package agent

import (
	"encoding/json"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"time"
)

// StateFile is the daemon's runtime record, read by the dashboard. tmpfs
// (/var/run → /tmp/run on OpenWRT): gone on reboot, contains no secrets.
const StateFile = "/var/run/iotgw/agent.json"

// Probe is one health check outcome.
type Probe struct {
	OK     bool      `json:"ok"`
	Detail string    `json:"detail,omitempty"`
	At     time.Time `json:"at,omitempty"`
}

// Uplink is the physical path to the LAN router.
type Uplink struct {
	Iface   string `json:"iface,omitempty"`   // UCI/netifd interface, e.g. wan
	Device  string `json:"device,omitempty"`  // l3 device, e.g. eth0
	Gateway string `json:"gateway,omitempty"` // current LAN router
	Metric  int    `json:"metric,omitempty"`
}

// Endpoint is the Netmaker server and the route that keeps it outside the tunnel.
type Endpoint struct {
	Host         string `json:"host,omitempty"`
	IP           string `json:"ip,omitempty"`
	Port         string `json:"port,omitempty"`
	RouteVia     string `json:"route_via,omitempty"` // gateway of the live route ("" on-link)
	RouteDev     string `json:"route_dev,omitempty"`
	RouteOK      bool   `json:"route_ok"`
	RouteManaged bool   `json:"route_managed"` // network.iotgw_endpoint exists
}

// Event is one line of the agent's action history.
type Event struct {
	At     time.Time `json:"at"`
	Kind   string    `json:"kind"`   // check | change | rollback | hold | renew | error | info
	Result string    `json:"result"` // ok | failed | skipped | held
	Text   string    `json:"text"`
}

// State is the whole document.
type State struct {
	UpdatedAt time.Time `json:"updated_at"`
	PID       int       `json:"pid"`
	Version   string    `json:"version"`
	Interval  string    `json:"interval"`

	Policy     Policy    `json:"policy"`
	Prefer     Egress    `json:"prefer"`
	Hold       bool      `json:"hold"`
	HoldReason string    `json:"hold_reason,omitempty"`
	HoldSince  time.Time `json:"hold_since,omitempty"`

	Egress   Egress   `json:"egress"`
	Uplink   Uplink   `json:"uplink"`
	Endpoint Endpoint `json:"endpoint"`

	LANInternet  Probe `json:"lan_internet"`  // TCP out of the uplink device
	VPNInternet  Probe `json:"vpn_internet"`  // TCP out of the tunnel
	Handshake    Probe `json:"handshake"`     // fresh WireGuard handshake
	EgressOK     Probe `json:"egress_ok"`     // TCP along the default path
	NetmakerSeen Probe `json:"netmaker_seen"` // endpoint routed outside the tunnel + handshake

	LANFails     int         `json:"lan_fails"`
	LANRecovers  int         `json:"lan_recovers"`
	FailStreak   int         `json:"fail_streak"`
	BackoffUntil time.Time   `json:"backoff_until,omitempty"`
	Changes      []time.Time `json:"changes,omitempty"` // recent automatic changes (rate limit)

	NextCheck time.Time `json:"next_check,omitempty"`
	LastError string    `json:"last_error,omitempty"`
	Events    []Event   `json:"events,omitempty"`
}

// maxEvents bounds the history kept in the state file.
const maxEvents = 30

// AddEvent appends to the bounded history.
func (s *State) AddEvent(kind, result, text string) {
	s.Events = append(s.Events, Event{At: time.Now().UTC(), Kind: kind, Result: result, Text: text})
	if len(s.Events) > maxEvents {
		s.Events = s.Events[len(s.Events)-maxEvents:]
	}
}

// ReadState loads the daemon state (ErrNoState when the daemon never ran).
func ReadState(path string) (*State, error) {
	b, err := os.ReadFile(path)
	if errors.Is(err, fs.ErrNotExist) {
		return nil, ErrNoState
	}
	if err != nil {
		return nil, err
	}
	var s State
	if err := json.Unmarshal(b, &s); err != nil {
		return nil, err
	}
	return &s, nil
}

// ErrNoState means the daemon has not written its state yet.
var ErrNoState = errors.New("the iotgw daemon has not written its state yet")

// WriteState stores the state atomically.
func WriteState(path string, s *State) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	b, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), ".agent-*.json")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	if _, err := tmp.Write(b); err != nil {
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
