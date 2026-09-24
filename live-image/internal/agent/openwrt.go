package agent

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"slices"
	"sort"
	"strings"

	"github.com/i40sys/iotgw-ng/live-image/internal/uci"
)

// The agent's own sections in /etc/config/network. Owning a NAMED section
// makes the Netmaker route addressable and idempotent (decision-032 §9).
const (
	netConfig        = "network"
	endpointRouteSec = "iotgw_endpoint"
	// vpnUplinkMetric is the metric the agent gives the uplink's default
	// route while the Internet egresses through the tunnel: above the wg0
	// default route's metric, so the tunnel wins, while the uplink default
	// stays installed as the path the tunnel itself (and the fallback) uses.
	vpnUplinkMetric = "20"
	// wgMetric is the wg0 route metric (the value setup_vpn.sh / network.j2
	// write): above the uplink's 0 in LAN mode, below vpnUplinkMetric in VPN mode.
	wgMetric = "5"
	anyIPv4  = "0.0.0.0/0"
)

// ── uplink (ubus) ────────────────────────────────────────────────────────────

type ubusRoute struct {
	Target  string `json:"target"`
	Mask    int    `json:"mask"`
	Nexthop string `json:"nexthop"`
}

type ubusIface struct {
	Interface string      `json:"interface"`
	Up        bool        `json:"up"`
	Proto     string      `json:"proto"`
	L3Device  string      `json:"l3_device"`
	Device    string      `json:"device"`
	Metric    int         `json:"metric"`
	Route     []ubusRoute `json:"route"`
}

// ParseUplink picks the uplink from `ubus call network.interface dump`: an
// up, non-WireGuard interface holding an IPv4 default route (DHCP or static).
// The lowest metric wins; `wan` wins a tie.
func ParseUplink(dump string, wgIface string) (Uplink, error) {
	var d struct {
		Interface []ubusIface `json:"interface"`
	}
	if err := json.Unmarshal([]byte(dump), &d); err != nil {
		return Uplink{}, fmt.Errorf("parse ubus network.interface dump: %w", err)
	}
	var cands []Uplink
	for _, i := range d.Interface {
		if !i.Up || i.Proto == "wireguard" || i.Interface == wgIface || i.Interface == "loopback" {
			continue
		}
		for _, r := range i.Route {
			if r.Target == "0.0.0.0" && r.Mask == 0 {
				dev := i.L3Device
				if dev == "" {
					dev = i.Device
				}
				cands = append(cands, Uplink{Iface: i.Interface, Device: dev, Gateway: r.Nexthop, Metric: i.Metric})
				break
			}
		}
	}
	if len(cands) == 0 {
		return Uplink{}, errors.New("no interface has a default route (is the LAN cable in and DHCP answering?)")
	}
	sort.SliceStable(cands, func(a, b int) bool {
		if cands[a].Metric != cands[b].Metric {
			return cands[a].Metric < cands[b].Metric
		}
		return cands[a].Iface == "wan"
	})
	u := cands[0]
	if u.Gateway == "0.0.0.0" {
		u.Gateway = ""
	}
	return u, nil
}

// ── desired UCI state ────────────────────────────────────────────────────────

// Op is one staged UCI change.
type Op struct {
	Delete bool
	Path   string
	Value  string   // set
	List   []string // set as list (replaces)
}

func (o Op) String() string {
	switch {
	case o.Delete:
		return "delete " + o.Path
	case o.List != nil:
		return o.Path + "=[" + strings.Join(o.List, " ") + "]"
	case strings.HasSuffix(o.Path, ".private_key"):
		return o.Path + "=<redacted>"
	}
	return o.Path + "=" + o.Value
}

// Apply stages ops through uci (nothing is committed here).
func Apply(ctx context.Context, u *uci.Client, ops []Op) error {
	for _, o := range ops {
		var err error
		switch {
		case o.Delete:
			err = u.Delete(ctx, o.Path)
		case o.List != nil:
			err = u.SetList(ctx, o.Path, o.List)
		default:
			err = u.Set(ctx, o.Path, o.Value)
		}
		if err != nil {
			return fmt.Errorf("uci %s: %w", o, err)
		}
	}
	return nil
}

// Describe joins ops for logs and events.
func Describe(ops []Op) string {
	s := make([]string, len(ops))
	for i, o := range ops {
		s[i] = o.String()
	}
	return strings.Join(s, "; ")
}

func find(secs []uci.Section, name string) *uci.Section {
	for i := range secs {
		if secs[i].Name == name {
			return &secs[i]
		}
	}
	return nil
}

// PeerSection is the name of the first wireguard_<iface> section.
func PeerSection(secs []uci.Section, wgIface string) string {
	for _, s := range secs {
		if s.Type == "wireguard_"+wgIface {
			return s.Name
		}
	}
	return ""
}

// setIfDiff adds a set op when the option differs.
func setIfDiff(ops []Op, s *uci.Section, path, opt, want string) []Op {
	if s == nil || s.Get(opt) != want {
		ops = append(ops, Op{Path: path + "." + opt, Value: want})
	}
	return ops
}

// EndpointRouteOps keeps the Netmaker server's /32 on the uplink via the
// CURRENT LAN router, replacing any static route to it written at install
// time (setup_vpn.sh / network.j2). With no known router the pinned route is
// removed rather than installed on-link — that is exactly the gw-c3 failure.
func EndpointRouteOps(secs []uci.Section, up Uplink, endpointIP string) []Op {
	var ops []Op
	if endpointIP == "" {
		return nil
	}
	for _, s := range secs {
		if s.Type == "route" && s.Name != endpointRouteSec && s.Get("target") == endpointIP {
			ops = append(ops, Op{Delete: true, Path: netConfig + "." + s.Name})
		}
	}
	cur := find(secs, endpointRouteSec)
	path := netConfig + "." + endpointRouteSec
	if up.Gateway == "" || up.Iface == "" {
		if cur != nil {
			ops = append(ops, Op{Delete: true, Path: path})
		}
		return ops
	}
	if cur == nil || cur.Type != "route" {
		ops = append(ops, Op{Path: path, Value: "route"})
		cur = nil
	}
	ops = setIfDiff(ops, cur, path, "interface", up.Iface)
	ops = setIfDiff(ops, cur, path, "target", endpointIP)
	ops = setIfDiff(ops, cur, path, "netmask", "255.255.255.255")
	ops = setIfDiff(ops, cur, path, "gateway", up.Gateway)
	return ops
}

// SplitRouteOps makes the device's Netmaker network route through the tunnel
// (so replies to the hub/controller use wg0 even while the default route is
// the uplink) and keeps the tunnel's own default route as the VPN egress.
func SplitRouteOps(secs []uci.Section, wgIface, network string) []Op {
	peer := PeerSection(secs, wgIface)
	if peer == "" {
		return nil
	}
	s := find(secs, peer)
	path := netConfig + "." + peer
	var ops []Op
	want := []string{}
	if network != "" {
		want = append(want, network)
	}
	want = append(want, anyIPv4)
	have := s.Options["allowed_ips"]
	for _, w := range want {
		if !slices.Contains(have, w) {
			// Keep anything extra the operator added; add what is missing.
			merged := append(append([]string{}, want...), without(have, want)...)
			ops = append(ops, Op{Path: path + ".allowed_ips", List: merged})
			break
		}
	}
	ops = setIfDiff(ops, s, path, "route_allowed_ips", "1")
	return ops
}

func without(a, b []string) []string {
	var out []string
	for _, x := range a {
		if !slices.Contains(b, x) {
			out = append(out, x)
		}
	}
	return out
}

// EgressOps makes the default route go the wanted way: the uplink's default
// route metric decides between the uplink (metric 0) and wg0 (metric 5).
func EgressOps(secs []uci.Section, up Uplink, wgIface string, want Egress) []Op {
	var ops []Op
	upSec := find(secs, up.Iface)
	wgSec := find(secs, wgIface)
	upPath := netConfig + "." + up.Iface
	switch want {
	case EgressVPN:
		ops = setIfDiff(ops, upSec, upPath, "metric", vpnUplinkMetric)
		if wgSec != nil && wgSec.Get("metric") != wgMetric {
			ops = append(ops, Op{Path: netConfig + "." + wgIface + ".metric", Value: wgMetric})
		}
	case EgressLAN:
		// Only undo the metric the agent itself set.
		if upSec != nil && upSec.Get("metric") == vpnUplinkMetric {
			ops = append(ops, Op{Delete: true, Path: upPath + ".metric"})
		}
	}
	return ops
}

// EndpointFromUCI returns the peer endpoint host and port.
func EndpointFromUCI(secs []uci.Section, wgIface string) (host, port string) {
	peer := PeerSection(secs, wgIface)
	if peer == "" {
		return "", ""
	}
	s := find(secs, peer)
	return s.Get("endpoint_host"), s.Get("endpoint_port")
}

// resolveIPv4 turns an endpoint host into an IPv4 address.
func resolveIPv4(ctx context.Context, host string) (string, error) {
	if ip := net.ParseIP(host); ip != nil {
		return ip.String(), nil
	}
	ips, err := net.DefaultResolver.LookupIP(ctx, "ip4", host)
	if err != nil || len(ips) == 0 {
		return "", fmt.Errorf("cannot resolve %s: %v", host, err)
	}
	return ips[0].String(), nil
}
