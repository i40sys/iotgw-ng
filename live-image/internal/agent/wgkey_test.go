package agent

import (
	"context"
	"strings"
	"testing"

	"github.com/i40sys/iotgw-ng/live-image/internal/uci"
	"github.com/i40sys/iotgw-ng/live-image/internal/wgkey"
)

// uciWithKey answers `uci -q get network.wg0.private_key` with key.
func uciWithKey(key string) *uci.Client {
	return &uci.Client{Run: func(_ context.Context, args ...string) (string, error) {
		if len(args) == 3 && args[1] == "get" && args[2] == "network.wg0.private_key" {
			return key + "\n", nil
		}
		return "", nil
	}}
}

func TestGatewayWGKeyReusesTheInstalledKey(t *testing.T) {
	cur, curPub, _ := wgkey.Generate()
	a := &Agent{UCI: uciWithKey(cur)}
	priv, pub, msg, err := a.gatewayWGKey(context.Background(), "wg0", false)
	if err != nil || priv != cur || pub != curPub {
		t.Fatalf("installed key not reused: %v", err)
	}
	if strings.Contains(msg, cur) || !strings.Contains(msg, curPub) {
		t.Fatalf("message must name the public key only: %q", msg)
	}
}

func TestGatewayWGKeyRotate(t *testing.T) {
	cur, curPub, _ := wgkey.Generate()
	a := &Agent{UCI: uciWithKey(cur)}
	priv, pub, msg, err := a.gatewayWGKey(context.Background(), "wg0", true)
	if err != nil || priv == cur || pub == curPub || !strings.Contains(msg, "rotating") || strings.Contains(msg, priv) {
		t.Fatalf("rotate: %q %v", msg, err)
	}
	if p, _ := wgkey.Public(priv); p != pub {
		t.Fatal("rotated pair does not match")
	}
}

func TestGatewayWGKeyGeneratesWhenMissingOrBroken(t *testing.T) {
	for _, cur := range []string{"", "not-a-key"} {
		a := &Agent{UCI: uciWithKey(cur)}
		priv, pub, msg, err := a.gatewayWGKey(context.Background(), "wg0", false)
		if err != nil || priv == "" || !wgkey.ValidPublic(pub) || !strings.Contains(msg, "generated") {
			t.Fatalf("key %q: %q %v", cur, msg, err)
		}
	}
}

func TestLoadConfigAPICA(t *testing.T) {
	show := func(out string) *uci.Client {
		return &uci.Client{Run: func(_ context.Context, args ...string) (string, error) { return out, nil }}
	}
	c, err := LoadConfig(context.Background(), show("iotgw.main=iotgw\niotgw.main.api_base='http://10.2.0.47:8000'\n"))
	if err != nil || c.APICA != "/etc/iotgw/api-ca.pem" {
		t.Fatalf("default api_ca: %q %v", c.APICA, err)
	}
	c, _ = LoadConfig(context.Background(), show("iotgw.main=iotgw\niotgw.main.api_ca='/etc/iotgw/other.pem'\n"))
	if c.APICA != "/etc/iotgw/other.pem" {
		t.Fatalf("api_ca: %q", c.APICA)
	}
}
