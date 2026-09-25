package seal

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/ecdh"
	"crypto/hkdf"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"os"
	"strings"
	"testing"

	"github.com/i40sys/iotgw-ng/live-image/internal/envelope"
)

const conf = "[Interface]\nPrivateKey = secret\nAddress = 10.99.0.2/32\n"

func TestRoundTrip(t *testing.T) {
	k, err := NewKey()
	if err != nil {
		t.Fatal(err)
	}
	if b, _ := base64.StdEncoding.DecodeString(k.Public()); len(b) != 32 {
		t.Fatalf("reply_key is %d bytes, want 32", len(b))
	}
	sealed, err := Seal(k.Public(), "gw-01@1a2b3c4d", []byte(conf))
	if err != nil {
		t.Fatal(err)
	}
	if !IsSealed(sealed) || bytes.Contains(sealed, []byte("secret")) {
		t.Fatalf("not a sealed document / plaintext leaked: %s", sealed)
	}
	var r Reply
	if err := json.Unmarshal(sealed, &r); err != nil || r.V != 1 || r.Alg != "X25519-HKDF-SHA256-A256GCM" {
		t.Fatalf("wire format: %+v %v", r, err)
	}
	if n, _ := base64.StdEncoding.DecodeString(r.Nonce); len(n) != 12 {
		t.Errorf("nonce is %d bytes, want 12", len(n))
	}
	plain, err := k.Open(sealed, "gw-01@1a2b3c4d")
	if err != nil || string(plain) != conf {
		t.Fatalf("open: %q %v", plain, err)
	}
}

func TestOpenRejects(t *testing.T) {
	k, _ := NewKey()
	other, _ := NewKey()
	sealed, _ := Seal(k.Public(), "gw-01@1a2b3c4d", []byte(conf))
	if _, err := k.Open(sealed, "gw-02@1a2b3c4d"); err == nil {
		t.Error("opened with another device_id (AAD)")
	}
	if _, err := other.Open(sealed, "gw-01@1a2b3c4d"); err == nil {
		t.Error("opened with another key")
	}
	var r Reply
	_ = json.Unmarshal(sealed, &r)
	ct, _ := base64.StdEncoding.DecodeString(r.CT)
	ct[0] ^= 1
	r.CT = base64.StdEncoding.EncodeToString(ct)
	tampered, _ := json.Marshal(r)
	if _, err := k.Open(tampered, "gw-01@1a2b3c4d"); err == nil {
		t.Error("opened a tampered ciphertext")
	}
	r.Alg = "something-else"
	bad, _ := json.Marshal(r)
	if _, err := k.Open(bad, "gw-01@1a2b3c4d"); err == nil || !strings.Contains(err.Error(), "unsupported") {
		t.Errorf("unsupported alg accepted: %v", err)
	}
}

func TestLegacyEnvelopeIsNotSealed(t *testing.T) {
	legacy, err := envelope.Seal([]byte(conf), "123456")
	if err != nil {
		t.Fatal(err)
	}
	if IsSealed(legacy) {
		t.Error("a legacy code envelope was taken for a sealed reply")
	}
	k, _ := NewKey()
	if _, err := k.Open(legacy, "x"); err != ErrNotSealed {
		t.Errorf("want ErrNotSealed, got %v", err)
	}
}

// TestMatchesTheSpec recomputes the reply by hand from fixed keys, step by
// step as the contract writes it, so a change to either side shows.
func TestMatchesTheSpec(t *testing.T) {
	recv, _ := KeyFromBytes(bytes.Repeat([]byte{7}, 32))
	eph, _ := ecdh.X25519().NewPrivateKey(bytes.Repeat([]byte{9}, 32))
	rk := recv.priv.PublicKey().Bytes()
	epk := eph.PublicKey().Bytes()
	shared, _ := eph.ECDH(recv.priv.PublicKey())
	key, _ := hkdf.Key(sha256.New, shared, append(append([]byte{}, epk...), rk...), "iotgw-vpn-reply v1", 32)
	b, _ := aes.NewCipher(key)
	a, _ := cipher.NewGCM(b)
	nonce := bytes.Repeat([]byte{1}, 12)
	enc := base64.StdEncoding.EncodeToString
	doc, _ := json.Marshal(map[string]any{"v": 1, "alg": Alg, "epk": enc(epk), "nonce": enc(nonce),
		"ct": enc(a.Seal(nil, nonce, []byte(conf), []byte("gw-01@1a2b3c4d")))})
	plain, err := recv.Open(doc, "gw-01@1a2b3c4d")
	if err != nil || string(plain) != conf {
		t.Fatalf("hand-built reply: %q %v", plain, err)
	}
}

// TestOpensTheEdgeFunctionVector opens a reply produced by the `vpn` edge
// function's own sealing code (task-132.04): the two implementations agree.
func TestOpensTheEdgeFunctionVector(t *testing.T) {
	b, err := os.ReadFile("testdata/edge-function-vector.json")
	if err != nil {
		t.Fatal(err)
	}
	var v struct {
		Priv      string          `json:"recipient_private_key_x25519_raw_b64"`
		ReplyKey  string          `json:"reply_key_b64"`
		DeviceID  string          `json:"device_id"`
		Plaintext string          `json:"plaintext"`
		Sealed    json.RawMessage `json:"sealed_reply_json"`
	}
	if err := json.Unmarshal(b, &v); err != nil {
		t.Fatal(err)
	}
	raw, _ := base64.StdEncoding.DecodeString(v.Priv)
	k, err := KeyFromBytes(raw)
	if err != nil {
		t.Fatal(err)
	}
	if k.Public() != v.ReplyKey {
		t.Fatalf("reply_key %s, vector says %s", k.Public(), v.ReplyKey)
	}
	if !IsSealed(v.Sealed) {
		t.Fatal("the vector's reply is not recognised as sealed")
	}
	plain, err := k.Open(v.Sealed, v.DeviceID)
	if err != nil || string(plain) != v.Plaintext {
		t.Fatalf("open: %q %v", plain, err)
	}
	if _, err := k.Open(v.Sealed, v.DeviceID+"x"); err == nil {
		t.Error("the vector opened with another device_id")
	}
}
