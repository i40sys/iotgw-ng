// Package devapi is the client for the device-authenticated edge functions
// (`vpn`, `ssh-ca`). The live-image bootstrap and the installed-gateway agent
// (decision-032) share it, so both speak exactly the same envelope.
//
// Authentication (decision-033): a request sealed with the operator's
// one-time code (vpn, ssh-ca enroll / live-enroll), or — for an SSH
// renewal only — a plain JSON request signed by the enrolled host key.
// The gateway never derives a code; it only uses the one it was given.
package devapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/i40sys/iotgw-ng/live-image/internal/envelope"
	"github.com/i40sys/iotgw-ng/live-image/internal/seal"
)

// Client talks to the device-authenticated edge functions (vpn, ssh-ca)
// through Kong.
type Client struct {
	base     string // the API gateway base URL, e.g. https://api.example
	deviceID string
	code     string // "" for the code-less renew call
	http     *http.Client
}

// New returns a client for deviceID authenticated by code ("" when only
// CallPlain is used).
func New(base, deviceID, code string) *Client {
	return &Client{
		base:     strings.TrimRight(base, "/"),
		deviceID: deviceID,
		code:     code,
		http:     &http.Client{Timeout: 30 * time.Second},
	}
}

// Endpoint is the function URL shown to the operator (no secrets in it).
func (c *Client) Endpoint(fn string) string {
	return fmt.Sprintf("%s/functions/v1/%s?device_id=%s", c.base, fn, url.QueryEscape(c.deviceID))
}

// APIError is a non-2xx reply, with the server's error text when it sent one.
type APIError struct {
	Status  int
	Message string
	// Coded: the request was authenticated with a one-time code (so a 401
	// is about the code, not about a host-key signature).
	Coded bool
}

func (e *APIError) Error() string {
	hint := ""
	switch e.Status {
	case http.StatusUnauthorized:
		if e.Coded {
			hint = " — the one-time code was rejected (wrong, expired or already used): take a fresh code from the device page in the iotgw-ng UI"
		}
	case http.StatusTooManyRequests:
		hint = " — too many wrong codes: the device's code endpoints are locked for a while (15 min)"
	case http.StatusConflict:
		if !strings.Contains(e.Message, "already enrolled") {
			hint = " — the device's domain is not linked to a pki-manager zone"
		}
	case http.StatusBadGateway, http.StatusServiceUnavailable:
		hint = " — the server could not reach its upstream (pki-manager / database)"
	}
	return fmt.Sprintf("HTTP %d: %s%s", e.Status, e.Message, hint)
}

// post sends body and returns the reply body of a 2xx, or an *APIError.
func (c *Client) post(ctx context.Context, fn, contentType string, body []byte, coded bool) ([]byte, int, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.Endpoint(fn), bytes.NewReader(body))
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Content-Type", contentType)
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, 0, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()
	out, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return nil, resp.StatusCode, fmt.Errorf("read reply: %w", err)
	}
	if resp.StatusCode/100 != 2 {
		var e struct {
			Error   string `json:"error"`
			Details string `json:"details"`
		}
		msg := strings.TrimSpace(string(out))
		if json.Unmarshal(out, &e) == nil && e.Error != "" {
			msg = e.Error
			if e.Details != "" {
				msg += ": " + e.Details
			}
		}
		if len(msg) > 300 {
			msg = msg[:300] + "…"
		}
		return nil, resp.StatusCode, &APIError{Status: resp.StatusCode, Message: msg, Coded: coded}
	}
	return out, resp.StatusCode, nil
}

// sealed POSTs payload sealed with the code (octet-stream envelope).
func (c *Client) sealed(ctx context.Context, fn string, payload any) ([]byte, int, error) {
	if c.code == "" {
		return nil, 0, errors.New("a one-time code from the iotgw-ng UI is required (-otp CODE)")
	}
	plain, err := json.Marshal(payload)
	if err != nil {
		return nil, 0, err
	}
	body, err := envelope.Seal(plain, c.code)
	if err != nil {
		return nil, 0, err
	}
	return c.post(ctx, fn, "application/octet-stream", body, true)
}

// Call seals payload with the code, POSTs it to fn and returns the reply,
// decrypted with the same code (ssh-ca enroll / live-enroll / trust).
func (c *Client) Call(ctx context.Context, fn string, payload any) ([]byte, int, error) {
	raw, status, err := c.sealed(ctx, fn, payload)
	if err != nil {
		return nil, status, err
	}
	out, err := envelope.Open(raw, c.code)
	if err != nil {
		return nil, status, fmt.Errorf("%s", envelope.Describe(err))
	}
	return out, status, nil
}

// VPNReply says how the vpn function's reply was protected.
type VPNReply struct {
	Config []byte
	// Sealed: sealed to this call's reply_key (decision-033 §4). False = the
	// server still answered with the deprecated code-encrypted envelope.
	Sealed bool
}

// CallVPN requests the WireGuard configuration: a fresh X25519 reply key goes
// into the code-sealed request ("reply_key"), and the reply sealed to it is
// opened with AAD = device_id. A legacy reply (octet-stream, code envelope)
// from a server that predates decision-033 is still accepted.
func (c *Client) CallVPN(ctx context.Context, payload map[string]string) (VPNReply, int, error) {
	k, err := seal.NewKey()
	if err != nil {
		return VPNReply{}, 0, err
	}
	body := make(map[string]string, len(payload)+1)
	for key, v := range payload {
		body[key] = v
	}
	body["reply_key"] = k.Public()
	raw, status, err := c.sealed(ctx, "vpn", body)
	if err != nil {
		return VPNReply{}, status, err
	}
	if seal.IsSealed(raw) {
		out, err := k.Open(raw, c.deviceID)
		if err != nil {
			return VPNReply{}, status, err
		}
		return VPNReply{Config: out, Sealed: true}, status, nil
	}
	out, err := envelope.Open(raw, c.code)
	if err != nil {
		return VPNReply{}, status, fmt.Errorf("%s", envelope.Describe(err))
	}
	return VPNReply{Config: out}, status, nil
}

// CallPlain POSTs payload as plain JSON (no code) and returns the reply as
// is — the ssh-ca `renew` call, authenticated by its host-key signature.
func (c *Client) CallPlain(ctx context.Context, fn string, payload any) ([]byte, int, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, 0, err
	}
	return c.post(ctx, fn, "application/json", body, false)
}
