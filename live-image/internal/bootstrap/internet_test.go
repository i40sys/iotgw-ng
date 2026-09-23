package bootstrap

import (
	"strings"
	"testing"
)

const serverConf = `# WireGuard VPN Configuration File, device_id: gw-c3@88b97bd9
# Network ID: 88b97bd9-0e09-42e6-9248-b66ec6512da5
# Network: 10.5.0.1/31

[Interface]
Address = 10.5.0.1/32
PrivateKey = c2VjcmV0
MTU = 1420
DNS = 10.5.0.0
PreUp = ip route del default || true
PreUp = ip route add 216.45.62.117 via 10.2.0.1 dev eth0 || true
PostDown = ip route del 216.45.62.117 via 10.2.0.1 dev eth0 || true
PostDown = ip route add default via 10.2.0.1 || true

[Peer]
PublicKey = MVrf5pB0sPD9pQjV62NDxJNfBuJj2borv9kv8Ba4NiY=
Endpoint = 216.45.62.117:443
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 20
`

func TestNetworkFromConfIsCanonical(t *testing.T) {
	n, err := networkFromConf(serverConf)
	if err != nil || n != "10.5.0.0/31" {
		t.Fatalf("got %q %v", n, err)
	}
	if _, err := networkFromConf("[Interface]\n"); err == nil {
		t.Fatal("missing header must be an error")
	}
}

func TestRenderSplitTunnel(t *testing.T) {
	conf, dns := renderWG(serverConf, ViaLAN, "10.5.0.0/31")
	if strings.Contains(conf, "route del default") || strings.Contains(conf, "PostDown") {
		t.Fatal("split tunnel must not touch the default route")
	}
	if !strings.Contains(conf, "AllowedIPs = 10.5.0.0/31") || strings.Contains(conf, "0.0.0.0/0") {
		t.Fatalf("split tunnel must route only the network:\n%s", conf)
	}
	if strings.Contains(conf, "DNS =") || len(dns) != 1 || dns[0] != "10.5.0.0" {
		t.Fatalf("DNS= must be lifted out of the wg-quick config (got %v)", dns)
	}
	if _, err := parseWGConf(conf); err != nil {
		t.Fatalf("rendered config must stay valid: %v", err)
	}
}

func TestRenderFullTunnelKeepsServerRouting(t *testing.T) {
	conf, _ := renderWG(serverConf, ViaVPN, "10.5.0.0/31")
	if !strings.Contains(conf, "AllowedIPs = 0.0.0.0/0") || !strings.Contains(conf, "PreUp = ip route del default") {
		t.Fatalf("full tunnel must be the server config as delivered:\n%s", conf)
	}
	if strings.Contains(conf, "DNS =") {
		t.Fatal("DNS= must be removed in every mode (no resolvconf in the image)")
	}
}
