// Package collect gathers the live image's operational state. Each collector
// is a small, independent probe with its own timeout that returns structured
// data — no presentation, no Bubble Tea. The dashboard runs them off the UI
// loop and renders whatever they return (decision-031).
//
// Collectors are read-only: they never call the provisioning APIs and never
// change the machine. What bootstrap did is read from its state document.
package collect

import (
	"time"

	"github.com/i40sys/iotgw-ng/live-image/internal/state"
)

// Status re-exports the shared health vocabulary.
type Status = state.Status

// Check is one probe result.
type Check struct {
	Status  Status
	Detail  string
	Latency time.Duration
}

// Host is the concise machine summary.
type Host struct {
	Hostname     string
	DeviceID     string
	CPUModel     string
	Arch         string
	CPUs         int
	MemTotal     uint64 // bytes
	Disks        []Disk
	BootSource   string
	Kernel       string
	ImageRelease string
	ToolVersion  string
}

// Disk is one block device worth showing (no loop/ram/zram devices).
type Disk struct {
	Name      string
	SizeBytes uint64
	Model     string
	Removable bool
}

// Iface is one network interface.
type Iface struct {
	Name      string
	MAC       string
	Kind      string // ethernet | wireguard | other
	OperState string // up | down | unknown | …
	Carrier   bool
	IPv4      []string
	IPv6      []string
	Egress    bool // carries the route to the Internet
}

// Network is interfaces + routing + resolver.
type Network struct {
	Ifaces         []Iface
	DefaultGateway string
	DefaultIface   string
	EgressIface    string // actual egress for Internet traffic (policy routing aware)
	EgressVia      string
	DNS            []string
	Status         Status
	Detail         string
}

// Internet distinguishes resolution, raw IP reachability and HTTPS.
type Internet struct {
	DNS     Check
	IP      Check
	HTTPS   Check
	Overall Status
	At      time.Time
}

// VPN is the WireGuard state as the kernel sees it now.
type VPN struct {
	ConfigLoaded  bool
	ConfigStatus  Status
	ApplyStatus   Status
	Interface     string
	Present       bool
	Up            bool
	Addresses     []string
	PeerPublicKey string
	Endpoint      string // live endpoint from the kernel (falls back to config)
	LastHandshake time.Time
	RxBytes       uint64
	TxBytes       uint64
	Routes        []string
	InternetVia   string // lan | vpn (as applied by bootstrap)
	NetworkCIDR   string
	DNS           []string
	Status        Status
	Detail        string
}

// Reachability is how well this machine can see the VPN server.
type Reachability struct {
	Host        string
	Port        string
	Protocol    string
	ResolvedIPs []string
	DNS         Check
	Route       Check
	ICMP        Check
	WireGuard   Check // the real protocol check: a recent handshake
	Status      Status
	At          time.Time
}

// PKI is the SSH trust + live host identity as installed and as sshd uses it.
type PKI struct {
	Zone   string
	Domain string

	UserCARequested bool
	UserCAReceived  bool
	UserCAInstalled bool
	UserCAPath      string
	UserCAFPs       []string
	UserCATrusted   bool // sshd -T shows TrustedUserCAKeys
	Principals      []string
	UserCAStatus    Status
	UserCADetail    string

	HostCAFPs      []string
	KnownHostsPath string
	HostCAStatus   Status
	HostCADetail   string

	HostKeyType      string
	HostKeyFP        string
	HostCertPresent  bool
	HostCertPath     string
	HostPrincipals   []string
	HostCertValidTo  time.Time
	HostCertSignedBy string
	HostCertActive   bool // sshd -T shows HostCertificate
	HostIDStatus     Status
	HostIDDetail     string

	SSHDActive bool
	SSHDStatus Status
	SSHDDetail string
}

// Bootstrap is the provisioning record plus the service state.
type Bootstrap struct {
	Doc          *state.Bootstrap
	ServiceState string // systemctl is-active iotgw-bootstrap
	Err          string
}
