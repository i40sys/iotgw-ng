package tui

import (
	"context"
	"strings"
	"syscall"
	"time"

	tea "github.com/charmbracelet/bubbletea"

	"github.com/i40sys/iotgw-ng/live-image/internal/agent"
	"github.com/i40sys/iotgw-ng/live-image/internal/collect"
	"github.com/i40sys/iotgw-ng/live-image/internal/platform"
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
	instMsg  agent.Installed
	// snapMsg is the daemon's published status (nil when missing/unreadable).
	snapMsg struct{ s *agent.Snapshot }

	// holdDoneMsg is the outcome of `iotgw hold enable|disable`.
	holdDoneMsg struct {
		on  bool
		err error
		out string
	}

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
	kInst  = "inst"
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

// readSnapCmd reads the daemon's snapshot — on an installed gateway the
// daemon is the backend and the dashboard only a viewer.
func readSnapCmd() tea.Cmd {
	return func() tea.Msg {
		s, err := agent.ReadSnapshot(agent.SnapshotFile)
		if err != nil {
			return snapMsg{}
		}
		return snapMsg{s}
	}
}

// kickDaemonCmd asks the daemon for an immediate status round (SIGUSR1).
func kickDaemonCmd() tea.Cmd {
	return func() tea.Msg {
		if st, err := agent.ReadState(agent.StateFile); err == nil && st.PID > 0 {
			_ = syscall.Kill(st.PID, syscall.SIGUSR1)
		}
		return nil
	}
}

// collectInstCmd gathers the installed gateway's picture (OpenWRT only).
func collectInstCmd() tea.Cmd {
	return func() tea.Msg { return instMsg(withTimeout(agent.CollectInstalled)) }
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

// switchInternetCmd asks the binary itself (`iotgw internet <mode>`, as root)
// to change how the Internet is reached. With hold, the dashboard's only
// state-changing actions, and they run only after the operator confirmed.
func switchInternetCmd(via string) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
		defer cancel()
		res, err := sysexec.RunPrivileged(ctx, 110*time.Second, platform.Self(), "internet", via)
		return switchDoneMsg{via: via, err: err, out: lastLine(res.Stdout)}
	}
}

// holdCmd freezes or resumes the daemon's automatic changes.
func holdCmd(on bool) tea.Cmd {
	return func() tea.Msg {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		verb := "disable"
		if on {
			verb = "enable"
		}
		args := []string{"hold", verb}
		if on {
			args = append(args, "-reason", "set from the console dashboard")
		}
		res, err := sysexec.RunPrivileged(ctx, 25*time.Second, platform.Self(), args...)
		return holdDoneMsg{on: on, err: err, out: lastLine(res.Stdout)}
	}
}

func lastLine(s string) string {
	lines := strings.Split(strings.TrimSpace(s), "\n")
	return lines[len(lines)-1]
}
