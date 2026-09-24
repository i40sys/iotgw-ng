#!/usr/bin/env bash
# End-to-end test of the iotgw agent on real OpenWRT under QEMU
# (decision-032 / task-125.11; decision-029 for the QEMU approach).
#
# Two OpenWRT 23.05 x86-64 VMs, no root needed (KVM when /dev/kvm is usable,
# TCG otherwise):
#
#   hub  = the site LAN router (172.30.0.1, DHCP, NAT to the Internet through
#          QEMU user networking) AND a Netmaker-like WireGuard server whose
#          endpoint 203.0.113.10 is NOT on the LAN — reachable only via the
#          router, exactly like the real Netmaker host. arp_ignore=1 makes an
#          on-link route to it fail the way it failed on gw-c3.
#   gw   = an installed gateway as the install playbook leaves it: wg0 + the
#          install-time route to the endpoint WITHOUT a gateway (the gw-c3
#          bug), the iotgw package (binary, procd service, console launcher)
#          and /etc/config/iotgw.
#
# A fake vpn/ssh-ca API (test/fakeapi: real envelope + TOTP) runs on the host.
#
# Cases: the daemon repairs the Netmaker route; follows a LAN-router change;
# falls back to VPN when the LAN loses Internet and returns (hysteresis);
# hold freezes automatic changes; the policy survives a reboot; vpn refresh
# repairs a broken tunnel and rolls back a bad config; ssh refresh installs a
# host certificate sshd serves (and proves continuity on renewal); the
# dashboard runs on the serial console.
#
# usage: live-image/test/qemu/run.sh          (WORK=dir to keep artifacts)
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
MOD="$(cd "$HERE/../.." && pwd)" # live-image/
WORK="${WORK:-$HERE/.work}"
OWRT_VER="${OWRT_VER:-23.05.4}"
IMG_URL="https://downloads.openwrt.org/releases/${OWRT_VER}/targets/x86/64/openwrt-${OWRT_VER}-x86-64-generic-ext4-combined.img.gz"
HUB_SSH=12221 GW_SSH=12222 GW_SSHD=12223 GW_HTTP=12224 SITE_PORT=12230 API_PORT=18080
INTERVAL=15 # daemon check interval in the test (seconds)

mkdir -p "$WORK"
cd "$WORK"
PIDS=()
cleanup() {
  if [ -n "${KEEP:-}" ]; then
    echo "KEEP set: VMs left running (hub ssh -p $HUB_SSH, gw ssh -p $GW_SSH root@127.0.0.1 -i $WORK/scn/mgmt); kill ${PIDS[*]} when done"
    return
  fi
  for p in "${PIDS[@]}"; do kill "$p" 2>/dev/null || true; done
  wait 2>/dev/null || true
}
trap cleanup EXIT

log() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
PASS=0 FAIL=0 FAILED=()
ok() { PASS=$((PASS + 1)); printf '  \033[32mPASS\033[0m %s\n' "$*"; }
ko() { FAIL=$((FAIL + 1)); FAILED+=("$*"); printf '  \033[31mFAIL\033[0m %s\n' "$*"; }

if [ -w /dev/kvm ]; then ACCEL=(-accel kvm -cpu host); else ACCEL=(-accel tcg); fi
echo "QEMU acceleration: ${ACCEL[*]}"

# ── build ────────────────────────────────────────────────────────────────────
log "build iotgw + fakeapi"
(cd "$MOD" && CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags "-s -w -X github.com/i40sys/iotgw-ng/live-image/internal/version.Version=qemu-test" -o "$WORK/iotgw" ./cmd/iotgw)
(cd "$MOD" && go build -o "$WORK/fakeapi" ./test/fakeapi)

# ── keys + scenario ──────────────────────────────────────────────────────────
log "keys and scenario"
rm -rf scn && mkdir -p scn
ssh-keygen -q -t ed25519 -N '' -f scn/mgmt -C iotgw-qemu-test
read -r HUB_KEY HUB_PUB < <(./fakeapi genkey)
read -r GW_KEY GW_PUB < <(./fakeapi genkey)
echo "$GW_KEY" >scn/gw.key
echo "$HUB_PUB" >scn/hub.pub
ssh-keygen -q -t ed25519 -N '' -f scn/host_ca -C test-host-ca
ssh-keygen -q -t ed25519 -N '' -f scn/user_ca -C test-user-ca
ssh-keygen -q -t ed25519 -N '' -f scn/operator -C operator
ssh-keygen -q -s scn/user_ca -I operator -n iotgw-ops -V -5m:+1d scn/operator.pub
echo "@cert-authority * $(cat scn/host_ca.pub)" >scn/known_hosts
DOMAIN_ID=d0000000-0000-4000-8000-000000000001
NETWORK_ID=12345678-0000-4000-8000-000000000002
DEVICE_UUID=aaaaaaaa-0000-4000-8000-000000000003
echo $DOMAIN_ID >scn/domain_id
echo $NETWORK_ID >scn/network_id
echo $DEVICE_UUID >scn/device_uuid
echo 4 >scn/totp_counter

# ── images ───────────────────────────────────────────────────────────────────
log "OpenWRT $OWRT_VER images"
[ -f openwrt.img ] || {
  curl -fsSL "$IMG_URL" -o openwrt.img.gz
  zcat openwrt.img.gz >openwrt.img 2>/dev/null || true # trailing signature → gzip warns
  rm -f openwrt.img.gz
}

# rootfs partition (2) as offset/size, for debugfs on an extracted copy
part() { sfdisk -d "$1" | awk -v n="$1"2 '$1==n {for(i=1;i<=NF;i++){if($i=="start="){s=$(i+1)} if($i=="size="){z=$(i+1)}} gsub(",","",s); gsub(",","",z); print s, z}'; }

# put SRC at DEST (root-owned, MODE) into the ext4 image FS
put() {
  local fs=$1 src=$2 dest=$3 mode=$4
  debugfs -w -R "rm $dest" "$fs" >/dev/null 2>&1 || true
  debugfs -w -R "write $src $dest" "$fs" >/dev/null 2>&1
  debugfs -w -f - "$fs" >/dev/null 2>&1 <<EOF
sif $dest uid 0
sif $dest gid 0
sif $dest mode 0100$mode
EOF
}

prep() { # name uci-defaults-file [extra-fn]
  local name=$1 defaults=$2 extra=${3:-}
  cp openwrt.img "$name.img"
  read -r start size < <(part "$name.img")
  dd if="$name.img" of="$name.root" bs=512 skip="$start" count="$size" status=none
  debugfs -w -R "mkdir /etc/dropbear" "$name.root" >/dev/null 2>&1 || true
  put "$name.root" scn/mgmt.pub /etc/dropbear/authorized_keys 600
  put "$name.root" "$defaults" /etc/uci-defaults/99-iotgw-test 755
  [ -n "$extra" ] && "$extra" "$name.root"
  dd if="$name.root" of="$name.img" bs=512 seek="$start" conv=notrunc status=none
  rm -f "$name.root"
}

cat >hub.defaults <<EOF
#!/bin/sh
uci set network.lan.ipaddr='172.30.0.1'
uci set network.lan.netmask='255.255.255.0'
uci set network.wan.device='eth1'
uci set network.wan6.device='eth1'
uci set network.mgmt=interface
uci set network.mgmt.proto='static'
uci set network.mgmt.device='eth2'
uci set network.mgmt.ipaddr='10.10.1.15'
uci set network.mgmt.netmask='255.255.255.0'
# the "Netmaker" endpoint: a public-style address NOT on the LAN
uci set network.nmk=interface
uci set network.nmk.proto='static'
uci set network.nmk.device='lo'
uci set network.nmk.ipaddr='203.0.113.10'
uci set network.nmk.netmask='255.255.255.255'
uci add_list firewall.@zone[0].network='mgmt'
uci set dropbear.@dropbear[0].Port='2222'
uci commit
echo 'net.ipv4.conf.all.arp_ignore=1' >/etc/sysctl.d/99-iotgw-test.conf
exit 0
EOF

cat >gw.defaults <<EOF
#!/bin/sh
# the installed gateway: wan on eth0 (as on gw-c3), management NIC on eth1
uci set network.wan.device='eth0'
uci set network.wan6.device='eth0'
uci del_list network.@device[0].ports='eth0' 2>/dev/null
uci set network.mgmt=interface
uci set network.mgmt.proto='static'
uci set network.mgmt.device='eth1'
uci set network.mgmt.ipaddr='10.10.2.15'
uci set network.mgmt.netmask='255.255.255.0'
uci add_list firewall.@zone[0].network='mgmt'
uci set dropbear.@dropbear[0].Port='2222'
uci commit
exit 0
EOF

cat >iotgw.config <<EOF
config iotgw 'main'
	option internet_policy 'auto'
	option prefer 'lan'
	option hold '0'
	option check_interval '$INTERVAL'
	# the test makes many changes quickly; production keeps 3 per 15 min
	option max_changes '50'
	option wg_iface 'wg0'
	option api_base 'http://10.0.2.2:$API_PORT'
	option device_id 'gw-qemu@${NETWORK_ID:0:8}'
	option device_uuid '$DEVICE_UUID'
	option network_id '$NETWORK_ID'
	option domain_id '$DOMAIN_ID'
	option totp_counter '4'
	option network_cidr '10.99.0.0/24'
	option installed_at 'qemu-test'
EOF

gw_extra() { # what tasks/iotgw_agent.yaml puts into the rootfs
  local fs=$1
  put "$fs" "$WORK/iotgw" /usr/sbin/iotgw 755
  put "$fs" "$MOD/openwrt/overlay/etc/init.d/iotgw" /etc/init.d/iotgw 755
  put "$fs" "$MOD/openwrt/overlay/usr/libexec/iotgw-console" /usr/libexec/iotgw-console 755
  put "$fs" iotgw.config /etc/config/iotgw 600
  debugfs -R "cat /etc/inittab" "$fs" 2>/dev/null |
    sed -E 's#^(tty1|ttyS0)::askfirst:/usr/libexec/login.sh$#\1::respawn:/usr/libexec/iotgw-console#' >inittab.gw
  put "$fs" inittab.gw /etc/inittab 644
}
prep hub hub.defaults
prep gw gw.defaults gw_extra

# ── boot ─────────────────────────────────────────────────────────────────────
boot() { # name ssh-port -- qemu nic args…
  local name=$1
  shift
  qemu-system-x86_64 "${ACCEL[@]}" -m 256 -smp 2 -display none -vga std \
    -drive "file=$name.img,format=raw,if=virtio" \
    -serial "file:$name.serial.log" -monitor none "$@" &
  PIDS+=($!)
}
SSH=(ssh -o BatchMode=yes -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR -o ConnectTimeout=5 -i scn/mgmt)
hub() { "${SSH[@]}" -p $HUB_SSH root@127.0.0.1 "$@"; }
gw() { "${SSH[@]}" -p $GW_SSH root@127.0.0.1 "$@"; }
wait_ssh() { # fn timeout
  local f=$1 t=${2:-300}
  for _ in $(seq "$t"); do $f true 2>/dev/null && return 0; sleep 1; done
  echo "timeout waiting for $f ssh" >&2
  return 1
}
# until "desc" timeout cmd… : retry a check
until_ok() {
  local desc=$1 t=$2
  shift 2
  for _ in $(seq "$t"); do
    if "$@" >/dev/null 2>&1; then ok "$desc"; return 0; fi
    sleep 1
  done
  ko "$desc"
  return 0 # record and go on: one failure must not hide the others
}

log "boot hub + gw"
boot hub \
  -netdev "socket,id=site,listen=127.0.0.1:$SITE_PORT" -device virtio-net-pci,netdev=site,mac=52:54:00:10:00:01 \
  -netdev user,id=wan -device virtio-net-pci,netdev=wan,mac=52:54:00:10:00:02 \
  -netdev "user,id=mgmt,net=10.10.1.0/24,restrict=on,hostfwd=tcp:127.0.0.1:$HUB_SSH-10.10.1.15:2222" -device virtio-net-pci,netdev=mgmt,mac=52:54:00:10:00:03
sleep 3
boot_gw() {
  boot gw \
    -netdev "socket,id=site,connect=127.0.0.1:$SITE_PORT" -device virtio-net-pci,netdev=site,mac=52:54:00:20:00:01 \
    -netdev "user,id=mgmt,net=10.10.2.0/24,restrict=on,hostfwd=tcp:127.0.0.1:$GW_SSH-10.10.2.15:2222,hostfwd=tcp:127.0.0.1:$GW_SSHD-10.10.2.15:22,hostfwd=tcp:127.0.0.1:$GW_HTTP-10.10.2.15:80" -device virtio-net-pci,netdev=mgmt,mac=52:54:00:20:00:02
  GW_PID=$!
}
boot_gw
wait_ssh hub 600
wait_ssh gw 600

log "hub: WireGuard server (the Netmaker stand-in)"
# retry: a VM's uplink may still be settling (DHCP, the hub's own restarts)
opkg_in() { # vm packages…
  local vm=$1
  shift
  for _ in $(seq 10); do
    if $vm "ip route | grep -q '^default' && opkg update >/dev/null 2>&1 && opkg install $* >/dev/null"; then return 0; fi
    sleep 10
  done
  echo "$vm: opkg failed" >&2
  exit 1
}
opkg_in hub wireguard-tools kmod-wireguard
hub "set -e
uci set network.wg0=interface
uci set network.wg0.proto='wireguard'
uci set network.wg0.private_key='$HUB_KEY'
uci set network.wg0.listen_port='51820'
uci add_list network.wg0.addresses='10.99.0.1/24'
uci set network.gwpeer=wireguard_wg0
uci set network.gwpeer.public_key='$GW_PUB'
uci add_list network.gwpeer.allowed_ips='10.99.0.2/32'
uci add_list firewall.@zone[0].network='wg0'
uci commit
# a restart (not reload) so netifd picks up the just-installed wireguard proto
/etc/init.d/network restart; /etc/init.d/firewall reload
# Like the real Netmaker host, the tunnel addresses are reachable ONLY
# through the tunnel: a ping to 10.99.0.1 from the gw proves wg0 is up.
nft add table inet iotgwhub
nft 'add chain inet iotgwhub inp { type filter hook input priority -5; }'
nft add rule inet iotgwhub inp iifname br-lan ip daddr 10.99.0.0/24 drop"

log "gw: packages + the install-time VPN config (with the gw-c3 on-link route)"
opkg_in gw wireguard-tools kmod-wireguard openssh-server openssh-keygen
gw "set -e
uci set network.wg0=interface
uci set network.wg0.proto='wireguard'
uci set network.wg0.private_key='$GW_KEY'
uci add_list network.wg0.addresses='10.99.0.2/32'
uci set network.wg0.metric='5'
uci set network.wgserver=wireguard_wg0
uci set network.wgserver.public_key='$HUB_PUB'
uci set network.wgserver.endpoint_host='203.0.113.10'
uci set network.wgserver.endpoint_port='51820'
uci set network.wgserver.persistent_keepalive='25'
uci set network.wgserver.route_allowed_ips='1'
uci add_list network.wgserver.allowed_ips='0.0.0.0/0'
uci add network route >/dev/null
uci set network.@route[-1].interface='wan'
uci set network.@route[-1].target='203.0.113.10'
uci set network.@route[-1].netmask='255.255.255.255'
uci commit network
# a restart (not reload) so netifd picks up the just-installed wireguard proto
/etc/init.d/network restart"

"./fakeapi" serve -listen "127.0.0.1:$API_PORT" -dir scn >fakeapi.log 2>&1 &
PIDS+=($!)

tunnel_up() { gw "ping -c1 -W2 10.99.0.1"; }
egress_is() { [ "$(gw "ip route get 1.1.1.1" | sed -n 's/.* dev \([^ ]*\).*/\1/p')" = "$1" ]; }
route_gw() { gw "uci -q get network.iotgw_endpoint.gateway"; }
route_is() { [ "$(route_gw)" = "$1" ]; }
legacy_gone() { ! gw "uci show network" | grep "target='203.0.113.10'" | grep -qv iotgw_endpoint; }
net_via_wg() { gw "ip route get 10.99.0.1" | grep -q 'dev wg0'; }
vpn_internet_ok() { [ "$(gw "jsonfilter -i /var/run/iotgw/agent.json -e @.egress_ok.ok")" = true ]; }

# ── cases ────────────────────────────────────────────────────────────────────
log "0. baseline: the install-time route is on-link and the tunnel is down"
sleep 20
if gw "ip route get 203.0.113.10" | grep -q via; then ko "baseline route should be on-link"; else ok "endpoint route is on-link (gw-c3 bug reproduced)"; fi
if tunnel_up; then ko "tunnel should be down"; else ok "tunnel down"; fi

log "1. daemon repairs the Netmaker route (task-125.05)"
gw "/etc/init.d/iotgw enable && /etc/init.d/iotgw start"
until_ok "iotgw_endpoint route via 172.30.0.1" 120 route_is 172.30.0.1
until_ok "install-time route removed" 30 legacy_gone
until_ok "tunnel up" 120 tunnel_up
until_ok "Netmaker network routed through wg0" 60 net_via_wg

log "2. LAN router change (task-125.05 AC1)"
hub "set -e
uci delete network.lan.ipaddr; uci delete network.lan.netmask
uci add_list network.lan.ipaddr='172.30.0.1/24'; uci add_list network.lan.ipaddr='172.30.0.254/24'
uci add_list dhcp.lan.dhcp_option='3,172.30.0.254'
uci commit; /etc/init.d/network reload; /etc/init.d/dnsmasq restart"
sleep 15
gw "ubus call network.interface.wan renew"
until_ok "route follows the new router 172.30.0.254" 150 route_is 172.30.0.254
until_ok "tunnel up after the router change" 120 tunnel_up

log "3. LAN loses Internet → VPN fallback, then return (task-125.05 AC3)"
hub "nft add table inet iotgwtest; nft 'add chain inet iotgwtest lanfw { type filter hook forward priority -5; }'; nft add rule inet iotgwtest lanfw iifname br-lan drop"
until_ok "egress switched to VPN" 240 egress_is wg0
# the daemon's own probe along the default path (BusyBox nc has no -z)
until_ok "Internet works through the VPN" 60 vpn_internet_ok
hub "nft delete table inet iotgwtest"
until_ok "egress back on the LAN after the hysteresis" 240 egress_is eth0

log "4. hold freezes automatic changes (task-125.06)"
gw "iotgw hold enable -reason qemu-test"
gw "uci set network.iotgw_endpoint.gateway=172.30.0.77 && uci commit network && ubus call network reload"
sleep $((INTERVAL * 3))
if [ "$(route_gw)" = 172.30.0.77 ]; then ok "on hold: the broken route is NOT repaired"; else ko "hold did not freeze the route"; fi
if gw "grep -q '\"held\"' /var/run/iotgw/agent.json"; then ok "held change recorded"; else ko "no held event"; fi
gw "iotgw hold disable"
until_ok "hold off: route repaired" 120 route_is 172.30.0.254
until_ok "tunnel up after hold" 180 tunnel_up

log "5. persistent Internet policy (task-125.06)"
if gw "iotgw internet vpn"; then ok "iotgw internet vpn"; else ko "iotgw internet vpn"; fi
until_ok "egress via VPN" 60 egress_is wg0
# A cold power cycle (clean poweroff, new QEMU on the same disk): a warm
# reboot under TCG emulation sometimes hangs in the bootloader.
gw "sync; poweroff" || true
for _ in $(seq 120); do kill -0 "$GW_PID" 2>/dev/null || break; sleep 1; done
kill "$GW_PID" 2>/dev/null || true
boot_gw
wait_ssh gw 600
if [ "$(gw 'uci -q get iotgw.main.internet_policy')" = vpn ]; then ok "policy survives reboot"; else ko "policy lost on reboot"; fi
until_ok "egress via VPN after reboot" 180 egress_is wg0
gw "iotgw internet auto" >/dev/null
until_ok "auto: back to LAN" 240 egress_is eth0
# the launcher waits (≤ 90 s) for the boot to settle before drawing
dash_running() { gw "ps w | grep -v grep | grep -q 'iotgw status'"; }
dash_serial() { grep -q "iotgw gateway console" gw.serial.log; }
until_ok "dashboard running on the console (task-125.04)" 150 dash_running
until_ok "dashboard drawn on the serial console" 60 dash_serial

log "6. vpn refresh (task-125.07)"
read -r BAD_KEY _ < <(./fakeapi genkey)
gw "uci set network.wg0.private_key='$BAD_KEY' && uci commit network && ubus call network reload"
sleep 15
if tunnel_up; then ko "tunnel should be down with a wrong key"; else ok "tunnel down with a wrong key"; fi
if gw "iotgw vpn refresh"; then ok "vpn refresh"; else ko "vpn refresh"; fi
until_ok "tunnel up after vpn refresh" 60 tunnel_up
curl -fsS -X POST "http://127.0.0.1:$API_PORT/control?vpn=bad-peer" >/dev/null
# (exits 1 by design; capture first — with pipefail a pipe would report that)
out=$(gw "iotgw vpn refresh" 2>&1 || true)
if grep -q "rolled back" <<<"$out"; then ok "bad config rolled back"; else ko "bad config not rolled back: $out"; fi
curl -fsS -X POST "http://127.0.0.1:$API_PORT/control?vpn=good" >/dev/null
if [ "$(gw 'uci -q get network.wgserver.public_key')" = "$HUB_PUB" ]; then ok "peer restored"; else ko "peer not restored"; fi
until_ok "tunnel still up after the rollback" 90 tunnel_up

log "7. ssh refresh (task-125.08)"
if gw "iotgw ssh refresh"; then ok "ssh refresh"; else ko "ssh refresh"; fi
opssh() { ssh -o BatchMode=yes -o LogLevel=ERROR -o ConnectTimeout=5 -i scn/operator -o CertificateFile=scn/operator-cert.pub \
  -o UserKnownHostsFile=scn/known_hosts -o StrictHostKeyChecking=yes -o HostKeyAlias=gw.test.iotgw \
  -o HostKeyAlgorithms=ecdsa-sha2-nistp256-cert-v01@openssh.com -p $GW_SSHD root@127.0.0.1 "$@"; }
until_ok "operator logs in with a user certificate; host certificate verified" 30 opssh true
if gw "iotgw ssh refresh" | grep -q "nothing to do"; then ok "renewal skipped while the certificate is current"; else ko "renewal not idempotent"; fi
if gw "iotgw ssh refresh -force" && grep -q "continuity proof OK" fakeapi.log; then ok "forced renewal proves continuity"; else ko "forced renewal / continuity"; fi
until_ok "sshd still serving after renewal" 30 opssh true

log "8. LuCI page + rpcd plugin: the web backend is the daemon's snapshot"
# Install the whole OpenWRT package the way the playbook does (extract it).
PKG=$(mktemp -d)
mkdir -p "$PKG/usr/sbin" && cp "$WORK/iotgw" "$PKG/usr/sbin/" && cp -a "$MOD/openwrt/overlay/." "$PKG/"
tar --owner=0 --group=0 -C "$PKG" -czf "$WORK/iotgw-openwrt.tar.gz" . && rm -rf "$PKG"
gw "tar xzf - -C / && /etc/init.d/rpcd restart && rm -rf /tmp/luci-indexcache* /tmp/luci-modulecache" <"$WORK/iotgw-openwrt.tar.gz"
sleep 3
if gw "ubus -v list iotgw" | grep -q vpn_refresh; then ok "ubus object iotgw registered by rpcd"; else ko "ubus object iotgw missing"; fi
if [ "$(gw "ubus call iotgw status | jsonfilter -e @.available")" = true ]; then ok "status served from the daemon's snapshot"; else ko "status not available"; fi
gw "ubus call iotgw hold '{\"enable\":true,\"reason\":\"e2e\"}'" >/dev/null
if [ "$(gw "uci -q get iotgw.main.hold")" = 1 ]; then ok "hold via rpcd"; else ko "hold via rpcd"; fi
gw "ubus call iotgw hold '{\"enable\":false}'" >/dev/null
job=$(gw "ubus call iotgw ssh_refresh '{}' | jsonfilter -e @.job")
job_done() { [ "$(gw "ubus call iotgw job '{\"id\":\"$job\"}' | jsonfilter -e @.rc")" = 0 ]; }
until_ok "background job (ssh refresh) finishes with rc 0" 120 job_done
RPC="http://127.0.0.1:$GW_HTTP/ubus"
SID=$(curl -fsS "$RPC" -d '{"jsonrpc":"2.0","id":1,"method":"call","params":["00000000000000000000000000000000","session","login",{"username":"root","password":""}]}' | jq -r '.result[1].ubus_rpc_session')
if curl -fsS "$RPC" -d "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"call\",\"params\":[\"$SID\",\"iotgw\",\"status\",{}]}" | jq -e '.result[1].available == true' >/dev/null; then ok "LuCI session reaches iotgw status over /ubus"; else ko "LuCI session cannot call iotgw"; fi
if curl -fsS "$RPC" -d '{"jsonrpc":"2.0","id":3,"method":"call","params":["00000000000000000000000000000000","iotgw","status",{}]}' | jq -e '.error.code == -32002' >/dev/null; then ok "anonymous call denied (ACL)"; else ko "anonymous call not denied"; fi
if [ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$GW_HTTP/luci-static/resources/view/iotgw/status.js")" = 200 ]; then ok "LuCI view served"; else ko "LuCI view not served"; fi

# ── result ───────────────────────────────────────────────────────────────────
log "agent history (gw)"
gw "iotgw vpn status; logread -e iotgw | tail -25" || true
echo
echo "PASS $PASS  FAIL $FAIL"
for f in "${FAILED[@]}"; do echo "  failed: $f"; done
[ "$FAIL" -eq 0 ]
