package tui

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"

	"github.com/i40sys/iotgw-ng/live-image/internal/agent"
	"github.com/i40sys/iotgw-ng/live-image/internal/sysexec"
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

func init() {
	// Never run the real binary (as root, through sudo) from a test.
	runPrivileged = func(context.Context, time.Duration, sysexec.LineFunc, string, ...string) (sysexec.Result, error) {
		return sysexec.Result{}, errors.New("not run in tests")
	}
}

func hit(m Model, t tea.KeyType) Model {
	next, _ := m.Update(tea.KeyMsg{Type: t})
	return next.(Model)
}

func typeCode(m Model, code string) Model {
	for _, c := range code {
		m = press(m, string(c))
	}
	return m
}

func enrolledModel() Model {
	m := owrtModel(false)
	m.inst.HostCert = true
	return m
}

// runCode submits the code input and returns the model plus the command
// line the action would show (the streamed action's start message).
func runCode(t *testing.T, m Model) (Model, actionStartMsg) {
	t.Helper()
	next, cmd := m.Update(tea.KeyMsg{Type: tea.KeyEnter})
	m = next.(Model)
	if cmd == nil {
		t.Fatal("[Enter] started nothing")
	}
	return m, findStart(t, cmd)
}

// findStart runs a (batched) command until the refresh's actionStartMsg.
// (runPrivileged is stubbed in init: nothing is executed.)
func findStart(t *testing.T, cmd tea.Cmd) actionStartMsg {
	t.Helper()
	var walk func(tea.Msg) (actionStartMsg, bool)
	walk = func(msg tea.Msg) (actionStartMsg, bool) {
		switch v := msg.(type) {
		case actionStartMsg:
			return v, true
		case tea.BatchMsg:
			for _, c := range v {
				if c == nil {
					continue
				}
				if s, ok := walk(c()); ok {
					return s, true
				}
			}
		}
		return actionStartMsg{}, false
	}
	s, ok := walk(cmd())
	if !ok {
		t.Fatal("no action started")
	}
	return s
}

func TestVPNRefreshAsksForTheCode(t *testing.T) {
	m := press(owrtModel(false), "v")
	if m.codeFor != "vpn" || !strings.Contains(m.body(), "VPN refresh — one-time code") {
		t.Fatalf("[v] did not open the code input:\n%s", m.body())
	}
	// Letters, q and an incomplete code do nothing; Backspace deletes.
	m = typeCode(m, "12a3q")
	if m.codeBuf != "123" || m.codeFor != "vpn" {
		t.Fatalf("code buffer %q (open=%q)", m.codeBuf, m.codeFor)
	}
	if !strings.Contains(m.body(), "1 2 3 _ _ _") {
		t.Errorf("the typed digits are not shown in the prompt:\n%s", m.body())
	}
	if r := hit(m, tea.KeyEnter); r.busy || r.codeFor != "vpn" {
		t.Error("[Enter] ran with an incomplete code")
	}
	m = hit(m, tea.KeyBackspace)
	m = typeCode(m, "45678")
	if m.codeBuf != "124567" {
		t.Fatalf("after Backspace and overflow: %q", m.codeBuf)
	}
	if c := hit(m, tea.KeyEsc); c.codeFor != "" || c.codeBuf != "" || c.busy {
		t.Error("[Esc] did not cancel and clear the code")
	}
	r, start := runCode(t, m)
	if !r.busy || r.codeFor != "" || r.codeBuf != "" {
		t.Error("[Enter] did not start the refresh and clear the code")
	}
	if start.cmdline != "iotgw vpn refresh -otp ******" {
		t.Errorf("command line shown: %q", start.cmdline)
	}
	if strings.Contains(r.body(), "124567") {
		t.Error("the code is still on the dashboard after it was submitted")
	}
	if press(r, "v").codeFor != "" {
		t.Error("[v] opened a second prompt while an action runs")
	}
}

func TestSSHRefreshEnrolledRenewsWithoutCode(t *testing.T) {
	m := press(enrolledModel(), "s")
	if m.confirmRefresh != "ssh" || m.codeFor != "" || !strings.Contains(m.body(), "Renew the SSH host certificate?") {
		t.Fatalf("[s] on an enrolled gateway did not open the renew prompt:\n%s", m.body())
	}
	if c := press(m, "n"); c.confirmRefresh != "" || c.busy {
		t.Error("[s] then [n] did not cancel")
	}
	if r := press(m, "y"); r.confirmRefresh != "" || !r.busy {
		t.Error("[s] then [y] did not start the renewal")
	}
	next, cmd := m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("f")})
	if !next.(Model).busy {
		t.Fatal("[f] did not start a forced renewal")
	}
	if s := findStart(t, cmd); s.cmdline != "iotgw ssh refresh -force" {
		t.Errorf("forced renewal command line: %q", s.cmdline)
	}
}

func TestSSHRefreshNotEnrolledAsksForTheCode(t *testing.T) {
	m := press(owrtModel(false), "s")
	if m.codeFor != "ssh" || m.confirmRefresh != "" || !strings.Contains(m.body(), "First SSH enrollment") {
		t.Fatalf("[s] before enrollment did not ask for a code:\n%s", m.body())
	}
	_, start := runCode(t, typeCode(m, "654321"))
	if start.cmdline != "iotgw ssh refresh -otp ******" {
		t.Errorf("command line shown: %q", start.cmdline)
	}
}

func TestCodePromptsFitTheConsole(t *testing.T) {
	for _, m := range []Model{press(owrtModel(false), "v"), press(owrtModel(false), "s"), press(enrolledModel(), "s")} {
		for i, l := range strings.Split(m.body(), "\n") {
			if w := lipgloss.Width(l); w > 80 {
				t.Fatalf("line %d is %d wide at 80 columns: %q", i, w, l)
			}
		}
	}
}

func TestDisplayArgsMasksTheCode(t *testing.T) {
	if got := displayArgs([]string{"vpn", "refresh", "-otp", "123456"}); got != "iotgw vpn refresh -otp ******" || strings.Contains(got, "123456") {
		t.Errorf("displayArgs = %q", got)
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
