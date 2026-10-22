package tui

import (
	"testing"
	"time"

	tea "github.com/charmbracelet/bubbletea"
)

func update(m Model, msg tea.Msg) (Model, tea.Cmd) {
	next, cmd := m.Update(msg)
	return next.(Model), cmd
}

func TestRepaintReplaysTheTerminalSize(t *testing.T) {
	m := owrtModel(false)
	if m.repaintNow() != nil {
		t.Fatal("repaint before the first size: nothing to replay")
	}
	// A serial console reporting 0x0 gets the 80x24 fallback for the layout,
	// but the replayed size must stay what the terminal said.
	m, _ = update(m, tea.WindowSizeMsg{Width: 0, Height: 0})
	if m.width != 80 || m.height != 24 {
		t.Fatalf("fallback layout size %dx%d", m.width, m.height)
	}
	m, _ = update(m, tea.WindowSizeMsg{Width: 240, Height: 67})
	msg := m.repaintNow()()
	if ws, ok := msg.(tea.WindowSizeMsg); !ok || ws.Width != 240 || ws.Height != 67 {
		t.Fatalf("repaint sends %#v, want the terminal's 240x67", msg)
	}
	// Replaying it keeps the layout (and the scroll position) as it was.
	m.vp.SetContent(m.body())
	m.vp.ScrollDown(3)
	off := m.vp.YOffset
	m, _ = update(m, msg)
	if m.width != 240 || m.height != 67 || m.vp.YOffset != off {
		t.Fatalf("repaint changed the layout: %dx%d offset %d (was %d)", m.width, m.height, m.vp.YOffset, off)
	}
}

func TestRepaintIsFastDuringAndJustAfterAnAction(t *testing.T) {
	m := owrtModel(false)
	now := time.Now()
	if d := m.nextRepaint(now); d != repaintInterval {
		t.Fatalf("idle interval %v", d)
	}
	m.action = &action{started: now}
	if d := m.nextRepaint(now); d != repaintActionInterval {
		t.Fatalf("running action interval %v", d)
	}
	m.action.ended = now.Add(-repaintActionTail / 2)
	if d := m.nextRepaint(now); d != repaintActionInterval {
		t.Fatalf("just-ended action interval %v", d)
	}
	m.action.ended = now.Add(-2 * repaintActionTail)
	if d := m.nextRepaint(now); d != repaintInterval {
		t.Fatalf("long-ended action interval %v", d)
	}
}

func TestActionStartBeginsANewRepaintChain(t *testing.T) {
	m := owrtModel(false)
	m, _ = update(m, tea.WindowSizeMsg{Width: 120, Height: 40})
	gen := m.repaintGen
	m, cmd := update(m, actionStartMsg{title: "VPN refresh", cmdline: "iotgw vpn refresh", ch: make(chan tea.Msg)})
	if m.repaintGen != gen+1 || cmd == nil {
		t.Fatalf("action start: gen %d (was %d), cmd %v", m.repaintGen, gen, cmd)
	}
	// A tick of the previous chain is dropped (no repaint, no re-arming)…
	if _, cmd := update(m, repaintTickMsg{gen: gen}); cmd != nil {
		t.Fatal("a stale repaint tick re-armed its chain")
	}
	// …the current chain repaints and re-arms.
	if _, cmd := update(m, repaintTickMsg{gen: m.repaintGen}); cmd == nil {
		t.Fatal("the current repaint tick did nothing")
	}
}
