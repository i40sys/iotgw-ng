package collect

import (
	"context"
	"net"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/i40sys/iotgw-ng/live-image/internal/iproute"
	"github.com/i40sys/iotgw-ng/live-image/internal/netinfo"
	"github.com/i40sys/iotgw-ng/live-image/internal/state"
)

// RouteTo asks the kernel which path traffic to ip takes. Unlike /proc/net/route
// this honours policy routing (wg-quick's fwmark table). Plain-text `ip route
// get`, so it works with BusyBox `ip` on OpenWRT too.
func RouteTo(ctx context.Context, ip string) (*iproute.Route, error) {
	return iproute.Get(ctx, ip)
}

func ifaceKind(name string) string {
	if _, err := os.Stat(filepath.Join("/sys/class/net", name, "device")); err == nil {
		return "ethernet"
	}
	if t := readTrim(filepath.Join("/sys/class/net", name, "uevent")); strings.Contains(t, "DEVTYPE=wireguard") {
		return "wireguard"
	}
	return "other"
}

// CollectNetwork lists interfaces with addresses, the default route, the
// actual Internet egress and the resolver configuration.
func CollectNetwork(ctx context.Context) Network {
	var n Network
	ifs, err := net.Interfaces()
	if err != nil {
		n.Status, n.Detail = state.Unknown, err.Error()
		return n
	}
	if def, _ := netinfo.DefaultRoute(); def != nil {
		n.DefaultIface = def.Iface
		if def.Gateway != nil {
			n.DefaultGateway = def.Gateway.String()
		}
	}
	if rg, err := RouteTo(ctx, "1.1.1.1"); err == nil && rg != nil {
		n.EgressIface, n.EgressVia = rg.Dev, rg.Gateway
	}
	n.DNS = netinfo.Nameservers()

	physUp := 0
	for _, i := range ifs {
		if i.Flags&net.FlagLoopback != 0 {
			continue
		}
		it := Iface{
			Name:      i.Name,
			MAC:       i.HardwareAddr.String(),
			Kind:      ifaceKind(i.Name),
			OperState: readTrim(filepath.Join("/sys/class/net", i.Name, "operstate")),
			Carrier:   readTrim(filepath.Join("/sys/class/net", i.Name, "carrier")) == "1",
			Egress:    i.Name == n.EgressIface,
		}
		addrs, _ := i.Addrs()
		for _, a := range addrs {
			ipn, ok := a.(*net.IPNet)
			if !ok {
				continue
			}
			if ipn.IP.To4() != nil {
				it.IPv4 = append(it.IPv4, ipn.String())
			} else if !ipn.IP.IsLinkLocalUnicast() {
				it.IPv6 = append(it.IPv6, ipn.String())
			}
		}
		// Hide cabled-but-unused NICs' noise only when they have nothing to say.
		if it.Kind == "ethernet" && it.Carrier && len(it.IPv4) > 0 {
			physUp++
		}
		n.Ifaces = append(n.Ifaces, it)
	}
	sort.SliceStable(n.Ifaces, func(a, b int) bool {
		// Interfaces with a link and addresses first.
		ra := n.Ifaces[a].Carrier && len(n.Ifaces[a].IPv4) > 0
		rb := n.Ifaces[b].Carrier && len(n.Ifaces[b].IPv4) > 0
		if ra != rb {
			return ra
		}
		return n.Ifaces[a].Name < n.Ifaces[b].Name
	})
	switch {
	case physUp == 0:
		n.Status, n.Detail = state.Failed, "no physical interface has a link and an IPv4 address"
	case n.DefaultIface == "" && n.EgressIface == "":
		n.Status, n.Detail = state.Warning, "no default route"
	default:
		n.Status = state.Healthy
	}
	return n
}
