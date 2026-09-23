package envelope

import (
	"bytes"
	"os/exec"
	"testing"
)

func TestRoundTrip(t *testing.T) {
	msg := []byte(`{"device_id":"gw-c3@88b97bd9"}`)
	sealed, err := Seal(msg, "123456")
	if err != nil {
		t.Fatal(err)
	}
	got, err := Open(sealed, "123456")
	if err != nil || !bytes.Equal(got, msg) {
		t.Fatalf("round trip: %q %v", got, err)
	}
	if _, err := Open(sealed, "654321"); err == nil {
		t.Fatal("wrong code must not open the envelope")
	}
}

// The wire format must be byte-compatible with the openssl CLI the old boot
// scripts and the edge functions' tests use.
func TestOpenSSLCompatible(t *testing.T) {
	if _, err := exec.LookPath("openssl"); err != nil {
		t.Skip("openssl not installed")
	}
	msg := []byte("hello from iotgw\n")
	sealed, err := Seal(msg, "424242")
	if err != nil {
		t.Fatal(err)
	}
	dec := exec.Command("openssl", "enc", "-d", "-aes-256-cbc", "-pbkdf2", "-iter", "300000", "-salt", "-pass", "pass:424242")
	dec.Stdin = bytes.NewReader(sealed)
	out, err := dec.Output()
	if err != nil || !bytes.Equal(out, msg) {
		t.Fatalf("openssl could not open our envelope: %q %v", out, err)
	}
	enc := exec.Command("openssl", "enc", "-aes-256-cbc", "-pbkdf2", "-iter", "300000", "-salt", "-pass", "pass:424242")
	enc.Stdin = bytes.NewReader(msg)
	ct, err := enc.Output()
	if err != nil {
		t.Fatal(err)
	}
	got, err := Open(ct, "424242")
	if err != nil || !bytes.Equal(got, msg) {
		t.Fatalf("could not open openssl's envelope: %q %v", got, err)
	}
}
