package agent

import (
	"fmt"
	"time"
)

// Hysteresis thresholds: how many consecutive checks must agree before the
// egress moves. With the default 60 s interval that is ~3 minutes, which rides
// out a DHCP renewal or a flapping cable without LAN ⇄ VPN ping-pong.
const (
	failThreshold    = 3
	recoverThreshold = 3
)

// Rate limit and backoff for automatic changes (decision-032 §7).
const (
	rateWindow  = 15 * time.Minute
	rateMax     = 3
	backoffBase = time.Minute
	backoffMax  = 30 * time.Minute
)

// Observation is what one check cycle measured.
type Observation struct {
	Current     Egress // path the default route takes now
	LANInternet bool   // Internet reachable out of the uplink device
	VPNInternet bool   // Internet reachable out of the tunnel
	Handshake   bool   // fresh WireGuard handshake
}

// Counters carries hysteresis across cycles.
type Counters struct {
	PreferredFails int // consecutive cycles the preferred path had no Internet
	PreferredOK    int // consecutive cycles the preferred path had Internet (while on the fallback)
}

// Decision is the egress the policy wants and why.
type Decision struct {
	Want   Egress
	Reason string
}

func other(e Egress) Egress {
	if e == EgressVPN {
		return EgressLAN
	}
	return EgressVPN
}

func pathOK(o Observation, e Egress) bool {
	if e == EgressVPN {
		return o.Handshake && o.VPNInternet
	}
	return o.LANInternet
}

// Decide applies the policy. It never asks to move onto a path that is not
// working right now: a change must not leave the gateway without egress.
func Decide(p Policy, prefer Egress, o Observation, c *Counters) Decision {
	cur := o.Current
	if cur == EgressUnknown {
		cur = EgressLAN
	}
	switch p {
	case PolicyLAN, PolicyVPN:
		want := EgressLAN
		if p == PolicyVPN {
			want = EgressVPN
		}
		c.PreferredFails, c.PreferredOK = 0, 0
		if cur == want {
			return Decision{Want: cur, Reason: fmt.Sprintf("pinned to %s", want)}
		}
		if !pathOK(o, want) {
			return Decision{Want: cur, Reason: fmt.Sprintf("pinned to %s, but %s has no Internet — staying on %s", want, want, cur)}
		}
		return Decision{Want: want, Reason: fmt.Sprintf("pinned to %s", want)}
	}

	// auto: prefer `prefer`, fall back to the other path.
	fallback := other(prefer)
	if cur == prefer {
		c.PreferredOK = 0
		if pathOK(o, prefer) {
			c.PreferredFails = 0
			return Decision{Want: prefer, Reason: fmt.Sprintf("%s (preferred) has Internet", prefer)}
		}
		c.PreferredFails++
		if c.PreferredFails < failThreshold {
			return Decision{Want: prefer, Reason: fmt.Sprintf("%s has no Internet (%d/%d before falling back)", prefer, c.PreferredFails, failThreshold)}
		}
		if !pathOK(o, fallback) {
			return Decision{Want: prefer, Reason: fmt.Sprintf("%s has no Internet, and neither has %s — nothing better to switch to", prefer, fallback)}
		}
		return Decision{Want: fallback, Reason: fmt.Sprintf("%s has had no Internet for %d checks; %s works — falling back", prefer, c.PreferredFails, fallback)}
	}

	// On the fallback: go back once the preferred path is steadily healthy,
	// or at once if the fallback itself broke while the preferred one works.
	c.PreferredFails = 0
	if pathOK(o, prefer) {
		c.PreferredOK++
	} else {
		c.PreferredOK = 0
	}
	switch {
	case !pathOK(o, cur) && pathOK(o, prefer):
		return Decision{Want: prefer, Reason: fmt.Sprintf("%s (fallback) lost Internet; %s works again", cur, prefer)}
	case c.PreferredOK >= recoverThreshold:
		return Decision{Want: prefer, Reason: fmt.Sprintf("%s (preferred) healthy for %d checks — returning", prefer, c.PreferredOK)}
	case c.PreferredOK > 0:
		return Decision{Want: cur, Reason: fmt.Sprintf("%s recovering (%d/%d)", prefer, c.PreferredOK, recoverThreshold)}
	}
	return Decision{Want: cur, Reason: fmt.Sprintf("on fallback %s; %s still has no Internet", cur, prefer)}
}

// Limiter enforces the rate limit and the failure backoff. Zero Max/Window
// mean the defaults (rateMax changes per rateWindow).
type Limiter struct {
	Changes      []time.Time
	FailStreak   int
	BackoffUntil time.Time
	Max          int
	Window       time.Duration
}

func (l *Limiter) limits() (int, time.Duration) {
	m, w := l.Max, l.Window
	if m <= 0 {
		m = rateMax
	}
	if w <= 0 {
		w = rateWindow
	}
	return m, w
}

// Allow reports whether an automatic change may run now, and why not.
func (l *Limiter) Allow(now time.Time) (bool, string) {
	if now.Before(l.BackoffUntil) {
		return false, fmt.Sprintf("backing off after %d failed change(s) until %s", l.FailStreak, l.BackoffUntil.Local().Format("15:04:05"))
	}
	limit, window := l.limits()
	recent := l.Changes[:0]
	for _, t := range l.Changes {
		if now.Sub(t) < window {
			recent = append(recent, t)
		}
	}
	l.Changes = recent
	if len(recent) >= limit {
		return false, fmt.Sprintf("rate limit: %d automatic changes in the last %s", len(recent), window)
	}
	return true, ""
}

// Record notes the outcome of an automatic change.
func (l *Limiter) Record(now time.Time, ok bool) {
	l.Changes = append(l.Changes, now)
	if ok {
		l.FailStreak, l.BackoffUntil = 0, time.Time{}
		return
	}
	l.FailStreak++
	d := backoffBase << min(l.FailStreak-1, 10)
	l.BackoffUntil = now.Add(min(d, backoffMax))
}
