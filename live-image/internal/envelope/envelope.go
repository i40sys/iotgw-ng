// Package envelope implements the device-authentication envelope shared with
// the `vpn` and `ssh-ca` edge functions (supabase/volumes/functions/_shared/
// device-auth.ts): OpenSSL-compatible `enc -aes-256-cbc -pbkdf2 -iter 300000
// -salt`, keyed by the device's one-time code. Being able to produce a
// ciphertext the server can open IS the authentication; the reply comes back
// under the same code.
package envelope

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/pbkdf2"
	"crypto/rand"
	"crypto/sha256"
	"errors"
	"fmt"
)

const (
	iterations  = 300_000
	saltedMagic = "Salted__"
)

func deriveKeyIV(password string, salt []byte) (key, iv []byte, err error) {
	// 48 bytes = 32-byte AES-256 key + 16-byte CBC IV, as OpenSSL derives them.
	km, err := pbkdf2.Key(sha256.New, password, salt, iterations, 48)
	if err != nil {
		return nil, nil, err
	}
	return km[:32], km[32:], nil
}

// Seal encrypts plaintext exactly like `openssl enc -aes-256-cbc -pbkdf2
// -iter 300000 -salt -pass pass:<password>`.
func Seal(plaintext []byte, password string) ([]byte, error) {
	salt := make([]byte, 8)
	if _, err := rand.Read(salt); err != nil {
		return nil, err
	}
	key, iv, err := deriveKeyIV(password, salt)
	if err != nil {
		return nil, err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	pad := aes.BlockSize - len(plaintext)%aes.BlockSize
	padded := append(append([]byte{}, plaintext...), bytes.Repeat([]byte{byte(pad)}, pad)...)
	out := make([]byte, len(padded))
	cipher.NewCBCEncrypter(block, iv).CryptBlocks(out, padded)
	return append(append([]byte(saltedMagic), salt...), out...), nil
}

// ErrBadEnvelope means the data is not a salted OpenSSL envelope or the
// password is wrong (the two are indistinguishable by design).
var ErrBadEnvelope = errors.New("not a valid envelope for this code")

// Open decrypts a Seal / `openssl enc` envelope.
func Open(data []byte, password string) ([]byte, error) {
	if len(data) < 16+aes.BlockSize || string(data[:8]) != saltedMagic {
		return nil, ErrBadEnvelope
	}
	key, iv, err := deriveKeyIV(password, data[8:16])
	if err != nil {
		return nil, err
	}
	body := data[16:]
	if len(body)%aes.BlockSize != 0 {
		return nil, ErrBadEnvelope
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	out := make([]byte, len(body))
	cipher.NewCBCDecrypter(block, iv).CryptBlocks(out, body)
	pad := int(out[len(out)-1])
	if pad == 0 || pad > aes.BlockSize || pad > len(out) {
		return nil, ErrBadEnvelope
	}
	for _, b := range out[len(out)-pad:] {
		if int(b) != pad {
			return nil, ErrBadEnvelope
		}
	}
	return out[:len(out)-pad], nil
}

// Describe renders a short, safe description of a failed Open for diagnostics.
func Describe(err error) string {
	if errors.Is(err, ErrBadEnvelope) {
		return "response could not be decrypted with the device code (wrong or expired code?)"
	}
	return fmt.Sprintf("decrypt: %v", err)
}
