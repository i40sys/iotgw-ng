package wgconf

import "testing"

const sample = `# Network ID: 88b97bd9-0e09-42e6-9248-b66ec6512da5
# Network: 10.5.0.1/24
[Interface]
PrivateKey = cHJpdmF0ZQ==
Address = 10.5.0.1/32
PreUp = ip route add 216.45.62.117 via 10.2.0.1 dev eth0 || true

[Peer]
PublicKey = MVrf5pB0sPD9pQjV62NDxJNfBuJj2borv9kv8Ba4NiY=
Endpoint = 216.45.62.117:443
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 20
`

func TestParse(t *testing.T) {
	c, err := Parse(sample)
	if err != nil {
		t.Fatal(err)
	}
	if c.Network != "10.5.0.0/24" || c.Keepalive != 20 || c.Endpoint != "216.45.62.117:443" || c.PrivateKey != "cHJpdmF0ZQ==" {
		t.Fatalf("parsed %+v", c)
	}
	if h, p, _ := c.EndpointHostPort(); h != "216.45.62.117" || p != "443" {
		t.Fatalf("endpoint %s %s", h, p)
	}
	if _, err := Parse("[Interface]\nAddress = 10.0.0.1/32\n"); err == nil {
		t.Fatal("config without a private key accepted")
	}
}
