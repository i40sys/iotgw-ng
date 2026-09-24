// Package totp derives the device one-time code exactly like the `vpn` and
// `ssh-ca` edge functions (supabase/volumes/functions/_shared/device-auth.ts)
// and the Ansible ssh_ca task: RFC 4226 HOTP (HMAC-SHA1, 6 digits) over a
// 600 s time step, keyed by the literal string
// `<domain_id>-<network_id>-<device_uuid>-<totp_counter>`.
//
// Those inputs are identifiers, not secrets (decision-032 "Refresh
// authentication"): a derived code is exactly as strong as the controller's
// own derivation today. The server accepts ±1 step.
package totp

import (
	"crypto/hmac"
	"crypto/sha1"
	"encoding/binary"
	"fmt"
	"time"
)

// Period is the code lifetime.
const Period = 600 * time.Second

// Identity is what the code is derived from.
type Identity struct {
	DomainID   string
	NetworkID  string
	DeviceUUID string
	Counter    int
}

// Complete reports whether every input is present.
func (i Identity) Complete() bool {
	return i.DomainID != "" && i.NetworkID != "" && i.DeviceUUID != ""
}

// Code returns the code valid at t.
func Code(id Identity, t time.Time) string {
	secret := fmt.Sprintf("%s-%s-%s-%d", id.DomainID, id.NetworkID, id.DeviceUUID, id.Counter)
	var msg [8]byte
	binary.BigEndian.PutUint64(msg[:], uint64(t.Unix()/int64(Period/time.Second)))
	m := hmac.New(sha1.New, []byte(secret))
	m.Write(msg[:])
	h := m.Sum(nil)
	o := h[len(h)-1] & 0x0f
	v := (uint32(h[o])&0x7f)<<24 | uint32(h[o+1])<<16 | uint32(h[o+2])<<8 | uint32(h[o+3])
	return fmt.Sprintf("%06d", v%1_000_000)
}
