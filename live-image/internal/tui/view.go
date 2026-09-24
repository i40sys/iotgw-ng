package tui

import (
	"fmt"
	"strings"
	"time"

	"github.com/charmbracelet/lipgloss"

	"github.com/i40sys/iotgw-ng/live-image/internal/collect"
	"github.com/i40sys/iotgw-ng/live-image/internal/state"
	"github.com/i40sys/iotgw-ng/live-image/internal/version"
)

// twoColumnMin is the terminal width from which panels sit side by side.
const twoColumnMin = 110

// View renders header, scrollable body and footer.
func (m Model) View() string {
	if !m.ready {
		return "iotgw-status: starting…"
	}
	return lipgloss.JoinVertical(lipgloss.Left, m.header(), m.vp.View(), m.footer())
}

func (m Model) header() string {
	host, dev := "…", "no device identity"
	if m.host != nil {
		host = m.host.Hostname
		if m.host.DeviceID != "" {
			dev = m.host.DeviceID
		}
	}
	title := "iotgw live provisioning console"
	if m.owrt {
		title = "iotgw gateway console"
	}
	left := fmt.Sprintf("%s | %s | %s", title, host, dev)
	right := "iotgw " + version.Version
	return headerStyle.Width(m.width).Render(fill(left, right, m.width-2))
}

func (m Model) footer() string {
	keys := []string{
		keyStyle.Render("[r]") + " Refresh",
		keyStyle.Render("[d]") + " Details",
		keyStyle.Render("[i]") + " Internet via " + map[string]string{"lan": "VPN", "vpn": "LAN"}[m.currentVia()],
		keyStyle.Render("[Up/Down PgUp/PgDn]") + " Scroll",
		keyStyle.Render("[q]") + " Exit to shell",
	}
	if m.owrt {
		hold := "Hold"
		if m.holdOn() {
			hold = "Resume auto-repair"
		}
		keys = []string{
			keyStyle.Render("[r]") + " Refresh",
			keyStyle.Render("[d]") + " Details",
			keyStyle.Render("[i]") + " Internet policy",
			keyStyle.Render("[h]") + " " + hold,
			keyStyle.Render("[PgUp/PgDn]") + " Scroll",
			keyStyle.Render("[q]") + " Shell",
		}
	}
	updated := ""
	if t, ok := m.updated[kNet]; ok {
		updated = "updated " + t.Format("15:04:05")
	}
	return footerStyle.Width(m.width).Render(fill(strings.Join(keys, "   "), updated, m.width-2))
}

// fill puts left and right at the two ends of a line of the given width.
func fill(left, right string, width int) string {
	gap := width - lipgloss.Width(left) - lipgloss.Width(right)
	if gap < 1 {
		return left
	}
	return left + strings.Repeat(" ", gap) + right
}

// body is the viewport content: the dashboard or the details view.
func (m Model) body() string {
	if m.showDetails {
		return m.details()
	}
	var top []string
	if b := m.holdBanner(); b != "" {
		top = append(top, b)
	}
	if p := m.switchPanel(); p != "" {
		top = append(top, p)
	}
	return lipgloss.JoinVertical(lipgloss.Left, append(top, m.dashboard())...)
}

// switchPanel is the Internet-mode confirmation prompt or the last notice.
func (m Model) switchPanel() string {
	w := m.width
	switch {
	case m.choosing:
		cur := "auto"
		if m.inst != nil {
			cur = string(m.inst.Config.Policy)
		}
		return panel("Internet policy (now: "+strings.ToUpper(cur)+") — saved in /etc/config/iotgw, kept across reboots", state.Pending, w,
			keyStyle.Render("[a]")+" AUTO  LAN preferred, automatic fallback to VPN when the LAN has no Internet (default)",
			keyStyle.Render("[l]")+" LAN   pinned: Internet via the local router, no automatic switching",
			keyStyle.Render("[v]")+" VPN   pinned: Internet via the Netmaker hub, no automatic switching",
			"A switch is verified and rolled back automatically if the gateway loses Internet.",
			"", keyStyle.Render("[Esc]")+" cancel")
	case m.confirmHold == "enable":
		return panel("Put the daemon on HOLD?", state.Pending, w,
			"The iotgw daemon keeps checking and recording the network, but stops",
			"changing anything automatically (routes, Internet path, VPN, SSH) so you",
			"can diagnose by hand without it undoing your changes. It stays on hold",
			"across reboots until you resume it ([h] again, or `iotgw hold disable`).",
			"", keyStyle.Render("[y]")+" hold   "+keyStyle.Render("[n]")+" cancel")
	case m.confirmHold == "disable":
		return panel("Resume automatic repair?", state.Pending, w,
			"The daemon will again fix the Netmaker route and the Internet path on its next check.",
			"", keyStyle.Render("[y]")+" resume   "+keyStyle.Render("[n]")+" cancel")
	case m.confirmVia == "vpn":
		return panel("Switch Internet to VPN (full tunnel)?", state.Pending, w,
			"All traffic and DNS go through wg0; the Internet egresses from the",
			"Netmaker hub, which is this network's Internet Gateway (NAT). Local",
			"LAN resolvers are not used. Watch the Internet panel after switching.",
			"wg0 restarts (a few seconds without VPN; SSH over the VPN drops).",
			"", keyStyle.Render("[y]")+" switch   "+keyStyle.Render("[n]")+" cancel")
	case m.confirmVia == "lan":
		return panel("Switch Internet to LAN (split tunnel)?", state.Pending, w,
			"Only the device's Netmaker network goes through wg0; Internet and DNS",
			"use the local LAN gateway and resolvers.",
			"wg0 restarts (a few seconds without VPN; SSH over the VPN drops).",
			"", keyStyle.Render("[y]")+" switch   "+keyStyle.Render("[n]")+" cancel")
	case m.notice != "":
		st := state.Healthy
		if m.switching {
			st = state.Running
		} else if m.noticeBad {
			st = state.Failed
		}
		return panel("Last action", st, w, m.notice)
	}
	return ""
}

// holdBanner makes hold impossible to miss: what it is, since when, why,
// and how to leave it (decision-032 §8).
func (m Model) holdBanner() string {
	if !m.holdOn() {
		return ""
	}
	c := m.inst.Config
	since := "-"
	if !c.HoldSince.IsZero() {
		since = c.HoldSince.Local().Format("2006-01-02 15:04") + " (" + ago(c.HoldSince) + ")"
	}
	return panel("HOLD — AUTOMATIC REPAIR IS SUSPENDED", state.Warning, m.width,
		"The iotgw daemon is still monitoring and recording, but it will NOT change the",
		"network, the Netmaker route, the Internet path, the VPN or SSH on its own.",
		"This is meant for manual diagnosis; manual commands (iotgw vpn/ssh refresh,",
		"iotgw internet …) still work. Changes it would have made are listed in Details.",
		"",
		kv("Since", since),
		kv("Reason", orDash(c.HoldReason)),
		kv("Resume", "[h] on this screen, or `iotgw hold disable`"))
}

// dashboard lays the status panels out for the terminal width.
func (m Model) dashboard() string {
	w := m.width
	if m.owrt {
		if w >= twoColumnMin {
			col := w / 2
			left := lipgloss.JoinVertical(lipgloss.Left,
				m.installedPanel(col), m.agentPanel(col), m.networkPanel(col), m.hostPanel(col))
			right := lipgloss.JoinVertical(lipgloss.Left,
				m.vpnPanel(col), m.reachPanel(col), m.internetPanel(col), m.pkiPanel(col))
			return lipgloss.JoinHorizontal(lipgloss.Top, left, right)
		}
		return lipgloss.JoinVertical(lipgloss.Left,
			m.installedPanel(w), m.agentPanel(w), m.vpnPanel(w), m.internetPanel(w),
			m.pkiPanel(w), m.reachPanel(w), m.networkPanel(w), m.hostPanel(w))
	}
	if w >= twoColumnMin {
		col := w / 2
		left := lipgloss.JoinVertical(lipgloss.Left,
			m.provisioningPanel(col), m.hostPanel(col), m.networkPanel(col), m.internetPanel(col))
		right := lipgloss.JoinVertical(lipgloss.Left,
			m.vpnPanel(col), m.reachPanel(col), m.pkiPanel(col))
		return lipgloss.JoinHorizontal(lipgloss.Top, left, right)
	}
	return lipgloss.JoinVertical(lipgloss.Left,
		m.provisioningPanel(w), m.vpnPanel(w), m.pkiPanel(w), m.networkPanel(w),
		m.internetPanel(w), m.reachPanel(w), m.hostPanel(w))
}

// ── panel helpers ────────────────────────────────────────────────────────────

const labelWidth = 20

// kvSep marks the label/value boundary inside a row so panel() can wrap long
// values under the value column instead of under the label.
const kvSep = "\x1f"

func kv(label, value string) string {
	return label + kvSep + value
}

// layoutRow renders one row for a panel whose inner width is inner.
func layoutRow(row string, inner int) string {
	label, value, isKV := strings.Cut(row, kvSep)
	if !isKV {
		return lipgloss.NewStyle().Width(inner).Render(row)
	}
	valueWidth := max(inner-labelWidth, 10)
	wrapped := strings.Split(lipgloss.NewStyle().Width(valueWidth).Render(value), "\n")
	pad := strings.Repeat(" ", labelWidth)
	out := labelStyle.Render(fmt.Sprintf("%-*s", labelWidth, label)) + strings.TrimRight(wrapped[0], " ")
	for _, l := range wrapped[1:] {
		if t := strings.TrimRight(l, " "); t != "" {
			out += "\n" + pad + t
		}
	}
	return out
}

func panel(title string, s state.Status, width int, rows ...string) string {
	inner := width - 4 // border + padding
	head := titleStyle.Render(title)
	if s != "" {
		head = fill(head, badge(s), inner)
	}
	lines := []string{head}
	for _, r := range rows {
		lines = append(lines, layoutRow(r, inner))
	}
	return panelStyle(s, width).Render(strings.Join(lines, "\n"))
}

func orDash(s string) string {
	if strings.TrimSpace(s) == "" {
		return "-"
	}
	return s
}

func ago(t time.Time) string {
	if t.IsZero() {
		return "never"
	}
	return time.Since(t).Round(time.Second).String() + " ago"
}

func humanBytes(b uint64) string {
	const unit = 1024
	if b < unit {
		return fmt.Sprintf("%d B", b)
	}
	div, exp := uint64(unit), 0
	for n := b / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %ciB", float64(b)/float64(div), "KMGTPE"[exp])
}

func yesNo(b bool) string {
	if b {
		return "YES"
	}
	return "NO"
}

// ── panels ───────────────────────────────────────────────────────────────────

func (m Model) provisioningPanel(w int) string {
	doc := m.doc()
	if doc == nil {
		st, why := state.Pending, "bootstrap has not written its state yet"
		if m.boot != nil && m.boot.ServiceState == "failed" {
			st, why = state.Failed, "iotgw-bootstrap.service FAILED — journalctl -u iotgw-bootstrap"
		}
		return panel("Provisioning", st, w, why)
	}
	var rows []string
	overall := state.Healthy
	for _, s := range doc.Steps {
		rows = append(rows, kv(s.Title, badge(s.Status)))
		overall = worstOf(overall, s.Status)
	}
	if !doc.Finished {
		overall = state.Running
	}
	return panel("Provisioning", overall, w, rows...)
}

func (m Model) hostPanel(w int) string {
	h := m.host
	if h == nil {
		return panel("Host", state.Pending, w, "collecting…")
	}
	rows := []string{
		kv("Hostname", orDash(h.Hostname)),
		kv("Device", orDash(h.DeviceID)),
		kv("CPU", fmt.Sprintf("%s (%s, %d CPUs)", orDash(h.CPUModel), h.Arch, h.CPUs)),
		kv("RAM", humanBytes(h.MemTotal)),
		kv("Kernel", orDash(h.Kernel)),
		kv("Boot", orDash(h.BootSource)),
		kv(map[bool]string{true: "OS", false: "Live image"}[m.owrt], orDash(h.ImageRelease)),
		kv("Dashboard", version.String()),
	}
	for i, d := range h.Disks {
		label := ""
		if i == 0 {
			label = "Storage"
		}
		desc := fmt.Sprintf("%s %s %s", d.Name, humanBytes(d.SizeBytes), d.Model)
		if d.Removable {
			desc += " (removable)"
		}
		rows = append(rows, kv(label, strings.TrimSpace(desc)))
	}
	if len(h.Disks) == 0 {
		rows = append(rows, kv("Storage", "no disks detected"))
	}
	return panel("Host", "", w, rows...)
}

func (m Model) networkPanel(w int) string {
	n := m.net
	if n == nil {
		return panel("Network", state.Pending, w, "collecting…")
	}
	var rows, noLink []string
	for _, i := range n.Ifaces {
		link := "DOWN"
		if i.Carrier {
			link = "UP"
		}
		if !i.Carrier && len(i.IPv4) == 0 && i.Kind == "ethernet" {
			noLink = append(noLink, i.Name)
			continue
		}
		line := fmt.Sprintf("%-8s %-4s %s", i.Name, link, orDash(strings.Join(i.IPv4, " ")))
		if i.Egress {
			line += "  <- Internet egress"
		}
		rows = append(rows, line)
		if i.MAC != "" {
			rows = append(rows, labelStyle.Render(fmt.Sprintf("         %s  %s", i.MAC, i.Kind)))
		}
		for _, v6 := range i.IPv6 {
			rows = append(rows, labelStyle.Render("         "+v6))
		}
	}
	if len(noLink) > 0 {
		rows = append(rows, kv("No link", strings.Join(noLink, " ")))
	}
	gw := orDash(n.DefaultGateway)
	if n.DefaultIface != "" {
		gw += " dev " + n.DefaultIface
	}
	rows = append(rows, "",
		kv("Default gateway", gw),
		kv("Egress to Internet", orDash(strings.TrimSpace(n.EgressIface+" "+n.EgressVia))),
		kv("DNS servers", orDash(strings.Join(n.DNS, ", "))))
	if n.Detail != "" {
		rows = append(rows, kv("Note", n.Detail))
	}
	return panel("Network", n.Status, w, rows...)
}

func checkRow(label string, c collect.Check) string {
	v := badge(c.Status)
	if c.Detail != "" {
		v += "  " + labelStyle.Render(c.Detail)
	}
	return kv(label, v)
}

func (m Model) internetPanel(w int) string {
	i := m.inet
	if i == nil {
		return panel("Internet", state.Pending, w, "testing…")
	}
	return panel("Internet", i.Overall, w,
		checkRow("DNS", i.DNS),
		checkRow("IP connectivity", i.IP),
		checkRow("HTTPS", i.HTTPS),
		kv("Tested", ago(i.At)))
}

func (m Model) vpnPanel(w int) string {
	v := m.vpn
	if v == nil {
		return panel("VPN (WireGuard / Netmaker)", state.Pending, w, "collecting…")
	}
	cfg := "not loaded"
	if v.ConfigLoaded {
		cfg = "loaded"
	}
	wg := "absent"
	if v.Present {
		wg = "DOWN"
		if v.Up {
			wg = "UP"
		}
	}
	via := "LAN (split tunnel — only " + orDash(v.NetworkCIDR) + " via wg0)"
	if v.InternetVia == "vpn" {
		via = "VPN (full tunnel — everything via wg0)"
	} else if v.InternetVia == "" {
		via = "-"
	}
	rows := []string{
		kv("Internet via", via),
		kv("DNS", orDash(strings.Join(v.DNS, ", "))),
		kv("Config fetch", badge(v.ConfigStatus)+"  "+labelStyle.Render(cfg)),
		kv("Config applied", badge(v.ApplyStatus)),
		kv("Interface", v.Interface+"  "+wg),
		kv("Address", orDash(strings.Join(v.Addresses, ", "))),
		kv("Endpoint", orDash(v.Endpoint)),
		kv("Last handshake", ago(v.LastHandshake)),
		kv("Transfer", fmt.Sprintf("rx %s / tx %s", humanBytes(v.RxBytes), humanBytes(v.TxBytes))),
		kv("Routes", orDash(strings.Join(v.Routes, ", "))),
	}
	if v.Detail != "" {
		rows = append(rows, kv("Note", v.Detail))
	}
	return panel("VPN (WireGuard / Netmaker)", v.Status, w, rows...)
}

func (m Model) reachPanel(w int) string {
	r := m.reach
	if r == nil {
		return panel("VPN server reachability", state.Pending, w, "testing…")
	}
	return panel("VPN server reachability", r.Status, w,
		kv("Server", orDash(r.Host)),
		kv("Resolved", orDash(strings.Join(r.ResolvedIPs, ", "))),
		kv("Port", orDash(r.Port)+" "+r.Protocol),
		checkRow("DNS", r.DNS),
		checkRow("Route", r.Route),
		checkRow("ICMP", r.ICMP),
		checkRow("WireGuard", r.WireGuard),
		kv("Tested", ago(r.At)))
}

func (m Model) pkiPanel(w int) string {
	p := m.pki
	if p == nil {
		return panel("SSH PKI", state.Pending, w, "collecting…")
	}
	short := func(fps []string) string {
		if len(fps) == 0 {
			return "-"
		}
		s := fps[0]
		if len(fps) > 1 {
			s += fmt.Sprintf(" (+%d)", len(fps)-1)
		}
		return s
	}
	zone := orDash(p.Zone)
	if p.Domain != "" {
		zone += " (domain " + p.Domain + ")"
	}
	valid := "-"
	if !p.HostCertValidTo.IsZero() {
		valid = p.HostCertValidTo.Local().Format("2006-01-02 15:04") + " (in " + time.Until(p.HostCertValidTo).Round(time.Minute).String() + ")"
	}
	rows := []string{
		kv("Trust domain", zone),
		"",
		titleStyle.Render("User CA") + "  " + badge(p.UserCAStatus),
		kv("  Requested", yesNo(p.UserCARequested)+"   Received "+yesNo(p.UserCAReceived)+"   Installed "+yesNo(p.UserCAInstalled)),
		kv("  Fingerprint", short(p.UserCAFPs)),
		kv("  Installed at", orDash(p.UserCAPath)),
		kv("  sshd trust", map[bool]string{true: "ACTIVE", false: "INACTIVE"}[p.UserCATrusted]),
		kv("  Principals", orDash(strings.Join(p.Principals, ", "))),
		"",
		titleStyle.Render("Host CA") + "  " + badge(p.HostCAStatus),
		kv("  Fingerprint", short(p.HostCAFPs)),
		kv("  known_hosts", orDash(p.KnownHostsPath)),
		"",
		titleStyle.Render("SSH host identity (this machine)") + "  " + badge(p.HostIDStatus),
		kv("  Host key", strings.TrimSpace(orDash(p.HostKeyType)+" "+p.HostKeyFP)),
		kv("  Host cert", map[bool]string{true: "PRESENT", false: "ABSENT"}[p.HostCertPresent]),
		kv("  Principal(s)", orDash(strings.Join(p.HostPrincipals, ", "))),
		kv("  Valid until", valid),
		kv("  Signed by", orDash(p.HostCertSignedBy)),
		kv("  sshd HostCert", map[bool]string{true: "ACTIVE", false: "INACTIVE"}[p.HostCertActive]),
		"",
		kv("sshd", badge(p.SSHDStatus)+"  "+labelStyle.Render(p.SSHDDetail)),
	}
	for _, d := range []string{p.UserCADetail, p.HostCADetail, p.HostIDDetail} {
		if d != "" {
			rows = append(rows, kv("Note", d))
		}
	}
	return panel("SSH PKI", worstOf(p.UserCAStatus, p.HostIDStatus, p.SSHDStatus), w, rows...)
}

// ── details view ─────────────────────────────────────────────────────────────

func (m Model) details() string {
	var b strings.Builder
	b.WriteString(titleStyle.Render("Details — what is not healthy, and why") + "\n")
	logs := "journalctl -u iotgw-bootstrap"
	if m.owrt {
		logs = "logread -e iotgw"
	}
	b.WriteString(labelStyle.Render("Press [d] or [Esc] to return. Full logs: "+logs) + "\n\n")
	if m.owrt {
		b.WriteString(m.agentDetails())
	}
	n := 0
	if doc := m.doc(); doc != nil {
		if doc.Identity.DeviceID != "" {
			b.WriteString(kv("Device", doc.Identity.DeviceID) + "\n")
			b.WriteString(kv("API", doc.Identity.APIBase) + "\n\n")
		}
		for _, s := range doc.Steps {
			if s.Status == state.Healthy {
				continue
			}
			n++
			b.WriteString(titleStyle.Render(s.Title) + "  " + badge(s.Status) + "\n")
			if s.Message != "" {
				b.WriteString(kv("  Message", s.Message) + "\n")
			}
			if s.Endpoint != "" {
				b.WriteString(kv("  Endpoint", s.Endpoint) + "\n")
			}
			if s.HTTPStatus != 0 {
				b.WriteString(kv("  HTTP status", fmt.Sprint(s.HTTPStatus)) + "\n")
			}
			if s.Error != "" {
				b.WriteString(kv("  Error", s.Error) + "\n")
			}
			if !s.FinishedAt.IsZero() {
				b.WriteString(kv("  Last attempt", s.FinishedAt.Local().Format("15:04:05")) + "\n")
			}
			b.WriteString("\n")
		}
	} else if m.boot != nil && m.boot.Err != "" {
		n++
		b.WriteString(kv("Bootstrap state", m.boot.Err) + "\n\n")
	}
	add := func(title string, s state.Status, detail string) {
		if s == state.Healthy || s == "" || detail == "" {
			return
		}
		n++
		b.WriteString(titleStyle.Render(title) + "  " + badge(s) + "\n" + kv("  Detail", detail) + "\n\n")
	}
	if m.net != nil {
		add("Network", m.net.Status, m.net.Detail)
	}
	if m.vpn != nil {
		add("VPN", m.vpn.Status, m.vpn.Detail)
	}
	if m.inet != nil {
		add("Internet DNS", m.inet.DNS.Status, m.inet.DNS.Detail)
		add("Internet IP", m.inet.IP.Status, m.inet.IP.Detail)
		add("Internet HTTPS", m.inet.HTTPS.Status, m.inet.HTTPS.Detail)
	}
	if m.reach != nil {
		add("VPN server route", m.reach.Route.Status, m.reach.Route.Detail)
		add("VPN server WireGuard", m.reach.WireGuard.Status, m.reach.WireGuard.Detail)
	}
	if m.pki != nil {
		add("User CA", m.pki.UserCAStatus, m.pki.UserCADetail)
		add("Host CA", m.pki.HostCAStatus, m.pki.HostCADetail)
		add("Host identity", m.pki.HostIDStatus, m.pki.HostIDDetail)
		add("sshd", m.pki.SSHDStatus, m.pki.SSHDDetail)
	}
	if n == 0 {
		b.WriteString(badge(state.Healthy) + "  nothing to report — every component is healthy\n")
	}
	lines := strings.Split(b.String(), "\n")
	for i, l := range lines {
		if strings.Contains(l, kvSep) {
			lines[i] = layoutRow(l, max(m.width-2, 40))
		}
	}
	return strings.Join(lines, "\n")
}

func worstOf(ss ...state.Status) state.Status {
	rank := map[state.Status]int{state.Healthy: 0, state.Skipped: 1, state.NotTested: 1, state.Pending: 2, state.Running: 2, state.Unknown: 3, state.NotConfigured: 3, state.Warning: 4, state.Failed: 5}
	w := state.Healthy
	for _, s := range ss {
		if rank[s] > rank[w] {
			w = s
		}
	}
	return w
}

func checkOf(s state.Status, detail string) collect.Check {
	return collect.Check{Status: s, Detail: detail}
}
