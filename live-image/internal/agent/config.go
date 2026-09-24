// Package agent is the installed-gateway side of the iotgw tool
// (decision-032): the persistent configuration in /etc/config/iotgw, the
// self-healing daemon that keeps the management path (uplink, Netmaker route,
// Internet egress) working, and the on-demand VPN/SSH refresh operations.
// Every change it makes to the network or sshd is transactional: snapshot,
// apply, verify, and restore the snapshot when the gateway got worse.
package agent

import (
	"context"
	"fmt"
	"net"
	"strconv"
	"strings"
	"time"

	"github.com/i40sys/iotgw-ng/live-image/internal/totp"
	"github.com/i40sys/iotgw-ng/live-image/internal/uci"
)

// UCI coordinates of the agent's own configuration.
const (
	ConfigName = "iotgw"
	mainSect   = "main"
	mainPath   = ConfigName + "." + mainSect
)

// Policy is how the Internet egress is chosen (decision-032 §5).
type Policy string

const (
	// PolicyAuto prefers Config.Prefer and falls back to the other path when
	// the preferred one has no Internet. The default: LAN preferred.
	PolicyAuto Policy = "auto"
	// PolicyLAN pins the egress to the local uplink (no automatic switching).
	PolicyLAN Policy = "lan"
	// PolicyVPN pins the egress to the tunnel (no automatic switching).
	PolicyVPN Policy = "vpn"
)

// ParsePolicy validates a policy name.
func ParsePolicy(s string) (Policy, error) {
	switch Policy(strings.ToLower(strings.TrimSpace(s))) {
	case PolicyAuto, "":
		return PolicyAuto, nil
	case PolicyLAN:
		return PolicyLAN, nil
	case PolicyVPN:
		return PolicyVPN, nil
	}
	return "", fmt.Errorf("internet policy must be lan, vpn or auto, not %q", s)
}

// Egress is the path Internet traffic actually takes.
type Egress string

const (
	EgressLAN     Egress = "lan"
	EgressVPN     Egress = "vpn"
	EgressUnknown Egress = ""
)

// Config is /etc/config/iotgw, section `main`.
type Config struct {
	Policy Policy
	Prefer Egress // what auto prefers (lan by default)

	Hold       bool
	HoldReason string
	HoldSince  time.Time

	Interval time.Duration
	// Rate limit for automatic changes (decision-032 §7): at most MaxChanges
	// per ChangeWindow. Zero = the defaults (3 per 15 min).
	MaxChanges   int
	ChangeWindow time.Duration

	// Device identity, written by the install playbook. Identifiers only —
	// the one-time code is derived from them (internal/totp).
	APIBase     string
	DeviceID    string // <name>@<8-hex network prefix>
	DeviceUUID  string
	NetworkID   string
	DomainID    string
	TOTPCounter int
	// NetworkCIDR is the device's Netmaker network (from the vpn config).
	NetworkCIDR string

	WGIface     string
	InstalledAt string
}

// Defaults applied to missing options.
const (
	DefaultInterval = 60 * time.Second
	minInterval     = 15 * time.Second
)

// TOTPIdentity is what the device code is derived from.
func (c Config) TOTPIdentity() totp.Identity {
	return totp.Identity{DomainID: c.DomainID, NetworkID: c.NetworkID, DeviceUUID: c.DeviceUUID, Counter: c.TOTPCounter}
}

// IdentityComplete reports whether the device can authenticate by itself.
func (c Config) IdentityComplete() bool {
	return c.APIBase != "" && c.DeviceID != "" && c.TOTPIdentity().Complete()
}

// LoadConfig reads /etc/config/iotgw. A missing file yields the defaults.
func LoadConfig(ctx context.Context, u *uci.Client) (Config, error) {
	c := Config{Policy: PolicyAuto, Prefer: EgressLAN, Interval: DefaultInterval, WGIface: "wg0"}
	secs, err := u.Show(ctx, ConfigName)
	if err != nil {
		// No /etc/config/iotgw yet: defaults, but say so.
		return c, fmt.Errorf("read %s: %w", ConfigName, err)
	}
	var s *uci.Section
	for i := range secs {
		if secs[i].Name == mainSect {
			s = &secs[i]
		}
	}
	if s == nil {
		return c, nil
	}
	if p, err := ParsePolicy(s.Get("internet_policy")); err == nil {
		c.Policy = p
	}
	if s.Get("prefer") == string(EgressVPN) {
		c.Prefer = EgressVPN
	}
	c.Hold = s.Get("hold") == "1"
	c.HoldReason = s.Get("hold_reason")
	if t, err := time.Parse(time.RFC3339, s.Get("hold_since")); err == nil {
		c.HoldSince = t
	}
	if n, err := strconv.Atoi(s.Get("check_interval")); err == nil {
		c.Interval = max(time.Duration(n)*time.Second, minInterval)
	}
	c.MaxChanges, _ = strconv.Atoi(s.Get("max_changes"))
	if n, err := strconv.Atoi(s.Get("change_window")); err == nil && n > 0 {
		c.ChangeWindow = time.Duration(n) * time.Second
	}
	c.APIBase = strings.TrimRight(s.Get("api_base"), "/")
	c.DeviceID = s.Get("device_id")
	c.DeviceUUID = s.Get("device_uuid")
	c.NetworkID = s.Get("network_id")
	c.DomainID = s.Get("domain_id")
	c.TOTPCounter, _ = strconv.Atoi(s.Get("totp_counter"))
	c.NetworkCIDR = canonCIDR(s.Get("network_cidr"))
	if v := s.Get("wg_iface"); v != "" {
		c.WGIface = v
	}
	c.InstalledAt = s.Get("installed_at")
	return c, nil
}

// canonCIDR returns the network of a CIDR (10.5.0.1/24 → 10.5.0.0/24), or ""
// when it does not parse: an invalid value must not reach WireGuard.
func canonCIDR(v string) string {
	_, n, err := net.ParseCIDR(strings.TrimSpace(v))
	if err != nil {
		return ""
	}
	return n.String()
}

// ensureMain creates the `main` section when the file is new.
func ensureMain(ctx context.Context, u *uci.Client) error {
	if u.Get(ctx, mainPath) == "iotgw" {
		return nil
	}
	return u.Set(ctx, mainPath, "iotgw")
}

// SetPolicy persists the Internet policy.
func SetPolicy(ctx context.Context, u *uci.Client, p Policy) error {
	if err := ensureMain(ctx, u); err != nil {
		return err
	}
	if err := u.Set(ctx, mainPath+".internet_policy", string(p)); err != nil {
		return err
	}
	return u.Commit(ctx, ConfigName)
}

// SetHold persists hold mode (decision-032 §8).
func SetHold(ctx context.Context, u *uci.Client, on bool, reason string, now time.Time) error {
	if err := ensureMain(ctx, u); err != nil {
		return err
	}
	if on {
		if reason == "" {
			reason = "manual diagnosis"
		}
		for k, v := range map[string]string{"hold": "1", "hold_reason": reason, "hold_since": now.UTC().Format(time.RFC3339)} {
			if err := u.Set(ctx, mainPath+"."+k, v); err != nil {
				return err
			}
		}
	} else {
		if err := u.Set(ctx, mainPath+".hold", "0"); err != nil {
			return err
		}
		_ = u.Delete(ctx, mainPath+".hold_reason")
		_ = u.Delete(ctx, mainPath+".hold_since")
	}
	return u.Commit(ctx, ConfigName)
}

// setOption persists one option of `main`.
func setOption(ctx context.Context, u *uci.Client, opt, value string) error {
	if err := ensureMain(ctx, u); err != nil {
		return err
	}
	if err := u.Set(ctx, mainPath+"."+opt, value); err != nil {
		return err
	}
	return u.Commit(ctx, ConfigName)
}
