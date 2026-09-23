package bootstrap

import (
	"bufio"
	"fmt"
	"strings"
)

// wgSummary is the public part of a wg-quick configuration.
type wgSummary struct {
	Addresses     []string
	PeerPublicKey string
	Endpoint      string
	AllowedIPs    []string
}

// parseWGConf validates a wg-quick config and extracts its public fields.
// It never returns the PrivateKey.
func parseWGConf(conf string) (wgSummary, error) {
	var s wgSummary
	section := ""
	hasPrivate := false
	sc := bufio.NewScanner(strings.NewReader(conf))
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
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
			s.Addresses = append(s.Addresses, splitList(v)...)
		case section == "interface" && k == "privatekey":
			hasPrivate = v != ""
		case section == "peer" && k == "publickey":
			s.PeerPublicKey = v
		case section == "peer" && k == "endpoint":
			s.Endpoint = v
		case section == "peer" && k == "allowedips":
			s.AllowedIPs = append(s.AllowedIPs, splitList(v)...)
		}
	}
	switch {
	case !hasPrivate:
		return s, fmt.Errorf("config has no [Interface] PrivateKey")
	case len(s.Addresses) == 0:
		return s, fmt.Errorf("config has no [Interface] Address")
	case s.PeerPublicKey == "" || s.Endpoint == "":
		return s, fmt.Errorf("config has no [Peer] with PublicKey and Endpoint")
	}
	return s, nil
}

func splitList(v string) []string {
	var out []string
	for _, p := range strings.Split(v, ",") {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}
