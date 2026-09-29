#!/usr/bin/env bash
# Boot-test the built live image under QEMU (task-149.01, decision-029): serve
# the image over HTTP from the host, boot vmlinuz+initrd with the SAME kernel
# parameters as the iPXE `iotgw-live` entry (live-boot `fetch=` of the
# squashfs), and require on the serial console that systemd reaches the
# iotgw-bootstrap unit and sshd. No device identity is passed, so the bootstrap
# itself stops at its identity step — that is expected here.
#   test-boot.sh <image-dir> [timeout-seconds]
set -euo pipefail
img="$(realpath "$1")"; timeout_s="${2:-600}"
work="$(mktemp -d)"; log="$work/serial.log"
port="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])')"
cleanup() { kill "${http_pid:-}" "${qemu_pid:-}" 2>/dev/null || true; }
trap cleanup EXIT

python3 -m http.server "$port" --bind 127.0.0.1 --directory "$img" >"$work/http.log" 2>&1 &
http_pid=$!
if [ -w /dev/kvm ]; then accel=(-accel kvm -cpu host); else accel=(-accel tcg); fi
echo "QEMU ${accel[*]}, image served on :$port"

cmdline="boot=live username=user union=overlay config components noswap edd=on nomodeset \
locales=en_US.UTF-8 ocs_live_batch=no net.ifnames=0 nosplash noprompt \
fetch=http://10.0.2.2:$port/filesystem.squashfs console=ttyS0,115200 systemd.show_status=1"

qemu-system-x86_64 "${accel[@]}" -m 2048 -smp 2 -display none -no-reboot \
  -kernel "$img/vmlinuz" -initrd "$img/initrd" -append "$cmdline" \
  -netdev user,id=n0 -device virtio-net-pci,netdev=n0 \
  -serial "file:$log" &
qemu_pid=$!

# Unit NAMES: systemd truncates descriptions in its status lines.
want=("Finished iotgw-bootstrap.service" "Started ssh.service")
deadline=$((SECONDS + timeout_s))
while [ $SECONDS -lt $deadline ]; do
  ok=1
  # systemd colours unit names: match on the console text without ANSI codes.
  sed 's/\x1b\[[0-9;]*[a-zA-Z]//g' "$log" > "$work/clean.log" 2>/dev/null || true
  for w in "${want[@]}"; do grep -qF "$w" "$work/clean.log" || ok=0; done
  if [ $ok = 1 ]; then
    echo "PASS: booted from the fetched squashfs and reached:"
    for w in "${want[@]}"; do grep -F "$w" "$work/clean.log" | head -1 | sed 's/^/  /'; done
    grep -q 'GET /filesystem.squashfs' "$work/http.log" && echo "  (squashfs fetched over HTTP by live-boot/curl)"
    exit 0
  fi
  kill -0 "$qemu_pid" 2>/dev/null || break
  sleep 5
done
cp "$log" "${TMPDIR:-/tmp}/iotgw-live-boot-serial.log" 2>/dev/null || true
echo "FAIL: markers not seen within ${timeout_s}s (log: ${TMPDIR:-/tmp}/iotgw-live-boot-serial.log); last console lines:" >&2
tail -40 "$log" >&2 || true
exit 1
