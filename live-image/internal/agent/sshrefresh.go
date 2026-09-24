package agent

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/i40sys/iotgw-ng/live-image/internal/devapi"
	"github.com/i40sys/iotgw-ng/live-image/internal/platform"
	"github.com/i40sys/iotgw-ng/live-image/internal/sysexec"
)

// The installed gateway's SSH-CA files — exactly the set the Ansible ssh_ca
// task (iotgw-kestra tasks/ssh_ca.yaml) writes, so either can renew what the
// other enrolled.
const (
	sshHostKey      = "/etc/ssh/ssh_host_ecdsa_key"
	sshHostCert     = "/etc/ssh/ssh_host_ecdsa_key-cert.pub"
	sshUserCA       = "/etc/ssh/ssh-user-ca.pub"
	sshHostCA       = "/etc/ssh/ssh-host-ca.pub" // = collect.HostCAFile
	sshKnownHosts   = "/etc/ssh/ssh_known_hosts"
	sshPrincipals   = "/etc/ssh/auth_principals/root"
	sshRevokedKeys  = "/etc/ssh/revoked_keys"
	sshBreakGlass   = "/etc/ssh/sshd_config.d/50-iotgw-authorized-keys.conf"
	sshCADropIn     = "/etc/ssh/sshd_config.d/60-iotgw-ssh-ca.conf"
	sshdConfig      = "/etc/ssh/sshd_config"
	sshIncludeLine  = "Include /etc/ssh/sshd_config.d/*.conf"
	sshRenewMargin  = 30 * 24 * time.Hour
	sshReenrollNS   = "iotgw-reenroll"
	sshdVerifyWait  = 2 * time.Second
	sshdVerifyTries = 5
)

const breakGlassDropIn = "AuthorizedKeysFile .ssh/authorized_keys\n"

const caDropIn = "HostKey " + sshHostKey + "\n" +
	"HostCertificate " + sshHostCert + "\n" +
	"TrustedUserCAKeys " + sshUserCA + "\n" +
	"AuthorizedPrincipalsFile /etc/ssh/auth_principals/%u\n" +
	"RevokedKeys " + sshRevokedKeys + "\n"

// enrollReply is the part of the ssh-ca `enroll` reply the gateway installs.
type enrollReply struct {
	Zone                string   `json:"zone"`
	Domain              string   `json:"domain"`
	FQDN                string   `json:"fqdn"`
	AuthPrincipals      string   `json:"auth_principals"`
	UserCA              string   `json:"user_ca"`
	HostCA              string   `json:"host_ca"`
	CertAuthority       string   `json:"cert_authority"`
	HostCert            string   `json:"host_cert"`
	HostCertValidBefore string   `json:"host_cert_valid_before"`
	Warnings            []string `json:"warnings"`
}

// fileSnap is one file's content before a change (absent when !Existed).
type fileSnap struct {
	Path    string
	Content []byte
	Mode    os.FileMode
	Existed bool
}

func snapFiles(paths ...string) []fileSnap {
	var out []fileSnap
	for _, p := range paths {
		fi, err := os.Stat(p)
		if err != nil {
			out = append(out, fileSnap{Path: p})
			continue
		}
		b, err := os.ReadFile(p)
		if err != nil {
			out = append(out, fileSnap{Path: p})
			continue
		}
		out = append(out, fileSnap{Path: p, Content: b, Mode: fi.Mode().Perm(), Existed: true})
	}
	return out
}

func restoreFiles(snaps []fileSnap) error {
	var errs []error
	for _, s := range snaps {
		if !s.Existed {
			if err := os.Remove(s.Path); err != nil && !os.IsNotExist(err) {
				errs = append(errs, err)
			}
			continue
		}
		if err := writeAtomic(s.Path, s.Content, s.Mode); err != nil {
			errs = append(errs, err)
		}
	}
	return errors.Join(errs...)
}

func writeAtomic(path string, content []byte, mode os.FileMode) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	tmp := path + ".iotgw-tmp"
	if err := os.WriteFile(tmp, content, mode); err != nil {
		return err
	}
	if err := os.Chmod(tmp, mode); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

func withNL(s string) []byte {
	if !strings.HasSuffix(s, "\n") {
		s += "\n"
	}
	return []byte(s)
}

// ensureHostKey creates the ECDSA P-256 host key (the private half never
// leaves the gateway) and returns its public line.
func ensureHostKey(ctx context.Context) (string, error) {
	if _, err := os.Stat(sshHostKey); err != nil {
		if _, err := sysexec.Run(ctx, 20*time.Second, "ssh-keygen", "-q", "-t", "ecdsa", "-b", "256", "-N", "", "-f", sshHostKey); err != nil {
			return "", err
		}
	}
	b, err := os.ReadFile(sshHostKey + ".pub")
	return strings.TrimSpace(string(b)), err
}

// needsRenewal decides whether the installed certificate should be replaced:
// missing, for another key, or expiring within the margin.
func needsRenewal(ctx context.Context) (bool, string) {
	if _, err := os.Stat(sshHostCert); err != nil {
		return true, "no host certificate installed"
	}
	res, err := sysexec.Run(ctx, 5*time.Second, "ssh-keygen", "-L", "-f", sshHostCert)
	if err != nil {
		return true, "the installed certificate does not parse"
	}
	hostFP, _ := keyFingerprint(ctx, sshHostKey+".pub")
	var certFP, validTo string
	for _, l := range strings.Split(res.Stdout, "\n") {
		l = strings.TrimSpace(l)
		if v, ok := strings.CutPrefix(l, "Public key:"); ok {
			for _, f := range strings.Fields(v) {
				if strings.HasPrefix(f, "SHA256:") {
					certFP = f
				}
			}
		}
		if strings.HasPrefix(l, "Valid:") {
			if i := strings.LastIndex(l, " to "); i >= 0 {
				validTo = strings.TrimSpace(l[i+4:])
			}
		}
	}
	if hostFP == "" || certFP != hostFP {
		return true, "the certificate is for another host key"
	}
	if t, err := time.ParseInLocation("2006-01-02T15:04:05", validTo, time.Local); err == nil {
		if left := time.Until(t); left < sshRenewMargin {
			return true, fmt.Sprintf("the certificate expires in %s", left.Round(time.Hour))
		}
		return false, "valid until " + t.Format("2006-01-02")
	}
	if validTo == "forever" {
		return false, "valid forever"
	}
	return true, "cannot read the certificate's validity"
}

func keyFingerprint(ctx context.Context, path string) (string, error) {
	res, err := sysexec.Run(ctx, 5*time.Second, "ssh-keygen", "-lf", path)
	if err != nil {
		return "", err
	}
	if f := strings.Fields(res.Stdout); len(f) >= 2 {
		return f[1], nil
	}
	return "", errors.New("no fingerprint")
}

// continuitySig signs `<device_id>\n<host_pubkey type+key>\n<code>` with the
// CURRENT host key (task-075), proving the re-enroll is a continuation.
func continuitySig(ctx context.Context, deviceID, hostPub, code string) (string, error) {
	f := strings.Fields(hostPub)
	if len(f) < 2 {
		return "", errors.New("bad host public key")
	}
	dir, err := os.MkdirTemp("", "iotgw-reenroll-")
	if err != nil {
		return "", err
	}
	defer os.RemoveAll(dir)
	msg := filepath.Join(dir, "challenge")
	if err := os.WriteFile(msg, []byte(deviceID+"\n"+f[0]+" "+f[1]+"\n"+code), 0o600); err != nil {
		return "", err
	}
	if _, err := sysexec.Run(ctx, 10*time.Second, "ssh-keygen", "-Y", "sign", "-f", sshHostKey, "-n", sshReenrollNS, msg); err != nil {
		return "", err
	}
	b, err := os.ReadFile(msg + ".sig")
	return string(b), err
}

// sshdServing checks sshd is running, answering on its port, and using the
// host certificate and the User CA.
func sshdServing(ctx context.Context) error {
	if !platform.SSHDActive(ctx) {
		return errors.New("sshd is not running")
	}
	res, err := sysexec.Run(ctx, 10*time.Second, "sshd", "-T")
	if err != nil {
		return fmt.Errorf("sshd -T: %w", err)
	}
	eff := strings.ToLower(res.Stdout)
	port := "22"
	for _, l := range strings.Split(eff, "\n") {
		if v, ok := strings.CutPrefix(l, "port "); ok {
			port = strings.TrimSpace(v)
			break
		}
	}
	for _, want := range []string{"hostcertificate " + sshHostCert, "trustedusercakeys " + sshUserCA} {
		if !strings.Contains(eff, want) {
			return fmt.Errorf("sshd is not using %q", want)
		}
	}
	c, err := net.DialTimeout("tcp", net.JoinHostPort("127.0.0.1", port), 3*time.Second)
	if err != nil {
		return fmt.Errorf("sshd not answering on port %s: %w", port, err)
	}
	defer c.Close()
	_ = c.SetReadDeadline(time.Now().Add(3 * time.Second))
	buf := make([]byte, 64)
	n, _ := c.Read(buf)
	if !strings.HasPrefix(string(buf[:n]), "SSH-") {
		return fmt.Errorf("port %s did not answer with an SSH banner", port)
	}
	return nil
}

// waitServing polls sshdServing briefly after a reload/restart.
func waitServing(ctx context.Context) error {
	var err error
	for i := 0; i < sshdVerifyTries; i++ {
		time.Sleep(sshdVerifyWait)
		if err = sshdServing(ctx); err == nil {
			return nil
		}
	}
	return err
}

// SSHRefresh re-requests the SSH trust and host certificate from the ssh-ca
// API (`enroll`) and installs them transactionally: sshd -t, reload (restart
// as a fallback), verify sshd serves them, or restore every file and restart.
func (a *Agent) SSHRefresh(ctx context.Context, otp string, force bool, out func(string)) error {
	cfg, err := LoadConfig(ctx, a.UCI)
	if err != nil {
		return err
	}
	if cfg.APIBase == "" || cfg.DeviceID == "" {
		return errors.New("no device identity in /etc/config/iotgw (api_base, device_id)")
	}
	need, why := needsRenewal(ctx)
	if !need && !force {
		out("nothing to do: the host certificate is current (" + why + "); use -force to re-request anyway")
		return nil
	}
	out("renewing: " + why)
	code, source, err := DeviceCode(cfg, otp)
	if err != nil {
		return err
	}
	hostPub, err := ensureHostKey(ctx)
	if err != nil {
		return fmt.Errorf("host key: %w", err)
	}
	req := map[string]string{"device_id": cfg.DeviceID, "action": "enroll", "host_pubkey": hostPub}
	if _, err := os.Stat(sshHostCert); err == nil {
		// Already enrolled: prove continuity with the current host key.
		sig, err := continuitySig(ctx, cfg.DeviceID, hostPub, code)
		if err != nil {
			return fmt.Errorf("sign the re-enroll challenge: %w", err)
		}
		req["continuity_sig"] = sig
	}
	client := devapi.New(cfg.APIBase, cfg.DeviceID, code)
	out(fmt.Sprintf("requesting SSH trust + host certificate from %s (action enroll, code: %s)", client.Endpoint("ssh-ca"), source))
	raw, status, err := client.Call(ctx, "ssh-ca", req)
	if err != nil {
		return hint401(fmt.Errorf("ssh-ca API (HTTP %d): %w", status, err), source)
	}
	var r enrollReply
	if err := json.Unmarshal(raw, &r); err != nil {
		return fmt.Errorf("ssh-ca reply is not JSON: %w", err)
	}
	if strings.TrimSpace(r.HostCert) == "" || strings.TrimSpace(r.UserCA) == "" {
		return errors.New("ssh-ca returned no host_cert/user_ca — refusing to touch sshd")
	}
	for _, w := range r.Warnings {
		out("server warning: " + w)
	}
	principals := r.AuthPrincipals
	if strings.TrimSpace(principals) == "" {
		principals = "iotgw-admin\niotgw-ops\n"
	}

	snaps := snapFiles(sshHostCert, sshUserCA, sshHostCA, sshKnownHosts, sshPrincipals, sshRevokedKeys, sshBreakGlass, sshCADropIn, sshdConfig)
	rollback := func(why string, cause error) error {
		out("ROLLING BACK: " + why)
		rerr := restoreFiles(snaps)
		if err := platform.RestartSSHD(ctx); err != nil {
			rerr = errors.Join(rerr, fmt.Errorf("restart sshd after restore: %w", err))
		}
		if rerr != nil {
			return fmt.Errorf("%s: %w; restore problems: %v", why, cause, rerr)
		}
		return fmt.Errorf("%w: %s: %v", ErrRolledBack, why, cause)
	}

	files := []struct {
		path    string
		content []byte
		mode    os.FileMode
	}{
		{sshHostCert, withNL(r.HostCert), 0o644},
		{sshUserCA, withNL(r.UserCA), 0o444},
		{sshPrincipals, withNL(principals), 0o644},
		{sshBreakGlass, []byte(breakGlassDropIn), 0o644},
		{sshCADropIn, []byte(caDropIn), 0o644},
	}
	// The domain's Host CA: lets the dashboard prove this machine's host
	// certificate is signed by it, and lets the gateway verify other gateways.
	if strings.TrimSpace(r.HostCA) != "" {
		files = append(files, struct {
			path    string
			content []byte
			mode    os.FileMode
		}{sshHostCA, withNL(r.HostCA), 0o644})
	}
	if strings.TrimSpace(r.CertAuthority) != "" {
		files = append(files, struct {
			path    string
			content []byte
			mode    os.FileMode
		}{sshKnownHosts, withNL(r.CertAuthority), 0o644})
	}
	if _, err := os.Stat(sshRevokedKeys); err != nil {
		// sshd refuses to start if RevokedKeys names a missing file.
		files = append(files, struct {
			path    string
			content []byte
			mode    os.FileMode
		}{sshRevokedKeys, nil, 0o600})
	}
	for _, f := range files {
		if err := writeAtomic(f.path, f.content, f.mode); err != nil {
			return rollback("cannot write "+f.path, err)
		}
	}
	if err := ensureInclude(); err != nil {
		return rollback("cannot add the drop-in Include to "+sshdConfig, err)
	}
	if _, err := sysexec.Run(ctx, 15*time.Second, "sshd", "-t"); err != nil {
		return rollback("sshd rejected the new configuration (sshd -t)", err)
	}
	out("sshd -t OK; reloading sshd")
	if err := platform.ReloadSSHD(ctx); err != nil {
		out("reload failed (" + err.Error() + "); restarting sshd")
		if err := platform.RestartSSHD(ctx); err != nil {
			return rollback("sshd could not be reloaded or restarted", err)
		}
	}
	if err := waitServing(ctx); err != nil {
		out("sshd not serving the new identity after reload (" + err.Error() + "); restarting sshd")
		if rerr := platform.RestartSSHD(ctx); rerr != nil {
			return rollback("sshd restart failed", rerr)
		}
		if err := waitServing(ctx); err != nil {
			return rollback("sshd is not serving the new identity", err)
		}
	}
	valid := r.HostCertValidBefore
	if t, err := time.Parse(time.RFC3339, valid); err == nil {
		valid = t.Local().Format("2006-01-02 15:04")
	}
	out(fmt.Sprintf("SSH refreshed: host certificate for %s (zone %s) valid until %s; sshd serving it with the User CA", r.FQDN, r.Zone, valid))
	return nil
}

// ensureInclude puts the drop-in Include at the top of sshd_config.
func ensureInclude() error {
	b, err := os.ReadFile(sshdConfig)
	if err != nil {
		return err
	}
	for _, l := range strings.Split(string(b), "\n") {
		if strings.TrimSpace(l) == sshIncludeLine {
			return nil
		}
	}
	fi, _ := os.Stat(sshdConfig)
	mode := os.FileMode(0o644)
	if fi != nil {
		mode = fi.Mode().Perm()
	}
	return writeAtomic(sshdConfig, append([]byte(sshIncludeLine+"\n"), b...), mode)
}
