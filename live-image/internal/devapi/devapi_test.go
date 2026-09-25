package devapi

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/i40sys/iotgw-ng/live-image/internal/envelope"
	"github.com/i40sys/iotgw-ng/live-image/internal/seal"
)

const (
	dev  = "gw-01@1a2b3c4d"
	code = "123456"
	conf = "[Interface]\nPrivateKey = k\n"
)

// vpnServer answers like the vpn function: sealed when the request carries
// reply_key and sealed is true, else the legacy code envelope.
func vpnServer(t *testing.T, sealed bool, gotKey *string) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if ct := r.Header.Get("Content-Type"); ct != "application/octet-stream" {
			t.Errorf("request Content-Type %q", ct)
		}
		if r.URL.Query().Get("device_id") != dev {
			t.Errorf("device_id query %q", r.URL.RawQuery)
		}
		b, _ := io.ReadAll(r.Body)
		plain, err := envelope.Open(b, code)
		if err != nil {
			w.WriteHeader(401)
			_, _ = w.Write([]byte(`{"error":"Authentication failed"}`))
			return
		}
		var req map[string]string
		_ = json.Unmarshal(plain, &req)
		*gotKey = req["reply_key"]
		if sealed && req["reply_key"] != "" {
			out, err := seal.Seal(req["reply_key"], req["device_id"], []byte(conf))
			if err != nil {
				t.Fatal(err)
			}
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write(out)
			return
		}
		out, _ := envelope.Seal([]byte(conf), code)
		w.Header().Set("Content-Type", "application/octet-stream")
		_, _ = w.Write(out)
	}))
}

func TestCallVPNSealed(t *testing.T) {
	var key string
	srv := vpnServer(t, true, &key)
	defer srv.Close()
	r, status, err := New(srv.URL, dev, code).CallVPN(context.Background(), map[string]string{"device_id": dev})
	if err != nil || status != 200 || !r.Sealed || string(r.Config) != conf {
		t.Fatalf("sealed: %+v %d %v", r, status, err)
	}
	if key == "" {
		t.Error("no reply_key in the request")
	}
}

func TestCallVPNLegacyReply(t *testing.T) {
	var key string
	srv := vpnServer(t, false, &key)
	defer srv.Close()
	r, _, err := New(srv.URL, dev, code).CallVPN(context.Background(), map[string]string{"device_id": dev})
	if err != nil || r.Sealed || string(r.Config) != conf {
		t.Fatalf("legacy: %+v %v", r, err)
	}
}

func TestCallVPNNeedsACode(t *testing.T) {
	_, _, err := New("http://127.0.0.1:1", dev, "").CallVPN(context.Background(), map[string]string{})
	if err == nil || !strings.Contains(err.Error(), "-otp") {
		t.Errorf("no code: %v", err)
	}
}

func TestCodedRejectionHint(t *testing.T) {
	var key string
	srv := vpnServer(t, true, &key)
	defer srv.Close()
	_, status, err := New(srv.URL, dev, "999999").CallVPN(context.Background(), map[string]string{})
	var ae *APIError
	if status != 401 || !errors.As(err, &ae) || !ae.Coded || !strings.Contains(err.Error(), "fresh code") {
		t.Errorf("401: %d %v", status, err)
	}
}

func TestCallPlain(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if ct := r.Header.Get("Content-Type"); ct != "application/json" {
			t.Errorf("Content-Type %q", ct)
		}
		var req map[string]any
		_ = json.NewDecoder(r.Body).Decode(&req)
		if req["action"] != "renew" {
			w.WriteHeader(401)
			_, _ = w.Write([]byte(`{"error":"stale or replayed renew"}`))
			return
		}
		_, _ = w.Write([]byte(`{"action":"renew","host_cert":"x"}`))
	}))
	defer srv.Close()
	c := New(srv.URL, dev, "")
	out, _, err := c.CallPlain(context.Background(), "ssh-ca", map[string]any{"action": "renew", "ts": 1})
	if err != nil || !strings.Contains(string(out), `"host_cert":"x"`) {
		t.Fatalf("renew: %s %v", out, err)
	}
	_, _, err = c.CallPlain(context.Background(), "ssh-ca", map[string]any{"action": "other"})
	var ae *APIError
	if !errors.As(err, &ae) || ae.Coded || strings.Contains(err.Error(), "fresh code") {
		t.Errorf("a signature rejection must not blame a code: %v", err)
	}
}

func TestConflictHints(t *testing.T) {
	enrolled := (&APIError{Status: 409, Message: "device already enrolled: renew with the host key"}).Error()
	if strings.Contains(enrolled, "pki-manager zone") {
		t.Errorf("already-enrolled 409 blamed the zone: %s", enrolled)
	}
	if zone := (&APIError{Status: 409, Message: "no zone"}).Error(); !strings.Contains(zone, "pki-manager zone") {
		t.Errorf("zone 409 hint missing: %s", zone)
	}
}
