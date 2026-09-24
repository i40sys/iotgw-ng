// Package uci reads and writes OpenWRT's Unified Configuration Interface
// through the `uci` CLI — the only supported way to change what netifd,
// dnsmasq and friends will apply (decision-032 §2: never edit files OpenWRT
// regenerates). A Runner seam lets tests fake the CLI.
package uci

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/i40sys/iotgw-ng/live-image/internal/sysexec"
)

// Runner executes the uci binary.
type Runner func(ctx context.Context, args ...string) (string, error)

// ExecRunner runs the real `uci`.
func ExecRunner(ctx context.Context, args ...string) (string, error) {
	res, err := sysexec.Run(ctx, 10*time.Second, "uci", args...)
	return res.Stdout, err
}

// Client talks to one UCI instance.
type Client struct {
	Run Runner
	// ConfigDir is where committed configs live (/etc/config).
	ConfigDir string
}

// New returns a client for the real system.
func New() *Client { return &Client{Run: ExecRunner, ConfigDir: "/etc/config"} }

// Section is one config section as `uci show` prints it.
type Section struct {
	Name    string // "wan"; anonymous sections get their cfgXXXXXX id (uci -X)
	Type    string
	Options map[string][]string
}

// Get returns the first value of an option ("" when unset).
func (s Section) Get(opt string) string {
	if v := s.Options[opt]; len(v) > 0 {
		return v[0]
	}
	return ""
}

// Show parses `uci -X show <config>` (-X names anonymous sections by their
// cfgXXXXXX id, so every section is addressable).
func (c *Client) Show(ctx context.Context, config string) ([]Section, error) {
	out, err := c.Run(ctx, "-X", "show", config)
	if err != nil {
		return nil, err
	}
	return ParseShow(config, out), nil
}

// ParseShow parses `uci show` output for one config.
func ParseShow(config, out string) []Section {
	idx := map[string]int{}
	var secs []Section
	for _, line := range strings.Split(out, "\n") {
		key, val, ok := strings.Cut(strings.TrimSpace(line), "=")
		if !ok {
			continue
		}
		parts := strings.SplitN(key, ".", 3)
		if len(parts) < 2 || parts[0] != config {
			continue
		}
		name := parts[1]
		i, seen := idx[name]
		if !seen {
			secs = append(secs, Section{Name: name, Options: map[string][]string{}})
			i = len(secs) - 1
			idx[name] = i
		}
		if len(parts) == 2 {
			secs[i].Type = val
			continue
		}
		secs[i].Options[parts[2]] = unquote(val)
	}
	return secs
}

// unquote splits a uci show value: a quoted scalar, or several quoted
// values for a list. A quote inside a value is written as quote, backslash,
// quote, quote (shell style).
func unquote(v string) []string {
	var out []string
	var cur strings.Builder
	in := false
	for i := 0; i < len(v); i++ {
		ch := v[i]
		switch {
		case !in && ch == '\'':
			in = true
		case in && ch == '\'':
			// '\'' → a literal quote, stay in the value.
			if strings.HasPrefix(v[i:], `'\''`) {
				cur.WriteByte('\'')
				i += 3
				continue
			}
			in = false
			out = append(out, cur.String())
			cur.Reset()
		case in:
			cur.WriteByte(ch)
		case ch != ' ':
			// Unquoted scalar (older uci): take the rest of the token.
			j := strings.IndexByte(v[i:], ' ')
			if j < 0 {
				j = len(v) - i
			}
			out = append(out, v[i:i+j])
			i += j
		}
	}
	return out
}

// Get reads one option ("" when unset).
func (c *Client) Get(ctx context.Context, path string) string {
	out, err := c.Run(ctx, "-q", "get", path)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(out)
}

// Set sets an option or creates a named section (path "network.x=route").
func (c *Client) Set(ctx context.Context, path, value string) error {
	_, err := c.Run(ctx, "set", path+"="+value)
	return err
}

// Delete removes an option or a section; a missing one is not an error.
func (c *Client) Delete(ctx context.Context, path string) error {
	_, err := c.Run(ctx, "-q", "delete", path)
	if err != nil && strings.Contains(err.Error(), "exited 1") {
		// `uci -q delete` exits 1, silently, for a missing entry: already done.
		return nil
	}
	return err
}

// SetList replaces a list option with values.
func (c *Client) SetList(ctx context.Context, path string, values []string) error {
	if err := c.Delete(ctx, path); err != nil {
		return err
	}
	for _, v := range values {
		if _, err := c.Run(ctx, "add_list", path+"="+v); err != nil {
			return err
		}
	}
	return nil
}

// Commit writes staged changes of config to /etc/config.
func (c *Client) Commit(ctx context.Context, config string) error {
	_, err := c.Run(ctx, "commit", config)
	return err
}

// Revert drops staged (uncommitted) changes of config.
func (c *Client) Revert(ctx context.Context, config string) error {
	_, err := c.Run(ctx, "revert", config)
	return err
}

// Snapshot is a committed config file captured before a change.
type Snapshot struct {
	Config  string
	Content []byte
	Existed bool
}

// Take captures /etc/config/<config> as committed now.
func (c *Client) Take(config string) (Snapshot, error) {
	b, err := os.ReadFile(filepath.Join(c.ConfigDir, config))
	if os.IsNotExist(err) {
		return Snapshot{Config: config}, nil
	}
	if err != nil {
		return Snapshot{}, err
	}
	return Snapshot{Config: config, Content: b, Existed: true}, nil
}

// Restore puts a snapshot back (atomically) and drops staged changes.
func (c *Client) Restore(ctx context.Context, s Snapshot) error {
	_ = c.Revert(ctx, s.Config)
	path := filepath.Join(c.ConfigDir, s.Config)
	if !s.Existed {
		err := os.Remove(path)
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	tmp := path + ".iotgw-restore"
	if err := os.WriteFile(tmp, s.Content, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

// Diff is a short description of what changed between two snapshots' texts,
// for the event log ("" when identical).
func Diff(a, b Snapshot) string {
	if string(a.Content) == string(b.Content) {
		return ""
	}
	al := strings.Split(string(a.Content), "\n")
	bl := strings.Split(string(b.Content), "\n")
	seen := map[string]bool{}
	for _, l := range al {
		seen[strings.TrimSpace(l)] = true
	}
	var added []string
	for _, l := range bl {
		if t := strings.TrimSpace(l); t != "" && !seen[t] {
			added = append(added, t)
		}
	}
	sort.Strings(added)
	if len(added) > 6 {
		added = append(added[:6], fmt.Sprintf("… (+%d)", len(added)-6))
	}
	return strings.Join(added, "; ")
}
