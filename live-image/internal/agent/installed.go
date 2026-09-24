package agent

import (
	"context"
	"os"
	"time"

	"github.com/i40sys/iotgw-ng/live-image/internal/platform"
	"github.com/i40sys/iotgw-ng/live-image/internal/state"
	"github.com/i40sys/iotgw-ng/live-image/internal/uci"
)

// Installed is what the dashboard's Installed panel shows (decision-032 §3).
type Installed struct {
	OS          string
	ConfigErr   string // /etc/config/iotgw unreadable
	Config      Config
	InstalledAt string

	IdentityOK   bool // the device can authenticate by itself
	WGConfigured bool // network.<wg> has a private key and a peer
	HostCert     bool // an SSH host certificate is installed

	Daemon        *State // nil when the daemon never wrote its state
	DaemonErr     string
	DaemonRunning bool // state refreshed recently
}

// Provisioned: identity, VPN configuration and SSH enrollment are all there.
func (i Installed) Provisioned() bool { return i.IdentityOK && i.WGConfigured && i.HostCert }

// daemonStale is how old the state may be before the daemon counts as gone.
func daemonStale(interval string) time.Duration {
	d, err := time.ParseDuration(interval)
	if err != nil || d <= 0 {
		d = DefaultInterval
	}
	return 2*d + 90*time.Second // a cycle's own probes and a verify can take a while
}

// CollectInstalled gathers the installed gateway's picture.
func CollectInstalled(ctx context.Context) Installed {
	u := uci.New()
	var in Installed
	in.OS = platform.Release()
	cfg, err := LoadConfig(ctx, u)
	if err != nil {
		in.ConfigErr = err.Error()
	}
	in.Config = cfg
	in.InstalledAt = cfg.InstalledAt
	in.IdentityOK = cfg.IdentityComplete()
	if secs, err := u.Show(ctx, netConfig); err == nil {
		if s := find(secs, cfg.WGIface); s != nil && s.Get("private_key") != "" && PeerSection(secs, cfg.WGIface) != "" {
			in.WGConfigured = true
		}
	}
	_, err = os.Stat(sshHostCert)
	in.HostCert = err == nil
	st, err := ReadState(StateFile)
	if err != nil {
		in.DaemonErr = err.Error()
	} else {
		in.Daemon = st
		in.DaemonRunning = time.Since(st.UpdatedAt) < daemonStale(st.Interval)
	}
	return in
}

// SyntheticDoc presents the installed gateway to the VPN and PKI collectors
// in the live image's vocabulary, so the same panels render on both.
func (i Installed) SyntheticDoc() *state.Bootstrap {
	now := time.Now().UTC()
	doc := state.New(now)
	doc.Finished = true
	doc.Identity = state.Identity{DeviceID: i.Config.DeviceID, HasCode: i.IdentityOK, APIBase: i.Config.APIBase}
	set := func(id string, st state.Status, msg string) {
		if s := doc.Step(id); s != nil {
			s.Status, s.Message = st, msg
		}
	}
	ok := func(b bool) state.Status {
		if b {
			return state.Healthy
		}
		return state.NotConfigured
	}
	set(state.StepIdentity, ok(i.IdentityOK), "device identity in /etc/config/iotgw")
	set(state.StepNetwork, state.Healthy, "")
	set(state.StepVPNFetch, ok(i.WGConfigured), "WireGuard configuration in /etc/config/network")
	set(state.StepVPNApply, ok(i.WGConfigured), "")
	set(state.StepPKIFetch, ok(i.HostCert), "SSH-CA enrollment")
	set(state.StepUserCA, ok(i.HostCert), "")
	set(state.StepHostCert, ok(i.HostCert), "")
	set(state.StepSSHD, ok(i.HostCert), "")
	doc.VPN = state.VPN{Interface: i.Config.WGIface, NetworkCIDR: i.Config.NetworkCIDR}
	if i.Daemon != nil {
		doc.VPN.InternetVia = string(i.Daemon.Egress)
	}
	doc.PKI = state.PKI{UserCAPath: sshUserCA, HostCertPath: sshHostCert, PrincipalsPath: sshPrincipals}
	return doc
}
