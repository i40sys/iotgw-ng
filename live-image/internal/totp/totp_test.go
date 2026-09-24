package totp

import (
	"testing"
	"time"
)

// The expected value is what the Ansible ssh_ca task's python derivation
// (and so device-auth.ts) produces for the same inputs and time step.
func TestCodeMatchesControllerDerivation(t *testing.T) {
	id := Identity{DomainID: "d", NetworkID: "n", DeviceUUID: "u", Counter: 4}
	at := time.Unix(1_790_000_000, 0)
	if got, want := Code(id, at), "076786"; got != want {
		t.Fatalf("Code = %s, want %s", got, want)
	}
	// Same 600 s step → same code; next step → (almost surely) different.
	if Code(id, at.Add(-time.Duration(at.Unix()%600)*time.Second)) != Code(id, at) {
		t.Fatal("code changed within one step")
	}
}
