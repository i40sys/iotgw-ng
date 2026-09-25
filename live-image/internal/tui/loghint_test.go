package tui

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/i40sys/iotgw-ng/live-image/internal/platform"
)

// The dashboard tests expect a gateway without rsyslog (logread) regardless
// of the machine running them.
func init() { platform.RsyslogdPath = "/nonexistent/rsyslogd" }

func TestLogHintFollowsRsyslog(t *testing.T) {
	defer func() { platform.RsyslogdPath = "/nonexistent/rsyslogd" }()
	m := owrtModel(false)
	if h := m.logHint(); h != "logread -e iotgw" {
		t.Errorf("without rsyslog: %q", h)
	}
	fake := filepath.Join(t.TempDir(), "rsyslogd")
	_ = os.WriteFile(fake, nil, 0o755)
	platform.RsyslogdPath = fake
	if h := m.logHint(); !strings.Contains(h, "/var/log/messages") {
		t.Errorf("with rsyslog: %q", h)
	}
	m.showDetails = true
	if d := m.body(); !strings.Contains(d, "/var/log/messages") {
		t.Errorf("Details does not point at /var/log/messages")
	}
}
