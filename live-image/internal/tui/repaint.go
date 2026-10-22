package tui

import (
	"time"

	tea "github.com/charmbracelet/bubbletea"
)

// Full repaints. Bubble Tea only rewrites the lines it thinks changed, but on
// a local console other processes write to the same screen behind its back:
// procd runs hotplug/init scripts with /dev/console as their stdout/stderr
// (firewall, dockerd, wireguard… on every network reload, e.g. a VPN refresh
// or a self-healing repair), and the live image's boot prints there too. Such
// text scrolls the screen and lands between the panels; unchanged lines were
// never redrawn, so the dashboard stayed garbled and flickered as parts of it
// were repainted on top. A periodic full repaint rewrites every line in place
// (from the home position, erasing each line's tail): no blank flash, and any
// foreign text is gone within one interval.
const (
	repaintInterval = 10 * time.Second
	// While a console action runs (and a little after: hotplug scripts
	// finish after the command returns) the network is being changed.
	repaintActionInterval = time.Second
	repaintActionTail     = 10 * time.Second
)

// repaintTickMsg carries the generation of the tick chain that sent it: an
// action start begins a new, faster chain at once, and the old chain's ticks
// are dropped instead of piling up.
type repaintTickMsg struct{ gen int }

func repaintAfter(gen int, d time.Duration) tea.Cmd {
	return tea.Tick(d, func(time.Time) tea.Msg { return repaintTickMsg{gen} })
}

// repaintNow makes the renderer drop its last frame: it repaints on any
// WindowSizeMsg, and one with the terminal's own size changes nothing else.
func (m Model) repaintNow() tea.Cmd {
	if m.termW == 0 && m.termH == 0 {
		return nil // no size yet: the first frame is a full one anyway
	}
	w, h := m.termW, m.termH
	return func() tea.Msg { return tea.WindowSizeMsg{Width: w, Height: h} }
}

// nextRepaint is the interval to the next full repaint.
func (m Model) nextRepaint(now time.Time) time.Duration {
	if a := m.action; a != nil && (a.ended.IsZero() || now.Sub(a.ended) < repaintActionTail) {
		return repaintActionInterval
	}
	return repaintInterval
}
