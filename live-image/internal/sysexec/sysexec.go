// Package sysexec runs system commands safely: explicit argv (never a shell
// string), a mandatory timeout, and bounded output.
package sysexec

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strings"
	"time"
)

// MaxOutput caps captured stdout/stderr per command.
const MaxOutput = 1 << 20

type capped struct {
	buf bytes.Buffer
}

func (c *capped) Write(p []byte) (int, error) {
	if room := MaxOutput - c.buf.Len(); room > 0 {
		if len(p) > room {
			c.buf.Write(p[:room])
		} else {
			c.buf.Write(p)
		}
	}
	return len(p), nil
}

// Result is a finished command.
type Result struct {
	Stdout   string
	Stderr   string
	ExitCode int
}

// LineFunc receives one output line as the command produces it (stderr
// tells which stream). It may be called from two goroutines at once.
type LineFunc func(stderr bool, line string)

// lines passes every complete line written to it to fn, and flushes a last
// unterminated line on close.
type lines struct {
	stderr  bool
	fn      LineFunc
	pending []byte
}

func (l *lines) Write(p []byte) (int, error) {
	l.pending = append(l.pending, p...)
	for {
		i := bytes.IndexByte(l.pending, '\n')
		if i < 0 {
			break
		}
		l.fn(l.stderr, strings.TrimRight(string(l.pending[:i]), "\r"))
		l.pending = l.pending[i+1:]
	}
	return len(p), nil
}

func (l *lines) close() {
	if len(l.pending) > 0 {
		l.fn(l.stderr, string(l.pending))
		l.pending = nil
	}
}

// Run executes name with args, killing it after timeout. A non-zero exit is
// returned as an error that includes the (trimmed) stderr.
func Run(ctx context.Context, timeout time.Duration, name string, args ...string) (Result, error) {
	return run(ctx, timeout, nil, name, args...)
}

// RunStream is Run that also hands every output line to onLine as soon as it
// is written, so a long action can be followed while it runs.
func RunStream(ctx context.Context, timeout time.Duration, onLine LineFunc, name string, args ...string) (Result, error) {
	return run(ctx, timeout, onLine, name, args...)
}

func run(ctx context.Context, timeout time.Duration, onLine LineFunc, name string, args ...string) (Result, error) {
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, name, args...)
	cmd.Env = append(os.Environ(), "LC_ALL=C")
	var out, errb capped
	cmd.Stdout, cmd.Stderr = &out, &errb
	if onLine != nil {
		lo, le := &lines{fn: onLine}, &lines{stderr: true, fn: onLine}
		defer lo.close()
		defer le.close()
		cmd.Stdout, cmd.Stderr = io.MultiWriter(&out, lo), io.MultiWriter(&errb, le)
	}
	err := cmd.Run()
	res := Result{Stdout: out.buf.String(), Stderr: errb.buf.String()}
	if cmd.ProcessState != nil {
		res.ExitCode = cmd.ProcessState.ExitCode()
	}
	if ctx.Err() == context.DeadlineExceeded {
		return res, fmt.Errorf("%s: timed out after %s", name, timeout)
	}
	if err != nil {
		var ee *exec.ExitError
		if errors.As(err, &ee) {
			msg := strings.TrimSpace(res.Stderr)
			if msg == "" {
				msg = strings.TrimSpace(res.Stdout)
			}
			if len(msg) > 300 {
				msg = msg[:300] + "…"
			}
			return res, fmt.Errorf("%s exited %d: %s", name, res.ExitCode, msg)
		}
		return res, fmt.Errorf("%s: %w", name, err)
	}
	return res, nil
}

// RunPrivileged runs a read-only diagnostic that needs root (wg show,
// sshd -T). As root it runs directly; otherwise through non-interactive sudo,
// which the live image grants its console user. It never prompts.
func RunPrivileged(ctx context.Context, timeout time.Duration, name string, args ...string) (Result, error) {
	return RunPrivilegedStream(ctx, timeout, nil, name, args...)
}

// RunPrivilegedStream is RunPrivileged with RunStream's line callback.
func RunPrivilegedStream(ctx context.Context, timeout time.Duration, onLine LineFunc, name string, args ...string) (Result, error) {
	if os.Geteuid() == 0 {
		return run(ctx, timeout, onLine, name, args...)
	}
	return run(ctx, timeout, onLine, "sudo", append([]string{"-n", name}, args...)...)
}
