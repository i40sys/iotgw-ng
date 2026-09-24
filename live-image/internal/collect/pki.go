package collect

import (
	"context"
	"os"
	"slices"
	"strings"
	"time"

	"github.com/i40sys/iotgw-ng/live-image/internal/platform"
	"github.com/i40sys/iotgw-ng/live-image/internal/state"
	"github.com/i40sys/iotgw-ng/live-image/internal/sysexec"
)

// certInfo is the part of `ssh-keygen -L` we display.
type certInfo struct {
	KeyType    string
	SignedBy   string
	ValidTo    time.Time
	Principals []string
}

// parseCertListing parses `ssh-keygen -L -f <cert>` output.
func parseCertListing(out string) certInfo {
	var ci certInfo
	inPrincipals := false
	for _, raw := range strings.Split(out, "\n") {
		line := strings.TrimSpace(raw)
		switch {
		case strings.HasPrefix(line, "Type:"):
			ci.KeyType = strings.TrimSpace(strings.TrimPrefix(line, "Type:"))
			inPrincipals = false
		case strings.HasPrefix(line, "Signing CA:"):
			// "Signing CA: ECDSA SHA256:xxx (using ecdsa-sha2-nistp256)"
			for _, f := range strings.Fields(line) {
				if strings.HasPrefix(f, "SHA256:") {
					ci.SignedBy = f
				}
			}
		case strings.HasPrefix(line, "Valid:"):
			// "Valid: from 2026-09-23T09:08:13 to 2026-09-23T21:13:13"
			if i := strings.LastIndex(line, " to "); i >= 0 {
				if t, err := time.ParseInLocation("2006-01-02T15:04:05", strings.TrimSpace(line[i+4:]), time.Local); err == nil {
					ci.ValidTo = t
				}
			}
		case strings.HasPrefix(line, "Principals:"):
			inPrincipals = true
		case strings.HasSuffix(line, ":") || strings.Contains(line, ": "):
			inPrincipals = false
		case inPrincipals && line != "":
			ci.Principals = append(ci.Principals, line)
		}
	}
	return ci
}

func sshdEffective(ctx context.Context) (map[string]string, error) {
	res, err := sysexec.RunPrivileged(ctx, 8*time.Second, "sshd", "-T")
	if err != nil {
		return nil, err
	}
	m := map[string]string{}
	for _, l := range strings.Split(res.Stdout, "\n") {
		k, v, ok := strings.Cut(strings.TrimSpace(l), " ")
		if ok {
			m[strings.ToLower(k)] = v
		}
	}
	return m, nil
}

func fileExists(p string) bool {
	_, err := os.Stat(p)
	return p != "" && err == nil
}

// CollectPKI reports the SSH trust and the live host identity: what bootstrap
// received and installed, and what sshd is actually using right now.
func CollectPKI(ctx context.Context, doc *state.Bootstrap) PKI {
	p := PKI{
		UserCAStatus: state.Pending, HostCAStatus: state.Pending,
		HostIDStatus: state.Pending, SSHDStatus: state.Unknown,
		UserCAPath: "/etc/ssh/ssh-user-ca.pub", HostCertPath: "/etc/ssh/ssh_host_ecdsa_key-cert.pub",
	}
	fetch := state.Pending
	if doc != nil {
		if s := doc.Step(state.StepPKIFetch); s != nil {
			fetch = s.Status
			p.UserCARequested = s.Status != state.Pending && s.Status != state.NotConfigured
			p.UserCAReceived = s.Status == state.Healthy
		}
		pk := doc.PKI
		p.Zone, p.Domain, p.Principals = pk.Zone, pk.Domain, pk.Principals
		p.UserCAFPs, p.HostCAFPs, p.KnownHostsPath = pk.UserCAFPs, pk.HostCAFPs, pk.KnownHostsPath
		p.HostKeyFP, p.HostPrincipals, p.HostCertValidTo = pk.HostKeyFP, pk.HostPrincipals, pk.HostCertValidTo
		if pk.UserCAPath != "" {
			p.UserCAPath = pk.UserCAPath
		}
		if pk.HostCertPath != "" {
			p.HostCertPath = pk.HostCertPath
		}
	}

	eff, effErr := sshdEffective(ctx)
	p.SSHDActive = platform.SSHDActive(ctx)
	if eff != nil {
		p.UserCATrusted = eff["trustedusercakeys"] == p.UserCAPath
		p.HostCertActive = strings.Contains(eff["hostcertificate"], p.HostCertPath)
	}

	// User CA.
	p.UserCAInstalled = fileExists(p.UserCAPath)
	switch {
	case fetch == state.Failed:
		p.UserCAStatus, p.UserCADetail = state.Failed, "SSH CA configuration MISSING — the ssh-ca request failed"
	case fetch == state.Pending || fetch == state.Running:
		p.UserCAStatus, p.UserCADetail = state.Pending, "waiting for bootstrap"
	case !p.UserCAInstalled:
		p.UserCAStatus, p.UserCADetail = state.NotConfigured, "no User CA installed"
	case eff == nil:
		p.UserCAStatus, p.UserCADetail = state.Unknown, "cannot read sshd config: "+errText(effErr)
	case !p.UserCATrusted:
		p.UserCAStatus, p.UserCADetail = state.Failed, "installed, but sshd does not trust it (TrustedUserCAKeys)"
	default:
		p.UserCAStatus = state.Healthy
	}

	// Host identity: a signed certificate for THIS machine's host key.
	if b, err := os.ReadFile("/etc/ssh/ssh_host_ecdsa_key.pub"); err == nil {
		if f := strings.Fields(string(b)); len(f) > 0 {
			p.HostKeyType = f[0]
		}
	}
	p.HostCertPresent = fileExists(p.HostCertPath)
	if p.HostCertPresent {
		if res, err := sysexec.Run(ctx, 5*time.Second, "ssh-keygen", "-L", "-f", p.HostCertPath); err == nil {
			ci := parseCertListing(res.Stdout)
			p.HostCertSignedBy = ci.SignedBy
			if len(ci.Principals) > 0 {
				p.HostPrincipals = ci.Principals
			}
			if !ci.ValidTo.IsZero() {
				p.HostCertValidTo = ci.ValidTo
			}
		}
	}
	evalHostCA(ctx, &p, fetch)

	switch {
	case fetch == state.Pending || fetch == state.Running:
		p.HostIDStatus, p.HostIDDetail = state.Pending, "waiting for bootstrap"
	case !p.HostCertPresent && platform.IsOpenWRT():
		// A fresh install is not enrolled until provisioning: a normal state.
		p.HostIDStatus, p.HostIDDetail = state.NotConfigured, "not enrolled yet — run the provisioning deployment, or `iotgw ssh refresh`"
	case !p.HostCertPresent:
		p.HostIDStatus, p.HostIDDetail = state.Failed, "no host certificate — this machine has no signed SSH host identity (host key is TOFU)"
	case !p.HostCertValidTo.IsZero() && time.Now().After(p.HostCertValidTo):
		p.HostIDStatus, p.HostIDDetail = state.Failed, "host certificate EXPIRED"
	case eff != nil && !p.HostCertActive:
		p.HostIDStatus, p.HostIDDetail = state.Failed, "certificate present but sshd is not serving it (HostCertificate)"
	case !p.HostCertValidTo.IsZero() && time.Until(p.HostCertValidTo) < time.Hour:
		p.HostIDStatus, p.HostIDDetail = state.Warning, "host certificate expires in under an hour"
	default:
		p.HostIDStatus = state.Healthy
	}

	// sshd itself.
	switch {
	case !p.SSHDActive:
		p.SSHDStatus, p.SSHDDetail = state.Failed, "sshd is not running"
	case eff == nil:
		p.SSHDStatus, p.SSHDDetail = state.Unknown, "cannot read sshd -T: "+errText(effErr)
	case p.UserCATrusted && p.HostCertActive:
		p.SSHDStatus = state.Healthy
	case p.UserCATrusted || p.HostCertActive:
		p.SSHDStatus, p.SSHDDetail = state.Warning, "running with partial SSH PKI configuration"
	default:
		p.SSHDStatus, p.SSHDDetail = state.NotConfigured, "running without SSH CA trust (break-glass keys only)"
	}
	return p
}

func errText(err error) string {
	if err == nil {
		return "unknown error"
	}
	return err.Error()
}

// CollectBootstrap reads the provisioning record and the service state
// (live image only: an installed gateway has no boot-time provisioning).
func CollectBootstrap(ctx context.Context) Bootstrap {
	var b Bootstrap
	if platform.IsOpenWRT() {
		return b
	}
	doc, err := state.Read(state.File)
	if err != nil && err != state.ErrNotStarted {
		b.Err = err.Error()
	}
	b.Doc = doc
	if res, err := sysexec.Run(ctx, 3*time.Second, "systemctl", "is-active", "iotgw-bootstrap"); err == nil || res.Stdout != "" {
		b.ServiceState = strings.TrimSpace(res.Stdout)
	}
	return b
}

// HostCAFile is where the installed gateway keeps the domain's Host CA
// (written by `iotgw ssh refresh` / the Ansible ssh_ca task).
const HostCAFile = "/etc/ssh/ssh-host-ca.pub"

// evalHostCA checks the Host CA for real: this machine's host certificate
// must be signed by (one of) the domain's Host CA key(s) — the check a client
// with `@cert-authority` makes when it connects. A certificate signed by
// another CA (e.g. after a CA rotation that this gateway missed) is FAILED.
func evalHostCA(ctx context.Context, p *PKI, fetch Status) {
	if fileExists(HostCAFile) {
		if fps, err := keyFingerprints(ctx, HostCAFile); err == nil {
			p.HostCAFPs = fps
		}
	}
	switch {
	case len(p.HostCAFPs) == 0 && fetch == state.Failed:
		p.HostCAStatus, p.HostCADetail = state.Failed, "SSH CA configuration MISSING"
	case len(p.HostCAFPs) == 0 && (fetch == state.Pending || fetch == state.Running):
		p.HostCAStatus = state.Pending
	case len(p.HostCAFPs) == 0:
		p.HostCAStatus, p.HostCADetail = state.NotConfigured, "no Host CA installed — `iotgw ssh refresh` fetches it"
	case !p.HostCertPresent || p.HostCertSignedBy == "":
		p.HostCAStatus, p.HostCADetail = state.NotTested, "Host CA installed, but there is no host certificate to check against it"
	case slices.Contains(p.HostCAFPs, p.HostCertSignedBy):
		p.HostCAStatus, p.HostCADetail = state.Healthy, "this machine's host certificate is signed by the domain's Host CA"
	default:
		p.HostCAStatus, p.HostCADetail = state.Failed, "host certificate signed by "+p.HostCertSignedBy+", NOT by the domain's Host CA — clients will reject it; run `iotgw ssh refresh -force`"
	}
}

// keyFingerprints returns the SHA256 fingerprints of the keys in path.
func keyFingerprints(ctx context.Context, path string) ([]string, error) {
	res, err := sysexec.Run(ctx, 5*time.Second, "ssh-keygen", "-lf", path)
	if err != nil {
		return nil, err
	}
	var fps []string
	for _, l := range strings.Split(strings.TrimSpace(res.Stdout), "\n") {
		if f := strings.Fields(l); len(f) >= 2 {
			fps = append(fps, f[1])
		}
	}
	return fps, nil
}
