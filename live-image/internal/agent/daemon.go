package agent

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/i40sys/iotgw-ng/live-image/internal/iproute"
	"github.com/i40sys/iotgw-ng/live-image/internal/version"
)

// Daemon is the long-running self-healing loop (`iotgw daemon`,
// decision-032 §4). One cycle = observe, reconcile the Netmaker route, apply
// the Internet policy, record. Hold mode keeps the observing and recording
// but turns every change into a "held" event.
type Daemon struct {
	A *Agent
	// Snap publishes the full status (the dashboards' backend); nil = none.
	Snap *Snapshotter
	st   State
	cnt  Counters
	lim  Limiter
	// lastHeld dedups "would do X" events while on hold.
	lastHeld string
	// lastSummary dedups check events: only a changed picture is logged.
	lastSummary string
	// lastSkipped dedups rate-limit / backoff notices.
	lastSkipped string
}

// Run loops until ctx ends. The first check runs shortly after start (the
// network is still settling at boot), then every configured interval.
func (d *Daemon) Run(ctx context.Context) error {
	d.st = State{PID: pid(), Version: version.String()}
	if prev, err := ReadState(d.A.StatePath); err == nil {
		// Keep the history across daemon restarts (not across reboots: tmpfs).
		d.st.Events = prev.Events
	}
	d.st.AddEvent("info", "ok", "iotgw daemon started ("+version.Version+")")
	if d.Snap != nil {
		go d.Snap.Run(ctx)
		// SIGUSR1 = "refresh now" (the dashboards' [r], LuCI's Refresh).
		usr1 := make(chan os.Signal, 1)
		signal.Notify(usr1, syscall.SIGUSR1)
		defer signal.Stop(usr1)
		go func() {
			for {
				select {
				case <-ctx.Done():
					return
				case <-usr1:
					d.Snap.Kick()
				}
			}
		}()
	}
	wait := 10 * time.Second
	for {
		d.st.NextCheck = time.Now().Add(wait).UTC()
		d.save()
		select {
		case <-ctx.Done():
			d.st.AddEvent("info", "ok", "iotgw daemon stopped")
			d.save()
			return nil
		case <-time.After(wait):
		}
		wait = d.Cycle(ctx)
	}
}

func (d *Daemon) save() {
	d.st.UpdatedAt = time.Now().UTC()
	d.st.Changes = d.lim.Changes
	d.st.FailStreak, d.st.BackoffUntil = d.lim.FailStreak, d.lim.BackoffUntil
	d.st.LANFails, d.st.LANRecovers = d.cnt.PreferredFails, d.cnt.PreferredOK
	if err := WriteState(d.A.StatePath, &d.st); err != nil {
		d.A.logf("cannot write %s: %v", d.A.StatePath, err)
	}
}

// Cycle runs one observe → reconcile → record pass and returns the wait
// until the next one.
func (d *Daemon) Cycle(ctx context.Context) time.Duration {
	a := d.A
	cfg, cerr := LoadConfig(ctx, a.UCI)
	d.st.Policy, d.st.Prefer, d.st.Interval = cfg.Policy, cfg.Prefer, cfg.Interval.String()
	d.st.Hold, d.st.HoldReason, d.st.HoldSince = cfg.Hold, cfg.HoldReason, cfg.HoldSince
	d.st.LastError = ""
	if cerr != nil {
		d.st.LastError = cerr.Error()
	}
	defer d.save()

	now := func() time.Time { return time.Now().UTC() }
	wg := cfg.WGIface

	// ── observe ──────────────────────────────────────────────────────────────
	up, uerr := a.Uplink(ctx, wg)
	d.st.Uplink = up
	secs, serr := a.UCI.Show(ctx, netConfig)
	if serr != nil {
		d.st.LastError = "read network config: " + serr.Error()
		return cfg.Interval
	}
	host, port := EndpointFromUCI(secs, wg)
	ep := Endpoint{Host: host, Port: port}
	if host != "" {
		if ip, err := resolveIPv4(ctx, host); err == nil {
			ep.IP = ip
		}
	}
	ep.RouteManaged = find(secs, endpointRouteSec) != nil

	obs := Observation{Current: CurrentEgress(ctx, wg)}
	d.st.Egress = obs.Current
	if uerr == nil {
		obs.LANInternet, d.st.LANInternet.Detail = tcpProbe(ctx, up.Device)
	} else {
		d.st.LANInternet.Detail = "no uplink: " + uerr.Error()
	}
	d.st.LANInternet.OK, d.st.LANInternet.At = obs.LANInternet, now()
	wgUp := ifaceExists(wg)
	if wgUp {
		obs.VPNInternet, d.st.VPNInternet.Detail = tcpProbe(ctx, wg)
		obs.Handshake, d.st.Handshake.Detail = handshakeProbe(ctx, wg)
	} else {
		d.st.VPNInternet.Detail, d.st.Handshake.Detail = "no "+wg+" interface", "no "+wg+" interface"
	}
	d.st.VPNInternet.OK, d.st.VPNInternet.At = obs.VPNInternet, now()
	d.st.Handshake.OK, d.st.Handshake.At = obs.Handshake, now()
	egressOK, egressDetail := tcpProbe(ctx, "")
	d.st.EgressOK = Probe{OK: egressOK, Detail: egressDetail, At: now()}

	if ep.IP != "" {
		if r, err := iproute.Get(ctx, ep.IP); err == nil && r != nil {
			ep.RouteVia, ep.RouteDev = r.Gateway, r.Dev
			// Outside the tunnel, through the CURRENT router: on-link to a
			// public address is the gw-c3 failure (ARPing the Internet on the
			// LAN), and a stale router is the next one.
			ep.RouteOK = r.Dev != wg && r.Gateway != "" && (uerr != nil || (r.Dev == up.Device && r.Gateway == up.Gateway))
		}
	}
	d.st.Endpoint = ep
	seen := ep.RouteOK && obs.Handshake
	d.st.NetmakerSeen = Probe{OK: seen, At: now(), Detail: fmt.Sprintf("route %s, %s", map[bool]string{true: "outside the tunnel via " + ep.RouteVia, false: "WRONG (" + strings.TrimSpace(ep.RouteDev+" "+ep.RouteVia) + ")"}[ep.RouteOK], d.st.Handshake.Detail)}

	// Only stable facts: an age ("handshake 16s ago") would make every cycle
	// "changed" and flood the log and the history.
	summary := fmt.Sprintf("uplink %s via %s | egress %s | LAN Internet %s | VPN Internet %s | tunnel %s | Netmaker route %s",
		orNone(up.Device), orNone(up.Gateway), orNone(string(obs.Current)), okWord(obs.LANInternet), okWord(obs.VPNInternet),
		map[bool]string{true: "UP", false: "DOWN"}[obs.Handshake], map[bool]string{true: "OK", false: "WRONG"}[ep.RouteOK])
	if summary != d.lastSummary {
		d.st.AddEvent("check", "ok", summary)
		a.logf("check: %s", summary)
		d.lastSummary = summary
	}
	if uerr != nil {
		d.st.LastError = uerr.Error()
		return cfg.Interval
	}

	// ── 1. the management path: Netmaker route + tunnelled network ─────────
	var ops []Op
	if ep.IP != "" {
		ops = append(ops, EndpointRouteOps(secs, up, ep.IP)...)
	}
	ops = append(ops, SplitRouteOps(secs, wg, cfg.NetworkCIDR)...)
	if len(ops) > 0 {
		d.change(ctx, cfg, "route", "keep the Netmaker route on the current LAN router", ops, NoRegression)
	}

	// ── 2. the Internet egress policy ───────────────────────────────────────
	dec := Decide(cfg.Policy, cfg.Prefer, obs, &d.cnt)
	if dec.Want != obs.Current && obs.Current != EgressUnknown {
		egressOps := EgressOps(secs, up, wg, dec.Want)
		want := dec.Want
		accept := func(before, after Health, final bool) (bool, string) {
			if !after.Egress {
				return false, "no Internet through " + string(want) + " after the switch"
			}
			return NoRegression(before, after, final)
		}
		if len(egressOps) > 0 && d.change(ctx, cfg, "egress", "Internet via "+strings.ToUpper(string(want))+": "+dec.Reason, egressOps, accept) {
			d.st.Egress = CurrentEgress(ctx, wg)
			d.cnt = Counters{}
		}
	}
	return cfg.Interval
}

// change runs one automatic change through hold, the limiter and a
// transaction. It reports whether the change was applied and kept.
func (d *Daemon) change(ctx context.Context, cfg Config, kind, what string, ops []Op, accept Accept) bool {
	desc := what + " — " + Describe(ops)
	if cfg.Hold {
		if desc != d.lastHeld {
			d.st.AddEvent("hold", "held", "on hold, NOT applied: "+desc)
			d.A.logf("hold: not applying %s", desc)
			d.lastHeld = desc
		}
		return false
	}
	d.lastHeld = ""
	now := time.Now()
	d.lim.Max, d.lim.Window = cfg.MaxChanges, cfg.ChangeWindow
	if ok, why := d.lim.Allow(now); !ok {
		if why != d.lastSkipped {
			d.st.AddEvent(kind, "skipped", why+": "+desc)
			d.A.logf("%s: NOT applied (%s): %s", kind, why, desc)
			d.lastSkipped = why
		}
		return false
	}
	d.lastSkipped = ""
	before, after, err := d.A.Transact(ctx, cfg.WGIface, kind, ops, accept)
	d.lim.Record(now, err == nil)
	switch {
	case errors.Is(err, ErrRolledBack):
		d.st.AddEvent("rollback", "failed", desc+" — "+err.Error())
		return false
	case err != nil:
		d.st.AddEvent("error", "failed", desc+" — "+err.Error())
		return false
	}
	d.st.AddEvent("change", "ok", fmt.Sprintf("%s (before: %s; after: %s)", desc, before, after))
	if d.Snap != nil {
		d.Snap.Kick()
	}
	return true
}

func orNone(s string) string {
	if s == "" {
		return "none"
	}
	return s
}
