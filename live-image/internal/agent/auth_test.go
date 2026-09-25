package agent

import (
	"errors"
	"testing"
)

func TestDeviceCodeComesOnlyFromTheOperator(t *testing.T) {
	// A complete legacy identity (domain/network/uuid/counter) must not
	// produce a code: the gateway cannot compute one (decision-033).
	cfg := Config{APIBase: "http://api", DeviceID: "gw@12345678", DeviceUUID: "u", NetworkID: "n", DomainID: "d", TOTPCounter: 4}
	if _, err := DeviceCode(cfg, ""); !errors.Is(err, ErrNoCode) {
		t.Errorf("no -otp: %v, want ErrNoCode", err)
	}
	if _, err := DeviceCode(cfg, "12345"); err == nil {
		t.Error("a 5-digit code was accepted")
	}
	if c, err := DeviceCode(cfg, " 012345 "); err != nil || c != "012345" {
		t.Errorf("operator code: %q %v", c, err)
	}
}

func TestIdentityCompleteNeedsOnlyAPIAndDevice(t *testing.T) {
	if !(Config{APIBase: "http://api", DeviceID: "gw@12345678"}).IdentityComplete() {
		t.Error("api_base + device_id must be enough")
	}
	if (Config{DeviceID: "gw@12345678", DeviceUUID: "u", NetworkID: "n", DomainID: "d"}).IdentityComplete() {
		t.Error("no api_base: incomplete")
	}
}

func TestRenewMessageMatchesTheServer(t *testing.T) {
	// ssh-ca verifies `${device_id}\n${normalizeHostPubkey(host_pubkey)}\n${ts}`,
	// the key as "type base64" without its comment.
	norm, err := normHostPub("  ecdsa-sha2-nistp256 AAAAE2Vj root@gw \n")
	if err != nil || norm != "ecdsa-sha2-nistp256 AAAAE2Vj" {
		t.Fatalf("normHostPub: %q %v", norm, err)
	}
	if got := renewMessage("gw@12345678", norm, 1790000000); got != "gw@12345678\necdsa-sha2-nistp256 AAAAE2Vj\n1790000000" {
		t.Errorf("renew message: %q", got)
	}
	if _, err := normHostPub("garbage"); err == nil {
		t.Error("a one-field key was accepted")
	}
}
