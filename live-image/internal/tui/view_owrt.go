package tui

import (
	"fmt"
	"strings"
	"time"

	"github.com/i40sys/iotgw-ng/live-image/internal/agent"
	"github.com/i40sys/iotgw-ng/live-image/internal/state"
)

// The installed-gateway panels (decision-032 §3): Installed replaces the
// live image's Provisioning panel, Agent shows the self-healing daemon.

func statusOf(ok bool) state.Status {
	if ok {
		return state.Healthy
	}
	return state.Failed
}

func (m Model) installedPanel(w int) string {
	in := m.inst
	if in == nil {
		return panel("Installed", state.Pending, w, "collecting…")
	}
	vpnSt, vpnTxt := state.Pending, "collecting…"
	if m.vpn != nil {
		vpnSt, vpnTxt = m.vpn.Status, m.vpn.Detail
		if vpnSt == state.Healthy {
			vpnTxt = "tunnel up, last handshake " + ago(m.vpn.LastHandshake)
		}
	}
	netSt, netTxt := state.Pending, "testing…"
	if m.inet != nil {
		netSt, netTxt = m.inet.Overall, fmt.Sprintf("DNS %s, IP %s, HTTPS %s", word(m.inet.DNS.Status), word(m.inet.IP.Status), word(m.inet.HTTPS.Status))
	}
	certSt, certTxt := state.Pending, ""
	if m.pki != nil {
		certSt, certTxt = m.pki.HostIDStatus, m.pki.HostIDDetail
		if certSt == state.Healthy && !m.pki.HostCertValidTo.IsZero() {
			certTxt = "valid until " + m.pki.HostCertValidTo.Local().Format("2006-01-02")
		}
	}
	uplink := "-"
	if m.net != nil && m.net.EgressIface != "" {
		uplink = "LAN (" + m.net.EgressIface + ")"
		if m.vpn != nil && m.net.EgressIface == m.vpn.Interface {
			uplink = "VPN (" + m.net.EgressIface + ", via the Netmaker hub)"
		}
	}

	installedTxt := orDash(in.OS)
	if in.InstalledAt != "" {
		installedTxt += ", installed " + in.InstalledAt
	}
	var provMissing []string
	if !in.IdentityOK {
		provMissing = append(provMissing, "device identity")
	}
	if !in.WGConfigured {
		provMissing = append(provMissing, "VPN config")
	}
	if !in.HostCert {
		provMissing = append(provMissing, "SSH enrollment")
	}
	provTxt := "identity, VPN and SSH enrollment present"
	if len(provMissing) > 0 {
		provTxt = "missing: " + strings.Join(provMissing, ", ")
	}

	row := func(label string, st state.Status, detail string) string {
		v := badge(st)
		if detail != "" {
			v += "  " + labelStyle.Render(detail)
		}
		return kv(label, v)
	}
	rows := []string{
		row("Installed", statusOf(in.ConfigErr == ""), installedTxt),
		row("Provisioned", statusOf(in.Provisioned()), provTxt),
		row("SSH certificate", certSt, certTxt),
		row("VPN", vpnSt, vpnTxt),
		row("Internet", netSt, netTxt),
		kv("Active uplink", uplink),
	}
	if in.ConfigErr != "" {
		rows = append(rows, kv("Note", "/etc/config/iotgw: "+in.ConfigErr))
	}
	overall := worstOf(statusOf(in.ConfigErr == ""), statusOf(in.Provisioned()), certSt, vpnSt, netSt)
	return panel("Installed", overall, w, rows...)
}

func word(s state.Status) string {
	return strings.ToLower(string(s))
}

func (m Model) agentPanel(w int) string {
	in := m.inst
	if in == nil {
		return panel("Self-healing agent", state.Pending, w, "collecting…")
	}
	pol := agent.DescribePolicy(in.Config)
	if in.Daemon == nil {
		return panel("Self-healing agent", state.Failed, w,
			kv("Daemon", "NOT RUNNING — "+orDash(in.DaemonErr)),
			kv("Start it", "/etc/init.d/iotgw start"),
			kv("Internet policy", pol))
	}
	d := in.Daemon
	st := state.Healthy
	daemon := fmt.Sprintf("running (pid %d), last check %s", d.PID, ago(d.UpdatedAt))
	if !in.DaemonRunning {
		st, daemon = state.Failed, "STOPPED — state last written "+ago(d.UpdatedAt)+"; /etc/init.d/iotgw restart"
	}
	if in.Config.Hold && st == state.Healthy {
		st = state.Warning
	}
	gw := orDash(d.Uplink.Gateway)
	uplink := strings.TrimSpace(fmt.Sprintf("%s (%s) via %s", orDash(d.Uplink.Device), d.Uplink.Iface, gw))
	route := "WRONG: " + strings.TrimSpace(d.Endpoint.RouteDev+" "+d.Endpoint.RouteVia)
	if d.Endpoint.RouteOK {
		route = "via " + d.Endpoint.RouteVia + " dev " + d.Endpoint.RouteDev
	}
	if d.Endpoint.IP == "" {
		route = "no endpoint configured"
	}
	auto := "ON"
	if in.Config.Hold {
		auto = "OFF — HOLD (see the banner)"
	}
	rows := []string{
		kv("Daemon", daemon),
		kv("Automatic repair", auto),
		kv("Internet policy", pol),
		kv("Egress now", strings.ToUpper(orDash(string(d.Egress)))),
		kv("Uplink", uplink),
		kv("Netmaker server", orDash(d.Endpoint.Host)+":"+orDash(d.Endpoint.Port)),
		kv("  route", route),
		checkRowP("LAN Internet", d.LANInternet),
		checkRowP("VPN Internet", d.VPNInternet),
		checkRowP("Tunnel", d.Handshake),
	}
	if !d.BackoffUntil.IsZero() && time.Now().Before(d.BackoffUntil) {
		rows = append(rows, kv("Backoff", fmt.Sprintf("after %d failed change(s), until %s", d.FailStreak, d.BackoffUntil.Local().Format("15:04:05"))))
	}
	if d.LastError != "" {
		rows = append(rows, kv("Last error", d.LastError))
	}
	if n := len(d.Events); n > 0 {
		e := d.Events[n-1]
		rows = append(rows, kv("Last event", e.At.Local().Format("15:04:05")+" "+e.Kind+" "+e.Result+": "+e.Text))
	}
	return panel("Self-healing agent", st, w, rows...)
}

func checkRowP(label string, p agent.Probe) string {
	st := statusOf(p.OK)
	if p.At.IsZero() {
		st = state.NotTested
	}
	return checkRow(label, checkOf(st, p.Detail))
}

// agentDetails lists the daemon's recent history for the Details view.
func (m Model) agentDetails() string {
	var b strings.Builder
	in := m.inst
	if in == nil || in.Daemon == nil {
		return ""
	}
	b.WriteString(titleStyle.Render("Agent history (newest last)") + "\n")
	evs := in.Daemon.Events
	if len(evs) > 15 {
		evs = evs[len(evs)-15:]
	}
	for _, e := range evs {
		b.WriteString(kv("  "+e.At.Local().Format("01-02 15:04:05"), e.Kind+" "+e.Result+": "+e.Text) + "\n")
	}
	b.WriteString("\n")
	return b.String()
}
