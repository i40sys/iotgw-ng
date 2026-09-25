package wgkey

import (
	"encoding/base64"
	"strings"
	"testing"
)

// RFC 7748 §6.1: Alice's private and public X25519 keys.
func TestPublicKnownVector(t *testing.T) {
	priv := hexB64(t, "77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a")
	want := hexB64(t, "8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a")
	got, err := Public(priv)
	if err != nil || got != want {
		t.Fatalf("Public = %q, %v; want %q", got, err, want)
	}
}

func TestGenerate(t *testing.T) {
	a, apub, err := Generate()
	if err != nil {
		t.Fatal(err)
	}
	b, _, _ := Generate()
	if a == b {
		t.Fatal("two generated keys are equal")
	}
	if p, _ := Public(a); p != apub || !ValidPublic(apub) {
		t.Fatalf("public key mismatch")
	}
	raw, _ := base64.StdEncoding.DecodeString(a)
	if raw[0]&7 != 0 || raw[31]&128 != 0 || raw[31]&64 == 0 {
		t.Fatal("private key not clamped")
	}
}

func TestPublicRejectsGarbageWithoutEchoingIt(t *testing.T) {
	for _, bad := range []string{"", "secret-value", base64.StdEncoding.EncodeToString([]byte("short"))} {
		_, err := Public(bad)
		if err == nil {
			t.Fatalf("%q accepted", bad)
		}
		if bad != "" && strings.Contains(err.Error(), bad) {
			t.Fatal("the error echoes the key")
		}
	}
}

func hexB64(t *testing.T, h string) string {
	t.Helper()
	b := make([]byte, len(h)/2)
	for i := range b {
		var v byte
		for _, c := range h[2*i : 2*i+2] {
			v <<= 4
			switch {
			case c >= '0' && c <= '9':
				v |= byte(c - '0')
			default:
				v |= byte(c-'a') + 10
			}
		}
		b[i] = v
	}
	return base64.StdEncoding.EncodeToString(b)
}
