package cli

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/i40sys/iotgw-ng/live-image/internal/agent"
	"github.com/i40sys/iotgw-ng/live-image/internal/platform"
	"github.com/i40sys/iotgw-ng/live-image/internal/uci"
)

// The rpcd exec plugin (decision-032, LuCI): /usr/libexec/rpcd/iotgw runs
// `iotgw rpcd list` once when rpcd starts, then `iotgw rpcd call <method>`
// with the JSON arguments on stdin; the JSON it prints is the ubus reply.
// The browser reaches it as ubus object "iotgw" through uhttpd's /ubus
// JSON-RPC, gated by /usr/share/rpcd/acl.d/luci-app-iotgw.json.
//
// It reads the daemon's snapshot (the same backend as the console dashboard)
// and runs actions through the same code as the CLI. Actions that may take
// longer than rpcd's exec timeout (30 s) run as detached jobs: the call
// returns a job id and the page polls `job`.

// rpcdMethods is the `list` reply: method → argument signature.
var rpcdMethods = map[string]map[string]any{
	"status":      {},
	"refresh":     {},
	"set_policy":  {"policy": "str"},
	"hold":        {"enable": true, "reason": "str"},
	"vpn_refresh": {"otp": "str"},
	"ssh_refresh": {"otp": "str", "force": true},
	"job":         {"id": "str"},
}

// JobDir holds the output of background actions.
const JobDir = "/var/run/iotgw/jobs"

var (
	otpRe   = regexp.MustCompile(`^[0-9]{6}$`)
	jobIDRe = regexp.MustCompile(`^[0-9a-f]{12}$`)
)

func rpcdCmd(args []string) int {
	out := json.NewEncoder(os.Stdout)
	if len(args) == 0 || args[0] == "list" {
		_ = out.Encode(rpcdMethods)
		return 0
	}
	if args[0] != "call" || len(args) < 2 {
		fmt.Fprintln(os.Stderr, "usage: iotgw rpcd list | iotgw rpcd call <method>  (JSON arguments on stdin)")
		return 2
	}
	var in map[string]any
	if b, _ := io.ReadAll(io.LimitReader(os.Stdin, 64<<10)); len(strings.TrimSpace(string(b))) > 0 {
		if err := json.Unmarshal(b, &in); err != nil {
			_ = out.Encode(map[string]any{"error": "arguments are not a JSON object"})
			return 0
		}
	}
	res, err := rpcdCall(args[1], in)
	if err != nil {
		res = map[string]any{"error": err.Error()}
	}
	_ = out.Encode(res)
	return 0
}

func str(in map[string]any, k string) string {
	if v, ok := in[k].(string); ok {
		return strings.TrimSpace(v)
	}
	return ""
}

func boolean(in map[string]any, k string) bool {
	switch v := in[k].(type) {
	case bool:
		return v
	case string:
		return v == "1" || v == "true"
	case float64:
		return v != 0
	}
	return false
}

func rpcdCall(method string, in map[string]any) (map[string]any, error) {
	if !platform.IsOpenWRT() {
		return nil, errors.New("the iotgw rpcd plugin runs on the installed OpenWRT gateway")
	}
	switch method {
	case "status":
		snap, err := agent.ReadSnapshot(agent.SnapshotFile)
		if err != nil {
			return map[string]any{"available": false, "error": "no status yet: " + err.Error() + " (is the iotgw daemon running? /etc/init.d/iotgw start)"}, nil
		}
		return map[string]any{"available": true, "fresh": snap.Fresh(), "snapshot": snap, "jobs": recentJobs()}, nil

	case "refresh":
		if err := signalDaemon(); err != nil {
			return nil, err
		}
		return map[string]any{"ok": true}, nil

	case "set_policy":
		p, err := agent.ParsePolicy(str(in, "policy"))
		if err != nil || str(in, "policy") == "" {
			return nil, errors.New("policy must be auto, lan or vpn")
		}
		return startJob("internet "+string(p), "internet", string(p))

	case "hold":
		if boolean(in, "enable") {
			reason := str(in, "reason")
			if reason == "" {
				reason = "set from LuCI"
			}
			if err := agent.SetHold(ctxBG(), uci.New(), true, reason, time.Now()); err != nil {
				return nil, err
			}
		} else if err := agent.SetHold(ctxBG(), uci.New(), false, "", time.Now()); err != nil {
			return nil, err
		}
		_ = signalDaemon()
		return map[string]any{"ok": true, "hold": boolean(in, "enable")}, nil

	case "vpn_refresh", "ssh_refresh":
		args := []string{strings.TrimSuffix(method, "_refresh"), "refresh"}
		if otp := str(in, "otp"); otp != "" {
			if !otpRe.MatchString(otp) {
				return nil, errors.New("the one-time code must be 6 digits")
			}
			args = append(args, "-otp", otp)
		}
		if method == "ssh_refresh" && boolean(in, "force") {
			args = append(args, "-force")
		}
		return startJob(strings.Join(args[:2], " "), args...)

	case "job":
		return readJob(str(in, "id"))
	}
	return nil, fmt.Errorf("unknown method %q", method)
}

// signalDaemon asks the daemon for an immediate status round (SIGUSR1).
func signalDaemon() error {
	st, err := agent.ReadState(agent.StateFile)
	if err != nil || st.PID <= 0 {
		return errors.New("the iotgw daemon is not running")
	}
	if err := syscall.Kill(st.PID, syscall.SIGUSR1); err != nil {
		return fmt.Errorf("signal the iotgw daemon (pid %d): %w", st.PID, err)
	}
	return nil
}

// startJob runs `iotgw <args…>` detached (own session, so it outlives the
// rpcd call), output to JobDir/<id>.log, exit code to <id>.rc.
func startJob(title string, args ...string) (map[string]any, error) {
	if err := os.MkdirAll(JobDir, 0o700); err != nil {
		return nil, err
	}
	pruneJobs()
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	id := hex.EncodeToString(b)
	_ = os.WriteFile(filepath.Join(JobDir, id+".title"), []byte(title), 0o600)
	cmd := exec.Command(platform.Self(), append([]string{"rpcd-job", id}, args...)...)
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
	cmd.Stdin, cmd.Stdout, cmd.Stderr = nil, nil, nil
	if err := cmd.Start(); err != nil {
		return nil, err
	}
	_ = cmd.Process.Release()
	return map[string]any{"job": id, "title": title}, nil
}

// rpcdJobCmd is the detached job runner: `iotgw rpcd-job <id> <args…>`.
func rpcdJobCmd(args []string) int {
	if len(args) < 2 || !jobIDRe.MatchString(args[0]) {
		return 2
	}
	id := args[0]
	logf, err := os.OpenFile(filepath.Join(JobDir, id+".log"), os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o600)
	if err != nil {
		return 1
	}
	defer logf.Close()
	cmd := exec.Command(platform.Self(), args[1:]...)
	cmd.Stdout, cmd.Stderr = logf, logf
	rc := 0
	if err := cmd.Run(); err != nil {
		rc = 1
		var ee *exec.ExitError
		if errors.As(err, &ee) {
			rc = ee.ExitCode()
		}
	}
	_ = os.WriteFile(filepath.Join(JobDir, id+".rc"), []byte(strconv.Itoa(rc)), 0o600)
	_ = signalDaemon()
	return 0
}

func readJob(id string) (map[string]any, error) {
	if !jobIDRe.MatchString(id) {
		return nil, errors.New("bad job id")
	}
	title, _ := os.ReadFile(filepath.Join(JobDir, id+".title"))
	out, err := os.ReadFile(filepath.Join(JobDir, id+".log"))
	if err != nil && !os.IsNotExist(err) {
		return nil, err
	}
	res := map[string]any{"id": id, "title": string(title), "output": string(out), "running": true}
	if b, err := os.ReadFile(filepath.Join(JobDir, id+".rc")); err == nil {
		rc, _ := strconv.Atoi(strings.TrimSpace(string(b)))
		res["running"], res["rc"] = false, rc
	}
	return res, nil
}

// recentJobs lists the jobs of the last hour, newest first.
func recentJobs() []map[string]any {
	ents, _ := filepath.Glob(filepath.Join(JobDir, "*.title"))
	var out []map[string]any
	for _, e := range ents {
		fi, err := os.Stat(e)
		if err != nil || time.Since(fi.ModTime()) > time.Hour {
			continue
		}
		if j, err := readJob(strings.TrimSuffix(filepath.Base(e), ".title")); err == nil {
			j["started"] = fi.ModTime().UTC()
			out = append(out, j)
		}
	}
	for i := 0; i < len(out); i++ {
		for k := i + 1; k < len(out); k++ {
			if out[k]["started"].(time.Time).After(out[i]["started"].(time.Time)) {
				out[i], out[k] = out[k], out[i]
			}
		}
	}
	return out
}

// pruneJobs drops job files older than a day.
func pruneJobs() {
	ents, _ := filepath.Glob(filepath.Join(JobDir, "*"))
	for _, e := range ents {
		if fi, err := os.Stat(e); err == nil && time.Since(fi.ModTime()) > 24*time.Hour {
			_ = os.Remove(e)
		}
	}
}
