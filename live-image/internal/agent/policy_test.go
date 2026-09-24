package agent

import (
	"testing"
	"time"
)

func TestAutoFallsBackOnlyAfterThresholdAndOnlyToAWorkingPath(t *testing.T) {
	var c Counters
	lanDown := Observation{Current: EgressLAN, LANInternet: false, VPNInternet: true, Handshake: true}
	for i := 1; i < failThreshold; i++ {
		if d := Decide(PolicyAuto, EgressLAN, lanDown, &c); d.Want != EgressLAN {
			t.Fatalf("cycle %d: switched early: %+v", i, d)
		}
	}
	if d := Decide(PolicyAuto, EgressLAN, lanDown, &c); d.Want != EgressVPN {
		t.Fatalf("did not fall back: %+v", d)
	}

	// Both down: never move onto a dead path.
	c = Counters{}
	bothDown := Observation{Current: EgressLAN}
	for i := 0; i < 5; i++ {
		if d := Decide(PolicyAuto, EgressLAN, bothDown, &c); d.Want != EgressLAN {
			t.Fatalf("moved onto a dead VPN: %+v", d)
		}
	}
}

func TestAutoReturnsWithHysteresisOrAtOnceWhenFallbackDies(t *testing.T) {
	c := Counters{}
	onVPN := Observation{Current: EgressVPN, LANInternet: true, VPNInternet: true, Handshake: true}
	for i := 1; i < recoverThreshold; i++ {
		if d := Decide(PolicyAuto, EgressLAN, onVPN, &c); d.Want != EgressVPN {
			t.Fatalf("returned before hysteresis: %+v", d)
		}
	}
	if d := Decide(PolicyAuto, EgressLAN, onVPN, &c); d.Want != EgressLAN {
		t.Fatalf("did not return: %+v", d)
	}

	// A flapping LAN resets the recovery count: no ping-pong.
	c = Counters{}
	Decide(PolicyAuto, EgressLAN, onVPN, &c)
	Decide(PolicyAuto, EgressLAN, Observation{Current: EgressVPN, VPNInternet: true, Handshake: true}, &c)
	if c.PreferredOK != 0 {
		t.Fatalf("flap did not reset recovery: %+v", c)
	}

	c = Counters{}
	vpnDied := Observation{Current: EgressVPN, LANInternet: true}
	if d := Decide(PolicyAuto, EgressLAN, vpnDied, &c); d.Want != EgressLAN {
		t.Fatalf("stayed on a dead fallback: %+v", d)
	}
}

func TestPinnedPolicyNeverMovesOntoADeadPath(t *testing.T) {
	var c Counters
	if d := Decide(PolicyVPN, EgressLAN, Observation{Current: EgressLAN, LANInternet: true}, &c); d.Want != EgressLAN {
		t.Fatalf("pinned VPN moved onto a VPN without handshake: %+v", d)
	}
	if d := Decide(PolicyVPN, EgressLAN, Observation{Current: EgressLAN, LANInternet: true, VPNInternet: true, Handshake: true}, &c); d.Want != EgressVPN {
		t.Fatalf("pinned VPN not applied: %+v", d)
	}
}

func TestLimiter(t *testing.T) {
	now := time.Unix(1_790_000_000, 0)
	var l Limiter
	for i := 0; i < rateMax; i++ {
		if ok, why := l.Allow(now); !ok {
			t.Fatalf("change %d refused: %s", i, why)
		}
		l.Record(now, true)
	}
	if ok, _ := l.Allow(now); ok {
		t.Fatal("rate limit not enforced")
	}
	if ok, _ := l.Allow(now.Add(rateWindow + time.Second)); !ok {
		t.Fatal("rate window never expires")
	}

	l = Limiter{}
	l.Record(now, false)
	l.Record(now, false)
	if ok, _ := l.Allow(now.Add(90 * time.Second)); ok {
		t.Fatal("no backoff after two failures")
	}
	if ok, _ := l.Allow(now.Add(2*backoffBase + time.Second)); !ok {
		t.Fatal("backoff never ends")
	}
	l.Record(now, true)
	if l.FailStreak != 0 || !l.BackoffUntil.IsZero() {
		t.Fatalf("success did not reset backoff: %+v", l)
	}
}
