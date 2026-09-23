package collect

import (
	"context"
	"os"
	"strings"
	"time"

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
	if res, err := sysexec.Run(ctx, 3*time.Second, "systemctl", "is-active", "ssh"); err == nil {
		p.SSHDActive = strings.TrimSpace(res.Stdout) == "active"
	}
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

	// Host CA (trust for verifying OTHER hosts — not this machine's identity).
	switch {
	case len(p.HostCAFPs) > 0 && fileExists(p.KnownHostsPath):
		p.HostCAStatus, p.HostCADetail = state.Healthy, "@cert-authority in "+p.KnownHostsPath
	case fetch == state.Failed:
		p.HostCAStatus, p.HostCADetail = state.Failed, "SSH CA configuration MISSING"
	case fetch == state.Pending || fetch == state.Running:
		p.HostCAStatus = state.Pending
	default:
		p.HostCAStatus, p.HostCADetail = state.NotConfigured, "no Host CA received"
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
	switch {
	case fetch == state.Pending || fetch == state.Running:
		p.HostIDStatus, p.HostIDDetail = state.Pending, "waiting for bootstrap"
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
		p.SSHDStatus, p.SSHDDetail = state.Failed, "ssh.service is not active"
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

// CollectBootstrap reads the provisioning record and the service state.
func CollectBootstrap(ctx context.Context) Bootstrap {
	var b Bootstrap
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
