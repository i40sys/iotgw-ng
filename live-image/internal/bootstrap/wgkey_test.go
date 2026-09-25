package bootstrap

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLiveWGKeyPerBoot(t *testing.T) {
	wgKeyPath = filepath.Join(t.TempDir(), "iotgw", "wg0.key")
	priv, pub, err := liveWGKey(false)
	if err != nil || priv == "" || pub == "" {
		t.Fatalf("first key: %v", err)
	}
	if fi, err := os.Stat(wgKeyPath); err != nil || fi.Mode().Perm() != 0o600 {
		t.Fatalf("key file: %v %v", fi, err)
	}
	// A refresh within the same boot keeps the key…
	p2, pub2, err := liveWGKey(false)
	if err != nil || p2 != priv || pub2 != pub {
		t.Fatal("the key changed within a boot")
	}
	// …unless rotated.
	p3, pub3, err := liveWGKey(true)
	if err != nil || p3 == priv || pub3 == pub {
		t.Fatal("rotate kept the key")
	}
	if b, _ := os.ReadFile(wgKeyPath); string(b) != p3+"\n" {
		t.Fatal("the rotated key was not kept")
	}
}
