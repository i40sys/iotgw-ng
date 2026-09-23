// Package state is the contract between iotgw-bootstrap (writer, root) and
// iotgw-status (reader, unprivileged): one JSON document under /run/iotgw that
// records what the boot-time provisioning did, step by step (decision-031).
//
// It never contains secrets — no device code, no private key — so it is
// world-readable and the dashboard needs no privileges to read it.
package state

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"time"
)

// Dir is the runtime state directory (tmpfs; gone on reboot, as it should be).
const Dir = "/run/iotgw"

// File is the bootstrap state document.
const File = Dir + "/bootstrap.json"

// Status is the health vocabulary shared by bootstrap steps and the dashboard.
type Status string

const (
	Healthy       Status = "HEALTHY"
	Warning       Status = "WARNING"
	Failed        Status = "FAILED"
	Pending       Status = "PENDING"
	Running       Status = "RUNNING"
	Unknown       Status = "UNKNOWN"
	NotConfigured Status = "NOT CONFIGURED"
	NotTested     Status = "NOT TESTED"
	Skipped       Status = "SKIPPED"
)

// Step IDs, in execution order. VPN and PKI are independent concerns: a PKI
// failure never marks a VPN step failed and vice versa.
const (
	StepIdentity = "identity"
	StepNetwork  = "network"
	StepVPNFetch = "vpn-fetch"
	StepVPNApply = "vpn-apply"
	StepPKIFetch = "pki-fetch"
	StepUserCA   = "user-ca"
	StepHostCert = "host-cert"
	StepSSHD     = "sshd"
)

// StepOrder lists every step with its operator-facing title.
var StepOrder = []struct{ ID, Title string }{
	{StepIdentity, "Device identity"},
	{StepNetwork, "Physical network"},
	{StepVPNFetch, "VPN config fetch"},
	{StepVPNApply, "VPN configuration"},
	{StepPKIFetch, "SSH PKI fetch"},
	{StepUserCA, "User CA install"},
	{StepHostCert, "Host certificate"},
	{StepSSHD, "sshd configuration"},
}

// Step is the outcome of one bootstrap operation.
type Step struct {
	ID         string    `json:"id"`
	Title      string    `json:"title"`
	Status     Status    `json:"status"`
	Message    string    `json:"message,omitempty"`
	Error      string    `json:"error,omitempty"`
	Endpoint   string    `json:"endpoint,omitempty"`
	HTTPStatus int       `json:"http_status,omitempty"`
	StartedAt  time.Time `json:"started_at,omitempty"`
	FinishedAt time.Time `json:"finished_at,omitempty"`
}

// Identity is the device identity the operator typed at the iPXE prompt.
// The one-time code itself is deliberately NOT recorded.
type Identity struct {
	DeviceID string `json:"device_id,omitempty"`
	HasCode  bool   `json:"has_code"`
	APIBase  string `json:"api_base,omitempty"`
}

// VPN summarises the applied WireGuard configuration (public data only).
type VPN struct {
	ConfigPath    string    `json:"config_path,omitempty"`
	Interface     string    `json:"interface,omitempty"`
	Addresses     []string  `json:"addresses,omitempty"`
	Endpoint      string    `json:"endpoint,omitempty"` // host:port as configured
	PeerPublicKey string    `json:"peer_public_key,omitempty"`
	AllowedIPs    []string  `json:"allowed_ips,omitempty"`
	NetworkCIDR   string    `json:"network_cidr,omitempty"` // the device's Netmaker network
	InternetVia   string    `json:"internet_via,omitempty"` // lan | vpn
	DNS           []string  `json:"dns,omitempty"`          // resolvers set for that mode
	AppliedAt     time.Time `json:"applied_at,omitempty"`
}

// PKI summarises the SSH trust + live host identity that was installed.
type PKI struct {
	Zone            string    `json:"zone,omitempty"`
	Domain          string    `json:"domain,omitempty"`
	UserCAPath      string    `json:"user_ca_path,omitempty"`
	UserCAFPs       []string  `json:"user_ca_fingerprints,omitempty"`
	HostCAFPs       []string  `json:"host_ca_fingerprints,omitempty"`
	KnownHostsPath  string    `json:"known_hosts_path,omitempty"`
	PrincipalsPath  string    `json:"principals_path,omitempty"`
	Principals      []string  `json:"principals,omitempty"`
	HostKeyPath     string    `json:"host_key_path,omitempty"`
	HostKeyFP       string    `json:"host_key_fingerprint,omitempty"`
	HostCertPath    string    `json:"host_cert_path,omitempty"`
	HostFQDN        string    `json:"host_fqdn,omitempty"`
	HostPrincipals  []string  `json:"host_principals,omitempty"`
	HostCertValidTo time.Time `json:"host_cert_valid_before,omitempty"`
}

// Bootstrap is the whole document.
type Bootstrap struct {
	Identity  Identity  `json:"identity"`
	Steps     []Step    `json:"steps"`
	VPN       VPN       `json:"vpn"`
	PKI       PKI       `json:"pki"`
	StartedAt time.Time `json:"started_at"`
	UpdatedAt time.Time `json:"updated_at"`
	Finished  bool      `json:"finished"`
}

// New returns a document with every step PENDING.
func New(now time.Time) *Bootstrap {
	b := &Bootstrap{StartedAt: now, UpdatedAt: now}
	for _, s := range StepOrder {
		b.Steps = append(b.Steps, Step{ID: s.ID, Title: s.Title, Status: Pending})
	}
	return b
}

// Step returns a pointer to the step with the given id (nil if unknown).
func (b *Bootstrap) Step(id string) *Step {
	for i := range b.Steps {
		if b.Steps[i].ID == id {
			return &b.Steps[i]
		}
	}
	return nil
}

// ErrNotStarted means the bootstrap has not written its state yet.
var ErrNotStarted = errors.New("bootstrap state not written yet")

// Read loads the document at path.
func Read(path string) (*Bootstrap, error) {
	raw, err := os.ReadFile(path)
	if errors.Is(err, fs.ErrNotExist) {
		return nil, ErrNotStarted
	}
	if err != nil {
		return nil, err
	}
	var b Bootstrap
	if err := json.Unmarshal(raw, &b); err != nil {
		return nil, fmt.Errorf("parse %s: %w", path, err)
	}
	return &b, nil
}

// Write stores the document atomically (temp file + rename) so a concurrent
// reader never sees a half-written file.
func Write(path string, b *Bootstrap) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	raw, err := json.MarshalIndent(b, "", "  ")
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), ".bootstrap-*.json")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	if _, err := tmp.Write(raw); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Chmod(0o644); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), path)
}
