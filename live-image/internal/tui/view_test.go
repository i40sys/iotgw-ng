package tui

import (
	"strings"
	"testing"

	"github.com/charmbracelet/lipgloss"
)

// Long values must wrap under the value column, never under the label, and
// never exceed the panel's inner width.
func TestLayoutRowWraps(t *testing.T) {
	row := layoutRow(kv("Fingerprint", strings.Repeat("A", 70)), 40)
	for i, l := range strings.Split(row, "\n") {
		if w := lipgloss.Width(l); w > 40 {
			t.Fatalf("line %d is %d wide (> 40): %q", i, w, l)
		}
		if i > 0 && !strings.HasPrefix(l, strings.Repeat(" ", labelWidth)) {
			t.Fatalf("continuation line %d is not indented under the value column: %q", i, l)
		}
	}
}

// Every status must be understandable without colour.
func TestBadgesHaveText(t *testing.T) {
	for s, b := range badges {
		if !strings.Contains(b, string(s)) {
			t.Fatalf("badge for %s does not spell it out: %q", s, b)
		}
	}
}
