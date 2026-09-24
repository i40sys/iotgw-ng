package agent

import (
	"context"
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/i40sys/iotgw-ng/live-image/internal/iproute"
	"github.com/i40sys/iotgw-ng/live-image/internal/sysexec"
	"github.com/i40sys/iotgw-ng/live-image/internal/uci"
)

// Agent performs the installed-gateway operations. The seams (UCI, Ubus,
// Reload, Measure) make the transactional logic testable without OpenWRT.
type Agent struct {
	UCI    *uci.Client
	Ubus   func(ctx context.Context, args ...string) (string, error)
	Reload func(ctx context.Context) error
	// IfUp re-creates one interface. netifd's reload does not re-run the
	// WireGuard setup when only its peer section changed, so any change to
	// wg0 or its peer needs this (`ifup` = down + up).
	IfUp      func(ctx context.Context, iface string) error
	StatePath string
	Log       *log.Logger
	// Measure overrides the post-change health check (tests).
	Measure func(ctx context.Context, wgIface string) Health
	// VerifyTimeout bounds how long a change may take to prove itself.
	VerifyTimeout time.Duration
	// LockPath serializes changes between the daemon and manual commands
	// (dashboard, LuCI, CLI); "" = no lock.
	LockPath string
}

// DefaultLock is the change lock on the installed gateway.
const DefaultLock = "/var/run/iotgw/change.lock"

// lock takes the change lock (waits for a running change to finish). A lock
// that cannot be opened is not fatal: the change still runs, unserialized.
func (a *Agent) lock() func() {
	if a.LockPath == "" {
		return func() {}
	}
	_ = os.MkdirAll(filepath.Dir(a.LockPath), 0o755)
	f, err := os.OpenFile(a.LockPath, os.O_CREATE|os.O_RDWR, 0o600)
	if err != nil {
		a.logf("change lock %s: %v (continuing without it)", a.LockPath, err)
		return func() {}
	}
	if err := syscall.Flock(int(f.Fd()), syscall.LOCK_EX); err != nil {
		f.Close()
		return func() {}
	}
	return func() { _ = syscall.Flock(int(f.Fd()), syscall.LOCK_UN); f.Close() }
}

// New returns an agent for the real system.
func New(logger *log.Logger) *Agent {
	return &Agent{
		UCI: uci.New(),
		Ubus: func(ctx context.Context, args ...string) (string, error) {
			res, err := sysexec.Run(ctx, 10*time.Second, "ubus", args...)
			return res.Stdout, err
		},
		Reload: func(ctx context.Context) error {
			_, err := sysexec.Run(ctx, 30*time.Second, "ubus", "call", "network", "reload")
			return err
		},
		IfUp: func(ctx context.Context, iface string) error {
			_, err := sysexec.Run(ctx, 30*time.Second, "/sbin/ifup", iface)
			return err
		},
		StatePath:     StateFile,
		LockPath:      DefaultLock,
		Log:           logger,
		VerifyTimeout: 60 * time.Second,
	}
}

func (a *Agent) logf(format string, args ...any) {
	if a.Log != nil {
		a.Log.Printf(format, args...)
	}
}

// Uplink detects the current uplink and LAN router.
func (a *Agent) Uplink(ctx context.Context, wgIface string) (Uplink, error) {
	out, err := a.Ubus(ctx, "call", "network.interface", "dump")
	if err != nil {
		return Uplink{}, err
	}
	return ParseUplink(out, wgIface)
}

// Health is what a change must not make worse.
type Health struct {
	Egress    bool // Internet along the default path
	Handshake bool // tunnel alive
}

func (h Health) String() string {
	return fmt.Sprintf("Internet %s, tunnel %s", okWord(h.Egress), map[bool]string{true: "UP", false: "DOWN"}[h.Handshake])
}

func okWord(b bool) string {
	if b {
		return "OK"
	}
	return "NONE"
}

func (a *Agent) measure(ctx context.Context, wgIface string) Health {
	if a.Measure != nil {
		return a.Measure(ctx, wgIface)
	}
	var h Health
	h.Egress, _ = tcpProbe(ctx, "")
	if ifaceExists(wgIface) {
		h.Handshake, _ = handshakeProbe(ctx, wgIface)
	}
	return h
}

// Accept judges a change from the health before and after it; final is set
// on the last look before the verification deadline. It returns whether the
// change is kept, and a reason.
type Accept func(before, after Health, final bool) (ok bool, why string)

// NoRegression accepts anything that did not lose Internet or the tunnel —
// the rule for every automatic change (decision-032 §4/§7).
func NoRegression(before, after Health, _ bool) (bool, string) {
	switch {
	case before.Egress && !after.Egress:
		return false, "the gateway lost its Internet egress"
	case before.Handshake && !after.Handshake:
		return false, "the VPN tunnel went down"
	}
	return true, "no regression (" + after.String() + ")"
}

// ErrRolledBack means a change was applied, failed its verification and the
// previous configuration was restored.
var ErrRolledBack = errors.New("change rolled back")

// Transact stages ops on /etc/config/network, commits, reloads netifd and
// keeps the change only if accept agrees within VerifyTimeout; otherwise the
// snapshot is restored and netifd reloaded again. It returns the health
// before and after.
func (a *Agent) Transact(ctx context.Context, wgIface, label string, ops []Op, accept Accept) (Health, Health, error) {
	if len(ops) > 0 {
		defer a.lock()()
	}
	before := a.measure(ctx, wgIface)
	if len(ops) == 0 {
		return before, before, nil
	}
	snap, err := a.UCI.Take(netConfig)
	if err != nil {
		return before, before, fmt.Errorf("snapshot network: %w", err)
	}
	wgTouched := a.touchesWG(ctx, ops, wgIface)
	a.logf("%s: applying %s (before: %s)", label, Describe(ops), before)
	if err := Apply(ctx, a.UCI, ops); err != nil {
		_ = a.UCI.Revert(ctx, netConfig)
		return before, before, err
	}
	if err := a.UCI.Commit(ctx, netConfig); err != nil {
		_ = a.UCI.Revert(ctx, netConfig)
		return before, before, fmt.Errorf("commit network: %w", err)
	}
	after, why, ok := a.reloadAndVerify(ctx, wgIface, wgTouched, before, accept)
	if ok {
		a.logf("%s: kept (%s)", label, why)
		return before, after, nil
	}
	a.logf("%s: ROLLING BACK — %s", label, why)
	if err := a.UCI.Restore(ctx, snap); err != nil {
		return before, after, fmt.Errorf("%w: %s; restoring the snapshot FAILED: %v", ErrRolledBack, why, err)
	}
	if err := a.apply(ctx, wgIface, wgTouched); err != nil {
		return before, after, fmt.Errorf("%w: %s; reload after restore failed: %v", ErrRolledBack, why, err)
	}
	return before, after, fmt.Errorf("%w: %s", ErrRolledBack, why)
}

// apply makes netifd apply the committed config: reload, plus re-creating
// the tunnel when its interface or peer changed.
func (a *Agent) apply(ctx context.Context, wgIface string, wgTouched bool) error {
	if err := a.Reload(ctx); err != nil {
		return err
	}
	if wgTouched && a.IfUp != nil {
		return a.IfUp(ctx, wgIface)
	}
	return nil
}

// touchesWG reports whether ops change the WireGuard interface or its peer.
func (a *Agent) touchesWG(ctx context.Context, ops []Op, wgIface string) bool {
	peer := ""
	if secs, err := a.UCI.Show(ctx, netConfig); err == nil {
		peer = PeerSection(secs, wgIface)
	}
	for _, o := range ops {
		sec := strings.SplitN(o.Path, ".", 3)
		if len(sec) >= 2 && (sec[1] == wgIface || (peer != "" && sec[1] == peer)) {
			return true
		}
	}
	return false
}

func (a *Agent) reloadAndVerify(ctx context.Context, wgIface string, wgTouched bool, before Health, accept Accept) (Health, string, bool) {
	if err := a.apply(ctx, wgIface, wgTouched); err != nil {
		return before, "network reload failed: " + err.Error(), false
	}
	deadline := time.Now().Add(a.VerifyTimeout)
	var after Health
	why := ""
	for {
		// Give netifd and WireGuard a moment before each look.
		select {
		case <-ctx.Done():
			return after, "interrupted: " + ctx.Err().Error(), false
		case <-time.After(min(3*time.Second, a.VerifyTimeout)):
		}
		after = a.measure(ctx, wgIface)
		final := !time.Now().Before(deadline)
		var ok bool
		ok, why = accept(before, after, final)
		if ok || final {
			return after, why, ok
		}
	}
}

// CurrentEgress is the path traffic to the Internet takes right now.
func CurrentEgress(ctx context.Context, wgIface string) Egress {
	r, err := iproute.Get(ctx, "1.1.1.1")
	if err != nil || r == nil {
		return EgressUnknown
	}
	if r.Dev == wgIface {
		return EgressVPN
	}
	return EgressLAN
}

// Pid is recorded in the state file.
func pid() int { return os.Getpid() }
