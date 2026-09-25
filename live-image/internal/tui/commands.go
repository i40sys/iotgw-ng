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

	// refreshDoneMsg is the outcome of `iotgw vpn|ssh refresh`.
	refreshDoneMsg struct {
		what string // "vpn" | "ssh"
		err  error
		out  string
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

// actionLine is one output line of a console action, as it was written.
type actionLine struct {
	at     time.Time
	stderr bool
	text   string
}

// action is the console action running now (or run last): what was run,
// its output line by line as it came, and how it ended — so whoever is at
// the console can follow it and diagnose a failure on the dashboard itself.
type action struct {
	title   string
	cmdline string
	started time.Time
	ended   time.Time // zero while running
	err     error
	lines   []actionLine
}

// maxActionLines bounds the kept output of one action.
const maxActionLines = 500

type (
	actionStartMsg struct {
		title, cmdline string
		ch             <-chan tea.Msg
	}
	actionLineMsg actionLine
	actionEndMsg  struct{ err error }
)

// runPrivileged runs a console action (a seam for the tests, which must
// never execute anything).
var runPrivileged = sysexec.RunPrivilegedStream

// streamAction runs `iotgw <args>` as root and streams it to the dashboard:
// actionStartMsg, one actionLineMsg per output line, actionEndMsg, then the
// action's own outcome message from finish. The Update loop pulls them one
// at a time with nextAction.
func streamAction(title string, timeout time.Duration, args []string, finish func(sysexec.Result, error) tea.Msg) tea.Cmd {
	return func() tea.Msg {
		ch := make(chan tea.Msg, 256)
		go func() {
			defer close(ch)
			ctx, cancel := context.WithTimeout(context.Background(), timeout+10*time.Second)
			defer cancel()
			res, err := runPrivileged(ctx, timeout, func(stderr bool, line string) {
				ch <- actionLineMsg{at: time.Now(), stderr: stderr, text: line}
			}, platform.Self(), args...)
			ch <- actionEndMsg{err: err}
			ch <- finish(res, err)
		}()
		return actionStartMsg{title: title, cmdline: displayArgs(args), ch: ch}
	}
}

// nextAction waits for the running action's next message.
func nextAction(ch <-chan tea.Msg) tea.Cmd {
	return func() tea.Msg {
		if msg, ok := <-ch; ok {
			return msg
		}
		return nil
	}
}

// switchInternetCmd asks the binary itself (`iotgw internet <mode>`, as root)
// to change how the Internet is reached. With hold and the VPN/SSH refresh,
// the dashboard's only state-changing actions; they run only after the
// operator confirmed.
func switchInternetCmd(via string) tea.Cmd {
	return streamAction("Internet via "+strings.ToUpper(via), 110*time.Second, []string{"internet", via},
		func(res sysexec.Result, err error) tea.Msg {
			return switchDoneMsg{via: via, err: err, out: lastLine(res.Stdout)}
		})
}

// holdCmd freezes or resumes the daemon's automatic changes.
func holdCmd(on bool) tea.Cmd {
	args, title := []string{"hold", "disable"}, "Resume automatic repair"
	if on {
		args, title = []string{"hold", "enable", "-reason", "set from the console dashboard"}, "Hold"
	}
	return streamAction(title, 25*time.Second, args, func(res sysexec.Result, err error) tea.Msg {
		return holdDoneMsg{on: on, err: err, out: lastLine(res.Stdout)}
	})
}

// refreshCmd re-requests the VPN configuration or the SSH trust + host
// certificate (`iotgw vpn|ssh refresh`, as root) — the same transaction as
// the CLI and the LuCI page. otp is the operator's one-time code (always for
// the VPN, for a first SSH enrollment); "" = an SSH renewal by host key.
func refreshCmd(what string, force bool, otp string) tea.Cmd {
	args := []string{what, "refresh"}
	if otp != "" {
		args = append(args, "-otp", otp)
	}
	if force {
		args = append(args, "-force")
	}
	return streamAction(refreshTitle[what], 290*time.Second, args, func(res sysexec.Result, err error) tea.Msg {
		return refreshDoneMsg{what: what, err: err, out: lastLine(res.Stdout)}
	})
}

// displayArgs is args as shown on the dashboard: a one-time code is masked.
func displayArgs(args []string) string {
	shown := append([]string(nil), args...)
	for i := 0; i+1 < len(shown); i++ {
		if shown[i] == "-otp" {
			shown[i+1] = "******"
		}
	}
	return "iotgw " + strings.Join(shown, " ")
}

func lastLine(s string) string {
	lines := strings.Split(strings.TrimSpace(s), "\n")
	return lines[len(lines)-1]
}
