package agent

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/i40sys/iotgw-ng/live-image/internal/devapi"
	"github.com/i40sys/iotgw-ng/live-image/internal/totp"
	"github.com/i40sys/iotgw-ng/live-image/internal/uci"
	"github.com/i40sys/iotgw-ng/live-image/internal/wgconf"
)

// ServerConfPath keeps the vpn API's reply verbatim (0600: it holds the
// private key), as the live image does, so the network range and peer can be
// re-derived at any time.
const ServerConfPath = "/etc/iotgw/wg0.server.conf"

// DeviceCode returns the code to authenticate with: the operator's one-time
// code when given, else the code derived from the identity in
// /etc/config/iotgw (decision-032 "Refresh authentication").
func DeviceCode(cfg Config, override string) (string, string, error) {
	if override != "" {
		return override, "operator code", nil
	}
	if !cfg.TOTPIdentity().Complete() {
		return "", "", errors.New("no one-time code: pass -otp CODE (from the UI), or install the device identity in /etc/config/iotgw")
	}
	return totp.Code(cfg.TOTPIdentity(), time.Now()), "derived from the device identity", nil
}

// hint401 explains the usual cause of a rejected derived code.
func hint401(err error, source string) error {
	var ae *devapi.APIError
	if errors.As(err, &ae) && ae.Status == 401 && strings.Contains(ae.Message, "re-enrollment requires proof") {
		return fmt.Errorf("%w\n  this device was enrolled before with ANOTHER host key (e.g. it was reinstalled) and that key is gone:\n  its old SSH enrollment must be reset by an operator before it can enroll again", err)
	}
	if errors.As(err, &ae) && ae.Status == 401 && source != "operator code" {
		return fmt.Errorf("%w\n  the derived code was rejected: the device's code counter was probably reset in the UI.\n  Update it (uci set iotgw.main.totp_counter=N; uci commit iotgw) or pass -otp CODE", err)
	}
	return err
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
func (a *Agent) VPNRefresh(ctx context.Context, otp string, out func(string)) error {
	cfg, err := LoadConfig(ctx, a.UCI)
	if err != nil {
		return err
	}
	if cfg.APIBase == "" || cfg.DeviceID == "" {
		return errors.New("no device identity in /etc/config/iotgw (api_base, device_id) — was the gateway installed by the iotgw install flow?")
	}
	code, source, err := DeviceCode(cfg, otp)
	if err != nil {
		return err
	}
	wg := cfg.WGIface
	up, uerr := a.Uplink(ctx, wg)
	body := map[string]string{"device_id": cfg.DeviceID}
	if uerr == nil {
		body["gateway"], body["interface"] = up.Gateway, up.Device
	}
	client := devapi.New(cfg.APIBase, cfg.DeviceID, code)
	out(fmt.Sprintf("requesting the VPN configuration from %s (code: %s)", client.Endpoint("vpn"), source))
	reply, status, err := client.Call(ctx, "vpn", body)
	if err != nil {
		return hint401(fmt.Errorf("vpn API (HTTP %d): %w", status, err), source)
	}
	conf, err := wgconf.Parse(string(reply))
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
