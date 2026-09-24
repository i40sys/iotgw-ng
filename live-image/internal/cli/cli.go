// Package cli is the single `iotgw` binary's command line (decision-032 §1):
// one codebase and one release for the live image and the installed OpenWRT
// gateway, with modes as subcommands. Invoked as `iotgw-bootstrap` or
// `iotgw-status` (symlinks) it behaves exactly like the former binaries.
package cli

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"log/syslog"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	tea "github.com/charmbracelet/bubbletea"

	"github.com/i40sys/iotgw-ng/live-image/internal/agent"
	"github.com/i40sys/iotgw-ng/live-image/internal/bootstrap"
	"github.com/i40sys/iotgw-ng/live-image/internal/collect"
	"github.com/i40sys/iotgw-ng/live-image/internal/platform"
	"github.com/i40sys/iotgw-ng/live-image/internal/state"
	"github.com/i40sys/iotgw-ng/live-image/internal/tui"
	"github.com/i40sys/iotgw-ng/live-image/internal/uci"
	"github.com/i40sys/iotgw-ng/live-image/internal/version"
)

const usage = `iotgw — iotgw gateway tool (live image + installed OpenWRT), %s

usage: iotgw <command> [options]

  status                         console dashboard (what iotgw-status runs)
  daemon                         self-healing agent (installed OpenWRT, runs from /etc/init.d/iotgw)
  vpn status                     WireGuard/Netmaker state
  vpn refresh [-otp CODE]        re-request the VPN configuration and apply it safely
  ssh status                     SSH PKI state (User CA, host certificate, sshd)
  ssh refresh [-otp CODE] [-force]
                                 re-request SSH trust + host certificate, reload sshd safely
  internet lan|vpn|auto          how the Internet is reached (persistent on OpenWRT)
  hold enable [-reason TEXT] | hold disable | hold status
                                 freeze / resume the daemon's automatic changes
  bootstrap [-otp CODE]          live-image provisioning (what iotgw-bootstrap runs)
  version

Without -otp, refresh derives the device code from /etc/config/iotgw.
`

// Main runs the command line and returns the exit code.
func Main(argv []string) int {
	switch filepath.Base(argv[0]) {
	case "iotgw-bootstrap":
		return bootstrapCmd(argv[1:], true)
	case "iotgw-status":
		return statusCmd(argv[1:])
	}
	if len(argv) < 2 {
		fmt.Fprintf(os.Stderr, usage, version.Version)
		return 2
	}
	cmd, args := argv[1], argv[2:]
	switch cmd {
	case "status":
		return statusCmd(args)
	case "daemon":
		return daemonCmd(args)
	case "vpn":
		return vpnCmd(args)
	case "ssh":
		return sshCmd(args)
	case "internet", "internet-via":
		return internetCmd(args)
	case "hold":
		return holdCmd(args)
	case "bootstrap":
		return bootstrapCmd(args, false)
	case "version", "-version", "--version":
		fmt.Println("iotgw", version.String(), "| platform:", platform.Detect())
		return 0
	case "help", "-h", "--help":
		fmt.Printf(usage, version.Version)
		return 0
	}
	fmt.Fprintf(os.Stderr, "iotgw: unknown command %q\n\n"+usage, cmd, version.Version)
	return 2
}

// ── helpers ──────────────────────────────────────────────────────────────────

func signalContext(timeout time.Duration) (context.Context, context.CancelFunc) {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	if timeout <= 0 {
		return ctx, stop
	}
	ctx2, cancel := context.WithTimeout(ctx, timeout)
	return ctx2, func() { cancel(); stop() }
}

// syslogger logs to syslog under tag (journald on the live image, logd on
// OpenWRT); with echo it also prints to stderr for interactive commands.
func syslogger(tag string, echo bool) *log.Logger {
	var ws []io.Writer
	if w, err := syslog.New(syslog.LOG_INFO|syslog.LOG_DAEMON, tag); err == nil {
		ws = append(ws, w)
	}
	if echo {
		ws = append(ws, os.Stderr)
	}
	if len(ws) == 0 {
		return log.New(io.Discard, "", 0)
	}
	return log.New(io.MultiWriter(ws...), "", 0)
}

func requireRoot(what string) bool {
	if os.Geteuid() != 0 {
		fmt.Fprintf(os.Stderr, "iotgw %s must run as root\n", what)
		return false
	}
	return true
}

func fail(err error) int {
	fmt.Fprintln(os.Stderr, "iotgw:", err)
	return 1
}

func printer(prefix string) func(string) {
	lg := syslogger("iotgw", false)
	return func(s string) {
		fmt.Println(s)
		lg.Print(prefix + s)
	}
}

// ── status (dashboard) ───────────────────────────────────────────────────────

func statusCmd(args []string) int {
	fs := flag.NewFlagSet("status", flag.ExitOnError)
	showVersion := fs.Bool("version", false, "print the version and exit")
	_ = fs.Parse(args)
	if *showVersion {
		fmt.Println("iotgw-status", version.String(), "| live image:", version.ImageRelease())
		return 0
	}
	// Never write diagnostics to the terminal the TUI owns.
	log.SetOutput(syslogger("iotgw-status", false).Writer())
	log.SetFlags(0)
	log.Printf("iotgw-status %s starting (uid %d, %s)", version.String(), os.Getuid(), platform.Detect())
	p := tea.NewProgram(tui.New(), tea.WithAltScreen())
	if _, err := p.Run(); err != nil {
		log.Printf("dashboard error: %v", err)
		fmt.Fprintln(os.Stderr, "iotgw-status:", err)
		return 1
	}
	log.Printf("iotgw-status exited by the operator")
	if platform.IsOpenWRT() {
		fmt.Println("iotgw dashboard closed. Run 'iotgw status' to reopen it.")
	} else {
		fmt.Println("iotgw-status closed — you are in a normal shell. Run 'iotgw-status' to reopen the dashboard.")
	}
	return 0
}

// ── daemon ───────────────────────────────────────────────────────────────────

func daemonCmd(args []string) int {
	fs := flag.NewFlagSet("daemon", flag.ExitOnError)
	once := fs.Bool("once", false, "run one check cycle and exit (diagnostics)")
	_ = fs.Parse(args)
	if !platform.IsOpenWRT() {
		return fail(errors.New("the self-healing daemon runs on the installed OpenWRT gateway; the live image is provisioned by `iotgw bootstrap`"))
	}
	if !requireRoot("daemon") {
		return 1
	}
	ctx, cancel := signalContext(0)
	defer cancel()
	lg := syslogger("iotgw", *once)
	lg.Printf("iotgw daemon %s starting", version.String())
	d := &agent.Daemon{A: agent.New(lg)}
	if *once {
		d.Cycle(ctx)
		return 0
	}
	if err := d.Run(ctx); err != nil {
		return fail(err)
	}
	return 0
}

// ── vpn ──────────────────────────────────────────────────────────────────────

func vpnCmd(args []string) int {
	if len(args) == 0 {
		fmt.Fprintln(os.Stderr, "usage: iotgw vpn status | vpn refresh [-otp CODE]")
		return 2
	}
	switch args[0] {
	case "status":
		return vpnStatus()
	case "refresh":
		fs := flag.NewFlagSet("vpn refresh", flag.ExitOnError)
		otp := fs.String("otp", "", "one-time code from the UI (default: derived from /etc/config/iotgw)")
		_ = fs.Parse(args[1:])
		if !requireRoot("vpn refresh") {
			return 1
		}
		ctx, cancel := signalContext(5 * time.Minute)
		defer cancel()
		if err := gatewayFor(platform.Detect(), syslogger("iotgw", false)).VPNRefresh(ctx, *otp, printer("vpn refresh: ")); err != nil {
			return fail(err)
		}
		return 0
	}
	fmt.Fprintln(os.Stderr, "usage: iotgw vpn status | vpn refresh [-otp CODE]")
	return 2
}

func docForCollectors(ctx context.Context) *state.Bootstrap {
	if platform.IsOpenWRT() {
		return agent.CollectInstalled(ctx).SyntheticDoc()
	}
	doc, _ := state.Read(state.File)
	return doc
}

func vpnStatus() int {
	ctx, cancel := signalContext(30 * time.Second)
	defer cancel()
	v := collect.CollectVPN(ctx, docForCollectors(ctx))
	r := collect.CollectReachability(ctx, v)
	fmt.Printf("VPN            %s %s\n", v.Status, v.Detail)
	fmt.Printf("  interface    %s present=%v up=%v addresses=%s\n", v.Interface, v.Present, v.Up, strings.Join(v.Addresses, ","))
	fmt.Printf("  endpoint     %s\n", v.Endpoint)
	fmt.Printf("  handshake    %s\n", ago(v.LastHandshake))
	fmt.Printf("  routes       %s\n", strings.Join(v.Routes, ", "))
	fmt.Printf("Netmaker server %s\n", r.Status)
	fmt.Printf("  route        %s %s\n", r.Route.Status, r.Route.Detail)
	fmt.Printf("  wireguard    %s %s\n", r.WireGuard.Status, r.WireGuard.Detail)
	if platform.IsOpenWRT() {
		in := agent.CollectInstalled(ctx)
		fmt.Printf("Internet policy %s\n", agent.DescribePolicy(in.Config))
		if in.Daemon != nil {
			fmt.Printf("  egress now   %s (uplink %s via %s)\n", strings.ToUpper(string(in.Daemon.Egress)), in.Daemon.Uplink.Device, in.Daemon.Uplink.Gateway)
		}
	}
	if v.Status != state.Healthy {
		return 1
	}
	return 0
}

func ago(t time.Time) string {
	if t.IsZero() {
		return "never"
	}
	return time.Since(t).Round(time.Second).String() + " ago"
}

// ── ssh ──────────────────────────────────────────────────────────────────────

func sshCmd(args []string) int {
	if len(args) == 0 {
		fmt.Fprintln(os.Stderr, "usage: iotgw ssh status | ssh refresh [-otp CODE] [-force]")
		return 2
	}
	switch args[0] {
	case "status":
		ctx, cancel := signalContext(30 * time.Second)
		defer cancel()
		p := collect.CollectPKI(ctx, docForCollectors(ctx))
		fmt.Printf("User CA        %s %s (sshd trust %v)\n", p.UserCAStatus, p.UserCADetail, p.UserCATrusted)
		fmt.Printf("Host CA        %s %s\n", p.HostCAStatus, p.HostCADetail)
		fmt.Printf("Host identity  %s %s\n", p.HostIDStatus, p.HostIDDetail)
		fmt.Printf("  certificate  present=%v principals=%s valid until %s\n", p.HostCertPresent, strings.Join(p.HostPrincipals, ","), p.HostCertValidTo.Local().Format("2006-01-02 15:04"))
		fmt.Printf("sshd           %s %s\n", p.SSHDStatus, p.SSHDDetail)
		if p.HostIDStatus != state.Healthy || p.SSHDStatus != state.Healthy {
			return 1
		}
		return 0
	case "refresh":
		fs := flag.NewFlagSet("ssh refresh", flag.ExitOnError)
		otp := fs.String("otp", "", "one-time code from the UI (default: derived from /etc/config/iotgw)")
		force := fs.Bool("force", false, "re-request even if the current certificate is valid")
		_ = fs.Parse(args[1:])
		if !requireRoot("ssh refresh") {
			return 1
		}
		ctx, cancel := signalContext(5 * time.Minute)
		defer cancel()
		if err := gatewayFor(platform.Detect(), syslogger("iotgw", false)).SSHRefresh(ctx, *otp, *force, printer("ssh refresh: ")); err != nil {
			return fail(err)
		}
		return 0
	}
	fmt.Fprintln(os.Stderr, "usage: iotgw ssh status | ssh refresh [-otp CODE] [-force]")
	return 2
}

// ── internet ─────────────────────────────────────────────────────────────────

func internetCmd(args []string) int {
	if len(args) != 1 {
		fmt.Fprintln(os.Stderr, "usage: iotgw internet lan|vpn|auto")
		return 2
	}
	if !requireRoot("internet") {
		return 1
	}
	ctx, cancel := signalContext(2 * time.Minute)
	defer cancel()
	if err := gatewayFor(platform.Detect(), syslogger("iotgw", false)).Internet(ctx, args[0], printer("internet: ")); err != nil {
		return fail(err)
	}
	return 0
}

// ── hold ─────────────────────────────────────────────────────────────────────

func holdCmd(args []string) int {
	if len(args) == 0 {
		fmt.Fprintln(os.Stderr, "usage: iotgw hold enable [-reason TEXT] | hold disable | hold status")
		return 2
	}
	if !platform.IsOpenWRT() {
		return fail(errors.New("hold applies to the installed gateway's daemon; the live image has none"))
	}
	ctx, cancel := signalContext(30 * time.Second)
	defer cancel()
	u := uci.New()
	switch args[0] {
	case "status":
		cfg, err := agent.LoadConfig(ctx, u)
		if err != nil {
			return fail(err)
		}
		if !cfg.Hold {
			fmt.Println("hold: OFF — the daemon repairs the network automatically")
			return 0
		}
		fmt.Printf("hold: ON since %s — %s\n  the daemon keeps monitoring but makes NO automatic change; `iotgw hold disable` resumes it\n",
			cfg.HoldSince.Local().Format("2006-01-02 15:04"), cfg.HoldReason)
		return 0
	case "enable", "disable":
		fs := flag.NewFlagSet("hold", flag.ExitOnError)
		reason := fs.String("reason", "", "why automatic changes are frozen (shown on the dashboard)")
		_ = fs.Parse(args[1:])
		if !requireRoot("hold") {
			return 1
		}
		on := args[0] == "enable"
		if err := agent.SetHold(ctx, u, on, *reason, time.Now()); err != nil {
			return fail(err)
		}
		msg := "hold OFF: automatic repair resumed"
		if on {
			msg = "hold ON: the daemon keeps monitoring but will not change the network, routes, VPN or SSH until `iotgw hold disable`"
		}
		printer("hold: ")(msg)
		return 0
	}
	fmt.Fprintln(os.Stderr, "usage: iotgw hold enable [-reason TEXT] | hold disable | hold status")
	return 2
}

// ── bootstrap (live image) ───────────────────────────────────────────────────

func bootstrapCmd(args []string, legacy bool) int {
	name := "iotgw bootstrap"
	if legacy {
		name = "iotgw-bootstrap"
	}
	fs := flag.NewFlagSet(name, flag.ExitOnError)
	statePath := fs.String("state", state.File, "bootstrap state document")
	showVersion := fs.Bool("version", false, "print the version and exit")
	otp := fs.String("otp", "", "one-time code to use instead of the boot-time one (manual retry after it expired)")
	fs.Usage = func() {
		fmt.Fprintf(os.Stderr, "usage: %s [-otp CODE] [-state FILE]      provision (boot)\n", name)
		fmt.Fprintf(os.Stderr, "       %s internet-via lan|vpn           switch Internet route + DNS\n", name)
		fs.PrintDefaults()
	}
	_ = fs.Parse(args)
	if *showVersion {
		fmt.Println("iotgw-bootstrap", version.String())
		return 0
	}
	log.SetFlags(0) // systemd adds timestamps
	if platform.IsOpenWRT() {
		return fail(errors.New("bootstrap provisions the live image; on the installed gateway use `iotgw vpn refresh` / `iotgw ssh refresh`"))
	}
	if !requireRoot("bootstrap") {
		return 1
	}
	if fs.Arg(0) == "internet-via" {
		return internetCmd(fs.Args()[1:])
	}
	ctx, cancel := signalContext(10 * time.Minute)
	defer cancel()
	log.Printf("iotgw-bootstrap %s starting", version.String())
	r := bootstrap.NewRunner(*statePath)
	r.CodeOverride = *otp
	r.Run(ctx)
	log.Printf("iotgw-bootstrap finished; state in %s", *statePath)
	return 0
}
