package tui

import (
	"context"
	"strings"
	"time"

	tea "github.com/charmbracelet/bubbletea"

	"github.com/i40sys/iotgw-ng/live-image/internal/collect"
	"github.com/i40sys/iotgw-ng/live-image/internal/state"
	"github.com/i40sys/iotgw-ng/live-image/internal/sysexec"
)

// Refresh cadences. Kernel-local state is cheap and refreshed often; probes
// that leave the machine (Internet, VPN server) run less often. Nothing here
// ever calls a provisioning API — the dashboard only observes.
const (
	fastInterval = 3 * time.Second
	slowInterval = 20 * time.Second
	hostInterval = 60 * time.Second
	// collectTimeout bounds any single collector run.
	collectTimeout = 20 * time.Second
)

type (
	hostMsg  collect.Host
	netMsg   collect.Network
	bootMsg  collect.Bootstrap
	vpnMsg   collect.VPN
	reachMsg collect.Reachability
	inetMsg  collect.Internet
	pkiMsg   collect.PKI

	// switchDoneMsg is the outcome of the privileged Internet-mode switch.
	switchDoneMsg struct {
		via string
		err error
		out string
	}

	fastTickMsg time.Time
	slowTickMsg time.Time
	hostTickMsg time.Time
)

// Collector keys, used to avoid overlapping runs of the same collector.
const (
	kHost  = "host"
	kNet   = "net"
	kBoot  = "boot"
	kVPN   = "vpn"
	kReach = "reach"
	kInet  = "inet"
	kPKI   = "pki"
)

func withTimeout[T any](f func(context.Context) T) T {
	ctx, cancel := context.WithTimeout(context.Background(), collectTimeout)
	defer cancel()
	return f(ctx)
}

func collectHostCmd() tea.Cmd {
	return func() tea.Msg { return hostMsg(withTimeout(collect.CollectHost)) }
}

func collectNetCmd() tea.Cmd {
	return func() tea.Msg { return netMsg(withTimeout(collect.CollectNetwork)) }
}

func collectBootCmd() tea.Cmd {
	return func() tea.Msg { return bootMsg(withTimeout(collect.CollectBootstrap)) }
}

func collectVPNCmd(doc *state.Bootstrap) tea.Cmd {
	return func() tea.Msg {
		return vpnMsg(withTimeout(func(ctx context.Context) collect.VPN { return collect.CollectVPN(ctx, doc) }))
	}
}

func collectPKICmd(doc *state.Bootstrap) tea.Cmd {
	return func() tea.Msg {
		return pkiMsg(withTimeout(func(ctx context.Context) collect.PKI { return collect.CollectPKI(ctx, doc) }))
	}
}

func collectReachCmd(v collect.VPN) tea.Cmd {
	return func() tea.Msg {
		return reachMsg(withTimeout(func(ctx context.Context) collect.Reachability { return collect.CollectReachability(ctx, v) }))
	}
}

func collectInetCmd() tea.Cmd {
	return func() tea.Msg { return inetMsg(withTimeout(collect.CollectInternet)) }
}

func fastTick() tea.Cmd {
	return tea.Tick(fastInterval, func(t time.Time) tea.Msg { return fastTickMsg(t) })
}

func slowTick() tea.Cmd {
	return tea.Tick(slowInterval, func(t time.Time) tea.Msg { return slowTickMsg(t) })
}

func hostTick() tea.Cmd {
	return tea.Tick(hostInterval, func(t time.Time) tea.Msg { return hostTickMsg(t) })
}

// switchInternetCmd asks the privileged helper to change how the Internet is
// reached. It is the dashboard's only state-changing action, and it runs only
// after the operator confirmed it.
func switchInternetCmd(via string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
		defer cancel()
		res, err := sysexec.RunPrivileged(ctx, 110*time.Second, "/usr/local/bin/iotgw-bootstrap", "internet-via", via)
		return switchDoneMsg{via: via, err: err, out: strings.TrimSpace(res.Stdout)}
	}
}
