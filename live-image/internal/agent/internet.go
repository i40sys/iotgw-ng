package agent

import (
	"context"
	"fmt"
	"strings"
)

// SetInternet persists the Internet policy (decision-032 §5) and, for a
// pinned lan/vpn, switches the egress now through a transaction instead of
// waiting for the daemon's next cycle. `auto` is left to the daemon: its
// hysteresis decides. Manual commands work even on hold.
func (a *Agent) SetInternet(ctx context.Context, p Policy, out func(string)) error {
	if err := SetPolicy(ctx, a.UCI, p); err != nil {
		return fmt.Errorf("save the policy: %w", err)
	}
	cfg, err := LoadConfig(ctx, a.UCI)
	if err != nil {
		return err
	}
	out("Internet policy saved: " + describePolicy(cfg))
	if cfg.Hold {
		out("note: hold is ON — the daemon will not switch automatically; this manual switch still runs")
	}
	if p == PolicyAuto {
		out("the daemon applies it on its next check (every " + cfg.Interval.String() + ")")
		return nil
	}
	want := EgressLAN
	if p == PolicyVPN {
		want = EgressVPN
	}
	wg := cfg.WGIface
	if cur := CurrentEgress(ctx, wg); cur == want {
		out("Internet already goes via " + strings.ToUpper(string(want)))
		return nil
	}
	up, err := a.Uplink(ctx, wg)
	if err != nil {
		return err
	}
	if want == EgressVPN {
		if ok, why := handshakeProbe(ctx, wg); !ok {
			return fmt.Errorf("not switching to VPN: the tunnel is not up (%s); the policy is saved and the daemon will switch once it is", why)
		}
	}
	secs, err := a.UCI.Show(ctx, netConfig)
	if err != nil {
		return err
	}
	ops := EgressOps(secs, up, wg, want)
	accept := func(before, after Health, final bool) (bool, string) {
		if !after.Egress {
			return false, "no Internet via " + string(want)
		}
		return NoRegression(before, after, final)
	}
	before, after, err := a.Transact(ctx, wg, "internet "+string(want), ops, accept)
	if err != nil {
		return err
	}
	out(fmt.Sprintf("Internet now via %s (before: %s; after: %s)", strings.ToUpper(string(want)), before, after))
	return nil
}

func describePolicy(c Config) string {
	switch c.Policy {
	case PolicyLAN:
		return "lan (pinned: Internet via the local LAN, no automatic switching)"
	case PolicyVPN:
		return "vpn (pinned: Internet via the Netmaker hub, no automatic switching)"
	}
	return fmt.Sprintf("auto (%s preferred, automatic fallback to %s)", c.Prefer, other(c.Prefer))
}

// DescribePolicy is describePolicy for the CLI and the dashboard.
func DescribePolicy(c Config) string { return describePolicy(c) }
