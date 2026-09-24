package agent

import (
	"context"
	"fmt"
	"net"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/i40sys/iotgw-ng/live-image/internal/sysexec"
)

// probeTargets are reached over raw TCP: two providers, so one outage is not
// "no Internet". The same targets the dashboard's Internet panel uses.
var probeTargets = []string{"1.1.1.1:443", "8.8.8.8:53"}

// handshakeFresh mirrors collect.HandshakeFresh.
const handshakeFresh = 3 * time.Minute

// tcpProbe reports whether any target accepts a TCP connection. With dev set
// the socket is bound to that device (SO_BINDTODEVICE, needs root), so it
// tests that path regardless of which one the default route takes now.
func tcpProbe(ctx context.Context, dev string) (bool, string) {
	d := net.Dialer{Timeout: 4 * time.Second}
	if dev != "" {
		d.Control = func(_, _ string, c syscall.RawConn) error {
			var serr error
			if err := c.Control(func(fd uintptr) {
				serr = syscall.SetsockoptString(int(fd), syscall.SOL_SOCKET, syscall.SO_BINDTODEVICE, dev)
			}); err != nil {
				return err
			}
			return serr
		}
	}
	var errs []string
	for _, t := range probeTargets {
		c, err := d.DialContext(ctx, "tcp", t)
		if err == nil {
			c.Close()
			return true, "TCP " + t + " reachable"
		}
		errs = append(errs, err.Error())
	}
	return false, strings.Join(errs, "; ")
}

// lastHandshake reads the tunnel's most recent handshake.
func lastHandshake(ctx context.Context, iface string) (time.Time, error) {
	res, err := sysexec.Run(ctx, 5*time.Second, "wg", "show", iface, "latest-handshakes")
	if err != nil {
		return time.Time{}, err
	}
	var latest time.Time
	for _, l := range strings.Split(strings.TrimSpace(res.Stdout), "\n") {
		f := strings.Fields(l)
		if len(f) != 2 {
			continue
		}
		if ts, err := strconv.ParseInt(f[1], 10, 64); err == nil && ts > 0 {
			if t := time.Unix(ts, 0); t.After(latest) {
				latest = t
			}
		}
	}
	return latest, nil
}

// handshakeProbe reports whether the tunnel handshook recently.
func handshakeProbe(ctx context.Context, iface string) (bool, string) {
	t, err := lastHandshake(ctx, iface)
	switch {
	case err != nil:
		return false, "cannot read " + iface + ": " + err.Error()
	case t.IsZero():
		return false, "no handshake yet"
	case time.Since(t) > handshakeFresh:
		return false, fmt.Sprintf("last handshake %s ago", time.Since(t).Round(time.Second))
	}
	return true, fmt.Sprintf("handshake %s ago", time.Since(t).Round(time.Second))
}

// ifaceExists reports whether a network interface is present.
func ifaceExists(name string) bool {
	_, err := net.InterfaceByName(name)
	return err == nil
}
