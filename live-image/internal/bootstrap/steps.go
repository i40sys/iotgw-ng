package bootstrap

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/i40sys/iotgw-ng/live-image/internal/netinfo"
	"github.com/i40sys/iotgw-ng/live-image/internal/state"
	"github.com/i40sys/iotgw-ng/live-image/internal/sysexec"
)

// Paths written by the bootstrap. The sshd drop-ins are created at runtime
// only on success, so an image without a working PKI step has no dangling
// TrustedUserCAKeys / HostCertificate pointing at missing files.
const (
	wgConfPath      = "/etc/wireguard/wg0.conf"
	wgIface         = "wg0"
	userCAPath      = "/etc/ssh/ssh-user-ca.pub"
	principalsPath  = "/etc/ssh/auth_principals/root"
	revokedKeysPath = "/etc/ssh/revoked_keys"
	knownHostsPath  = "/etc/ssh/ssh_known_hosts"
	hostKeyPath     = "/etc/ssh/ssh_host_ecdsa_key"
	hostCertPath    = "/etc/ssh/ssh_host_ecdsa_key-cert.pub"
	userCADropIn    = "/etc/ssh/sshd_config.d/60-iotgw-ssh-ca.conf"
	hostCertDropIn  = "/etc/ssh/sshd_config.d/61-iotgw-live-host-cert.conf"
)

// ensureHostsEntry maps the machine's own hostname in /etc/hosts. Without it
// every sudo (and anything else resolving the local name) waits for DNS —
// which is unreachable once the full-tunnel VPN is up — before continuing.
func ensureHostsEntry() {
	name, err := os.Hostname()
	if err != nil || name == "" {
		return
	}
	b, _ := os.ReadFile("/etc/hosts")
	for _, l := range strings.Split(string(b), "\n") {
		f := strings.Fields(l)
		for _, n := range f[min(1, len(f)):] {
			if n == name {
				return
			}
		}
	}
	f, err := os.OpenFile("/etc/hosts", os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return
	}
	defer f.Close()
	fmt.Fprintf(f, "127.0.1.1\t%s\n", name)
}

// probeAPI checks the API is reachable over TCP. It deliberately does not
// require a default route: the API may be on-link (the provisioning LAN).
func probeAPI(ctx context.Context, hostPort string) error {
	d := net.Dialer{Timeout: 5 * time.Second}
	c, err := d.DialContext(ctx, "tcp", hostPort)
	if err != nil {
		return err
	}
	return c.Close()
}

// withRetry retries transport errors and 5xx, never authentication or other
// 4xx replies (retrying a rejected code cannot help).
func withRetry(ctx context.Context, attempts int, f func() (int, error)) (int, error) {
	var status int
	var err error
	for i := 0; i < attempts; i++ {
		status, err = f()
		if err == nil || (status >= 400 && status < 500) || ctx.Err() != nil {
			return status, err
		}
		time.Sleep(time.Duration(2*(i+1)) * time.Second)
	}
	return status, err
}

// ── VPN chain ────────────────────────────────────────────────────────────────

func (r *Runner) vpnFetch(ctx context.Context, netOK bool) (string, bool) {
	s := r.st.Step(state.StepVPNFetch)
	s.Endpoint = r.api.endpoint("vpn")
	if !netOK {
		r.skip(state.StepVPNFetch, state.NotConfigured, "skipped: the API is not reachable (see Physical network)")
		return "", false
	}
	r.begin(state.StepVPNFetch)
	body := map[string]string{"device_id": r.st.Identity.DeviceID}
	if def, _ := netinfo.DefaultRoute(); def != nil {
		body["interface"] = def.Iface
		if def.Gateway != nil {
			body["gateway"] = def.Gateway.String()
		}
	}
	var reply []byte
	status, err := withRetry(ctx, 3, func() (int, error) {
		var st int
		var e error
		reply, st, e = r.api.call(ctx, "vpn", body)
		return st, e
	})
	s.HTTPStatus = status
	if err != nil {
		r.end(state.StepVPNFetch, state.Failed, "VPN configuration request failed", err)
		return "", false
	}
	conf := string(reply)
	sum, err := parseWGConf(conf)
	if err != nil {
		r.end(state.StepVPNFetch, state.Failed, "VPN configuration is invalid", err)
		return "", false
	}
	if err := os.MkdirAll(filepath.Dir(wgConfPath), 0o700); err == nil {
		err = os.WriteFile(wgConfPath, []byte(conf), 0o600)
	}
	if err != nil {
		r.end(state.StepVPNFetch, state.Failed, "cannot write "+wgConfPath, err)
		return "", false
	}
	r.st.VPN = state.VPN{
		ConfigPath: wgConfPath, Interface: wgIface, Addresses: sum.Addresses,
		Endpoint: sum.Endpoint, PeerPublicKey: sum.PeerPublicKey, AllowedIPs: sum.AllowedIPs,
	}
	r.end(state.StepVPNFetch, state.Healthy, "configuration received for "+strings.Join(sum.Addresses, ", "), nil)
	return conf, true
}

// pinAPIRoute keeps the API reachable over the physical uplink once the
// full-tunnel VPN replaces the default route, so the (independent) SSH PKI
// call does not depend on the VPN's egress.
func (r *Runner) pinAPIRoute(ctx context.Context) {
	u, err := url.Parse(r.st.Identity.APIBase)
	if err != nil {
		return
	}
	ips, err := net.DefaultResolver.LookupIP(ctx, "ip4", u.Hostname())
	if err != nil || len(ips) == 0 {
		return
	}
	rt, err := netinfo.Lookup(ips[0])
	if err != nil || rt == nil || rt.Gateway == nil {
		return // on-link or unknown: nothing to pin
	}
	dst := ips[0].String() + "/32"
	if _, err := sysexec.Run(ctx, 5*time.Second, "ip", "route", "replace", dst, "via", rt.Gateway.String(), "dev", rt.Iface); err == nil {
		r.st.VPN.PinnedRoutes = append(r.st.VPN.PinnedRoutes, dst+" via "+rt.Gateway.String()+" dev "+rt.Iface+" (API)")
	}
}

func (r *Runner) vpnApply(ctx context.Context, _ string) {
	r.begin(state.StepVPNApply)
	r.pinAPIRoute(ctx)
	_, _ = sysexec.Run(ctx, 20*time.Second, "wg-quick", "down", wgIface)
	if _, err := sysexec.Run(ctx, 30*time.Second, "wg-quick", "up", wgIface); err != nil {
		r.end(state.StepVPNApply, state.Failed, "wg-quick up "+wgIface+" failed", err)
		return
	}
	r.st.VPN.AppliedAt = time.Now().UTC()
	// A WireGuard interface is "up" even with no peer; the handshake is the
	// real proof the VPN server answered.
	deadline := time.Now().Add(25 * time.Second)
	for time.Now().Before(deadline) {
		res, err := sysexec.Run(ctx, 5*time.Second, "wg", "show", wgIface, "latest-handshakes")
		if err == nil {
			for _, l := range strings.Split(strings.TrimSpace(res.Stdout), "\n") {
				f := strings.Fields(l)
				if len(f) == 2 && f[1] != "0" {
					r.end(state.StepVPNApply, state.Healthy, wgIface+" up, handshake with "+r.st.VPN.Endpoint, nil)
					return
				}
			}
		}
		time.Sleep(2 * time.Second)
	}
	r.end(state.StepVPNApply, state.Warning, wgIface+" is up but no handshake with "+r.st.VPN.Endpoint+" within 25 s", nil)
}

// ── SSH PKI chain ────────────────────────────────────────────────────────────

// pkiBundle is the `ssh-ca` live-enroll reply.
type pkiBundle struct {
	Zone                string   `json:"zone"`
	Domain              string   `json:"domain"`
	Principals          []string `json:"principals"`
	AuthPrincipals      string   `json:"auth_principals"`
	UserCA              string   `json:"user_ca"`
	HostCA              string   `json:"host_ca"`
	CertAuthority       string   `json:"cert_authority"`
	FQDN                string   `json:"fqdn"`
	HostPrincipals      []string `json:"host_principals"`
	HostCert            string   `json:"host_cert"`
	HostCertValidBefore string   `json:"host_cert_valid_before"`
}

func ensureHostKey(ctx context.Context) (string, error) {
	pub := hostKeyPath + ".pub"
	if _, err := os.Stat(pub); err != nil {
		if _, err := sysexec.Run(ctx, 20*time.Second, "ssh-keygen", "-q", "-t", "ecdsa", "-b", "256", "-N", "", "-f", hostKeyPath); err != nil {
			return "", err
		}
	}
	b, err := os.ReadFile(pub)
	return strings.TrimSpace(string(b)), err
}

func (r *Runner) pkiFetch(ctx context.Context, netOK bool) (*pkiBundle, bool) {
	s := r.st.Step(state.StepPKIFetch)
	s.Endpoint = r.api.endpoint("ssh-ca") + " (action live-enroll)"
	if !netOK {
		r.skip(state.StepPKIFetch, state.Failed, "SSH CA configuration MISSING: the API is not reachable (see Physical network)")
		return nil, false
	}
	r.begin(state.StepPKIFetch)
	hostPub, err := ensureHostKey(ctx)
	if err != nil {
		r.end(state.StepPKIFetch, state.Failed, "no ECDSA host key to certify", err)
		return nil, false
	}
	req := map[string]string{"device_id": r.st.Identity.DeviceID, "action": "live-enroll", "host_pubkey": hostPub}
	var reply []byte
	status, err := withRetry(ctx, 3, func() (int, error) {
		var st int
		var e error
		reply, st, e = r.api.call(ctx, "ssh-ca", req)
		return st, e
	})
	s.HTTPStatus = status
	if err != nil {
		r.end(state.StepPKIFetch, state.Failed, "SSH CA configuration MISSING: ssh-ca request failed", err)
		return nil, false
	}
	var b pkiBundle
	if err := json.Unmarshal(reply, &b); err != nil {
		r.end(state.StepPKIFetch, state.Failed, "SSH CA configuration INVALID: reply is not JSON", err)
		return nil, false
	}
	if strings.TrimSpace(b.UserCA) == "" || strings.TrimSpace(b.AuthPrincipals) == "" {
		r.end(state.StepPKIFetch, state.Failed, "SSH CA configuration INVALID: no User CA or principals in the reply", nil)
		return nil, false
	}
	r.st.PKI.Zone, r.st.PKI.Domain, r.st.PKI.Principals = b.Zone, b.Domain, b.Principals
	r.end(state.StepPKIFetch, state.Healthy, fmt.Sprintf("trust bundle for zone %s (domain %s)", b.Zone, b.Domain), nil)
	return &b, true
}

// fingerprints returns `ssh-keygen -lf` SHA256 fingerprints of every key in
// path, and fails if the file holds anything that is not a public key.
func fingerprints(ctx context.Context, path string) ([]string, error) {
	res, err := sysexec.Run(ctx, 10*time.Second, "ssh-keygen", "-lf", path)
	if err != nil {
		return nil, err
	}
	var fps []string
	for _, l := range strings.Split(strings.TrimSpace(res.Stdout), "\n") {
		if f := strings.Fields(l); len(f) >= 2 {
			fps = append(fps, f[1])
		}
	}
	if len(fps) == 0 {
		return nil, errors.New("no public key found")
	}
	return fps, nil
}

func writeFile(path, content string, mode os.FileMode) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	if !strings.HasSuffix(content, "\n") {
		content += "\n"
	}
	tmp := path + ".iotgw-tmp"
	if err := os.WriteFile(tmp, []byte(content), mode); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

func (r *Runner) installUserCA(b *pkiBundle) bool {
	ctx := context.Background()
	r.begin(state.StepUserCA)
	if err := writeFile(userCAPath, b.UserCA, 0o444); err != nil {
		r.end(state.StepUserCA, state.Failed, "cannot write "+userCAPath, err)
		return false
	}
	fps, err := fingerprints(ctx, userCAPath)
	if err != nil {
		os.Remove(userCAPath)
		r.end(state.StepUserCA, state.Failed, "SSH CA configuration INVALID: the User CA is not a valid public key", err)
		return false
	}
	if err := writeFile(principalsPath, b.AuthPrincipals, 0o644); err != nil {
		r.end(state.StepUserCA, state.Failed, "cannot write "+principalsPath, err)
		return false
	}
	if _, err := os.Stat(revokedKeysPath); err != nil {
		// sshd refuses to start if RevokedKeys names a missing file.
		_ = writeFile(revokedKeysPath, "", 0o600)
	}
	dropIn := "# iotgw live image: SSH User CA trust for zone " + b.Zone + " (decision-031).\n" +
		"# Written at boot by iotgw-bootstrap from the ssh-ca live-enroll reply.\n" +
		"TrustedUserCAKeys " + userCAPath + "\n" +
		"AuthorizedPrincipalsFile /etc/ssh/auth_principals/%u\n" +
		"RevokedKeys " + revokedKeysPath + "\n"
	if err := writeFile(userCADropIn, dropIn, 0o644); err != nil {
		r.end(state.StepUserCA, state.Failed, "cannot write "+userCADropIn, err)
		return false
	}
	r.st.PKI.UserCAPath, r.st.PKI.UserCAFPs, r.st.PKI.PrincipalsPath = userCAPath, fps, principalsPath
	r.end(state.StepUserCA, state.Healthy, fmt.Sprintf("%d User CA key(s) for %s installed", len(fps), b.Zone), nil)
	return true
}

func (r *Runner) installHostCert(b *pkiBundle) bool {
	ctx := context.Background()
	r.begin(state.StepHostCert)
	// Host CA trust for clients on this machine (known_hosts @cert-authority).
	if strings.TrimSpace(b.CertAuthority) != "" {
		if err := writeFile(knownHostsPath, b.CertAuthority, 0o644); err == nil {
			r.st.PKI.KnownHostsPath = knownHostsPath
		}
	}
	if strings.TrimSpace(b.HostCA) != "" {
		tmp := filepath.Join(state.Dir, "host-ca.pub")
		if writeFile(tmp, b.HostCA, 0o644) == nil {
			r.st.PKI.HostCAFPs, _ = fingerprints(ctx, tmp)
		}
	}
	if strings.TrimSpace(b.HostCert) == "" {
		r.end(state.StepHostCert, state.Failed, "no host certificate in the reply — the live image has no signed host identity", nil)
		return false
	}
	if err := writeFile(hostCertPath, b.HostCert, 0o644); err != nil {
		r.end(state.StepHostCert, state.Failed, "cannot write "+hostCertPath, err)
		return false
	}
	if _, err := sysexec.Run(ctx, 10*time.Second, "ssh-keygen", "-L", "-f", hostCertPath); err != nil {
		os.Remove(hostCertPath)
		r.end(state.StepHostCert, state.Failed, "the host certificate does not parse", err)
		return false
	}
	dropIn := "# iotgw live image: short-lived host identity " + b.FQDN + " (decision-031).\n" +
		"# Separate from the device's permanent (OpenWRT) enrollment.\n" +
		"HostCertificate " + hostCertPath + "\n"
	if err := writeFile(hostCertDropIn, dropIn, 0o644); err != nil {
		r.end(state.StepHostCert, state.Failed, "cannot write "+hostCertDropIn, err)
		return false
	}
	r.st.PKI.HostKeyPath, r.st.PKI.HostCertPath = hostKeyPath, hostCertPath
	r.st.PKI.HostFQDN, r.st.PKI.HostPrincipals = b.FQDN, b.HostPrincipals
	if fps, err := fingerprints(ctx, hostKeyPath+".pub"); err == nil {
		r.st.PKI.HostKeyFP = fps[0]
	}
	if t, err := time.Parse(time.RFC3339, b.HostCertValidBefore); err == nil {
		r.st.PKI.HostCertValidTo = t
	}
	r.end(state.StepHostCert, state.Healthy, "host certificate for "+b.FQDN+" installed", nil)
	return true
}

func (r *Runner) configureSSHD(ctx context.Context, userOK, certOK bool) {
	r.begin(state.StepSSHD)
	if !userOK && !certOK {
		r.end(state.StepSSHD, state.NotConfigured, "nothing to apply — no SSH trust was installed", nil)
		return
	}
	if _, err := sysexec.Run(ctx, 15*time.Second, "sshd", "-t"); err != nil {
		// Never leave sshd unable to start: drop our drop-ins and report.
		os.Remove(userCADropIn)
		os.Remove(hostCertDropIn)
		r.end(state.StepSSHD, state.Failed, "sshd rejected the configuration — iotgw drop-ins removed", err)
		return
	}
	if _, err := sysexec.Run(ctx, 20*time.Second, "systemctl", "reload-or-restart", "ssh"); err != nil {
		r.end(state.StepSSHD, state.Failed, "cannot reload sshd", err)
		return
	}
	res, err := sysexec.Run(ctx, 15*time.Second, "sshd", "-T")
	if err != nil {
		r.end(state.StepSSHD, state.Warning, "sshd reloaded but its effective config could not be read", err)
		return
	}
	eff := strings.ToLower(res.Stdout)
	var missing []string
	if userOK && !strings.Contains(eff, "trustedusercakeys "+userCAPath) {
		missing = append(missing, "TrustedUserCAKeys")
	}
	if certOK && !strings.Contains(eff, "hostcertificate "+hostCertPath) {
		missing = append(missing, "HostCertificate")
	}
	if len(missing) > 0 {
		r.end(state.StepSSHD, state.Failed, "sshd is not using: "+strings.Join(missing, ", "), nil)
		return
	}
	status, msg := state.Healthy, "sshd reloaded with User CA trust and the live host certificate"
	if !userOK || !certOK {
		status, msg = state.Warning, "sshd reloaded with partial SSH PKI configuration"
	}
	r.end(state.StepSSHD, status, msg, nil)
}
