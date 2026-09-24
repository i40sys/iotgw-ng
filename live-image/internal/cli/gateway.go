package cli

import (
	"context"
	"errors"
	"fmt"
	"log"

	"github.com/i40sys/iotgw-ng/live-image/internal/agent"
	"github.com/i40sys/iotgw-ng/live-image/internal/bootstrap"
	"github.com/i40sys/iotgw-ng/live-image/internal/platform"
	"github.com/i40sys/iotgw-ng/live-image/internal/state"
)

// Gateway is the platform seam of decision-032 §2: the operations the
// command line (and the dashboard, through it) asks for are the same on both
// platforms; how they change the system differs. The live image rewrites
// wg-quick, /etc/resolv.conf and systemd's sshd; the installed OpenWRT
// gateway goes through UCI/netifd, procd and transactions with rollback.
type Gateway interface {
	// Internet sets how the Internet is reached (lan | vpn | auto).
	Internet(ctx context.Context, mode string, out func(string)) error
	// VPNRefresh re-requests the WireGuard configuration and applies it.
	VPNRefresh(ctx context.Context, otp string, out func(string)) error
	// SSHRefresh re-requests the SSH trust / host certificate and reloads sshd.
	SSHRefresh(ctx context.Context, otp string, force bool, out func(string)) error
}

// gatewayFor returns the implementation for the running platform.
func gatewayFor(k platform.Kind, lg *log.Logger) Gateway {
	if k == platform.OpenWRT {
		return openwrtGateway{a: agent.New(lg)}
	}
	return liveGateway{statePath: state.File}
}

// ── installed OpenWRT: internal/agent ────────────────────────────────────────

type openwrtGateway struct{ a *agent.Agent }

func (g openwrtGateway) Internet(ctx context.Context, mode string, out func(string)) error {
	p, err := agent.ParsePolicy(mode)
	if err != nil || mode == "" {
		return errors.New("usage: iotgw internet lan|vpn|auto")
	}
	return g.a.SetInternet(ctx, p, out)
}

func (g openwrtGateway) VPNRefresh(ctx context.Context, otp string, out func(string)) error {
	return g.a.VPNRefresh(ctx, otp, out)
}

func (g openwrtGateway) SSHRefresh(ctx context.Context, otp string, force bool, out func(string)) error {
	return g.a.SSHRefresh(ctx, otp, force, out)
}

// ── live image: internal/bootstrap ───────────────────────────────────────────

type liveGateway struct{ statePath string }

func (g liveGateway) Internet(ctx context.Context, mode string, out func(string)) error {
	via, err := bootstrap.ParseInternetVia(mode)
	if err != nil || mode == "" {
		return errors.New("on the live image the Internet mode is lan or vpn (per boot)")
	}
	return bootstrap.SetInternetVia(ctx, g.statePath, via)
}

func (g liveGateway) VPNRefresh(ctx context.Context, otp string, out func(string)) error {
	r := bootstrap.NewRunner(g.statePath)
	r.CodeOverride = otp
	if err := r.RunVPN(ctx); err != nil {
		return err
	}
	out(fmt.Sprintf("VPN refreshed: %s", r.StepMessage(state.StepVPNApply)))
	return nil
}

func (g liveGateway) SSHRefresh(ctx context.Context, otp string, _ bool, out func(string)) error {
	// The live host identity is per boot: always re-requested (live-enroll).
	r := bootstrap.NewRunner(g.statePath)
	r.CodeOverride = otp
	if err := r.RunPKI(ctx); err != nil {
		return err
	}
	out(fmt.Sprintf("SSH refreshed: %s", r.StepMessage(state.StepSSHD)))
	return nil
}
