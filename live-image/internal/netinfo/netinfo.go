// Package netinfo reads IPv4 routing and resolver state straight from the
// kernel/procfs — no command execution, no privileges.
package netinfo

import (
	"bufio"
	"encoding/binary"
	"encoding/hex"
	"fmt"
	"net"
	"os"
	"strings"
)

// Route is one IPv4 route from /proc/net/route (main table only).
type Route struct {
	Iface   string
	Dst     net.IPNet
	Gateway net.IP // nil when on-link
	Metric  int
}

// IsDefault reports whether the route is 0.0.0.0/0.
func (r Route) IsDefault() bool {
	ones, _ := r.Dst.Mask.Size()
	return ones == 0 && r.Dst.IP.Equal(net.IPv4zero)
}

func hexIP(s string) (net.IP, error) {
	b, err := hex.DecodeString(s)
	if err != nil || len(b) != 4 {
		return nil, fmt.Errorf("bad address %q", s)
	}
	// /proc/net/route stores addresses in host (little-endian) order.
	v := binary.LittleEndian.Uint32(b)
	ip := make(net.IP, 4)
	binary.BigEndian.PutUint32(ip, v)
	return ip, nil
}

// Routes parses /proc/net/route.
func Routes() ([]Route, error) {
	f, err := os.Open("/proc/net/route")
	if err != nil {
		return nil, err
	}
	defer f.Close()
	var out []Route
	sc := bufio.NewScanner(f)
	sc.Scan() // header
	for sc.Scan() {
		fs := strings.Fields(sc.Text())
		if len(fs) < 8 {
			continue
		}
		dst, err1 := hexIP(fs[1])
		gw, err2 := hexIP(fs[2])
		mask, err3 := hexIP(fs[7])
		if err1 != nil || err2 != nil || err3 != nil {
			continue
		}
		r := Route{Iface: fs[0], Dst: net.IPNet{IP: dst, Mask: net.IPMask(mask.To4())}}
		if !gw.Equal(net.IPv4zero) {
			r.Gateway = gw
		}
		fmt.Sscanf(fs[6], "%d", &r.Metric)
		out = append(out, r)
	}
	return out, sc.Err()
}

// DefaultRoute returns the lowest-metric IPv4 default route, if any.
func DefaultRoute() (*Route, error) {
	rs, err := Routes()
	if err != nil {
		return nil, err
	}
	var best *Route
	for i := range rs {
		if rs[i].IsDefault() && (best == nil || rs[i].Metric < best.Metric) {
			best = &rs[i]
		}
	}
	return best, nil
}

// Lookup returns the most specific main-table route for ip.
func Lookup(ip net.IP) (*Route, error) {
	rs, err := Routes()
	if err != nil {
		return nil, err
	}
	var best *Route
	bestLen := -1
	for i := range rs {
		if rs[i].Dst.Contains(ip) {
			if l, _ := rs[i].Dst.Mask.Size(); l > bestLen {
				best, bestLen = &rs[i], l
			}
		}
	}
	return best, nil
}

// Nameservers returns the nameserver lines of /etc/resolv.conf.
func Nameservers() []string {
	b, err := os.ReadFile("/etc/resolv.conf")
	if err != nil {
		return nil
	}
	var out []string
	for _, l := range strings.Split(string(b), "\n") {
		f := strings.Fields(l)
		if len(f) >= 2 && f[0] == "nameserver" {
			out = append(out, f[1])
		}
	}
	return out
}
