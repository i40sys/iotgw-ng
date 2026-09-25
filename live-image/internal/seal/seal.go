// Package seal is the sealed VPN reply of decision-033 §4: the gateway sends
// a fresh X25519 public key ("reply_key") inside its code-encrypted request,
// and the `vpn` edge function seals the WireGuard configuration to that key
// instead of to the 6-digit code. Brute-forcing the code from a recorded
// exchange then yields only the request, never the private key.
//
//	shared = X25519(ephemeral_priv, reply_key)
//	key    = HKDF-SHA256(ikm=shared, salt=epk‖reply_key, info="iotgw-vpn-reply v1", L=32)
//	ct     = AES-256-GCM(key, nonce, plaintext, AAD=device_id)  (16-byte tag appended)
//
// Wire format (JSON): {"v":1,"alg":"X25519-HKDF-SHA256-A256GCM","epk","nonce","ct"},
// every binary field base64 (standard, padded).
package seal

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/ecdh"
	"crypto/hkdf"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
)

// Version and Alg identify the only sealing scheme.
const (
	Version = 1
	Alg     = "X25519-HKDF-SHA256-A256GCM"
	info    = "iotgw-vpn-reply v1"
)

// Reply is the sealed reply document.
type Reply struct {
	V     int    `json:"v"`
	Alg   string `json:"alg"`
	EPK   string `json:"epk"`
	Nonce string `json:"nonce"`
	CT    string `json:"ct"`
}

// Key is the requester's per-call X25519 key pair. The private half lives
// only in memory, for one request.
type Key struct{ priv *ecdh.PrivateKey }

// NewKey generates a fresh reply key.
func NewKey() (*Key, error) {
	p, err := ecdh.X25519().GenerateKey(rand.Reader)
	if err != nil {
		return nil, err
	}
	return &Key{priv: p}, nil
}

// KeyFromBytes rebuilds a key from its 32-byte private scalar (tests,
// interoperability vectors).
func KeyFromBytes(b []byte) (*Key, error) {
	p, err := ecdh.X25519().NewPrivateKey(b)
	if err != nil {
		return nil, err
	}
	return &Key{priv: p}, nil
}

// Public is the reply_key sent in the request: base64 of the 32-byte key.
func (k *Key) Public() string {
	return base64.StdEncoding.EncodeToString(k.priv.PublicKey().Bytes())
}

// ErrNotSealed means the data is not a sealed reply document at all (e.g. a
// legacy code-encrypted envelope).
var ErrNotSealed = errors.New("not a sealed reply")

// IsSealed reports whether data looks like a sealed reply document.
func IsSealed(data []byte) bool {
	var r Reply
	d := bytes.TrimSpace(data)
	return len(d) > 0 && d[0] == '{' && json.Unmarshal(d, &r) == nil && r.Alg != ""
}

func deriveKey(shared, epk, replyKey []byte) ([]byte, error) {
	salt := append(append([]byte{}, epk...), replyKey...)
	return hkdf.Key(sha256.New, shared, salt, info, 32)
}

func gcm(key []byte) (cipher.AEAD, error) {
	b, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(b)
}

// Open decrypts a sealed reply addressed to k, bound to deviceID.
func (k *Key) Open(data []byte, deviceID string) ([]byte, error) {
	var r Reply
	if err := json.Unmarshal(bytes.TrimSpace(data), &r); err != nil {
		return nil, ErrNotSealed
	}
	if r.V != Version || r.Alg != Alg {
		return nil, fmt.Errorf("unsupported sealed reply (v %d, alg %q)", r.V, r.Alg)
	}
	epk, err1 := base64.StdEncoding.DecodeString(r.EPK)
	nonce, err2 := base64.StdEncoding.DecodeString(r.Nonce)
	ct, err3 := base64.StdEncoding.DecodeString(r.CT)
	if err := errors.Join(err1, err2, err3); err != nil {
		return nil, fmt.Errorf("sealed reply: bad base64: %w", err)
	}
	pub, err := ecdh.X25519().NewPublicKey(epk)
	if err != nil {
		return nil, fmt.Errorf("sealed reply: bad epk: %w", err)
	}
	shared, err := k.priv.ECDH(pub)
	if err != nil {
		return nil, fmt.Errorf("sealed reply: %w", err)
	}
	key, err := deriveKey(shared, epk, k.priv.PublicKey().Bytes())
	if err != nil {
		return nil, err
	}
	a, err := gcm(key)
	if err != nil {
		return nil, err
	}
	if len(nonce) != a.NonceSize() {
		return nil, fmt.Errorf("sealed reply: nonce is %d bytes, want %d", len(nonce), a.NonceSize())
	}
	plain, err := a.Open(nil, nonce, ct, []byte(deviceID))
	if err != nil {
		return nil, errors.New("sealed reply does not open with this request's key (tampered, or for another device)")
	}
	return plain, nil
}

// Seal is the server side (the `vpn` edge function's algorithm), used by the
// test double and the tests: it seals plaintext to replyKey (base64).
func Seal(replyKey, deviceID string, plaintext []byte) ([]byte, error) {
	rk, err := base64.StdEncoding.DecodeString(replyKey)
	if err != nil {
		return nil, fmt.Errorf("reply_key: %w", err)
	}
	peer, err := ecdh.X25519().NewPublicKey(rk)
	if err != nil {
		return nil, fmt.Errorf("reply_key: %w", err)
	}
	eph, err := ecdh.X25519().GenerateKey(rand.Reader)
	if err != nil {
		return nil, err
	}
	shared, err := eph.ECDH(peer)
	if err != nil {
		return nil, err
	}
	epk := eph.PublicKey().Bytes()
	key, err := deriveKey(shared, epk, rk)
	if err != nil {
		return nil, err
	}
	a, err := gcm(key)
	if err != nil {
		return nil, err
	}
	nonce := make([]byte, a.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return nil, err
	}
	enc := base64.StdEncoding.EncodeToString
	return json.Marshal(Reply{V: Version, Alg: Alg, EPK: enc(epk), Nonce: enc(nonce),
		CT: enc(a.Seal(nil, nonce, plaintext, []byte(deviceID)))})
}
