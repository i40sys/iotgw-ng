// Package iproute parses the plain-text output of `ip route`. It works with
// both iproute2 (the live image) and BusyBox `ip` (OpenWRT), which has no
// JSON output (-j), so nothing here depends on it.
package iproute

import (
	"context"
	"strings"
	"time"

	"github.com/i40sys/iotgw-ng/live-image/internal/sysexec"
)

// Route is one parsed route line.
type Route struct {
	Dst     string // "default", "10.5.0.0/24", "216.45.62.117"
	Gateway string // "" when on-link
	Dev     string
	Table   string // "" = main
	Metric  string
}

// ParseLine parses one `ip route` line ("216.45.62.117 via 10.2.0.1 dev eth0
// src 10.2.0.210 uid 0"). Unknown keywords are skipped with their argument
// when they take one.
func ParseLine(line string) (Route, bool) {
	f := strings.Fields(line)
	if len(f) == 0 {
		return Route{}, false
	}
	var r Route
	i := 0
	// Optional leading route type (unicast, local, broadcast, …).
	switch f[0] {
	case "unicast", "local", "broadcast", "multicast", "unreachable", "prohibit", "blackhole", "throw":
		if f[0] != "unicast" {
			r.Table = f[0]
		}
		i = 1
	}
	if i >= len(f) {
		return Route{}, false
	}
	r.Dst = f[i]
	for i++; i < len(f); i++ {
		arg := func() string {
			if i+1 < len(f) {
				i++
				return f[i]
			}
			return ""
		}
		switch f[i] {
		case "via":
			r.Gateway = arg()
		case "dev":
			r.Dev = arg()
		case "table":
			r.Table = arg()
		case "metric":
			r.Metric = arg()
		case "src", "proto", "scope", "uid", "mtu", "expires", "realm", "pref", "tos":
			arg()
		}
	}
	return r, r.Dst != ""
}

// Get asks the kernel which path traffic to ip takes (`ip route get`). Unlike
// /proc/net/route it honours policy routing (wg-quick's fwmark table).
func Get(ctx context.Context, ip string) (*Route, error) {
	res, err := sysexec.Run(ctx, 3*time.Second, "ip", "route", "get", ip)
	if err != nil {
		return nil, err
	}
	for _, l := range strings.Split(res.Stdout, "\n") {
		if r, ok := ParseLine(l); ok && r.Dst != "cache" {
			return &r, nil
		}
	}
	return nil, nil
}

// ShowDev lists the routes through dev in every table.
func ShowDev(ctx context.Context, dev string) ([]Route, error) {
	res, err := sysexec.Run(ctx, 3*time.Second, "ip", "route", "show", "table", "all", "dev", dev)
	if err != nil {
		// BusyBox may not know "table all"; the main table is still useful.
		res, err = sysexec.Run(ctx, 3*time.Second, "ip", "route", "show", "dev", dev)
		if err != nil {
			return nil, err
		}
	}
	var out []Route
	for _, l := range strings.Split(res.Stdout, "\n") {
		if r, ok := ParseLine(l); ok {
			if r.Dev == "" {
				r.Dev = dev
			}
			out = append(out, r)
		}
	}
	return out, nil
}
