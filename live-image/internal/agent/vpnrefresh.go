package agent

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	"github.com/i40sys/iotgw-ng/live-image/internal/devapi"
	"github.com/i40sys/iotgw-ng/live-image/internal/uci"
	"github.com/i40sys/iotgw-ng/live-image/internal/wgconf"
	"github.com/i40sys/iotgw-ng/live-image/internal/wgkey"
)

// ServerConfPath keeps the vpn API's reply (0600: completed with the
// gateway's own private key when the server omitted it, decision-035), as the
// live image does, so the network range and peer can be re-derived at any
// time.
const ServerConfPath = "/etc/iotgw/wg0.server.conf"

// otpRe is a one-time code as the UI shows it.
var otpRe = regexp.MustCompile(`^[0-9]{6}$`)

// ErrNoCode is returned when an operation needs a one-time code and none was
// given: the gateway cannot compute one (decision-033).
var ErrNoCode = errors.New("a one-time code from the iotgw-ng UI is required (-otp CODE)")

// DeviceCode returns the operator's one-time code (decision-033): the only
// source of a code on the gateway. Nothing derives one.
func DeviceCode(_ Config, override string) (string, error) {
	override = strings.TrimSpace(override)
	if override == "" {
		return "", ErrNoCode
	}
	if !otpRe.MatchString(override) {
		return "", errors.New("the one-time code must be 6 digits")
	}
	return override, nil
}

// WGOps renders a vpn config into UCI changes for wg0 and its peer.
func WGOps(secs []uci.Section, wgIface string, c wgconf.Config) []Op {
	var ops []Op
	ifPath := netConfig + "." + wgIface
	wgSec := find(secs, wgIface)
	if wgSec == nil {
		ops = append(ops, Op{Path: ifPath, Value: "interface"}, Op{Path: ifPath + ".proto", Value: "wireguard"})
	}
	ops = setIfDiff(ops, wgSec, ifPath, "private_key", c.PrivateKey)
	if wgSec == nil || !sameList(wgSec.Options["addresses"], c.Addresses) {
		ops = append(ops, Op{Path: ifPath + ".addresses", List: c.Addresses})
	}
	if wgSec == nil || wgSec.Get("metric") == "" {
		ops = append(ops, Op{Path: ifPath + ".metric", Value: wgMetric})
	}

	peer := PeerSection(secs, wgIface)
	var pSec *uci.Section
	if peer == "" {
		peer = "wgserver"
		ops = append(ops, Op{Path: netConfig + "." + peer, Value: "wireguard_" + wgIface})
	} else {
		pSec = find(secs, peer)
	}
	pPath := netConfig + "." + peer
	host, port, _ := c.EndpointHostPort()
	ka := c.Keepalive
	if ka == 0 {
		ka = 25
	}
	ops = setIfDiff(ops, pSec, pPath, "public_key", c.PeerPublicKey)
	ops = setIfDiff(ops, pSec, pPath, "endpoint_host", host)
	ops = setIfDiff(ops, pSec, pPath, "endpoint_port", port)
	ops = setIfDiff(ops, pSec, pPath, "persistent_keepalive", strconv.Itoa(ka))
	ops = setIfDiff(ops, pSec, pPath, "route_allowed_ips", "1")
	want := []string{}
	if c.Network != "" {
		want = append(want, c.Network)
	}
	want = append(want, anyIPv4)
	if pSec == nil || !sameList(pSec.Options["allowed_ips"], want) {
		ops = append(ops, Op{Path: pPath + ".allowed_ips", List: want})
	}
	return ops
}

func sameList(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

// VPNRefresh re-requests the WireGuard configuration from the vpn API and
// applies it transactionally (decision-032 §6). out receives progress lines.
//
// The gateway holds its WireGuard private key (decision-035 §2): it sends
// only the public key of the key already in uci network.<wg>.private_key, so
// a refresh normally changes nothing on Netmaker and a rollback (which
// restores that same key) stays valid. rotateKey generates a new key pair
// instead; so does a gateway with no usable key. The private key is never
// logged, printed or sent.
func (a *Agent) VPNRefresh(ctx context.Context, otp string, rotateKey bool, out func(string)) error {
	cfg, err := LoadConfig(ctx, a.UCI)
	if err != nil {
		return err
	}
	if cfg.APIBase == "" || cfg.DeviceID == "" {
		return errors.New("no device identity in /etc/config/iotgw (api_base, device_id) — was the gateway installed by the iotgw install flow?")
	}
	code, err := DeviceCode(cfg, otp)
	if err != nil {
		return err
	}
	wg := cfg.WGIface
	up, uerr := a.Uplink(ctx, wg)
	priv, pub, keyMsg, err := a.gatewayWGKey(ctx, wg, rotateKey)
	if err != nil {
		return err
	}
	out(keyMsg)
	body := map[string]string{"device_id": cfg.DeviceID, "wg_public_key": pub}
	if uerr == nil {
		body["gateway"], body["interface"] = up.Gateway, up.Device
	}
	client := devapi.New(cfg.APIBase, cfg.DeviceID, code, devapi.WithCAFile(cfg.APICA))
	out(fmt.Sprintf("requesting the VPN configuration from %s (operator code; reply sealed to a one-off key; %s)", client.Endpoint("vpn"), client.Trust()))
	vr, status, err := client.CallVPN(ctx, body)
	if err != nil {
		return fmt.Errorf("vpn API (HTTP %d): %w", status, err)
	}
	if !vr.Sealed {
		out("warning: the server answered with the deprecated code-encrypted reply (not sealed to this request's key) — update the vpn function")
	}
	full, inserted, err := wgconf.WithPrivateKey(string(vr.Config), priv)
	if err != nil {
		return fmt.Errorf("the VPN configuration is invalid: %w", err)
	}
	if !inserted {
		out("warning: the server sent a private key (it predates gateway-held keys) — using the server's key, as before")
	}
	reply := []byte(full)
	conf, err := wgconf.Parse(full)
	if err != nil {
		return fmt.Errorf("the VPN configuration is invalid: %w", err)
	}
	out(fmt.Sprintf("received: address %v, peer %s at %s, network %s", conf.Addresses, conf.PeerPublicKey, conf.Endpoint, orNone(conf.Network)))

	secs, err := a.UCI.Show(ctx, netConfig)
	if err != nil {
		return err
	}
	ops := WGOps(secs, wg, conf)
	if host, _, _ := conf.EndpointHostPort(); uerr == nil {
		if ip, err := resolveIPv4(ctx, host); err == nil {
			ops = append(ops, EndpointRouteOps(secs, up, ip)...)
		}
	}
	accept := func(before, after Health, final bool) (bool, string) {
		switch {
		case after.Handshake:
			return true, "tunnel up (" + after.String() + ")"
		case before.Handshake:
			return false, "the tunnel was up before and is down with the new configuration"
		case before.Egress && !after.Egress:
			return false, "the gateway lost its Internet egress"
		case final:
			// Down before and after: rolling back to an equally dead
			// configuration protects nothing — keep the server's.
			return true, "kept: the tunnel was down before too (" + after.String() + ")"
		}
		return false, "no handshake yet"
	}
	var before, after Health
	if len(ops) == 0 {
		out("the installed configuration already matches the server's; nothing to apply")
		before = a.measure(ctx, wg)
		after = before
	} else {
		out("applying: " + Describe(ops))
		before, after, err = a.Transact(ctx, wg, "vpn refresh", ops, accept)
		if err != nil {
			return err
		}
	}
	if err := os.MkdirAll(filepath.Dir(ServerConfPath), 0o700); err == nil {
		if err := os.WriteFile(ServerConfPath, reply, 0o600); err != nil {
			out("warning: cannot save " + ServerConfPath + ": " + err.Error())
		}
	}
	if conf.Network != "" && conf.Network != cfg.NetworkCIDR {
		if err := setOption(ctx, a.UCI, "network_cidr", conf.Network); err != nil {
			out("warning: cannot record network_cidr: " + err.Error())
		}
	}
	if !after.Handshake {
		out(fmt.Sprintf("WARNING: applied, but no handshake yet (before: %s; after: %s) — watch `iotgw vpn status`", before, after))
		return nil
	}
	out(fmt.Sprintf("VPN refreshed: %s", after))
	return nil
}

// gatewayWGKey returns the WireGuard key pair the refresh uses: the one in
// uci network.<wg>.private_key, or a new one for rotateKey / no usable key.
// msg describes the choice with the PUBLIC key only.
func (a *Agent) gatewayWGKey(ctx context.Context, wg string, rotateKey bool) (priv, pub, msg string, err error) {
	if !rotateKey {
		if cur := strings.TrimSpace(a.UCI.Get(ctx, netConfig+"."+wg+".private_key")); cur != "" {
			if pub, err := wgkey.Public(cur); err == nil {
				return cur, pub, "keeping the gateway's WireGuard key (public " + pub + ")", nil
			}
		}
	}
	priv, pub, err = wgkey.Generate()
	if err != nil {
		return "", "", "", fmt.Errorf("generate a WireGuard key: %w", err)
	}
	if rotateKey {
		return priv, pub, "rotating the WireGuard key: new public key " + pub + " (the server moves the Netmaker client to it)", nil
	}
	return priv, pub, "the gateway has no usable WireGuard key: generated one (public " + pub + ")", nil
}
