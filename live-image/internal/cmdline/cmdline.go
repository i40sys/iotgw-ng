// Package cmdline reads the kernel command line, where iPXE puts the device
// identity the operator typed (device_id=, otp=) and optional overrides.
package cmdline

import (
	"os"
	"strings"
)

// Path is the kernel command line.
const Path = "/proc/cmdline"

// Parse splits a command line into key=value pairs (flags map to "").
func Parse(line string) map[string]string {
	out := map[string]string{}
	for _, f := range strings.Fields(line) {
		k, v, _ := strings.Cut(f, "=")
		out[k] = v
	}
	return out
}

// Read parses /proc/cmdline.
func Read() (map[string]string, error) {
	b, err := os.ReadFile(Path)
	if err != nil {
		return nil, err
	}
	return Parse(string(b)), nil
}
