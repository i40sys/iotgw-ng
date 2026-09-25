// Command fakeapi is a stand-in for the `vpn` and `ssh-ca` edge functions,
// used by the QEMU end-to-end test (test/qemu/run.sh, decision-032 /
// task-125.11) and following the decision-033 contract: it speaks the real
// device envelope (internal/envelope) and the sealed VPN reply
// (internal/seal), so the agent under test runs its production code path —
// without touching the real Netmaker, pki-manager or KMS.
//
// Like the backend, it holds a random seed per device and computes the codes
// itself (RFC 6238, HMAC-SHA1, 600 s step, ±1); the gateway cannot. Codes are
// single-use per purpose (a code at step N kills every step ≤ N), five wrong
// codes lock the device for 15 minutes, and ssh-ca `renew` is authenticated
// by an SSHSIG of the enrolled host key.
//
//	fakeapi genkey                      print "<private> <public>" (WireGuard)
//	fakeapi gentls -dir DIR -hosts H,…  throwaway device-API CA + server cert
//	                                    (DIR/api-ca.pem, api.pem, api.key)
//	fakeapi pipe HOST:PORT              relay stdio to HOST:PORT (a QEMU guestfwd cmd)
//	fakeapi serve -listen 127.0.0.1:18080 -dir DIR [-tls-listen ADDR] [-netmaker-hook CMD]
//
// DIR holds the scenario: gw.key (the gateway's install-time WireGuard
// private key), hub.pub, host_ca / user_ca.pub (ssh-keygen CAs) and
// network_id. -tls-listen also serves the API over HTTPS with DIR/api.pem
// (decision-035 §1).
//
// Gateway-held WireGuard keys (decision-035 §2): a vpn request with
// "wg_public_key" gets a config WITHOUT a PrivateKey line; when the key
// differs from the device's current one, fakeapi "updates Netmaker" by
// running -netmaker-hook (sh -c, env NEW_PUBLIC_KEY / OLD_PUBLIC_KEY) —
// the QEMU test moves the hub's WireGuard peer — and the device's key becomes
// gateway-held (a later keyless request is refused with 409).
//
// Test-only endpoints (the operator's view of the UI):
//
//	GET  /test/code?device_id=D[&purpose=vpn]   the code the UI would show now
//	                                            (the next step's once the current one
//	                                            is used; 409 when both are spent)
//	POST /test/rotate?device_id=D               "Reset code": a new seed
//	POST /control?vpn=good|bad-peer&ssh=good|bad-cert&validity=long|short&reset_ssh=1
package main

import (
	"bufio"
	"crypto/ecdh"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/i40sys/iotgw-ng/live-image/internal/envelope"
	"github.com/i40sys/iotgw-ng/live-image/internal/seal"
	"github.com/i40sys/iotgw-ng/live-image/internal/testpki"
	"github.com/i40sys/iotgw-ng/live-image/internal/wgkey"
)

const (
	stepSeconds = 600
	maxFailures = 5
	lockFor     = 15 * time.Minute
	renewSkew   = 300 // seconds
)

func main() {
	if len(os.Args) > 1 && os.Args[1] == "genkey" {
		k, err := ecdh.X25519().GenerateKey(rand.Reader)
		if err != nil {
			log.Fatal(err)
		}
		fmt.Println(base64.StdEncoding.EncodeToString(k.Bytes()), base64.StdEncoding.EncodeToString(k.PublicKey().Bytes()))
		return
	}
	if len(os.Args) > 1 && os.Args[1] == "gentls" {
		fs := flag.NewFlagSet("gentls", flag.ExitOnError)
		dir := fs.String("dir", ".", "output directory")
		hosts := fs.String("hosts", "127.0.0.1", "comma-separated IPs / DNS names for the server certificate")
		_ = fs.Parse(os.Args[2:])
		if err := genTLS(*dir, strings.Split(*hosts, ",")); err != nil {
			log.Fatal(err)
		}
		return
	}
	if len(os.Args) == 3 && os.Args[1] == "pipe" {
		pipe(os.Args[2])
		return
	}
	if len(os.Args) < 2 || os.Args[1] != "serve" {
		log.Fatal("usage: fakeapi genkey | gentls -dir DIR -hosts H,… | pipe HOST:PORT | serve -listen ADDR -dir DIR [-tls-listen ADDR] [-netmaker-hook CMD]")
	}
	fs := flag.NewFlagSet("serve", flag.ExitOnError)
	listen := fs.String("listen", "127.0.0.1:18080", "listen address")
	tlsListen := fs.String("tls-listen", "", "also serve HTTPS here with DIR/api.pem + DIR/api.key")
	hook := fs.String("netmaker-hook", "", "shell command run when a device's WireGuard public key changes")
	dir := fs.String("dir", ".", "scenario directory")
	_ = fs.Parse(os.Args[2:])
	s := newServer(*dir)
	s.hook = *hook
	if *tlsListen != "" {
		go func() {
			log.Printf("fakeapi listening on https://%s", *tlsListen)
			log.Fatal(http.ListenAndServeTLS(*tlsListen, filepath.Join(*dir, "api.pem"), filepath.Join(*dir, "api.key"), s.mux()))
		}()
	}
	log.Printf("fakeapi listening on %s (scenario %s)", *listen, *dir)
	log.Fatal(http.ListenAndServe(*listen, s.mux()))
}

// genTLS writes a throwaway CA and a server certificate for hosts.
func genTLS(dir string, hosts []string) error {
	b, err := testpki.New(hosts...)
	if err != nil {
		return err
	}
	for name, v := range map[string][]byte{"api-ca.pem": b.CAPEM, "api.pem": b.CertPEM, "api.key": b.KeyPEM} {
		if err := os.WriteFile(filepath.Join(dir, name), v, 0o600); err != nil {
			return err
		}
	}
	return nil
}

// pipe relays stdin/stdout to a TCP address: QEMU's guestfwd runs one per
// guest connection (`guestfwd=tcp:IP:443-cmd:fakeapi pipe 127.0.0.1:PORT`).
func pipe(addr string) {
	c, err := net.Dial("tcp", addr)
	if err != nil {
		os.Exit(1)
	}
	done := make(chan struct{}, 2)
	go func() {
		_, _ = io.Copy(c, bufio.NewReader(os.Stdin))
		c.(*net.TCPConn).CloseWrite()
		done <- struct{}{}
	}()
	go func() { _, _ = io.Copy(os.Stdout, c); done <- struct{}{} }()
	<-done
	<-done
}

// device is the server-side record of one device.
type device struct {
	seed        []byte
	seedN       int
	used        map[string]int64 // purpose → highest used step (this seed)
	failures    int
	lockedUntil time.Time
	hostPub     string // enrolled host key ("type base64"); "" = not enrolled
	lastRenewTS int64
	wgPub       string // the Netmaker client's WireGuard public key
	wgHeld      bool   // the private key is gateway-held (server stores none)
}

type server struct {
	dir      string
	mu       sync.Mutex
	vpnMode  string // good | bad-peer
	sshMode  string // good | bad-cert
	validity string // long | short (short = inside the gateway's renewal margin)
	devices  map[string]*device
	now      func() time.Time
	hook     string // -netmaker-hook
}

func newServer(dir string) *server {
	return &server{dir: dir, vpnMode: "good", sshMode: "good", validity: "long", devices: map[string]*device{}, now: time.Now}
}

func (s *server) mux() *http.ServeMux {
	m := http.NewServeMux()
	m.HandleFunc("/functions/v1/vpn", s.vpn)
	m.HandleFunc("/functions/v1/ssh-ca", s.sshCA)
	m.HandleFunc("/control", s.control)
	m.HandleFunc("/test/code", s.testCode)
	m.HandleFunc("/test/rotate", s.testRotate)
	return m
}

func (s *server) read(name string) string {
	b, err := os.ReadFile(filepath.Join(s.dir, name))
	if err != nil {
		log.Printf("scenario file %s: %v", name, err)
	}
	return strings.TrimSpace(string(b))
}

// dev returns (creating it, with a fresh seed) the record of id. s.mu held.
func (s *server) dev(id string) *device {
	d := s.devices[id]
	if d == nil {
		d = &device{}
		d.wgPub, _ = wgkey.Public(s.read("gw.key"))
		s.rotate(d)
		s.devices[id] = d
	}
	return d
}

// rotate gives d a new random seed (the UI's "Reset code"). s.mu held.
func (s *server) rotate(d *device) {
	d.seed = make([]byte, 32)
	if _, err := rand.Read(d.seed); err != nil {
		log.Fatal(err)
	}
	d.seedN++
	d.used = map[string]int64{}
}

// codeAt is RFC 6238 TOTP (HMAC-SHA1, 6 digits) at a step.
func codeAt(seed []byte, step int64) string {
	var msg [8]byte
	binary.BigEndian.PutUint64(msg[:], uint64(step))
	m := hmac.New(sha1.New, seed)
	m.Write(msg[:])
	h := m.Sum(nil)
	o := h[len(h)-1] & 0x0f
	v := (uint32(h[o])&0x7f)<<24 | uint32(h[o+1])<<16 | uint32(h[o+2])<<8 | uint32(h[o+3])
	return fmt.Sprintf("%06d", v%1_000_000)
}

func (s *server) step() int64 { return s.now().Unix() / stepSeconds }

func usedStep(d *device, purpose string) int64 {
	if v, ok := d.used[purpose]; ok {
		return v
	}
	return -1
}

func jsonErr(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

// authenticate is device-auth.ts: lock check, try each candidate code,
// record a failure, consume the code (single use per purpose).
func (s *server) authenticate(w http.ResponseWriter, deviceID, purpose string, body []byte) ([]byte, string, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	d := s.dev(deviceID)
	if s.now().Before(d.lockedUntil) {
		jsonErr(w, 429, "too many failed codes; try again later")
		return nil, "", false
	}
	now := s.step()
	for _, st := range []int64{now - 1, now, now + 1} {
		code := codeAt(d.seed, st)
		plain, err := envelope.Open(body, code)
		if err != nil || !json.Valid(plain) {
			// A wrong code still passes the CBC padding check ~1/256 of the
			// time: only a JSON plaintext proves the right code.
			continue
		}
		if usedStep(d, purpose) >= st {
			log.Printf("%s: device %s: code (step %d) already used", purpose, deviceID, st)
			jsonErr(w, 401, "code already used — get a new code from the UI")
			return nil, "", false
		}
		d.used[purpose] = st
		d.failures = 0
		log.Printf("%s: device %s: code accepted (step %d) and consumed", purpose, deviceID, st)
		return plain, code, true
	}
	d.failures++
	if d.failures >= maxFailures {
		d.lockedUntil, d.failures = s.now().Add(lockFor), 0
	}
	log.Printf("%s: device %s: no valid code opens the request", purpose, deviceID)
	jsonErr(w, 401, "Authentication failed")
	return nil, "", false
}

func (s *server) control(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	defer s.mu.Unlock()
	q := r.URL.Query()
	if m := q.Get("vpn"); m != "" {
		s.vpnMode = m
	}
	if m := q.Get("ssh"); m != "" {
		s.sshMode = m
	}
	if m := q.Get("validity"); m != "" {
		s.validity = m
	}
	if q.Get("reset_ssh") != "" {
		for id, d := range s.devices {
			d.hostPub, d.lastRenewTS = "", 0
			log.Printf("ssh-ca: SSH enrollment of %s reset", id)
		}
	}
	fmt.Fprintf(w, "vpn=%s ssh=%s validity=%s\n", s.vpnMode, s.sshMode, s.validity)
}

// testCode is what the UI's getDeviceCode shows: the current step's code, or
// the next step's once the current one was used for that purpose.
func (s *server) testCode(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("device_id")
	purpose := r.URL.Query().Get("purpose")
	if purpose == "" {
		purpose = "vpn"
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	d := s.dev(id)
	now := s.step()
	for _, st := range []int64{now, now + 1} {
		if usedStep(d, purpose) < st {
			fmt.Fprintln(w, codeAt(d.seed, st))
			return
		}
	}
	jsonErr(w, 409, "both the current and the next code are used: rotate the seed (Reset code)")
}

func (s *server) testRotate(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("device_id")
	s.mu.Lock()
	defer s.mu.Unlock()
	d := s.dev(id)
	s.rotate(d)
	log.Printf("device %s: seed rotated (#%d)", id, d.seedN)
	fmt.Fprintf(w, "rotated %d\n", d.seedN)
}

func (s *server) vpn(w http.ResponseWriter, r *http.Request) {
	body, _ := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	deviceID := r.URL.Query().Get("device_id")
	plain, code, ok := s.authenticate(w, deviceID, "vpn", body)
	if !ok {
		return
	}
	var req map[string]string
	_ = json.Unmarshal(plain, &req)
	s.mu.Lock()
	mode := s.vpnMode
	s.mu.Unlock()
	peer := s.read("hub.pub")
	if mode == "bad-peer" {
		// A syntactically valid key nobody holds: the tunnel cannot come up.
		peer = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
	}
	keyLine := "PrivateKey = " + s.read("gw.key")
	if pub, sent := req["wg_public_key"]; sent {
		if !wgkey.ValidPublic(pub) {
			jsonErr(w, 400, "wg_public_key must be a base64 32-byte key")
			return
		}
		s.mu.Lock()
		d := s.dev(deviceID)
		old := d.wgPub
		s.mu.Unlock()
		if pub != old {
			if err := s.runHook(pub, old); err != nil {
				log.Printf("vpn: Netmaker update FAILED: %v", err)
				jsonErr(w, 502, "Netmaker update failed")
				return
			}
			log.Printf("vpn: device %s: Netmaker client moved to the gateway's new public key %s", deviceID, pub)
		} else {
			log.Printf("vpn: device %s: gateway public key unchanged (%s), Netmaker untouched", deviceID, pub)
		}
		s.mu.Lock()
		d.wgPub, d.wgHeld = pub, true
		s.mu.Unlock()
		keyLine = "# PrivateKey: held by the gateway"
		log.Printf("vpn: device %s: PrivateKey omitted (gateway-held)", deviceID)
	} else {
		s.mu.Lock()
		held := s.dev(deviceID).wgHeld
		s.mu.Unlock()
		if held {
			jsonErr(w, 409, "this device's WireGuard key is held by the gateway; update the gateway agent")
			return
		}
	}
	conf := fmt.Sprintf(`# WireGuard VPN Configuration File (fakeapi)
# Network ID: %s
# Network: 10.99.0.0/24
[Interface]
%s
Address = 10.99.0.2/32

[Peer]
PublicKey = %s
Endpoint = 203.0.113.10:51820
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 20
`, s.read("network_id"), keyLine, peer)
	if rk := req["reply_key"]; rk != "" {
		out, err := seal.Seal(rk, deviceID, []byte(conf))
		if err != nil {
			jsonErr(w, 400, "bad reply_key: "+err.Error())
			return
		}
		log.Printf("vpn: device %s gateway %s interface %s → mode %s, reply SEALED to reply_key", deviceID, req["gateway"], req["interface"], mode)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(out)
		return
	}
	log.Printf("vpn: device %s → mode %s, deprecated unsealed vpn reply", deviceID, mode)
	sealed, err := envelope.Seal([]byte(conf), code)
	if err != nil {
		jsonErr(w, 500, err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/octet-stream")
	_, _ = w.Write(sealed)
}

// runHook "updates Netmaker": the ext client's publickey becomes pub.
func (s *server) runHook(pub, old string) error {
	if s.hook == "" {
		return nil
	}
	cmd := exec.Command("sh", "-c", s.hook)
	cmd.Env = append(os.Environ(), "NEW_PUBLIC_KEY="+pub, "OLD_PUBLIC_KEY="+old)
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("%v: %s", err, strings.TrimSpace(string(out)))
	}
	return nil
}

func normPub(pub string) (string, bool) {
	f := strings.Fields(pub)
	if len(f) < 2 {
		return "", false
	}
	return f[0] + " " + f[1], true
}

func (s *server) sshCA(w http.ResponseWriter, r *http.Request) {
	body, _ := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	deviceID := r.URL.Query().Get("device_id")
	if strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
		s.renew(w, deviceID, body)
		return
	}
	// The purpose is known only once the envelope is open; the gateway only
	// sends enroll here (live-enroll is the live image's, not tested here).
	plain, code, ok := s.authenticate(w, deviceID, "ssh-enroll", body)
	if !ok {
		return
	}
	var req map[string]string
	if err := json.Unmarshal(plain, &req); err != nil {
		jsonErr(w, 400, "bad json")
		return
	}
	if req["action"] != "enroll" {
		jsonErr(w, 400, "fakeapi only implements enroll (code) and renew (host key)")
		return
	}
	norm, ok := normPub(req["host_pubkey"])
	if !ok {
		jsonErr(w, 400, "bad host_pubkey")
		return
	}
	s.mu.Lock()
	enrolled := s.dev(deviceID).hostPub != ""
	s.mu.Unlock()
	if enrolled {
		log.Printf("ssh-ca: enroll REFUSED: device %s already enrolled", deviceID)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(409)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "device already enrolled",
			"details": "renew with the host key (action renew), or use Reset SSH enrollment in the UI after a reinstall"})
		return
	}
	resp, status, err := s.issue(deviceID, norm, "enroll")
	if err != nil {
		jsonErr(w, status, err.Error())
		return
	}
	log.Printf("ssh-ca: enrolled %s (host key %s…)", deviceID, norm[:40])
	sealed, err := envelope.Seal(resp, code)
	if err != nil {
		jsonErr(w, 500, err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/octet-stream")
	_, _ = w.Write(sealed)
}

// renew is the code-less ssh-ca action: SSHSIG (namespace iotgw-renew) by the
// enrolled host key over "<device_id>\n<host_pubkey>\n<ts>".
func (s *server) renew(w http.ResponseWriter, deviceID string, body []byte) {
	var req struct {
		DeviceID   string `json:"device_id"`
		Action     string `json:"action"`
		HostPubkey string `json:"host_pubkey"`
		TS         int64  `json:"ts"`
		Sig        string `json:"sig"`
	}
	if err := json.Unmarshal(body, &req); err != nil || req.Action != "renew" {
		jsonErr(w, 400, "plain JSON requests must be action renew")
		return
	}
	if req.DeviceID != deviceID {
		jsonErr(w, 400, "device_id mismatch")
		return
	}
	norm, ok := normPub(req.HostPubkey)
	if !ok {
		jsonErr(w, 400, "bad host_pubkey")
		return
	}
	if d := s.now().Unix() - req.TS; d > renewSkew || d < -renewSkew {
		jsonErr(w, 401, "renew timestamp out of window")
		return
	}
	s.mu.Lock()
	enrolledKey := s.dev(deviceID).hostPub
	s.mu.Unlock()
	if enrolledKey == "" {
		jsonErr(w, 401, "device is not enrolled: enroll with a one-time code")
		return
	}
	if err := verifySSHSig(enrolledKey, "iotgw-renew", fmt.Sprintf("%s\n%s\n%d", deviceID, norm, req.TS), req.Sig); err != nil {
		log.Printf("ssh-ca: renew signature REJECTED: %v", err)
		jsonErr(w, 401, "renew signature does not verify against the enrolled host key")
		return
	}
	s.mu.Lock()
	d := s.dev(deviceID)
	if d.lastRenewTS >= req.TS {
		s.mu.Unlock()
		jsonErr(w, 401, "stale or replayed renew")
		return
	}
	d.lastRenewTS = req.TS
	s.mu.Unlock()
	log.Printf("ssh-ca: renew signature OK (device %s)", deviceID)
	resp, status, err := s.issue(deviceID, norm, "renew")
	if err != nil {
		jsonErr(w, status, err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write(resp)
}

// issue signs norm with the host CA, records the enrollment and returns the
// reply payload.
func (s *server) issue(deviceID, norm, action string) ([]byte, int, error) {
	tmp, _ := os.MkdirTemp("", "fakeca-")
	defer os.RemoveAll(tmp)
	pubFile := filepath.Join(tmp, "host.pub")
	_ = os.WriteFile(pubFile, []byte(norm+"\n"), 0o644)
	s.mu.Lock()
	bad, short := s.sshMode == "bad-cert", s.validity == "short"
	s.mu.Unlock()
	if bad {
		// A certificate for SOME OTHER key: sshd -t would accept it.
		_ = os.Remove(pubFile)
		_ = exec.Command("ssh-keygen", "-q", "-t", "ecdsa", "-N", "", "-f", filepath.Join(tmp, "host")).Run()
	}
	validity, until := "-5m:+52w", 52*7*24*time.Hour
	if short {
		// Inside the gateway's 30-day renewal margin: the daemon renews it.
		validity, until = "-5m:+10d", 10*24*time.Hour
	}
	out, err := exec.Command("ssh-keygen", "-q", "-s", filepath.Join(s.dir, "host_ca"), "-I", "gw-test", "-h",
		"-n", "gw.test.iotgw,10.10.2.15", "-V", validity, pubFile).CombinedOutput()
	if err != nil {
		return nil, 502, fmt.Errorf("sign: %s", out)
	}
	cert, _ := os.ReadFile(filepath.Join(tmp, "host-cert.pub"))
	if !bad {
		s.mu.Lock()
		s.dev(deviceID).hostPub = norm // rolls forward on renew
		s.mu.Unlock()
	}
	resp, _ := json.Marshal(map[string]any{
		"action": action, "zone": "iotgw-test", "domain": "test",
		"principals": []string{"iotgw-admin", "iotgw-ops"}, "auth_principals": "iotgw-admin\niotgw-ops\n",
		"user_ca": s.read("user_ca.pub") + "\n", "host_cert": string(cert),
		"host_ca": s.read("host_ca.pub") + "\n", "cert_authority": "@cert-authority *.test.iotgw " + s.read("host_ca.pub") + "\n",
		"fqdn": "gw.test.iotgw", "host_cert_valid_before": s.now().Add(until).UTC().Format(time.RFC3339),
	})
	return resp, 200, nil
}

// verifySSHSig checks an armored SSHSIG over msg against pub.
func verifySSHSig(pub, namespace, msg, sig string) error {
	if sig == "" {
		return fmt.Errorf("no signature")
	}
	tmp, _ := os.MkdirTemp("", "fakesig-")
	defer os.RemoveAll(tmp)
	allowed := filepath.Join(tmp, "allowed")
	_ = os.WriteFile(allowed, []byte("gw "+pub+"\n"), 0o644)
	sigFile := filepath.Join(tmp, "sig")
	_ = os.WriteFile(sigFile, []byte(sig), 0o644)
	cmd := exec.Command("ssh-keygen", "-Y", "verify", "-f", allowed, "-I", "gw", "-n", namespace, "-s", sigFile)
	cmd.Stdin = strings.NewReader(msg)
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("%v: %s", err, strings.TrimSpace(string(out)))
	}
	return nil
}
