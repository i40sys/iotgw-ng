// Package tui is the iotgw-status Bubble Tea dashboard (decision-031). It
// holds the latest structured state from the collectors and renders it; all
// probing runs in tea.Cmds (off the update loop), so a hung DNS lookup or a
// dead VPN never freezes the screen.
package tui

import (
	"strings"
	"time"

	"github.com/charmbracelet/bubbles/key"
	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"

	"github.com/i40sys/iotgw-ng/live-image/internal/agent"
	"github.com/i40sys/iotgw-ng/live-image/internal/collect"
	"github.com/i40sys/iotgw-ng/live-image/internal/platform"
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

	// owrt: running on the installed OpenWRT gateway (decision-032), where
	// the Installed and Agent panels replace Provisioning.
	owrt bool
	inst *agent.Installed

	inflight map[string]bool
	updated  map[string]time.Time

	// Internet-mode switch ([i]): confirm → run → notice. On OpenWRT the
	// prompt offers the three policies (l/v/a) instead of y/n.
	confirmVia string // target mode awaiting y/n; "" when no prompt
	choosing   bool   // OpenWRT policy chooser open
	switching  bool
	notice     string
	noticeBad  bool

	// Hold ([h], OpenWRT): confirm → run → notice.
	confirmHold string // "enable" | "disable" awaiting y/n
}

// currentVia is the applied Internet mode ("lan" when unknown).
func (m *Model) currentVia() string {
	if m.vpn != nil && m.vpn.InternetVia == "vpn" {
		return "vpn"
	}
	return "lan"
}

// holdOn reports whether the daemon is on hold (OpenWRT).
func (m *Model) holdOn() bool {
	return m.inst != nil && m.inst.Config.Hold
}

// New returns a dashboard that starts every collector immediately.
func New() Model {
	return Model{inflight: map[string]bool{}, updated: map[string]time.Time{}, owrt: platform.IsOpenWRT()}
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

// provCmd refreshes the provisioning record: the live image's bootstrap
// state, or the installed gateway's picture on OpenWRT.
func (m *Model) provCmd() tea.Cmd {
	if m.owrt {
		return m.start(kInst, collectInstCmd())
	}
	return m.start(kBoot, collectBootCmd())
}

func (m *Model) refreshAll() tea.Cmd {
	return tea.Batch(
		m.start(kHost, collectHostCmd()),
		m.start(kNet, collectNetCmd()),
		m.provCmd(),
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
		if m.choosing {
			pick := map[string]string{"l": "lan", "v": "vpn", "a": "auto"}[msg.String()]
			switch {
			case pick != "":
				m.choosing, m.switching = false, true
				m.notice, m.noticeBad = "Setting the Internet policy to "+strings.ToUpper(pick)+"…", false
				cmds = append(cmds, switchInternetCmd(pick))
			case msg.String() == "esc" || msg.String() == "n" || msg.String() == "q":
				m.choosing = false
			}
			break
		}
		if m.confirmHold != "" {
			switch msg.String() {
			case "y", "Y":
				on := m.confirmHold == "enable"
				m.confirmHold = ""
				m.notice, m.noticeBad = map[bool]string{true: "Enabling hold…", false: "Disabling hold…"}[on], false
				cmds = append(cmds, holdCmd(on))
			case "n", "N", "esc", "q":
				m.confirmHold = ""
			}
			break
		}
		if m.confirmVia != "" {
			switch msg.String() {
			case "y", "Y":
				via := m.confirmVia
				m.confirmVia, m.switching = "", true
				m.notice, m.noticeBad = "Switching Internet to "+strings.ToUpper(via)+" — restarting wg0…", false
				cmds = append(cmds, switchInternetCmd(via))
			case "n", "N", "esc", "q":
				m.confirmVia = ""
			}
			break
		}
		switch msg.String() {
		case "q", "ctrl+c":
			return m, tea.Quit
		case "i":
			if m.owrt {
				if !m.switching {
					m.choosing = true
					m.vp.GotoTop()
				}
				break
			}
			if !m.switching && m.vpn != nil && m.vpn.ConfigLoaded {
				m.confirmVia = map[string]string{"lan": "vpn", "vpn": "lan"}[m.currentVia()]
				m.vp.GotoTop()
			} else if m.vpn == nil || !m.vpn.ConfigLoaded {
				m.notice, m.noticeBad = "No VPN configuration was retrieved — nothing to switch", true
			}
		case "h":
			if m.owrt {
				m.confirmHold = map[bool]string{true: "disable", false: "enable"}[m.holdOn()]
				m.vp.GotoTop()
			}
		case "r":
			// Also a full repaint: anything written to the console behind
			// the dashboard's back (kernel/boot messages) is wiped.
			cmds = append(cmds, tea.ClearScreen, m.refreshAll())
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
		// A serial console often reports 0x0: assume a classic 80x24.
		if msg.Width < 40 {
			msg.Width = 80
		}
		if msg.Height < 10 {
			msg.Height = 24
		}
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
	case instMsg:
		in := agent.Installed(msg)
		m.inst = &in
		m.done(kInst)
		doc := in.SyntheticDoc()
		cmds = append(cmds, m.start(kVPN, collectVPNCmd(doc)), m.start(kPKI, collectPKICmd(doc)))
	case holdDoneMsg:
		if msg.err != nil {
			m.notice, m.noticeBad = "Hold change FAILED: "+msg.err.Error(), true
		} else {
			m.notice, m.noticeBad = msg.out, false
		}
		cmds = append(cmds, m.provCmd())

	case switchDoneMsg:
		m.switching = false
		switch {
		case msg.err != nil:
			m.notice, m.noticeBad = "Switch to "+strings.ToUpper(msg.via)+" FAILED: "+msg.err.Error(), true
		case m.owrt:
			m.notice, m.noticeBad = msg.out, false
		default:
			m.notice, m.noticeBad = "Internet now via "+strings.ToUpper(msg.via)+". "+msg.out, false
		}
		cmds = append(cmds, m.refreshAll())

	case fastTickMsg:
		cmds = append(cmds, fastTick(), m.start(kNet, collectNetCmd()), m.provCmd())
	case slowTickMsg:
		cmds = append(cmds, slowTick(), m.start(kInet, collectInetCmd()))
		if v := m.vpn; v != nil {
			cmds = append(cmds, m.start(kReach, collectReachCmd(*v)))
		}
	case hostTickMsg:
		cmds = append(cmds, hostTick(), m.start(kHost, collectHostCmd()))
		if m.owrt {
			// A console on an installed gateway is shared with the kernel and
			// procd: repaint fully now and then so stray output never sticks.
			cmds = append(cmds, tea.ClearScreen)
		}
	}

	if m.ready {
		m.vp.SetContent(m.body())
		var cmd tea.Cmd
		m.vp, cmd = m.vp.Update(msg)
		cmds = append(cmds, cmd)
	}
	return m, tea.Batch(cmds...)
}
