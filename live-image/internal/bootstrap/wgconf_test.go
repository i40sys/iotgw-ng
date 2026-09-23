package bootstrap

import "testing"

func TestParseWGConf(t *testing.T) {
	conf := `# WireGuard VPN Configuration File
[Interface]
Address = 10.5.0.1/32
PrivateKey = c2VjcmV0
MTU = 1420
PreUp = ip route del default || true

[Peer]
PublicKey = MVrf5pB0sPD9pQjV62NDxJNfBuJj2borv9kv8Ba4NiY=
Endpoint = 216.45.62.117:443
AllowedIPs = 0.0.0.0/0, ::/0
`
	s, err := parseWGConf(conf)
	if err != nil {
		t.Fatal(err)
	}
	if s.Endpoint != "216.45.62.117:443" || len(s.Addresses) != 1 || s.Addresses[0] != "10.5.0.1/32" || len(s.AllowedIPs) != 2 {
		t.Fatalf("unexpected summary: %+v", s)
	}
	if _, err := parseWGConf("[Interface]\nAddress = 10.0.0.1/32\n"); err == nil {
		t.Fatal("a config without a key or peer must be rejected")
	}
}
