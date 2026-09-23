package collect

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"strconv"
	"strings"
	"time"

	"github.com/i40sys/iotgw-ng/live-image/internal/state"
	"github.com/i40sys/iotgw-ng/live-image/internal/sysexec"
)

// HandshakeFresh is how recent a WireGuard handshake must be to count as a
// live tunnel (WireGuard re-handshakes every ~2 min while traffic flows; the
// config uses a 20 s keepalive).
const HandshakeFresh = 3 * time.Minute

// wgDump parses `wg show <if> dump` (first line = interface, then peers).
type wgPeer struct {
	PublicKey     string
	Endpoint      string
	LastHandshake time.Time
	Rx, Tx        uint64
}

func parseWGDump(out string) []wgPeer {
	var peers []wgPeer
	for i, l := range strings.Split(strings.TrimSpace(out), "\n") {
		f := strings.Split(l, "\t")
		if i == 0 || len(f) < 8 {
			continue // interface line
		}
		p := wgPeer{PublicKey: f[0], Endpoint: f[2]}
		if f[2] == "(none)" {
			p.Endpoint = ""
		}
		if ts, err := strconv.ParseInt(f[4], 10, 64); err == nil && ts > 0 {
			p.LastHandshake = time.Unix(ts, 0)
		}
		p.Rx, _ = strconv.ParseUint(f[5], 10, 64)
		p.Tx, _ = strconv.ParseUint(f[6], 10, 64)
		peers = append(peers, p)
	}
	return peers
}

type ipRoute struct {
	Dst     string `json:"dst"`
	Gateway string `json:"gateway"`
	Dev     string `json:"dev"`
	Table   string `json:"table"`
}

// CollectVPN reports the WireGuard interface as the kernel sees it now,
// combined with what bootstrap recorded about fetching/applying its config.
func CollectVPN(ctx context.Context, doc *state.Bootstrap) VPN {
	v := VPN{Interface: "wg0", ConfigStatus: state.Pending, ApplyStatus: state.Pending}
	if doc != nil {
		if s := doc.Step(state.StepVPNFetch); s != nil {
			v.ConfigStatus = s.Status
			v.ConfigLoaded = s.Status == state.Healthy
		}
		if s := doc.Step(state.StepVPNApply); s != nil {
			v.ApplyStatus = s.Status
		}
		if doc.VPN.Interface != "" {
			v.Interface = doc.VPN.Interface
		}
		v.Endpoint, v.PeerPublicKey = doc.VPN.Endpoint, doc.VPN.PeerPublicKey
	}

	var wgReadErr error
	ifc, err := net.InterfaceByName(v.Interface)
	if err == nil {
		v.Present = true
		v.Up = ifc.Flags&net.FlagUp != 0
		addrs, _ := ifc.Addrs()
		for _, a := range addrs {
			v.Addresses = append(v.Addresses, a.String())
		}
		if res, err := sysexec.RunPrivileged(ctx, 8*time.Second, "wg", "show", v.Interface, "dump"); err == nil {
			if peers := parseWGDump(res.Stdout); len(peers) > 0 {
				p := peers[0]
				v.PeerPublicKey, v.LastHandshake, v.RxBytes, v.TxBytes = p.PublicKey, p.LastHandshake, p.Rx, p.Tx
				if p.Endpoint != "" {
					v.Endpoint = p.Endpoint
				}
			}
		} else {
			wgReadErr = err
		}
		if res, err := sysexec.Run(ctx, 3*time.Second, "ip", "-j", "route", "show", "table", "all", "dev", v.Interface); err == nil {
			var rs []ipRoute
			if json.Unmarshal([]byte(res.Stdout), &rs) == nil {
				for _, r := range rs {
					s := r.Dst
					if r.Table != "" && r.Table != "main" && r.Table != "local" {
						s += " (table " + r.Table + ")"
					}
					if r.Table != "local" {
						v.Routes = append(v.Routes, s)
					}
				}
			}
		}
	}

	switch {
	case v.ConfigStatus == state.Failed:
		v.Status, v.Detail = state.Failed, "VPN configuration could not be retrieved"
	case !v.Present && (v.ConfigStatus == state.Pending || v.ConfigStatus == state.Running):
		v.Status, v.Detail = state.Pending, "waiting for bootstrap"
	case !v.Present:
		v.Status = state.NotConfigured
		if v.Detail == "" {
			v.Detail = "no " + v.Interface + " interface"
		}
	case !v.Up:
		v.Status, v.Detail = state.Failed, v.Interface+" exists but is down"
	case wgReadErr != nil:
		// Do not guess: without the kernel's peer data the handshake is unknown.
		v.Status, v.Detail = state.Unknown, "cannot read WireGuard state: "+wgReadErr.Error()
	case v.LastHandshake.IsZero():
		v.Status, v.Detail = state.Warning, "no handshake with the VPN server yet"
	case time.Since(v.LastHandshake) > HandshakeFresh:
		v.Status, v.Detail = state.Warning, fmt.Sprintf("last handshake %s ago (stale)", time.Since(v.LastHandshake).Round(time.Second))
	default:
		v.Status = state.Healthy
	}
	return v
}

// CollectReachability probes the VPN server named in the WireGuard config:
// DNS (when it is a name), the route towards it, ICMP, and — because
// WireGuard is UDP and silently drops unauthenticated packets — a fresh
// handshake as the only real protocol-level proof. No TCP port check is made:
// it would test a service WireGuard does not run.
func CollectReachability(ctx context.Context, v VPN) Reachability {
	r := Reachability{Protocol: "UDP (WireGuard)", At: time.Now()}
	host, port, err := net.SplitHostPort(v.Endpoint)
	if err != nil || host == "" {
		r.Status = state.NotConfigured
		r.DNS = Check{Status: state.NotTested, Detail: "no VPN endpoint known yet"}
		r.Route, r.ICMP, r.WireGuard = r.DNS, r.DNS, r.DNS
		return r
	}
	r.Host, r.Port = host, port

	if ip := net.ParseIP(host); ip != nil {
		r.ResolvedIPs = []string{ip.String()}
		r.DNS = Check{Status: state.Healthy, Detail: "endpoint is an IP address (no DNS needed)"}
	} else {
		c, cancel := context.WithTimeout(ctx, 3*time.Second)
		ips, err := net.DefaultResolver.LookupHost(c, host)
		cancel()
		if err != nil || len(ips) == 0 {
			r.DNS = Check{Status: state.Failed, Detail: fmt.Sprintf("cannot resolve %s: %v", host, err)}
		} else {
			r.ResolvedIPs = ips
			r.DNS = Check{Status: state.Healthy, Detail: strings.Join(ips, ", ")}
		}
	}

	if len(r.ResolvedIPs) == 0 {
		r.Route = Check{Status: state.NotTested}
		r.ICMP = Check{Status: state.NotTested}
	} else {
		target := r.ResolvedIPs[0]
		if rg, err := RouteTo(ctx, target); err != nil || rg == nil {
			r.Route = Check{Status: state.Failed, Detail: "no route to " + target}
		} else {
			d := "via " + rg.Gateway + " dev " + rg.Dev
			if rg.Gateway == "" {
				d = "on-link dev " + rg.Dev
			}
			st := state.Healthy
			if rg.Dev == v.Interface {
				// The server must be reached OUTSIDE the tunnel it terminates.
				st, d = state.Failed, d+" — routed into the tunnel itself"
			}
			r.Route = Check{Status: st, Detail: d}
		}
		start := time.Now()
		if _, err := sysexec.Run(ctx, 4*time.Second, "ping", "-n", "-c", "1", "-W", "2", target); err != nil {
			// Many hosts drop ICMP; that alone is not a failure.
			r.ICMP = Check{Status: state.Warning, Detail: "no ICMP echo reply (may be filtered)"}
		} else {
			r.ICMP = Check{Status: state.Healthy, Detail: "echo reply", Latency: time.Since(start)}
		}
	}

	switch {
	case !v.Present:
		r.WireGuard = Check{Status: state.NotTested, Detail: "tunnel not configured"}
	case v.Status == state.Unknown:
		r.WireGuard = Check{Status: state.Unknown, Detail: v.Detail}
	case v.LastHandshake.IsZero():
		r.WireGuard = Check{Status: state.Failed, Detail: "no handshake — UDP " + port + " not answering, or keys rejected"}
	case time.Since(v.LastHandshake) > HandshakeFresh:
		r.WireGuard = Check{Status: state.Warning, Detail: fmt.Sprintf("last handshake %s ago", time.Since(v.LastHandshake).Round(time.Second))}
	default:
		r.WireGuard = Check{Status: state.Healthy, Detail: fmt.Sprintf("handshake %s ago", time.Since(v.LastHandshake).Round(time.Second))}
	}

	// The handshake is authoritative; DNS/route failures explain it.
	r.Status = worst(r.DNS.Status, r.Route.Status, r.WireGuard.Status)
	if r.Status == state.Healthy && r.ICMP.Status == state.Warning {
		r.Status = state.Healthy // ICMP filtering does not degrade a working tunnel
	}
	return r
}
