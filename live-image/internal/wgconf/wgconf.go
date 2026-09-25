// Package wgconf parses the wg-quick configuration the `vpn` edge function
// returns. Both the live image (wg-quick) and the installed OpenWRT gateway
// (UCI network.wg0 + wireguard_wg0) are rendered from it.
package wgconf

import (
	"bufio"
	"errors"
	"fmt"
	"net"
	"strconv"
	"strings"
)

// Config is a parsed single-peer WireGuard configuration.
type Config struct {
	PrivateKey    string // never log this
	Addresses     []string
	PeerPublicKey string
	Endpoint      string // host:port
	AllowedIPs    []string
	Keepalive     int
	// Network is the device's Netmaker network from the `# Network:` header
	// (canonical, e.g. 10.5.0.0/24); "" when the header is absent.
	Network string
}

// EndpointHostPort splits Endpoint.
func (c Config) EndpointHostPort() (string, string, error) {
	return net.SplitHostPort(c.Endpoint)
}

// Parse validates a wg-quick config and extracts its fields.
func Parse(conf string) (Config, error) {
	var c Config
	section := ""
	sc := bufio.NewScanner(strings.NewReader(conf))
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if v, ok := strings.CutPrefix(line, "# Network:"); ok {
			if _, n, err := net.ParseCIDR(strings.TrimSpace(v)); err == nil {
				c.Network = n.String()
			}
			continue
		}
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		if strings.HasPrefix(line, "[") {
			section = strings.ToLower(strings.Trim(line, "[]"))
			continue
		}
		k, v, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		k, v = strings.ToLower(strings.TrimSpace(k)), strings.TrimSpace(v)
		switch {
		case section == "interface" && k == "address":
			c.Addresses = append(c.Addresses, SplitList(v)...)
		case section == "interface" && k == "privatekey":
			c.PrivateKey = v
		case section == "peer" && k == "publickey":
			c.PeerPublicKey = v
		case section == "peer" && k == "endpoint":
			c.Endpoint = v
		case section == "peer" && k == "allowedips":
			c.AllowedIPs = append(c.AllowedIPs, SplitList(v)...)
		case section == "peer" && k == "persistentkeepalive":
			c.Keepalive, _ = strconv.Atoi(v)
		}
	}
	switch {
	case c.PrivateKey == "":
		return c, errors.New("config has no [Interface] PrivateKey")
	case len(c.Addresses) == 0:
		return c, errors.New("config has no [Interface] Address")
	case c.PeerPublicKey == "" || c.Endpoint == "":
		return c, errors.New("config has no [Peer] with PublicKey and Endpoint")
	}
	if _, _, err := c.EndpointHostPort(); err != nil {
		return c, fmt.Errorf("bad [Peer] Endpoint %q: %w", c.Endpoint, err)
	}
	return c, nil
}

// SplitList splits a comma-separated wg-quick value.
func SplitList(v string) []string {
	var out []string
	for _, p := range strings.Split(v, ",") {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}

// HasPrivateKey reports whether conf carries an [Interface] PrivateKey line.
func HasPrivateKey(conf string) bool {
	section := ""
	sc := bufio.NewScanner(strings.NewReader(conf))
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if strings.HasPrefix(line, "[") {
			section = strings.ToLower(strings.Trim(line, "[]"))
			continue
		}
		if k, v, ok := strings.Cut(line, "="); ok && section == "interface" && !strings.HasPrefix(line, "#") &&
			strings.ToLower(strings.TrimSpace(k)) == "privatekey" && strings.TrimSpace(v) != "" {
			return true
		}
	}
	return false
}

// WithPrivateKey completes a vpn reply that omits the private key (the
// gateway holds it, decision-035 §2) by inserting `PrivateKey = <key>` right
// after the [Interface] header — the wg-quick form the install flow's
// setup_vpn.sh parses. A reply that still carries a PrivateKey line (a server
// that predates decision-035) is returned unchanged with inserted=false: its
// key is used, as before.
func WithPrivateKey(conf, key string) (out string, inserted bool, err error) {
	if HasPrivateKey(conf) {
		return conf, false, nil
	}
	if strings.TrimSpace(key) == "" {
		return "", false, errors.New("the configuration has no PrivateKey and the gateway has no key to insert")
	}
	var b strings.Builder
	done := false
	sc := bufio.NewScanner(strings.NewReader(conf))
	for sc.Scan() {
		raw := sc.Text()
		b.WriteString(raw + "\n")
		if !done && strings.ToLower(strings.TrimSpace(raw)) == "[interface]" {
			b.WriteString("PrivateKey = " + strings.TrimSpace(key) + "\n")
			done = true
		}
	}
	if !done {
		return "", false, errors.New("config has no [Interface] section")
	}
	return b.String(), true, nil
}
