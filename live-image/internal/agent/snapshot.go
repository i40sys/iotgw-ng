package agent

import (
	"context"
	"encoding/json"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/i40sys/iotgw-ng/live-image/internal/collect"
	"github.com/i40sys/iotgw-ng/live-image/internal/version"
)

// SnapshotFile is the full status the daemon publishes: the single backend
// that the console dashboard, the LuCI page (through the rpcd plugin) and
// `iotgw rpcd` all read, instead of each probing the system on its own.
const SnapshotFile = "/var/run/iotgw/status.json"

// Snapshot cadences: cheap kernel-local facts often, probes that leave the
// machine less often (the same split the dashboard used on its own).
const (
	snapFast = 5 * time.Second
	snapSlow = 30 * time.Second
	snapHost = 60 * time.Second
	// SnapshotStale: older than this, readers fall back to probing themselves.
	SnapshotStale = 20 * time.Second
)

// Snapshot is everything the dashboards show.
type Snapshot struct {
	UpdatedAt time.Time             `json:"updated_at"`
	Version   string                `json:"version"`
	Host      *collect.Host         `json:"host,omitempty"`
	Network   *collect.Network      `json:"network,omitempty"`
	Internet  *collect.Internet     `json:"internet,omitempty"`
	VPN       *collect.VPN          `json:"vpn,omitempty"`
	Reach     *collect.Reachability `json:"reach,omitempty"`
	PKI       *collect.PKI          `json:"pki,omitempty"`
	Installed *Installed            `json:"installed,omitempty"`
}

// Fresh reports whether the snapshot is recent enough to show as-is.
func (s *Snapshot) Fresh() bool {
	return s != nil && time.Since(s.UpdatedAt) < SnapshotStale
}

// ReadSnapshot loads the published status.
func ReadSnapshot(path string) (*Snapshot, error) {
	b, err := os.ReadFile(path)
	if errors.Is(err, fs.ErrNotExist) {
		return nil, ErrNoState
	}
	if err != nil {
		return nil, err
	}
	var s Snapshot
	if err := json.Unmarshal(b, &s); err != nil {
		return nil, err
	}
	return &s, nil
}

// Snapshotter keeps SnapshotFile current. Refresh asks for a full round now
// (the dashboards' [r] / the LuCI Refresh button, via SIGUSR1).
type Snapshotter struct {
	Path    string
	Refresh chan struct{}

	mu       sync.Mutex
	snap     Snapshot
	lastSlow time.Time
	lastHost time.Time
}

// NewSnapshotter returns a snapshotter writing to path.
func NewSnapshotter(path string) *Snapshotter {
	return &Snapshotter{Path: path, Refresh: make(chan struct{}, 1)}
}

// Kick requests an immediate full refresh (non-blocking).
func (s *Snapshotter) Kick() {
	select {
	case s.Refresh <- struct{}{}:
	default:
	}
}

// Run collects until ctx ends.
func (s *Snapshotter) Run(ctx context.Context) {
	s.round(ctx, true)
	t := time.NewTicker(snapFast)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-s.Refresh:
			s.round(ctx, true)
		case <-t.C:
			s.round(ctx, false)
		}
	}
}

func bounded[T any](ctx context.Context, f func(context.Context) T) T {
	c, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	return f(c)
}

// round refreshes the cheap parts, and the slow ones when due (or forced).
func (s *Snapshotter) round(ctx context.Context, all bool) {
	now := time.Now()
	s.mu.Lock()
	snap := s.snap
	slowDue := all || now.Sub(s.lastSlow) >= snapSlow
	hostDue := all || now.Sub(s.lastHost) >= snapHost
	s.mu.Unlock()

	inst := bounded(ctx, CollectInstalled)
	doc := inst.SyntheticDoc()
	net := bounded(ctx, collect.CollectNetwork)
	vpn := bounded(ctx, func(c context.Context) collect.VPN { return collect.CollectVPN(c, doc) })
	pki := bounded(ctx, func(c context.Context) collect.PKI { return collect.CollectPKI(c, doc) })
	snap.Installed, snap.Network, snap.VPN, snap.PKI = &inst, &net, &vpn, &pki
	if hostDue {
		h := bounded(ctx, collect.CollectHost)
		snap.Host = &h
	}
	if slowDue {
		in := bounded(ctx, collect.CollectInternet)
		r := bounded(ctx, func(c context.Context) collect.Reachability { return collect.CollectReachability(c, vpn) })
		snap.Internet, snap.Reach = &in, &r
	}
	snap.UpdatedAt, snap.Version = time.Now().UTC(), version.String()

	s.mu.Lock()
	s.snap = snap
	if slowDue {
		s.lastSlow = now
	}
	if hostDue {
		s.lastHost = now
	}
	s.mu.Unlock()
	_ = writeJSON(s.Path, snap)
}

// writeJSON stores v atomically (0644: no secrets in a snapshot).
func writeJSON(path string, v any) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	b, err := json.Marshal(v)
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), ".snap-*.json")
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
