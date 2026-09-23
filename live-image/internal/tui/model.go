// Package tui is the iotgw-status Bubble Tea dashboard (decision-031). It
// holds the latest structured state from the collectors and renders it; all
// probing runs in tea.Cmds (off the update loop), so a hung DNS lookup or a
// dead VPN never freezes the screen.
package tui

import (
	"time"

	"github.com/charmbracelet/bubbles/key"
	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"

	"github.com/i40sys/iotgw-ng/live-image/internal/collect"
	"github.com/i40sys/iotgw-ng/live-image/internal/state"
)

// Model is the dashboard state.
type Model struct {
	width, height int
	vp            viewport.Model
	ready         bool
	showDetails   bool

	host  *collect.Host
	net   *collect.Network
	boot  *collect.Bootstrap
	vpn   *collect.VPN
	reach *collect.Reachability
	inet  *collect.Internet
	pki   *collect.PKI

	inflight map[string]bool
	updated  map[string]time.Time
}

// New returns a dashboard that starts every collector immediately.
func New() Model {
	return Model{inflight: map[string]bool{}, updated: map[string]time.Time{}}
}

func (m *Model) start(key string, cmd tea.Cmd) tea.Cmd {
	if m.inflight[key] {
		return nil
	}
	m.inflight[key] = true
	return cmd
}

func (m *Model) done(key string) {
	m.inflight[key] = false
	m.updated[key] = time.Now()
}

func (m *Model) doc() *state.Bootstrap {
	if m.boot == nil {
		return nil
	}
	return m.boot.Doc
}

func (m *Model) refreshAll() tea.Cmd {
	return tea.Batch(
		m.start(kHost, collectHostCmd()),
		m.start(kNet, collectNetCmd()),
		m.start(kBoot, collectBootCmd()),
		m.start(kInet, collectInetCmd()),
	)
}

// Init starts the collectors and the refresh tickers.
func (m Model) Init() tea.Cmd {
	return tea.Batch(m.refreshAll(), fastTick(), slowTick(), hostTick())
}

// Update handles input, collector results and ticks.
func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmds []tea.Cmd
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "q", "ctrl+c":
			return m, tea.Quit
		case "r":
			cmds = append(cmds, m.refreshAll())
			if v := m.vpn; v != nil {
				cmds = append(cmds, m.start(kReach, collectReachCmd(*v)))
			}
		case "d":
			m.showDetails = !m.showDetails
			m.vp.GotoTop()
		case "esc":
			m.showDetails = false
		}
	case tea.WindowSizeMsg:
		m.width, m.height = msg.Width, msg.Height
		h := max(msg.Height-2, 1) // header + footer
		if !m.ready {
			m.vp = viewport.New(msg.Width, h)
			// `d` is the Details key; keep half-page scrolling on ctrl+d/ctrl+u.
			m.vp.KeyMap.HalfPageDown = key.NewBinding(key.WithKeys("ctrl+d"))
			m.vp.KeyMap.HalfPageUp = key.NewBinding(key.WithKeys("ctrl+u"))
			m.ready = true
		} else {
			m.vp.Width, m.vp.Height = msg.Width, h
		}

	case hostMsg:
		h := collect.Host(msg)
		m.host = &h
		m.done(kHost)
	case netMsg:
		n := collect.Network(msg)
		m.net = &n
		m.done(kNet)
	case bootMsg:
		b := collect.Bootstrap(msg)
		m.boot = &b
		m.done(kBoot)
		// VPN and PKI views combine the bootstrap record with live state.
		cmds = append(cmds, m.start(kVPN, collectVPNCmd(b.Doc)), m.start(kPKI, collectPKICmd(b.Doc)))
	case vpnMsg:
		v := collect.VPN(msg)
		first := m.vpn == nil
		m.vpn = &v
		m.done(kVPN)
		if first {
			cmds = append(cmds, m.start(kReach, collectReachCmd(v)))
		}
	case reachMsg:
		r := collect.Reachability(msg)
		m.reach = &r
		m.done(kReach)
	case inetMsg:
		i := collect.Internet(msg)
		m.inet = &i
		m.done(kInet)
	case pkiMsg:
		p := collect.PKI(msg)
		m.pki = &p
		m.done(kPKI)

	case fastTickMsg:
		cmds = append(cmds, fastTick(), m.start(kNet, collectNetCmd()), m.start(kBoot, collectBootCmd()))
	case slowTickMsg:
		cmds = append(cmds, slowTick(), m.start(kInet, collectInetCmd()))
		if v := m.vpn; v != nil {
			cmds = append(cmds, m.start(kReach, collectReachCmd(*v)))
		}
	case hostTickMsg:
		cmds = append(cmds, hostTick(), m.start(kHost, collectHostCmd()))
	}

	if m.ready {
		m.vp.SetContent(m.body())
		var cmd tea.Cmd
		m.vp, cmd = m.vp.Update(msg)
		cmds = append(cmds, cmd)
	}
	return m, tea.Batch(cmds...)
}
