package main

import (
	"context"
	"crypto/tls"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/i40sys/iotgw-ng/live-image/internal/devapi"
	"github.com/i40sys/iotgw-ng/live-image/internal/wgconf"
	"github.com/i40sys/iotgw-ng/live-image/internal/wgkey"
)

func TestVPNGatewayHeldKey(t *testing.T) {
	s, srv := scenario(t)
	marker := filepath.Join(t.TempDir(), "hook")
	s.hook = `echo "$OLD_PUBLIC_KEY>$NEW_PUBLIC_KEY" >> ` + marker
	ctx := context.Background()
	priv, pub, _ := wgkey.Generate()
	call := func(body map[string]string) (string, error) {
		// A fresh seed per call: only two codes (this step, the next) per seed.
		s.mu.Lock()
		s.rotate(s.dev(dev))
		s.mu.Unlock()
		r, _, err := devapi.New(srv.URL, dev, code(t, srv, "vpn")).CallVPN(ctx, body)
		return string(r.Config), err
	}
	conf, err := call(map[string]string{"device_id": dev, "wg_public_key": pub})
	if err != nil || wgconf.HasPrivateKey(conf) || !strings.Contains(conf, "held by the gateway") {
		t.Fatalf("gateway-held reply: %v\n%s", err, conf)
	}
	full, inserted, err := wgconf.WithPrivateKey(conf, priv)
	if err != nil || !inserted {
		t.Fatal(err)
	}
	if c, err := wgconf.Parse(full); err != nil || c.PrivateKey != priv {
		t.Fatalf("completed config: %v", err)
	}
	// Same key again: Netmaker untouched (the hook ran once).
	if _, err := call(map[string]string{"device_id": dev, "wg_public_key": pub}); err != nil {
		t.Fatal(err)
	}
	b, _ := os.ReadFile(marker)
	if lines := strings.Split(strings.TrimSpace(string(b)), "\n"); len(lines) != 1 || !strings.HasSuffix(lines[0], ">"+pub) {
		t.Fatalf("hook runs: %q", b)
	}
	// Keyless (old agent) after the key became gateway-held: 409.
	if _, err := call(map[string]string{"device_id": dev}); status(err) != 409 || !strings.Contains(err.Error(), "held by the gateway") {
		t.Fatalf("keyless request: %v", err)
	}
	if _, err := call(map[string]string{"device_id": dev, "wg_public_key": "short"}); status(err) != 400 {
		t.Fatalf("bad key: %v", err)
	}
}

func TestServesPinnedTLS(t *testing.T) {
	s, _ := scenario(t)
	dir := t.TempDir()
	if err := genTLS(dir, []string{"127.0.0.1"}); err != nil {
		t.Fatal(err)
	}
	cert, err := tls.LoadX509KeyPair(filepath.Join(dir, "api.pem"), filepath.Join(dir, "api.key"))
	if err != nil {
		t.Fatal(err)
	}
	ts := httptest.NewUnstartedServer(s.mux())
	ts.TLS = &tls.Config{Certificates: []tls.Certificate{cert}}
	ts.StartTLS()
	defer ts.Close()
	// Operator code off the "UI" (same server state).
	s.mu.Lock()
	c := codeAt(s.dev(dev).seed, s.step())
	s.mu.Unlock()
	_, pub, _ := wgkey.Generate()
	r, _, err := devapi.New(ts.URL, dev, c, devapi.WithCAFile(filepath.Join(dir, "api-ca.pem"))).
		CallVPN(context.Background(), map[string]string{"device_id": dev, "wg_public_key": pub})
	if err != nil || !r.Sealed {
		t.Fatalf("pinned HTTPS call: %v", err)
	}
}
