package tui

import (
	"strings"
	"testing"
	"time"

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
	if !strings.Contains(m.footer(), "Resume auto-repair") {
		t.Error("footer does not offer to resume")
	}
}
