// Package bootstrap is the boot-time provisioning of the live image
// (decision-031). It runs once per boot as root, performs each step, and
// records every outcome in the state document the dashboard reads:
//
//	identity → network → VPN fetch → VPN apply → SSH PKI fetch →
//	User CA install → host certificate → sshd
//
// VPN and SSH PKI are two independent API calls (`vpn` and `ssh-ca`) and two
// independent chains of steps: a failure in one never skips or fails the
// other. Every failure is recorded explicitly — nothing silently continues
// into a later, generic "Permission denied".
package bootstrap

import (
	"context"
	"fmt"
	"log"
	"net"
	"net/url"
	"regexp"
	"time"

	"github.com/i40sys/iotgw-ng/live-image/internal/cmdline"
	"github.com/i40sys/iotgw-ng/live-image/internal/state"
)

// DefaultAPIBase is the API gateway (Kong) the live image talks to when the
// kernel command line has no iotgw_api=<url>. Empty by default: deployments
// either pass iotgw_api= from their iPXE entry or bake a default in at build
// time (-ldflags "-X …/internal/bootstrap.DefaultAPIBase=<url>", see the
// justfile's API_BASE).
var DefaultAPIBase = ""

var (
	deviceIDRe = regexp.MustCompile(`^[A-Za-z0-9._-]{1,64}@[0-9a-fA-F]{8}$`)
	codeRe     = regexp.MustCompile(`^[0-9]{6}$`)
)

// Runner executes the bootstrap and persists its state after every change.
type Runner struct {
	StatePath string
	// CodeOverride replaces the one-time code from the kernel command line —
	// for a manual retry from the shell once the boot-time code has expired.
	CodeOverride string
	// Via is how the Internet is reached once the VPN is up (kernel command
	// line iotgw_internet=lan|vpn; default lan).
	Via  InternetVia
	st   *state.Bootstrap
	code string
	api  *apiClient
}

// NewRunner prepares a run that writes to statePath.
func NewRunner(statePath string) *Runner {
	return &Runner{StatePath: statePath, st: state.New(time.Now().UTC())}
}

func (r *Runner) save() {
	r.st.UpdatedAt = time.Now().UTC()
	if err := state.Write(r.StatePath, r.st); err != nil {
		log.Printf("cannot write state %s: %v", r.StatePath, err)
	}
}

func (r *Runner) begin(id string) {
	s := r.st.Step(id)
	s.Status, s.StartedAt, s.Message, s.Error = state.Running, time.Now().UTC(), "", ""
	r.save()
}

func (r *Runner) end(id string, status state.Status, msg string, err error) {
	s := r.st.Step(id)
	s.Status, s.Message, s.FinishedAt = status, msg, time.Now().UTC()
	if err != nil {
		s.Error = err.Error()
	}
	log.Printf("[%s] %s: %s %s", id, status, msg, s.Error)
	r.save()
}

func (r *Runner) skip(id string, status state.Status, why string) {
	s := r.st.Step(id)
	s.Status, s.Message = status, why
	log.Printf("[%s] %s: %s", id, status, why)
	r.save()
}

// Run performs the whole bootstrap. It always returns after recording every
// step, so the dashboard can explain any failure.
func (r *Runner) Run(ctx context.Context) {
	r.save()
	defer func() { r.st.Finished = true; r.save() }()

	if !r.identity() {
		for _, id := range []string{state.StepNetwork, state.StepVPNFetch, state.StepVPNApply, state.StepPKIFetch, state.StepUserCA, state.StepHostCert, state.StepSSHD} {
			r.skip(id, state.NotConfigured, "no device identity — boot the 'VPN test' menu entry and enter the device username and code")
		}
		return
	}
	netOK := r.network(ctx)

	// VPN chain.
	if conf, ok := r.vpnFetch(ctx, netOK); ok {
		r.vpnApply(ctx, conf)
	} else {
		r.skip(state.StepVPNApply, state.NotConfigured, "VPN configuration was not retrieved")
	}

	// SSH PKI chain — independent of the VPN outcome.
	if bundle, ok := r.pkiFetch(ctx, netOK); ok {
		userOK := r.installUserCA(bundle)
		certOK := r.installHostCert(bundle)
		r.configureSSHD(ctx, userOK, certOK)
	} else {
		why := "SSH CA configuration MISSING — SSH PKI fetch failed, certificate logins will be refused"
		r.skip(state.StepUserCA, state.NotConfigured, why)
		r.skip(state.StepHostCert, state.NotConfigured, why)
		r.skip(state.StepSSHD, state.NotConfigured, why)
	}
}

func (r *Runner) identity() bool {
	r.begin(state.StepIdentity)
	args, err := cmdline.Read()
	if err != nil {
		r.end(state.StepIdentity, state.Failed, "cannot read the kernel command line", err)
		return false
	}
	deviceID, code := args["device_id"], args["otp"]
	if r.CodeOverride != "" {
		code = r.CodeOverride
	}
	base := args["iotgw_api"]
	if base == "" {
		base = DefaultAPIBase
	}
	if base == "" {
		r.st.Identity = state.Identity{DeviceID: args["device_id"], HasCode: args["otp"] != ""}
		r.end(state.StepIdentity, state.Failed, "no API URL: add iotgw_api=<url> to the kernel command line (iPXE entry) or build with API_BASE", nil)
		return false
	}
	r.st.Identity = state.Identity{DeviceID: deviceID, HasCode: code != "", APIBase: base}
	switch {
	case deviceID == "":
		r.end(state.StepIdentity, state.Failed, "no device_id on the kernel command line", nil)
		return false
	case !deviceIDRe.MatchString(deviceID):
		r.end(state.StepIdentity, state.Failed, fmt.Sprintf("device_id %q is not <name>@<8-hex network prefix>", deviceID), nil)
		return false
	case !codeRe.MatchString(code):
		r.end(state.StepIdentity, state.Failed, "the one-time code (otp=) is missing or not 6 digits", nil)
		return false
	}
	if u, err := url.Parse(base); err != nil || u.Host == "" {
		r.end(state.StepIdentity, state.Failed, fmt.Sprintf("iotgw_api %q is not a URL", base), err)
		return false
	}
	via, err := ParseInternetVia(args["iotgw_internet"])
	if err != nil {
		r.end(state.StepIdentity, state.Failed, "bad iotgw_internet on the kernel command line", err)
		return false
	}
	r.Via = via
	r.code = code
	r.api = newAPIClient(base, deviceID, code)
	ensureHostsEntry()
	r.end(state.StepIdentity, state.Healthy, "device "+deviceID, nil)
	return true
}

// network waits for a default route and a TCP connection to the API.
func (r *Runner) network(ctx context.Context) bool {
	r.begin(state.StepNetwork)
	u, _ := url.Parse(r.st.Identity.APIBase)
	port := u.Port()
	if port == "" {
		port = "80"
		if u.Scheme == "https" {
			port = "443"
		}
	}
	hostPort := net.JoinHostPort(u.Hostname(), port)
	deadline := time.Now().Add(90 * time.Second)
	var lastErr error
	for time.Now().Before(deadline) {
		if err := ctx.Err(); err != nil {
			lastErr = err
			break
		}
		lastErr = probeAPI(ctx, hostPort)
		if lastErr == nil {
			r.end(state.StepNetwork, state.Healthy, "API reachable at "+hostPort, nil)
			return true
		}
		time.Sleep(3 * time.Second)
	}
	r.end(state.StepNetwork, state.Failed, "API "+hostPort+" not reachable after 90 s", lastErr)
	return false
}
