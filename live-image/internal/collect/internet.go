package collect

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"time"

	"github.com/i40sys/iotgw-ng/live-image/internal/state"
)

// Probe targets. Two independent providers each, so one provider's outage
// reads as WARNING, not FAILED.
var (
	dnsNames   = []string{"deb.debian.org", "cloudflare.com"}
	ipTargets  = []string{"1.1.1.1:443", "8.8.8.8:53"}
	httpsProbe = "https://www.cloudflare.com/cdn-cgi/trace"
)

func grade(ok, total int) Status {
	switch {
	case ok == total:
		return state.Healthy
	case ok > 0:
		return state.Warning
	default:
		return state.Failed
	}
}

// CollectInternet runs DNS, raw TCP/IP and HTTPS probes. ICMP alone is not a
// meaningful Internet test (and needs privileges), so it is not used here.
func CollectInternet(ctx context.Context) Internet {
	in := Internet{At: time.Now()}

	res := net.Resolver{}
	ok, var1 := 0, ""
	start := time.Now()
	for _, n := range dnsNames {
		c, cancel := context.WithTimeout(ctx, 3*time.Second)
		ips, err := res.LookupHost(c, n)
		cancel()
		if err == nil && len(ips) > 0 {
			ok++
		} else if var1 == "" && err != nil {
			var1 = err.Error()
		}
	}
	in.DNS = Check{Status: grade(ok, len(dnsNames)), Latency: time.Since(start)}
	in.DNS.Detail = fmt.Sprintf("%d/%d names resolved", ok, len(dnsNames))
	if var1 != "" {
		in.DNS.Detail += " — " + var1
	}

	ok, var1 = 0, ""
	start = time.Now()
	for _, t := range ipTargets {
		d := net.Dialer{Timeout: 3 * time.Second}
		conn, err := d.DialContext(ctx, "tcp", t)
		if err == nil {
			ok++
			conn.Close()
		} else if var1 == "" {
			var1 = err.Error()
		}
	}
	in.IP = Check{Status: grade(ok, len(ipTargets)), Latency: time.Since(start)}
	in.IP.Detail = fmt.Sprintf("%d/%d TCP targets reachable by IP", ok, len(ipTargets))
	if var1 != "" {
		in.IP.Detail += " — " + var1
	}

	start = time.Now()
	c, cancel := context.WithTimeout(ctx, 6*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(c, http.MethodGet, httpsProbe, nil)
	resp, err := http.DefaultClient.Do(req)
	switch {
	case err != nil:
		in.HTTPS = Check{Status: state.Failed, Detail: err.Error()}
	case resp.StatusCode/100 != 2:
		resp.Body.Close()
		in.HTTPS = Check{Status: state.Warning, Detail: "HTTP " + resp.Status}
	default:
		resp.Body.Close()
		in.HTTPS = Check{Status: state.Healthy, Detail: "TLS + HTTP OK"}
	}
	in.HTTPS.Latency = time.Since(start)

	in.Overall = worst(in.DNS.Status, in.IP.Status, in.HTTPS.Status)
	return in
}

// worst returns the most severe status (FAILED > WARNING > others > HEALTHY).
func worst(ss ...Status) Status {
	rank := map[Status]int{state.Healthy: 0, state.NotTested: 1, state.Pending: 1, state.Unknown: 2, state.NotConfigured: 2, state.Warning: 3, state.Failed: 4}
	w := state.Healthy
	for _, s := range ss {
		if rank[s] > rank[w] {
			w = s
		}
	}
	return w
}
