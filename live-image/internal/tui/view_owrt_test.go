package tui

import (
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	"github.com/i40sys/iotgw-ng/live-image/internal/agent"
)

func owrtModel(hold bool) Model {
	m := New()
	m.owrt = true
	m.width, m.ready = 80, true
	m.inst = &agent.Installed{
		OS:     "OpenWrt 23.05.4 r24012-d8dd03c46f",
		Config: agent.Config{Policy: agent.PolicyAuto, Prefer: agent.EgressLAN, Hold: hold, HoldReason: "debugging the uplink", HoldSince: time.Now().Add(-time.Hour), WGIface: "wg0"},
		Daemon: &agent.State{PID: 42, UpdatedAt: time.Now(), Egress: agent.EgressLAN, Uplink: agent.Uplink{Iface: "wan", Device: "eth0", Gateway: "10.2.0.1"}},
	}
	m.inst.DaemonRunning = true
	return m
}

func TestInstalledPanelShowsTheRequiredItems(t *testing.T) {
	out := owrtModel(false).body()
	for _, want := range []string{"Installed", "Provisioned", "SSH certificate", "VPN", "Internet", "Active uplink", "Self-healing agent", "auto (lan preferred, automatic fallback to vpn)"} {
		if !strings.Contains(out, want) {
			t.Errorf("dashboard lacks %q", want)
		}
	}
	if strings.Contains(out, "HOLD") {
		t.Error("hold banner shown while hold is off")
	}
	for i, l := range strings.Split(out, "\n") {
		if w := lipgloss.Width(l); w > 80 {
			t.Fatalf("line %d is %d wide at 80 columns: %q", i, w, l)
		}
	}
}

func TestHoldIsImpossibleToMiss(t *testing.T) {
	m := owrtModel(true)
	out := m.body()
	for _, want := range []string{"HOLD — AUTOMATIC REPAIR IS SUSPENDED", "debugging the uplink", "iotgw hold disable", "OFF — HOLD"} {
		if !strings.Contains(out, want) {
			t.Errorf("hold view lacks %q", want)
		}
	}
	if !strings.Contains(m.footer(), "Resume") {
		t.Error("footer does not offer to resume")
	}
	m.width = 132
	if !strings.Contains(m.footer(), "Resume auto-repair") {
		t.Error("wide footer does not spell out resuming auto-repair")
	}
}

func press(m Model, k string) Model {
	next, _ := m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune(k)})
	return next.(Model)
}

func TestRefreshKeysAskFirstAndRunOnConfirm(t *testing.T) {
	for _, tc := range []struct{ key, what, title string }{
		{"v", "vpn", "Refresh the VPN configuration?"},
		{"s", "ssh", "Refresh SSH trust and the host certificate?"},
	} {
		m := press(owrtModel(false), tc.key)
		if m.confirmRefresh != tc.what || !strings.Contains(m.body(), tc.title) {
			t.Fatalf("[%s] did not open the %s prompt", tc.key, tc.what)
		}
		if c := press(m, "n"); c.confirmRefresh != "" || c.busy {
			t.Errorf("[%s] then [n] did not cancel", tc.key)
		}
		// Cmds are not executed here: [y] only marks the action as running.
		r := press(m, "y")
		if r.confirmRefresh != "" || !r.busy {
			t.Errorf("[%s] then [y] did not start the refresh", tc.key)
		}
		if press(r, tc.key).confirmRefresh != "" {
			t.Errorf("[%s] opened a second prompt while an action runs", tc.key)
		}
	}
	if press(press(owrtModel(false), "v"), "f").busy {
		t.Error("[f] (force) started a VPN refresh; it is SSH-only")
	}
	if !press(press(owrtModel(false), "s"), "f").busy {
		t.Error("[f] did not start a forced SSH refresh")
	}
}

func TestRefreshOutcomeIsShown(t *testing.T) {
	m := owrtModel(false)
	m.busy = true
	next, _ := m.Update(refreshDoneMsg{what: "ssh", err: errors.New("ssh-ca API (HTTP 401)")})
	out := next.(Model).body()
	if next.(Model).busy || !strings.Contains(out, "SSH refresh FAILED: ssh-ca API (HTTP 401)") {
		t.Errorf("failure not shown:\n%s", out)
	}
}

func TestLiveImageHasNoRefreshKeys(t *testing.T) {
	m := New()
	m.owrt, m.width, m.ready = false, 80, true
	if press(m, "v").confirmRefresh != "" || strings.Contains(m.footer(), "VPN refresh") {
		t.Error("the live image offers VPN/SSH refresh on its console")
	}
}

func TestOpenWRTFooterFitsTheConsole(t *testing.T) {
	for _, w := range []int{80, 132} {
		for _, hold := range []bool{false, true} {
			m := owrtModel(hold)
			m.width = w
			f := m.footer()
			if strings.Contains(f, "\n") || lipgloss.Width(f) > w {
				t.Errorf("footer wraps at %d columns (hold=%v): %q", w, hold, f)
			}
			for _, want := range []string{"[v]", "[s]", "[h]", "[q]"} {
				if !strings.Contains(f, want) {
					t.Errorf("footer at %d columns lacks %s", w, want)
				}
			}
		}
	}
}

// feed plays a streamed action into the model the way the runtime does:
// each message from the channel through Update.
func feed(m Model, msgs ...tea.Msg) Model {
	ch := make(chan tea.Msg, len(msgs))
	for _, msg := range msgs[1:] {
		ch <- msg
	}
	close(ch)
	start := msgs[0].(actionStartMsg)
	start.ch = ch
	next, _ := m.Update(start)
	m = next.(Model)
	for msg := range ch {
		next, _ = m.Update(msg)
		m = next.(Model)
	}
	return m
}

func TestActionOutputIsShownLiveAndKept(t *testing.T) {
	m := owrtModel(false)
	m.busy = true
	now := time.Now()
	start := actionStartMsg{title: "SSH refresh", cmdline: "iotgw ssh refresh"}
	m = feed(m, start,
		actionLineMsg{at: now, text: "ssh refresh: renewing: no host certificate installed"},
		actionLineMsg{at: now, text: "ssh refresh: requesting SSH trust + host certificate from http://api/functions/v1/ssh-ca"})
	// Still running: the lines so far are on the dashboard.
	out := m.body()
	for _, want := range []string{"Action: SSH refresh", "iotgw ssh refresh", "running for", "renewing: no host certificate installed", "requesting SSH trust"} {
		if !strings.Contains(out, want) {
			t.Errorf("while running, the dashboard lacks %q", want)
		}
	}

	err := errors.New("iotgw exited 1: ssh-ca API (HTTP 401)")
	m = feed(m, start,
		actionLineMsg{at: now, text: "ssh refresh: renewing: no host certificate installed"},
		actionLineMsg{at: now, stderr: true, text: "iotgw: ssh-ca API (HTTP 401): re-enrollment requires proof"},
		actionEndMsg{err: err},
		refreshDoneMsg{what: "ssh", err: err})
	out = m.body()
	for _, want := range []string{"FAILED after", "! iotgw: ssh-ca API (HTTP 401)", "Result: SSH refresh FAILED", "logread -e iotgw"} {
		if !strings.Contains(out, want) {
			t.Errorf("after the failure, the dashboard lacks %q:\n%s", want, out)
		}
	}
	if m.busy {
		t.Error("still busy after the action ended")
	}
	for i, l := range strings.Split(out, "\n") {
		if w := lipgloss.Width(l); w > 80 {
			t.Fatalf("line %d is %d wide at 80 columns: %q", i, w, l)
		}
	}
	m.showDetails = true
	if d := m.body(); !strings.Contains(d, "Last console action: SSH refresh") || !strings.Contains(d, "re-enrollment requires proof") {
		t.Errorf("Details lacks the action output:\n%s", d)
	}
}

func TestActionShowsOnlyTheLatestLines(t *testing.T) {
	msgs := []tea.Msg{actionStartMsg{title: "VPN refresh", cmdline: "iotgw vpn refresh"}}
	for i := 0; i < 30; i++ {
		msgs = append(msgs, actionLineMsg{at: time.Now(), text: fmt.Sprintf("step %02d", i)})
	}
	out := feed(owrtModel(false), msgs...).body()
	if strings.Contains(out, "step 17") || !strings.Contains(out, "step 18") || !strings.Contains(out, "step 29") || !strings.Contains(out, "18 earlier lines") {
		t.Errorf("expected the last 12 lines and a count of the rest:\n%s", out)
	}
}
