#!/usr/bin/env bash
# Chainloader test suite (task-149.03). Static checks on the RELEASE build,
# then QEMU boots of a TEST build (same chain.ipxe, menu URL pointed at a local
# HTTPS server, trusting ONLY a throwaway test CA). No network access to OVH.
#   test/run.sh <dist-dir>        (expects <dist>/release from `just build`)
# Env: SKIP_REPRO=1 skips the reproducibility rebuild.
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
dist="$(realpath "$1")"; rel="$dist/release"
work="$here/test/.work"; rm -rf "$work"; mkdir -p "$work"
PORT="${TEST_PORT:-18443}"
URL="https://10.0.2.2:$PORT/menu.ipxe"
REACHED="IOTGW-TEST-MENU-REACHED"
FALLBACK="the OVH netboot menu is unreachable"
fails=0
pass() { echo "PASS  $*"; }
fail() { echo "FAIL  $*"; fails=$((fails + 1)); }

# --- firmware / ROM discovery (Debian/Ubuntu paths) ---------------------------
first() { local f; for f in "$@"; do [ -e "$f" ] && { echo "$f"; return; }; done; }
ovmf_code="$(first /usr/share/OVMF/OVMF_CODE_4M.fd /usr/share/OVMF/OVMF_CODE.fd)"
ovmf_vars="$(first /usr/share/OVMF/OVMF_VARS_4M.fd /usr/share/OVMF/OVMF_VARS.fd)"
e1000_rom="$(first /usr/lib/ipxe/qemu/efi-e1000.rom /usr/share/qemu/efi-e1000.rom)"
[ -n "$ovmf_code" ] && [ -n "$e1000_rom" ] || { echo "need ovmf + ipxe-qemu" >&2; exit 2; }
if [ -w /dev/kvm ]; then accel=(-accel kvm -cpu host); else accel=(-accel tcg); fi

# --- 1. static checks on the release build ------------------------------------
if cmp -s "$here/chain.ipxe" "$rel/embedded.ipxe"; then pass "static: embedded script == chain.ipxe"
else fail "static: embedded script differs from chain.ipxe"; fi
release_url="$(sed -n 's/^set menu-url //p' "$here/chain.ipxe")"
if [ "$release_url" = "https://netboot.iotgw.i40sys.com/menu.ipxe" ] \
   && strings "$rel/ipxe.efi" | grep -qxF "set menu-url $release_url"; then
  pass "static: release binary embeds exactly $release_url"
else fail "static: release menu URL"; fi
if grep -qiE 'http://|10\.0\.2\.2' "$here/chain.ipxe" "$rel/embedded.ipxe"; then
  fail "static: plain-HTTP or test URL in the release script"
else pass "static: HTTPS only, no test URL in the release script"; fi
if python3 - "$rel/ipxe.efi" "$here"/certs/*.pem <<'PY'
import sys, hashlib, base64, re
blob = open(sys.argv[1], "rb").read()
for pem in sys.argv[2:]:
    der = base64.b64decode("".join(l for l in open(pem).read().splitlines() if l and "-----" not in l))
    if hashlib.sha256(der).digest() not in blob:
        sys.exit(f"trust anchor {pem} not embedded")
PY
then pass "static: the pinned ISRG roots are the embedded trust anchors"
else fail "static: trust anchors"; fi
if command -v gitleaks >/dev/null; then
  if gitleaks detect --no-git --no-banner -s "$rel" >/dev/null 2>&1; then pass "static: gitleaks finds no secrets in the outputs"
  else fail "static: gitleaks reported findings"; fi
fi

# --- test PKI + HTTPS server ----------------------------------------------------
mkca() { # <name>
  openssl req -x509 -newkey rsa:2048 -nodes -days 2 -subj "/CN=iotgw test CA $1" \
    -keyout "$work/$1.key" -out "$work/$1.pem" >/dev/null 2>&1
}
mkca trusted; mkca untrusted
for ca in trusted untrusted; do
  openssl req -newkey rsa:2048 -nodes -subj "/CN=10.0.2.2" -keyout "$work/srv-$ca.key" \
    -out "$work/srv-$ca.csr" >/dev/null 2>&1
  printf 'subjectAltName=IP:10.0.2.2\nextendedKeyUsage=serverAuth\n' > "$work/ext"
  openssl x509 -req -in "$work/srv-$ca.csr" -CA "$work/$ca.pem" -CAkey "$work/$ca.key" \
    -CAcreateserial -days 2 -extfile "$work/ext" -out "$work/srv-$ca.pem" >/dev/null 2>&1
done
mkdir -p "$work/www"
printf '#!ipxe\necho %s\npoweroff\n' "$REACHED" > "$work/www/menu.ipxe"

server_pid=""
start_server() { # <trusted|untrusted>
  python3 - "$work/www" "$PORT" "$work/srv-$1.pem" "$work/srv-$1.key" >"$work/https-$1.log" 2>&1 <<'PY' &
import http.server, ssl, sys, functools
root, port, cert, key = sys.argv[1], int(sys.argv[2]), sys.argv[3], sys.argv[4]
h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=root)
s = http.server.ThreadingHTTPServer(("127.0.0.1", port), h)
c = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER); c.load_cert_chain(cert, key)
s.socket = c.wrap_socket(s.socket, server_side=True); s.serve_forever()
PY
  server_pid=$!; sleep 1
}
stop_server() { [ -n "$server_pid" ] && kill "$server_pid" 2>/dev/null || true; server_pid=""; }
trap 'stop_server' EXIT

# --- test build (same script, local URL, test CA only) --------------------------
reldist="$(realpath --relative-to="$here" "$dist")"  # the builder sees the repo at /src
( cd "$here" && just _build "$reldist/test" test "test/.work/trusted.pem" "$URL" ) >"$work/build-test.log" 2>&1 \
  || { cat "$work/build-test.log"; echo "test build failed" >&2; exit 1; }
tb="$dist/test"
mkdir -p "$work/tftp"; cp "$tb/ipxe.efi" "$tb/undionly.kpxe" "$work/tftp/"

boot() { # <name> <expect-regex> <timeout> <qemu args...>
  local name="$1" expect="$2" to="$3"; shift 3
  local log="$work/$name.serial.log"
  timeout "$to" qemu-system-x86_64 "${accel[@]}" -m 512 -display none -no-reboot \
    -serial "file:$log" "$@" >/dev/null 2>&1 || true
  sed -i 's/\x1b\[[0-9;?]*[a-zA-Z]//g' "$log" 2>/dev/null || true
  # OVMF mirrors the console to serial twice: "AB" can arrive as "AABB".
  local doubled; doubled="$(printf '%s' "$expect" | sed 's/./&&/g')"
  if grep -qF -e "$expect" -e "$doubled" "$log"; then pass "$name"; return 0; fi
  fail "$name (see $log)"; tail -5 "$log" | sed 's/^/      /'; return 1
}
# a failed case is reported and the suite continues (exit status at the end)
set +e
uefi() { cp "$ovmf_vars" "$work/vars.fd"
  echo -drive if=pflash,format=raw,readonly=on,file="$ovmf_code" -drive if=pflash,format=raw,file="$work/vars.fd"; }
usbdisk() { echo -device qemu-xhci -drive if=none,id=u,format=raw,readonly=on,file="$tb/ipxe-usb.img" -device usb-storage,drive=u,bootindex=1; }

start_server trusted
# 2. UEFI firmware PXE -> ipxe.efi (TFTP) -> DHCP -> HTTPS menu
# shellcheck disable=SC2046
boot "uefi-pxe: ipxe.efi chains the HTTPS menu" "$REACHED" 180 $(uefi) \
  -netdev user,id=n0,tftp="$work/tftp",bootfile=ipxe.efi -device virtio-net-pci,netdev=n0,romfile=,bootindex=1
# 3. legacy BIOS PXE (NIC option ROM) -> undionly.kpxe (TFTP) -> HTTPS menu
boot "bios-pxe: undionly.kpxe chains the HTTPS menu" "$REACHED" 180 \
  -netdev user,id=n0,tftp="$work/tftp",bootfile=undionly.kpxe -device e1000,netdev=n0,romfile="$e1000_rom",bootindex=1
# 4. USB image under UEFI and under BIOS
# shellcheck disable=SC2046
boot "usb-uefi: ipxe-usb.img chains the HTTPS menu" "$REACHED" 180 $(uefi) $(usbdisk) \
  -netdev user,id=n0 -device virtio-net-pci,netdev=n0,romfile=
# shellcheck disable=SC2046
boot "usb-bios: ipxe-usb.img chains the HTTPS menu" "$REACHED" 180 $(usbdisk) \
  -netdev user,id=n0 -device virtio-net-pci,netdev=n0,romfile=
stop_server

# 5. untrusted certificate: refused, fallback shown, the menu is never fetched
start_server untrusted
if boot "tls-untrusted: refused and falls back" "$FALLBACK" 120 \
     -netdev user,id=n0,tftp="$work/tftp",bootfile=undionly.kpxe -device e1000,netdev=n0,romfile="$e1000_rom",bootindex=1; then
  if grep -qF -e "$REACHED" -e "$(printf '%s' "$REACHED" | sed 's/./&&/g')" "$work/tls-untrusted: refused and falls back.serial.log" \
     || grep -q 'GET /menu.ipxe' "$work/https-untrusted.log"; then
    fail "tls-untrusted: the menu was fetched despite the untrusted certificate"
  else pass "tls-untrusted: no menu fetched (no downgrade)"; fi
fi
stop_server

# 6. unreachable server: bounded retries, then the fallback menu (no hang)
boot "unreachable: fallback after bounded retries" "$FALLBACK" 120 \
  -netdev user,id=n0,tftp="$work/tftp",bootfile=undionly.kpxe -device e1000,netdev=n0,romfile="$e1000_rom",bootindex=1

# 8. reproducibility: an identical rebuild of the release
if [ -z "${SKIP_REPRO:-}" ]; then
  ( cd "$here" && just _build "$reldist/release-repro" ) >"$work/build-repro.log" 2>&1
  if diff -q <(cut -c1-64 "$rel/SHA256SUMS") <(cut -c1-64 "$dist/release-repro/SHA256SUMS") >/dev/null; then
    pass "reproducible: a second release build has identical SHA256"
  else fail "reproducible: SHA256 differs between two release builds"; diff "$rel/SHA256SUMS" "$dist/release-repro/SHA256SUMS" | sed 's/^/      /'; fi
fi

echo; [ "$fails" -eq 0 ] && echo "ALL CHAINLOADER TESTS PASSED" || { echo "$fails test(s) failed"; exit 1; }
