package bootstrap

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"time"

	"github.com/i40sys/iotgw-ng/live-image/internal/state"
	"github.com/i40sys/iotgw-ng/live-image/internal/sysexec"
)

// InternetVia selects how the live image reaches the Internet (decision-031).
//
//   - lan (default): split tunnel. Only the device's Netmaker network goes
//     through wg0; Internet and DNS use the local LAN gateway and the
//     DHCP-provided resolvers. The Netmaker hub is not an Internet gateway for
//     the iotgw networks, so this is the mode in which the Internet works.
//   - vpn: full tunnel, exactly as the server delivered it (all traffic and
//     DNS through wg0). Only useful once the hub egresses the network.
type InternetVia string

const (
	ViaLAN InternetVia = "lan"
	ViaVPN InternetVia = "vpn"
)

// ParseInternetVia validates a mode name.
func ParseInternetVia(s string) (InternetVia, error) {
	switch InternetVia(strings.ToLower(strings.TrimSpace(s))) {
	case ViaLAN, "":
		return ViaLAN, nil
	case ViaVPN:
		return ViaVPN, nil
	}
	return "", fmt.Errorf("internet mode must be 'lan' or 'vpn', not %q", s)
}

const (
	// serverConfPath keeps the configuration exactly as the vpn API sent it, so
	// either mode can be re-rendered from it at any time.
	serverConfPath = "/etc/wireguard/wg0.server.conf"
	resolvPath     = "/etc/resolv.conf"
	// lanResolvPath is the LAN resolver configuration captured at boot, before
	// anything changed it.
	lanResolvPath = state.Dir + "/resolv.conf.lan"
	// liveNetConf is live-boot's record of the DHCP lease (IPV4DNS0, …).
	liveNetConfGlob = "/run/net-*.conf"
)

// vpnDNSFallback is used in vpn mode when the configuration names no DNS.
var vpnDNSFallback = []string{"1.1.1.1", "9.9.9.9"}

// networkFromConf reads the `# Network: <cidr>` header the vpn API adds and
// returns the canonical network (10.5.0.1/31 → 10.5.0.0/31).
func networkFromConf(conf string) (string, error) {
	sc := bufio.NewScanner(strings.NewReader(conf))
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if v, ok := strings.CutPrefix(line, "# Network:"); ok {
			_, n, err := net.ParseCIDR(strings.TrimSpace(v))
			if err != nil {
				return "", fmt.Errorf("bad '# Network' header %q: %w", strings.TrimSpace(v), err)
			}
			return n.String(), nil
		}
	}
	return "", errors.New("the VPN configuration does not state its network (no '# Network:' header)")
}

// renderWG turns the server configuration into the wg0.conf for a mode.
// DNS= is always removed (wg-quick would call resolvconf, which the image does
// not have); DNS is managed by applyDNS instead. It returns the rendered file
// and the DNS servers the configuration asked for.
func renderWG(server string, via InternetVia, network string) (string, []string) {
	var out strings.Builder
	var dns []string
	section := ""
	sc := bufio.NewScanner(strings.NewReader(server))
	for sc.Scan() {
		raw := sc.Text()
		line := strings.TrimSpace(raw)
		if strings.HasPrefix(line, "[") {
			section = strings.ToLower(strings.Trim(line, "[]"))
		}
		key := ""
		if k, v, ok := strings.Cut(line, "="); ok && !strings.HasPrefix(line, "#") {
			key = strings.ToLower(strings.TrimSpace(k))
			if key == "dns" {
				dns = append(dns, splitList(v)...)
				continue
			}
		}
		if via == ViaLAN {
			// Split tunnel: keep the local default route, route only the network.
			if section == "interface" && (key == "preup" || key == "postdown" || key == "postup" || key == "predown") {
				continue
			}
			if section == "peer" && key == "allowedips" {
				out.WriteString("# iotgw live image: split tunnel (Internet via the local LAN)\n")
				out.WriteString("AllowedIPs = " + network + "\n")
				continue
			}
		}
		out.WriteString(raw + "\n")
	}
	return out.String(), dns
}

// captureLANResolv records the boot-time LAN resolvers once. live-boot's DHCP
// lease record is authoritative; the current resolv.conf is the fallback.
func captureLANResolv() error {
	if _, err := os.Stat(lanResolvPath); err == nil {
		return nil
	}
	var servers, search []string
	files, _ := filepath.Glob(liveNetConfGlob)
	for _, f := range files {
		b, err := os.ReadFile(f)
		if err != nil {
			continue
		}
		for _, l := range strings.Split(string(b), "\n") {
			k, v, ok := strings.Cut(l, "=")
			if !ok {
				continue
			}
			v = strings.Trim(v, `'"`)
			switch {
			case strings.HasPrefix(k, "IPV4DNS") && v != "" && v != "0.0.0.0":
				servers = append(servers, v)
			case (k == "DOMAINSEARCH" || k == "DNSDOMAIN") && v != "":
				for _, d := range strings.Fields(v) {
					if !slices.Contains(search, d) {
						search = append(search, d)
					}
				}
			}
		}
	}
	var content string
	if len(servers) > 0 {
		content = "# LAN resolvers from the DHCP lease (live-boot)\n"
		if len(search) > 0 {
			content += "search " + strings.Join(search, " ") + "\n"
		}
		for _, s := range servers {
			content += "nameserver " + s + "\n"
		}
	} else {
		b, err := os.ReadFile(resolvPath)
		if err != nil {
			return err
		}
		content = string(b)
	}
	return writeFile(lanResolvPath, content, 0o644)
}

// applyDNS writes /etc/resolv.conf for the mode and returns the servers used.
func applyDNS(via InternetVia, wgDNS []string) ([]string, error) {
	var content string
	var servers []string
	if via == ViaLAN {
		b, err := os.ReadFile(lanResolvPath)
		if err != nil {
			return nil, fmt.Errorf("no captured LAN resolver configuration: %w", err)
		}
		content = "# iotgw live image — Internet via LAN: resolvers from the local network\n" + string(b)
	} else {
		servers = wgDNS
		if len(servers) == 0 {
			servers = vpnDNSFallback
		}
		content = "# iotgw live image — Internet via VPN: resolvers reached through wg0\n"
		for _, s := range servers {
			content += "nameserver " + s + "\n"
		}
		content += "options timeout:2 attempts:2\n"
	}
	if servers == nil {
		for _, l := range strings.Split(content, "\n") {
			if f := strings.Fields(l); len(f) == 2 && f[0] == "nameserver" {
				servers = append(servers, f[1])
			}
		}
	}
	return servers, writeFile(resolvPath, content, 0o644)
}

// applyInternet (re)brings wg0 up in the given mode and sets DNS to match.
// It returns the handshake outcome; errors mean the tunnel is not up.
func applyInternet(ctx context.Context, via InternetVia, v *state.VPN) (state.Status, string, error) {
	server, err := os.ReadFile(serverConfPath)
	if err != nil {
		return state.Failed, "no VPN configuration to apply", err
	}
	network := v.NetworkCIDR
	if via == ViaLAN && network == "" {
		return state.Failed, "cannot split-tunnel: the VPN network is unknown", errors.New("missing network range")
	}
	if err := captureLANResolv(); err != nil {
		return state.Failed, "cannot capture the LAN resolver configuration", err
	}

	// Bring the old tunnel down with the config it was brought up with, so its
	// PostDown restores the default route before the new mode is written.
	_, _ = sysexec.Run(ctx, 20*time.Second, "wg-quick", "down", wgIface)

	conf, wgDNS := renderWG(string(server), via, network)
	if err := writeFile(wgConfPath, conf, 0o600); err != nil {
		return state.Failed, "cannot write " + wgConfPath, err
	}
	if _, err := sysexec.Run(ctx, 30*time.Second, "wg-quick", "up", wgIface); err != nil {
		return state.Failed, "wg-quick up " + wgIface + " failed", err
	}
	dns, err := applyDNS(via, wgDNS)
	if err != nil {
		return state.Failed, "tunnel up but DNS could not be configured", err
	}
	sum, _ := parseWGConf(conf)
	v.InternetVia, v.AllowedIPs, v.DNS, v.AppliedAt = string(via), sum.AllowedIPs, dns, time.Now().UTC()

	mode := "Internet via LAN (split tunnel)"
	if via == ViaVPN {
		mode = "Internet via VPN (full tunnel)"
	}
	deadline := time.Now().Add(25 * time.Second)
	for time.Now().Before(deadline) {
		res, err := sysexec.Run(ctx, 5*time.Second, "wg", "show", wgIface, "latest-handshakes")
		if err == nil {
			for _, l := range strings.Split(strings.TrimSpace(res.Stdout), "\n") {
				if f := strings.Fields(l); len(f) == 2 && f[1] != "0" {
					return state.Healthy, wgIface + " up, handshake with " + v.Endpoint + " — " + mode, nil
				}
			}
		}
		time.Sleep(2 * time.Second)
	}
	return state.Warning, wgIface + " up but no handshake with " + v.Endpoint + " within 25 s — " + mode, nil
}

// SetInternetVia switches an already-provisioned live image between modes.
// It is the privileged action behind the dashboard's [i] key.
func SetInternetVia(ctx context.Context, statePath string, via InternetVia) error {
	st, err := state.Read(statePath)
	if err != nil {
		return fmt.Errorf("no bootstrap state (%v) — the VPN was never provisioned", err)
	}
	if s := st.Step(state.StepVPNFetch); s == nil || s.Status != state.Healthy {
		return errors.New("the VPN configuration was not retrieved at boot; nothing to switch")
	}
	status, msg, aerr := applyInternet(ctx, via, &st.VPN)
	if s := st.Step(state.StepVPNApply); s != nil {
		s.Status, s.Message, s.FinishedAt, s.Error = status, msg, time.Now().UTC(), ""
		if aerr != nil {
			s.Error = aerr.Error()
		}
	}
	st.UpdatedAt = time.Now().UTC()
	if err := state.Write(statePath, st); err != nil {
		return err
	}
	if aerr != nil {
		return fmt.Errorf("%s: %w", msg, aerr)
	}
	fmt.Println(msg)
	return nil
}
