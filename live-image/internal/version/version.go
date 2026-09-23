// Package version carries build metadata injected with -ldflags at build time
// (see live-image/build.sh). The defaults identify an unreleased local build.
package version

import (
	"os"
	"strings"
)

var (
	// Version is the iotgw-live tooling version (git describe).
	Version = "dev"
	// Commit is the git commit the binaries were built from.
	Commit = "unknown"
	// BuildDate is the UTC build timestamp (RFC 3339).
	BuildDate = "unknown"
)

// ReleaseFile is written into the image by the build and names the live image.
const ReleaseFile = "/etc/iotgw-live-release"

// ImageRelease returns the live-image release string (first line of
// ReleaseFile), or "unknown" when the file is missing.
func ImageRelease() string {
	b, err := os.ReadFile(ReleaseFile)
	if err != nil {
		return "unknown"
	}
	line, _, _ := strings.Cut(strings.TrimSpace(string(b)), "\n")
	if line == "" {
		return "unknown"
	}
	return line
}

// String is the one-line tool version.
func String() string { return Version + " (" + Commit + ", " + BuildDate + ")" }
