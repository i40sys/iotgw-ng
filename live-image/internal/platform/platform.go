// Package platform tells the live image (Debian, systemd, decision-031) from
// an installed OpenWRT gateway (procd, UCI, BusyBox, decision-032) and hides
// the few system operations whose mechanics differ between the two: service
// state, sshd reload/restart, and where the tool's files live.
package platform

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/i40sys/iotgw-ng/live-image/internal/sysexec"
)

// Kind is the system the binary is running on.
type Kind string

const (
	LiveImage Kind = "live-image"
	OpenWRT   Kind = "openwrt"
)

// openwrtRelease exists on every OpenWRT system.
const openwrtRelease = "/etc/openwrt_release"

// Override forces the platform (tests, or IOTGW_PLATFORM=openwrt|live-image).
var Override Kind

// Detect returns the platform the binary runs on.
func Detect() Kind {
	if Override != "" {
		return Override
	}
	switch Kind(os.Getenv("IOTGW_PLATFORM")) {
	case OpenWRT:
		return OpenWRT
	case LiveImage:
		return LiveImage
	}
	if _, err := os.Stat(openwrtRelease); err == nil {
		return OpenWRT
	}
	return LiveImage
}

// IsOpenWRT is shorthand for Detect() == OpenWRT.
func IsOpenWRT() bool { return Detect() == OpenWRT }

// Release is a one-line description of the installed OS (OpenWRT's
// DISTRIB_DESCRIPTION), or "" when unknown.
func Release() string {
	b, err := os.ReadFile(openwrtRelease)
	if err != nil {
		return ""
	}
	for _, l := range strings.Split(string(b), "\n") {
		if v, ok := strings.CutPrefix(l, "DISTRIB_DESCRIPTION="); ok {
			return strings.Trim(v, `'"`)
		}
	}
	return ""
}

// ProcRunning reports whether a process whose command name (comm) is name is
// running. It reads /proc directly: OpenWRT has no pgrep/systemctl guarantee.
func ProcRunning(name string) bool {
	entries, err := os.ReadDir("/proc")
	if err != nil {
		return false
	}
	for _, e := range entries {
		if e.Name()[0] < '0' || e.Name()[0] > '9' {
			continue
		}
		b, err := os.ReadFile(filepath.Join("/proc", e.Name(), "comm"))
		if err == nil && strings.TrimSpace(string(b)) == name {
			return true
		}
	}
	return false
}

// SSHDActive reports whether the SSH daemon is running.
func SSHDActive(ctx context.Context) bool {
	if IsOpenWRT() {
		return ProcRunning("sshd")
	}
	res, err := sysexec.Run(ctx, 3*time.Second, "systemctl", "is-active", "ssh")
	return err == nil && strings.TrimSpace(res.Stdout) == "active"
}

// ReloadSSHD asks sshd to re-read its configuration (SIGHUP semantics; open
// sessions survive).
func ReloadSSHD(ctx context.Context) error {
	if IsOpenWRT() {
		_, err := sysexec.Run(ctx, 20*time.Second, "/etc/init.d/sshd", "reload")
		return err
	}
	_, err := sysexec.Run(ctx, 20*time.Second, "systemctl", "reload-or-restart", "ssh")
	return err
}

// RestartSSHD restarts sshd — the fallback when a reload did not take.
func RestartSSHD(ctx context.Context) error {
	if IsOpenWRT() {
		_, err := sysexec.Run(ctx, 30*time.Second, "/etc/init.d/sshd", "restart")
		return err
	}
	_, err := sysexec.Run(ctx, 30*time.Second, "systemctl", "restart", "ssh")
	return err
}

// Self is the path of the running binary, for re-invoking a subcommand
// (the dashboard runs `iotgw internet …` this way).
func Self() string {
	if p, err := os.Executable(); err == nil {
		return p
	}
	return "iotgw"
}

// RsyslogdPath is rsyslog's daemon: the provisioning installs rsyslog on the
// gateway, after which the system log is /var/log/messages rather than the
// logread ring buffer (task-137). A var for tests.
var RsyslogdPath = "/usr/sbin/rsyslogd"

// LogHint is the command that shows the tool's system log on this platform:
// journalctl on the live image; on OpenWRT logread, or /var/log/messages
// once rsyslog is installed.
func LogHint(k Kind) string {
	if k != OpenWRT {
		return "journalctl -t iotgw -t iotgw-bootstrap"
	}
	if _, err := os.Stat(RsyslogdPath); err == nil {
		return "grep iotgw /var/log/messages"
	}
	return "logread -e iotgw"
}
