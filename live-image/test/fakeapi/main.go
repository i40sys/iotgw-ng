// Command fakeapi is a stand-in for the `vpn` and `ssh-ca` edge functions,
// used by the QEMU end-to-end test (test/qemu/run.sh, decision-032 /
// task-125.11). It speaks the real device envelope (internal/envelope) and
// authenticates with the real TOTP derivation (internal/totp), so the agent
// under test runs its production code path — without touching the real
// Netmaker or pki-manager.
//
//	fakeapi genkey                      print "<private> <public>" (WireGuard)
//	fakeapi serve -listen 127.0.0.1:18080 -dir DIR
//
// DIR holds the scenario: gw.key (gateway WireGuard private key), hub.pub,
// host_ca / user_ca.pub (ssh-keygen CAs) and the device identity. POST
// /control?vpn=good|bad-peer switches what the vpn function returns.
package main

import (
	"crypto/ecdh"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/i40sys/iotgw-ng/live-image/internal/envelope"
	"github.com/i40sys/iotgw-ng/live-image/internal/totp"
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
	if len(os.Args) < 2 || os.Args[1] != "serve" {
		log.Fatal("usage: fakeapi genkey | fakeapi serve -listen ADDR -dir DIR")
	}
	fs := flag.NewFlagSet("serve", flag.ExitOnError)
	listen := fs.String("listen", "127.0.0.1:18080", "listen address")
	dir := fs.String("dir", ".", "scenario directory")
	_ = fs.Parse(os.Args[2:])
	s := &server{dir: *dir, vpnMode: "good", issued: map[string]bool{}}
	http.HandleFunc("/functions/v1/vpn", s.vpn)
	http.HandleFunc("/functions/v1/ssh-ca", s.sshCA)
	http.HandleFunc("/control", s.control)
	log.Printf("fakeapi listening on %s (scenario %s)", *listen, *dir)
	log.Fatal(http.ListenAndServe(*listen, nil))
}

type server struct {
	dir     string
	mu      sync.Mutex
	vpnMode string
	issued  map[string]bool // host pubkeys already certified (continuity)
	counts  map[string]int
}

func (s *server) read(name string) string {
	b, err := os.ReadFile(filepath.Join(s.dir, name))
	if err != nil {
		log.Printf("scenario file %s: %v", name, err)
	}
	return strings.TrimSpace(string(b))
}

// open authenticates like device-auth.ts: try every currently valid code.
func (s *server) open(r *http.Request) ([]byte, string, error) {
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		return nil, "", err
	}
	id := totp.Identity{DomainID: s.read("domain_id"), NetworkID: s.read("network_id"), DeviceUUID: s.read("device_uuid")}
	fmt.Sscanf(s.read("totp_counter"), "%d", &id.Counter)
	now := time.Now()
	for _, off := range []time.Duration{0, -totp.Period, totp.Period} {
		code := totp.Code(id, now.Add(off))
		if plain, err := envelope.Open(body, code); err == nil {
			return plain, code, nil
		}
	}
	return nil, "", fmt.Errorf("no valid code opens the request")
}

func jsonErr(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

func (s *server) reply(w http.ResponseWriter, code string, plain []byte) {
	sealed, err := envelope.Seal(plain, code)
	if err != nil {
		jsonErr(w, 500, err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/octet-stream")
	_, _ = w.Write(sealed)
}

func (s *server) control(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if m := r.URL.Query().Get("vpn"); m != "" {
		s.vpnMode = m
	}
	fmt.Fprintf(w, "vpn=%s\n", s.vpnMode)
}

func (s *server) vpn(w http.ResponseWriter, r *http.Request) {
	plain, code, err := s.open(r)
	if err != nil {
		jsonErr(w, 401, err.Error())
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
	log.Printf("vpn: device %s gateway %s interface %s → mode %s", req["device_id"], req["gateway"], req["interface"], mode)
	conf := fmt.Sprintf(`# WireGuard VPN Configuration File (fakeapi)
# Network ID: %s
# Network: 10.99.0.0/24
[Interface]
PrivateKey = %s
Address = 10.99.0.2/32

[Peer]
PublicKey = %s
Endpoint = 203.0.113.10:51820
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 20
`, s.read("network_id"), s.read("gw.key"), peer)
	s.reply(w, code, []byte(conf))
}

func (s *server) sshCA(w http.ResponseWriter, r *http.Request) {
	plain, code, err := s.open(r)
	if err != nil {
		jsonErr(w, 401, err.Error())
		return
	}
	var req map[string]string
	if err := json.Unmarshal(plain, &req); err != nil {
		jsonErr(w, 400, "bad json")
		return
	}
	if req["action"] != "enroll" {
		jsonErr(w, 400, "fakeapi only implements enroll")
		return
	}
	pub := strings.TrimSpace(req["host_pubkey"])
	f := strings.Fields(pub)
	if len(f) < 2 {
		jsonErr(w, 400, "bad host_pubkey")
		return
	}
	norm := f[0] + " " + f[1]
	s.mu.Lock()
	enrolled := len(s.issued) > 0
	s.mu.Unlock()
	if enrolled {
		// task-075: a re-enroll must prove the previous host key.
		if err := s.verifyContinuity(req["device_id"], norm, code, req["continuity_sig"]); err != nil {
			log.Printf("ssh-ca: continuity REJECTED: %v", err)
			jsonErr(w, 401, "re-enrollment requires proof of the existing host key: "+err.Error())
			return
		}
		log.Printf("ssh-ca: continuity proof OK")
	}
	tmp, _ := os.MkdirTemp("", "fakeca-")
	defer os.RemoveAll(tmp)
	pubFile := filepath.Join(tmp, "host.pub")
	_ = os.WriteFile(pubFile, []byte(norm+"\n"), 0o644)
	out, err := exec.Command("ssh-keygen", "-q", "-s", filepath.Join(s.dir, "host_ca"), "-I", "gw-test", "-h",
		"-n", "gw.test.iotgw,10.10.2.15", "-V", "-5m:+52w", pubFile).CombinedOutput()
	if err != nil {
		jsonErr(w, 502, "sign: "+string(out))
		return
	}
	cert, _ := os.ReadFile(filepath.Join(tmp, "host-cert.pub"))
	s.mu.Lock()
	s.issued[norm] = true
	s.mu.Unlock()
	log.Printf("ssh-ca: host certificate issued for %s", norm[:40])
	resp, _ := json.Marshal(map[string]any{
		"action": "enroll", "zone": "iotgw-test", "domain": "test",
		"principals": []string{"iotgw-admin", "iotgw-ops"}, "auth_principals": "iotgw-admin\niotgw-ops\n",
		"user_ca": s.read("user_ca.pub") + "\n", "host_cert": string(cert),
		"fqdn": "gw.test.iotgw", "host_cert_valid_before": time.Now().Add(52 * 7 * 24 * time.Hour).UTC().Format(time.RFC3339),
	})
	s.reply(w, code, resp)
}

// verifyContinuity checks the SSHSIG over "<device_id>\n<new pubkey>\n<code>"
// against the previously issued host key(s), like ssh-ca does.
func (s *server) verifyContinuity(deviceID, norm, code, sig string) error {
	if sig == "" {
		return fmt.Errorf("no continuity_sig")
	}
	tmp, _ := os.MkdirTemp("", "fakecont-")
	defer os.RemoveAll(tmp)
	s.mu.Lock()
	var signers []string
	for k := range s.issued {
		signers = append(signers, "gw "+k)
	}
	s.mu.Unlock()
	allowed := filepath.Join(tmp, "allowed")
	_ = os.WriteFile(allowed, []byte(strings.Join(signers, "\n")+"\n"), 0o644)
	sigFile := filepath.Join(tmp, "sig")
	_ = os.WriteFile(sigFile, []byte(sig), 0o644)
	cmd := exec.Command("ssh-keygen", "-Y", "verify", "-f", allowed, "-I", "gw", "-n", "iotgw-reenroll", "-s", sigFile)
	cmd.Stdin = strings.NewReader(deviceID + "\n" + norm + "\n" + code)
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("%v: %s", err, strings.TrimSpace(string(out)))
	}
	return nil
}
