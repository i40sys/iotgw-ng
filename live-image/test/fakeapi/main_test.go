package main

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/i40sys/iotgw-ng/live-image/internal/devapi"
)

const dev = "gw-qemu@12345678"

func scenario(t *testing.T) (*server, *httptest.Server) {
	t.Helper()
	dir := t.TempDir()
	for name, v := range map[string]string{"gw.key": "cHJpdmF0ZQ==", "hub.pub": "cHVibGlj", "network_id": "12345678-net", "user_ca.pub": "ssh-ed25519 AAAA user-ca"} {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(v+"\n"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	s := newServer(dir)
	srv := httptest.NewServer(s.mux())
	t.Cleanup(srv.Close)
	return s, srv
}

func get(t *testing.T, url string) (int, string) {
	t.Helper()
	resp, err := http.Get(url)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, strings.TrimSpace(string(b))
}

func code(t *testing.T, srv *httptest.Server, purpose string) string {
	t.Helper()
	st, c := get(t, srv.URL+"/test/code?device_id="+dev+"&purpose="+purpose)
	if st != 200 || len(c) != 6 {
		t.Fatalf("/test/code: %d %q", st, c)
	}
	return c
}

func status(err error) int {
	var ae *devapi.APIError
	if errors.As(err, &ae) {
		return ae.Status
	}
	return 0
}

func TestVPNCodeIsSingleUseAndTheReplySealed(t *testing.T) {
	_, srv := scenario(t)
	ctx := context.Background()
	c := code(t, srv, "vpn")
	r, _, err := devapi.New(srv.URL, dev, c).CallVPN(ctx, map[string]string{"device_id": dev})
	if err != nil || !r.Sealed || !strings.Contains(string(r.Config), "PrivateKey = cHJpdmF0ZQ==") {
		t.Fatalf("first use: %+v %v", r, err)
	}
	// Replayed: refused. The UI then offers the next step's code, which works.
	if _, _, err := devapi.New(srv.URL, dev, c).CallVPN(ctx, map[string]string{}); status(err) != 401 || !strings.Contains(err.Error(), "already used") {
		t.Fatalf("replay: %v", err)
	}
	next := code(t, srv, "vpn")
	if next == c {
		t.Fatal("/test/code offered the used code again")
	}
	if _, _, err := devapi.New(srv.URL, dev, next).CallVPN(ctx, map[string]string{}); err != nil {
		t.Fatalf("next step's code: %v", err)
	}
	if st, _ := get(t, srv.URL+"/test/code?device_id="+dev); st != 409 {
		t.Errorf("both steps used: /test/code %d, want 409", st)
	}
	resp, err := http.Post(srv.URL+"/test/rotate?device_id="+dev, "", nil)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if _, _, err := devapi.New(srv.URL, dev, code(t, srv, "vpn")).CallVPN(ctx, map[string]string{}); err != nil {
		t.Fatalf("after rotation: %v", err)
	}
}

func TestWrongCodesLockTheDevice(t *testing.T) {
	_, srv := scenario(t)
	ctx := context.Background()
	good := code(t, srv, "vpn")
	bad := "000000"
	if bad == good {
		bad = "000001"
	}
	for i := 0; i < maxFailures; i++ {
		if _, _, err := devapi.New(srv.URL, dev, bad).CallVPN(ctx, map[string]string{}); status(err) != 401 {
			t.Fatalf("wrong code %d: %v", i, err)
		}
	}
	if _, _, err := devapi.New(srv.URL, dev, good).CallVPN(ctx, map[string]string{}); status(err) != 429 {
		t.Fatalf("locked device accepted a request: %v", err)
	}
}

func TestEnrollThenRenewWithTheHostKey(t *testing.T) {
	if _, err := exec.LookPath("ssh-keygen"); err != nil {
		t.Skip("ssh-keygen not installed")
	}
	s, srv := scenario(t)
	dir := s.dir
	for _, args := range [][]string{
		{"-q", "-t", "ed25519", "-N", "", "-f", filepath.Join(dir, "host_ca")},
		{"-q", "-t", "ecdsa", "-b", "256", "-N", "", "-f", filepath.Join(dir, "gwhost")},
	} {
		if out, err := exec.Command("ssh-keygen", args...).CombinedOutput(); err != nil {
			t.Fatalf("ssh-keygen: %v %s", err, out)
		}
	}
	pub, _ := os.ReadFile(filepath.Join(dir, "gwhost.pub"))
	hostPub := strings.TrimSpace(string(pub))
	ctx := context.Background()

	// Renew before enrollment: refused.
	c := devapi.New(srv.URL, dev, "")
	renew := func(ts int64, keyFile string) error {
		norm, _ := normPub(hostPub)
		msg := filepath.Join(t.TempDir(), "m")
		_ = os.WriteFile(msg, []byte(dev+"\n"+norm+"\n"+strconv.FormatInt(ts, 10)), 0o600)
		if out, err := exec.Command("ssh-keygen", "-Y", "sign", "-f", keyFile, "-n", "iotgw-renew", msg).CombinedOutput(); err != nil {
			t.Fatalf("sign: %v %s", err, out)
		}
		sig, _ := os.ReadFile(msg + ".sig")
		_, _, err := c.CallPlain(ctx, "ssh-ca", map[string]any{"device_id": dev, "action": "renew", "host_pubkey": hostPub, "ts": ts, "sig": string(sig)})
		return err
	}
	now := time.Now().Unix()
	if err := renew(now, filepath.Join(dir, "gwhost")); status(err) != 401 {
		t.Fatalf("renew before enrollment: %v", err)
	}
	// Enroll with the code.
	out, _, err := devapi.New(srv.URL, dev, code(t, srv, "ssh-enroll")).Call(ctx, "ssh-ca", map[string]string{"device_id": dev, "action": "enroll", "host_pubkey": hostPub})
	if err != nil || !strings.Contains(string(out), "host_cert") {
		t.Fatalf("enroll: %s %v", out, err)
	}
	// A second enroll is refused with 409.
	if _, _, err := devapi.New(srv.URL, dev, code(t, srv, "ssh-enroll")).Call(ctx, "ssh-ca", map[string]string{"device_id": dev, "action": "enroll", "host_pubkey": hostPub}); status(err) != 409 || !strings.Contains(err.Error(), "already enrolled") {
		t.Fatalf("second enroll: %v", err)
	}
	// Renew signed by the enrolled key: accepted once per timestamp.
	if err := renew(now+1, filepath.Join(dir, "gwhost")); err != nil {
		t.Fatalf("renew: %v", err)
	}
	if err := renew(now+1, filepath.Join(dir, "gwhost")); status(err) != 401 {
		t.Fatalf("replayed renew: %v", err)
	}
	if err := renew(now-1000, filepath.Join(dir, "gwhost")); status(err) != 401 {
		t.Fatalf("renew out of the time window: %v", err)
	}
	// Signed by another key: refused.
	if out, err := exec.Command("ssh-keygen", "-q", "-t", "ecdsa", "-N", "", "-f", filepath.Join(dir, "other")).CombinedOutput(); err != nil {
		t.Fatalf("%v %s", err, out)
	}
	if err := renew(now+2, filepath.Join(dir, "other")); status(err) != 401 {
		t.Fatalf("renew signed by another key: %v", err)
	}
}
