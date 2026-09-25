package wgconf

import (
	"strings"
	"testing"
)

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

func TestWithPrivateKey(t *testing.T) {
	keyless := strings.Replace(sample, "PrivateKey = cHJpdmF0ZQ==\n", "# PrivateKey: held by the gateway\n", 1)
	if HasPrivateKey(keyless) {
		t.Fatal("the comment counts as a key")
	}
	out, inserted, err := WithPrivateKey(keyless, "T1dO")
	if err != nil || !inserted {
		t.Fatalf("insert: %v %v", inserted, err)
	}
	if !strings.Contains(out, "[Interface]\nPrivateKey = T1dO\n") {
		t.Fatalf("not inserted after [Interface]:\n%s", out)
	}
	if c, err := Parse(out); err != nil || c.PrivateKey != "T1dO" || c.Network != "10.5.0.0/24" {
		t.Fatalf("parse after insert: %+v %v", c, err)
	}
	// An old server's reply keeps its own key.
	out, inserted, err = WithPrivateKey(sample, "T1dO")
	if err != nil || inserted || out != sample {
		t.Fatalf("legacy reply changed: %v %v", inserted, err)
	}
	if _, _, err := WithPrivateKey(keyless, ""); err == nil {
		t.Fatal("no key and nothing to insert accepted")
	}
	if _, _, err := WithPrivateKey("[Peer]\nPublicKey = x\n", "T1dO"); err == nil {
		t.Fatal("no [Interface] accepted")
	}
}
