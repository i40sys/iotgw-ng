package agent

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/i40sys/iotgw-ng/live-image/internal/uci"
)

// fakeAgent commits by writing "committed" to the network file, and reports
// health from the given sequence (first call = before the change).
func fakeAgent(t *testing.T, health ...Health) (*Agent, string, *int) {
	a, path, reloads, _ := fakeAgentIfUp(t, health...)
	return a, path, reloads
}

func fakeAgentIfUp(t *testing.T, health ...Health) (*Agent, string, *int, *[]string) {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "network")
	if err := os.WriteFile(path, []byte("original\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	reloads := 0
	calls := 0
	var ifups []string
	a := &Agent{
		UCI: &uci.Client{ConfigDir: dir, Run: func(_ context.Context, args ...string) (string, error) {
			if args[0] == "commit" {
				return "", os.WriteFile(path, []byte("committed\n"), 0o644)
			}
			if len(args) >= 3 && args[1] == "show" {
				return "network.wg0=interface\nnetwork.wgserver=wireguard_wg0\n", nil
			}
			return "", nil
		}},
		Reload:        func(context.Context) error { reloads++; return nil },
		IfUp:          func(_ context.Context, i string) error { ifups = append(ifups, i); return nil },
		VerifyTimeout: time.Millisecond,
		Measure: func(context.Context, string) Health {
			h := health[min(calls, len(health)-1)]
			calls++
			return h
		},
	}
	return a, path, &reloads, &ifups
}

func TestTransactRollsBackWhenEgressIsLost(t *testing.T) {
	a, path, reloads := fakeAgent(t, Health{Egress: true}, Health{Egress: false})
	_, _, err := a.Transact(context.Background(), "wg0", "test", []Op{{Path: "network.wan.metric", Value: "20"}}, NoRegression)
	if !errors.Is(err, ErrRolledBack) {
		t.Fatalf("err = %v, want a rollback", err)
	}
	if b, _ := os.ReadFile(path); string(b) != "original\n" {
		t.Fatalf("network after rollback = %q", b)
	}
	if *reloads != 2 {
		t.Fatalf("reloads = %d, want 2 (apply + restore)", *reloads)
	}
}

func TestTransactKeepsANonRegressingChange(t *testing.T) {
	a, path, reloads := fakeAgent(t, Health{Egress: true}, Health{Egress: true, Handshake: true})
	if _, _, err := a.Transact(context.Background(), "wg0", "test", []Op{{Path: "network.x", Value: "route"}}, NoRegression); err != nil {
		t.Fatal(err)
	}
	if b, _ := os.ReadFile(path); string(b) != "committed\n" || *reloads != 1 {
		t.Fatalf("network = %q, reloads = %d", b, *reloads)
	}
}

func TestTransactWithoutOpsTouchesNothing(t *testing.T) {
	a, path, reloads := fakeAgent(t, Health{})
	if _, _, err := a.Transact(context.Background(), "wg0", "test", nil, NoRegression); err != nil {
		t.Fatal(err)
	}
	if b, _ := os.ReadFile(path); string(b) != "original\n" || *reloads != 0 {
		t.Fatalf("network = %q, reloads = %d", b, *reloads)
	}
}

// netifd does not re-run WireGuard setup for a peer-only change: the
// transaction must re-create wg0 on apply AND on restore.
func TestTransactRecreatesTheTunnelWhenItsPeerChanges(t *testing.T) {
	a, _, _, ifups := fakeAgentIfUp(t, Health{Egress: true, Handshake: true}, Health{Egress: true})
	_, _, err := a.Transact(context.Background(), "wg0", "test", []Op{{Path: "network.wgserver.public_key", Value: "X"}}, NoRegression)
	if !errors.Is(err, ErrRolledBack) {
		t.Fatalf("err = %v, want a rollback (tunnel lost)", err)
	}
	if len(*ifups) != 2 || (*ifups)[0] != "wg0" {
		t.Fatalf("ifup calls = %v, want wg0 on apply and on restore", *ifups)
	}

	a, _, _, ifups = fakeAgentIfUp(t, Health{Egress: true}, Health{Egress: true})
	if _, _, err := a.Transact(context.Background(), "wg0", "test", []Op{{Path: "network.iotgw_endpoint.gateway", Value: "1.2.3.4"}}, NoRegression); err != nil {
		t.Fatal(err)
	}
	if len(*ifups) != 0 {
		t.Fatalf("a route-only change re-created the tunnel: %v", *ifups)
	}
}
