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
	// snapFresh: the daemon's snapshot is current, so the dashboard shows it
	// instead of probing the system itself (the daemon is the backend).
	snapFresh bool

	inflight map[string]bool
	updated  map[string]time.Time

	// Internet-mode switch ([i]): confirm → run → notice. On OpenWRT the
	// prompt offers the three policies (l/v/a) instead of y/n.
	confirmVia string // target mode awaiting y/n; "" when no prompt
	choosing   bool   // OpenWRT policy chooser open
	busy       bool   // an action (switch, VPN/SSH refresh) is running
	notice     string
	noticeBad  bool

	// Hold ([h], OpenWRT): confirm → run → notice.
	confirmHold string // "enable" | "disable" awaiting y/n

	// VPN / SSH refresh ([v] / [s], OpenWRT): confirm → run → notice.
	confirmRefresh string // "vpn" | "ssh" awaiting y/n (f = force, ssh)

	// action is the console action running now or run last, streamed line
	// by line from actionCh (see streamAction).
	action   *action
	actionCh <-chan tea.Msg
}

// refreshTitle names a refresh for notices.
var refreshTitle = map[string]string{"vpn": "VPN refresh", "ssh": "SSH refresh"}

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

// Init starts the collectors and the refresh tickers. On an installed
// gateway it first reads the daemon's snapshot and only probes by itself
// when that is missing or stale.
func (m Model) Init() tea.Cmd {
	if m.owrt {
		return tea.Batch(readSnapCmd(), fastTick(), slowTick(), hostTick())
	}
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
				m.choosing, m.busy = false, true
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
				m.confirmHold, m.busy = "", true
				cmds = append(cmds, holdCmd(on))
			case "n", "N", "esc", "q":
				m.confirmHold = ""
			}
			break
		}
		if m.confirmRefresh != "" {
			what, force := m.confirmRefresh, false
			switch msg.String() {
			case "f", "F":
				if what != "ssh" {
					break
				}
				force = true
				fallthrough
			case "y", "Y":
				m.confirmRefresh, m.busy = "", true
				cmds = append(cmds, refreshCmd(what, force))
			case "n", "N", "esc", "q":
				m.confirmRefresh = ""
			}
			break
		}
		if m.confirmVia != "" {
			switch msg.String() {
			case "y", "Y":
				via := m.confirmVia
				m.confirmVia, m.busy = "", true
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
				if !m.busy {
					m.choosing = true
					m.vp.GotoTop()
				}
				break
			}
			if !m.busy && m.vpn != nil && m.vpn.ConfigLoaded {
				m.confirmVia = map[string]string{"lan": "vpn", "vpn": "lan"}[m.currentVia()]
				m.vp.GotoTop()
			} else if m.vpn == nil || !m.vpn.ConfigLoaded {
				m.action = nil
				m.notice, m.noticeBad = "No VPN configuration was retrieved — nothing to switch", true
			}
		case "h":
			if m.owrt && !m.busy {
				m.confirmHold = map[bool]string{true: "disable", false: "enable"}[m.holdOn()]
				m.vp.GotoTop()
			}
		case "v", "s":
			if m.owrt && !m.busy {
				m.confirmRefresh = map[string]string{"v": "vpn", "s": "ssh"}[msg.String()]
				m.vp.GotoTop()
			}
		case "r":
			// Also a full repaint: anything written to the console behind
			// the dashboard's back (kernel/boot messages) is wiped.
			cmds = append(cmds, tea.ClearScreen)
			if m.owrt && m.snapFresh {
				cmds = append(cmds, kickDaemonCmd(), tea.Tick(2*time.Second, func(time.Time) tea.Msg { return readSnapCmd()() }))
				break
			}
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
	case snapMsg:
		sn := msg.s
		m.snapFresh = sn.Fresh()
		if !m.snapFresh {
			// No daemon (or it is stuck): probe by ourselves.
			cmds = append(cmds, m.refreshAll())
			break
		}
		m.host, m.net, m.inet, m.vpn, m.reach, m.pki, m.inst = sn.Host, sn.Network, sn.Internet, sn.VPN, sn.Reach, sn.PKI, sn.Installed
		for _, k := range []string{kHost, kNet, kInet, kVPN, kReach, kPKI, kInst} {
			m.updated[k] = sn.UpdatedAt
		}
	case actionStartMsg:
		m.action = &action{title: msg.title, cmdline: msg.cmdline, started: time.Now()}
		m.actionCh = msg.ch
		m.notice, m.noticeBad = "", false
		m.vp.GotoTop()
		cmds = append(cmds, nextAction(m.actionCh))
	case actionLineMsg:
		if a := m.action; a != nil {
			a.lines = append(a.lines, actionLine(msg))
			if len(a.lines) > maxActionLines {
				a.lines = a.lines[len(a.lines)-maxActionLines:]
			}
		}
		cmds = append(cmds, nextAction(m.actionCh))
	case actionEndMsg:
		if a := m.action; a != nil {
			a.ended, a.err = time.Now(), msg.err
		}
		cmds = append(cmds, nextAction(m.actionCh))

	case holdDoneMsg:
		m.busy = false
		if msg.err != nil {
			m.notice, m.noticeBad = "Hold change FAILED: "+msg.err.Error(), true
		} else {
			m.notice, m.noticeBad = msg.out, false
		}
		cmds = append(cmds, m.provCmd())

	case refreshDoneMsg:
		m.busy = false
		if msg.err != nil {
			m.notice, m.noticeBad = refreshTitle[msg.what]+" FAILED: "+msg.err.Error(), true
		} else {
			m.notice, m.noticeBad = refreshTitle[msg.what]+": "+msg.out, false
		}
		cmds = append(cmds, kickDaemonCmd(), m.provCmd())

	case switchDoneMsg:
		m.busy = false
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
		if m.owrt {
			cmds = append(cmds, fastTick(), readSnapCmd())
			break
		}
		cmds = append(cmds, fastTick(), m.start(kNet, collectNetCmd()), m.provCmd())
	case slowTickMsg:
		if m.owrt && m.snapFresh {
			cmds = append(cmds, slowTick())
			break
		}
		cmds = append(cmds, slowTick(), m.start(kInet, collectInetCmd()))
		if v := m.vpn; v != nil {
			cmds = append(cmds, m.start(kReach, collectReachCmd(*v)))
		}
	case hostTickMsg:
		cmds = append(cmds, hostTick())
		if !m.owrt || !m.snapFresh {
			cmds = append(cmds, m.start(kHost, collectHostCmd()))
		}
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
