// Package devapi is the client for the device-authenticated edge functions
// (`vpn`, `ssh-ca`). The live-image bootstrap and the installed-gateway agent
// (decision-032) share it, so both speak exactly the same envelope.
package devapi

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/i40sys/iotgw-ng/live-image/internal/envelope"
)

// Client talks to the device-authenticated edge functions (vpn, ssh-ca)
// through Kong. Both use the same envelope: the request body is sealed with the
// device code and so is a successful reply; errors come back as plain JSON.
type Client struct {
	base     string // the API gateway base URL, e.g. https://api.example
	deviceID string
	code     string
	http     *http.Client
}

// New returns a client for deviceID authenticated by code.
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
}

func (e *APIError) Error() string {
	hint := ""
	switch e.Status {
	case http.StatusUnauthorized:
		hint = " — the device code was rejected (expired, or the counter was reset in the UI); take the current code from the UI"
	case http.StatusConflict:
		hint = " — the device's domain is not linked to a pki-manager zone"
	case http.StatusBadGateway, http.StatusServiceUnavailable:
		hint = " — the server could not reach its upstream (pki-manager / database)"
	}
	return fmt.Sprintf("HTTP %d: %s%s", e.Status, e.Message, hint)
}

// Call seals payload, POSTs it to fn and returns the decrypted reply.
func (c *Client) Call(ctx context.Context, fn string, payload any) ([]byte, int, error) {
	plain, err := json.Marshal(payload)
	if err != nil {
		return nil, 0, err
	}
	sealed, err := envelope.Seal(plain, c.code)
	if err != nil {
		return nil, 0, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.Endpoint(fn), bytes.NewReader(sealed))
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Content-Type", "application/octet-stream")
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, 0, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return nil, resp.StatusCode, fmt.Errorf("read reply: %w", err)
	}
	if resp.StatusCode/100 != 2 {
		var e struct {
			Error   string `json:"error"`
			Details string `json:"details"`
		}
		msg := strings.TrimSpace(string(body))
		if json.Unmarshal(body, &e) == nil && e.Error != "" {
			msg = e.Error
			if e.Details != "" {
				msg += ": " + e.Details
			}
		}
		if len(msg) > 300 {
			msg = msg[:300] + "…"
		}
		return nil, resp.StatusCode, &APIError{Status: resp.StatusCode, Message: msg}
	}
	out, err := envelope.Open(body, c.code)
	if err != nil {
		return nil, resp.StatusCode, fmt.Errorf("%s", envelope.Describe(err))
	}
	return out, resp.StatusCode, nil
}
