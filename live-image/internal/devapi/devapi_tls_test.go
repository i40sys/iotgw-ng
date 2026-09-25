package devapi

import (
	"context"
	"crypto/tls"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/i40sys/iotgw-ng/live-image/internal/testpki"
)

// tlsVPNServer is vpnServer over HTTPS with a certificate from a throwaway CA;
// it returns the server and the path of that CA's PEM.
func tlsVPNServer(t *testing.T) (*httptest.Server, string) {
	t.Helper()
	b, err := testpki.New("127.0.0.1")
	if err != nil {
		t.Fatal(err)
	}
	cert, err := b.TLSCertificate()
	if err != nil {
		t.Fatal(err)
	}
	var key string
	srv := httptest.NewUnstartedServer(vpnServer(t, true, &key).Config.Handler)
	srv.TLS = &tls.Config{Certificates: []tls.Certificate{cert}}
	srv.StartTLS()
	t.Cleanup(srv.Close)
	ca := filepath.Join(t.TempDir(), "api-ca.pem")
	if err := os.WriteFile(ca, b.CAPEM, 0o644); err != nil {
		t.Fatal(err)
	}
	return srv, ca
}

func TestPinnedCA(t *testing.T) {
	srv, ca := tlsVPNServer(t)
	c := New(srv.URL, dev, code, WithCAFile(ca))
	if !strings.Contains(c.Trust(), "pinned") {
		t.Errorf("trust %q", c.Trust())
	}
	r, status, err := c.CallVPN(context.Background(), map[string]string{"device_id": dev})
	if err != nil || status != 200 || string(r.Config) != conf {
		t.Fatalf("pinned: %+v %d %v", r, status, err)
	}
}

func TestPinnedCARejectsAnotherCA(t *testing.T) {
	srv, _ := tlsVPNServer(t)
	other, err := testpki.New("127.0.0.1")
	if err != nil {
		t.Fatal(err)
	}
	ca := filepath.Join(t.TempDir(), "other-ca.pem")
	_ = os.WriteFile(ca, other.CAPEM, 0o644)
	_, _, err = New(srv.URL, dev, code, WithCAFile(ca)).CallVPN(context.Background(), map[string]string{})
	if err == nil || !strings.Contains(err.Error(), "not issued by the trusted CA") {
		t.Fatalf("a certificate from another CA was not rejected: %v", err)
	}
}

func TestHTTPSWithoutCAFileUsesSystemRoots(t *testing.T) {
	srv, _ := tlsVPNServer(t)
	c := New(srv.URL, dev, code, WithCAFile(filepath.Join(t.TempDir(), "missing.pem")))
	if !strings.Contains(c.Trust(), "system CA roots") {
		t.Errorf("trust %q", c.Trust())
	}
	// The throwaway CA is not a system root: the call must fail.
	if _, _, err := c.CallVPN(context.Background(), map[string]string{}); err == nil {
		t.Fatal("a test-CA certificate verified against the system roots")
	}
}

func TestUnreadableCAFileFailsClosed(t *testing.T) {
	bad := filepath.Join(t.TempDir(), "api-ca.pem")
	_ = os.WriteFile(bad, []byte("not a certificate"), 0o644)
	_, _, err := New("https://127.0.0.1:1", dev, code, WithCAFile(bad)).CallVPN(context.Background(), map[string]string{})
	if err == nil || !strings.Contains(err.Error(), "holds no PEM certificate") {
		t.Fatalf("bad CA file: %v", err)
	}
}

func TestHTTPWithoutCAFileStaysHTTP(t *testing.T) {
	var key string
	srv := vpnServer(t, true, &key)
	defer srv.Close()
	c := New(srv.URL, dev, code, WithCAFile(filepath.Join(t.TempDir(), "missing.pem")))
	if _, _, err := c.CallVPN(context.Background(), map[string]string{"device_id": dev}); err != nil {
		t.Fatalf("http without a CA file: %v", err)
	}
	if !strings.Contains(c.Trust(), "plain HTTP") || c.Upgraded() != "" {
		t.Errorf("trust %q upgraded %q", c.Trust(), c.Upgraded())
	}
}

func TestEffectiveBase(t *testing.T) {
	ca := filepath.Join(t.TempDir(), "api-ca.pem")
	_ = os.WriteFile(ca, []byte("x"), 0o644)
	missing := filepath.Join(t.TempDir(), "missing.pem")
	for _, tc := range []struct {
		base, ca, want string
		up             bool
	}{
		{"http://10.2.0.47:8000", ca, "https://10.2.0.47", true},
		{"http://10.2.0.47:8000/", ca, "https://10.2.0.47", true},
		{"http://api.example:8000/prefix", ca, "https://api.example/prefix", true},
		{"http://[fd00::1]:8000", ca, "https://[fd00::1]", true},
		{"https://10.2.0.47", ca, "https://10.2.0.47", false},
		{"https://10.2.0.47:8443", ca, "https://10.2.0.47:8443", false},
		{"http://10.2.0.47:8000", missing, "http://10.2.0.47:8000", false},
		{"http://10.2.0.47:8000", "", "http://10.2.0.47:8000", false},
	} {
		got, up := EffectiveBase(tc.base, tc.ca)
		if got != tc.want || up != tc.up {
			t.Errorf("EffectiveBase(%q, %q) = %q %v; want %q %v", tc.base, tc.ca, got, up, tc.want, tc.up)
		}
	}
}

func TestUpgradedClientFailsClosedNamingBothURLs(t *testing.T) {
	// An http server behind the configured URL: after the upgrade the client
	// speaks TLS to it and must fail, never retry over plain HTTP.
	var key string
	srv := vpnServer(t, true, &key)
	defer srv.Close()
	_, ca := tlsVPNServer(t)
	c := New(srv.URL, dev, code, WithCAFile(ca))
	if c.Upgraded() != srv.URL || !strings.HasPrefix(c.Base(), "https://127.0.0.1") {
		t.Fatalf("upgrade: %q → %q", c.Upgraded(), c.Base())
	}
	_, _, err := c.CallVPN(context.Background(), map[string]string{})
	if err == nil {
		t.Fatal("the upgraded client reached the plain-HTTP server")
	}
	if msg := err.Error(); !strings.Contains(msg, srv.URL) || !strings.Contains(msg, "https://127.0.0.1") {
		t.Fatalf("the error does not name both URLs: %v", err)
	}
	if key != "" {
		t.Fatal("the request reached the server over plain HTTP")
	}
}
