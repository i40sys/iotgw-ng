package tui

import (
	"github.com/charmbracelet/lipgloss"

	"github.com/i40sys/iotgw-ng/live-image/internal/state"
)

// Every status carries a text symbol AND a word, so the dashboard stays
// readable on a monochrome console or over a limited remote terminal.
var badges = map[state.Status]string{
	state.Healthy:       "[+] HEALTHY",
	state.Warning:       "[!] WARNING",
	state.Failed:        "[X] FAILED",
	state.Pending:       "[.] PENDING",
	state.Running:       "[.] RUNNING",
	state.Unknown:       "[?] UNKNOWN",
	state.NotConfigured: "[-] NOT CONFIGURED",
	state.NotTested:     "[ ] NOT TESTED",
	state.Skipped:       "[-] SKIPPED",
}

var colors = map[state.Status]lipgloss.TerminalColor{
	state.Healthy:       lipgloss.AdaptiveColor{Light: "#1a7f37", Dark: "#3fb950"},
	state.Warning:       lipgloss.AdaptiveColor{Light: "#9a6700", Dark: "#d29922"},
	state.Failed:        lipgloss.AdaptiveColor{Light: "#cf222e", Dark: "#f85149"},
	state.Pending:       lipgloss.AdaptiveColor{Light: "#0969da", Dark: "#58a6ff"},
	state.Running:       lipgloss.AdaptiveColor{Light: "#0969da", Dark: "#58a6ff"},
	state.Unknown:       lipgloss.AdaptiveColor{Light: "#57606a", Dark: "#8b949e"},
	state.NotConfigured: lipgloss.AdaptiveColor{Light: "#57606a", Dark: "#8b949e"},
	state.NotTested:     lipgloss.AdaptiveColor{Light: "#57606a", Dark: "#8b949e"},
	state.Skipped:       lipgloss.AdaptiveColor{Light: "#57606a", Dark: "#8b949e"},
}

var (
	titleStyle  = lipgloss.NewStyle().Bold(true)
	labelStyle  = lipgloss.NewStyle().Faint(true)
	headerStyle = lipgloss.NewStyle().Bold(true).Padding(0, 1).Reverse(true)
	footerStyle = lipgloss.NewStyle().Padding(0, 1).Reverse(true)
	keyStyle    = lipgloss.NewStyle().Bold(true)
)

func badge(s state.Status) string {
	b, ok := badges[s]
	if !ok {
		b = "[?] " + string(s)
	}
	st := lipgloss.NewStyle().Bold(s == state.Failed || s == state.Warning)
	if c, ok := colors[s]; ok {
		st = st.Foreground(c)
	}
	return st.Render(b)
}

// panelStyle frames a section; the border colour mirrors its worst status.
func panelStyle(s state.Status, width int) lipgloss.Style {
	st := lipgloss.NewStyle().Border(lipgloss.NormalBorder()).Padding(0, 1).Width(width - 2)
	if c, ok := colors[s]; ok && (s == state.Failed || s == state.Warning) {
		st = st.BorderForeground(c)
	}
	return st
}
