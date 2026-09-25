// Package wgkey generates and derives WireGuard (Curve25519) keys without the
// wg tool (decision-035 §2): the gateway holds its private key and only its
// public key ever leaves the device. Never log a private key.
package wgkey

import (
	"crypto/ecdh"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"strings"
)

// Generate returns a new key pair as `wg genkey` / `wg pubkey` print them
// (standard base64 of 32 bytes; the private key is clamped).
func Generate() (priv, pub string, err error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", "", err
	}
	b[0] &= 248
	b[31] = (b[31] & 127) | 64
	priv = base64.StdEncoding.EncodeToString(b)
	pub, err = Public(priv)
	return priv, pub, err
}

// Public derives the public key of a base64 WireGuard private key. The error
// never contains the key.
func Public(priv string) (string, error) {
	b, err := base64.StdEncoding.DecodeString(strings.TrimSpace(priv))
	if err != nil || len(b) != 32 {
		return "", errors.New("not a WireGuard private key (base64 of 32 bytes)")
	}
	k, err := ecdh.X25519().NewPrivateKey(b)
	if err != nil {
		return "", errors.New("not a WireGuard private key")
	}
	return base64.StdEncoding.EncodeToString(k.PublicKey().Bytes()), nil
}

// ValidPublic reports whether s is a base64 32-byte public key.
func ValidPublic(s string) bool {
	b, err := base64.StdEncoding.DecodeString(s)
	return err == nil && len(b) == 32
}
