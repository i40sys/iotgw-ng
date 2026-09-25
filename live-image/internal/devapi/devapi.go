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
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/i40sys/iotgw-ng/live-image/internal/envelope"
	"github.com/i40sys/iotgw-ng/live-image/internal/seal"
)

// DefaultCAFile is the device-API CA the gateway pins (decision-035 §1). It
// ships in the live-image overlay and in the OpenWRT package; the installed
// gateway can point elsewhere with uci iotgw.main.api_ca.
const DefaultCAFile = "/etc/iotgw/api-ca.pem"

// Client talks to the device-authenticated edge functions (vpn, ssh-ca)
// through Kong.
type Client struct {
	base     string // the API gateway base URL, e.g. https://api.example
	deviceID string
	code     string // "" for the code-less renew call
	http     *http.Client
	trust    string // how the server is authenticated (for operator messages)
	upgraded string // the configured http:// base when it was upgraded to https
	err      error  // a TLS setup error, returned by every call (fail closed)
}

// Option configures a Client.
type Option func(*options)

type options struct{ caFile string }

// WithCAFile pins the server certificate to the CA(s) in path when the base
// URL is https:// and the file exists (decision-035 §1). An https URL
// without the file uses the system roots; an http URL ignores it.
func WithCAFile(path string) Option { return func(o *options) { o.caFile = path } }

// New returns a client for deviceID authenticated by code ("" when only
// CallPlain is used).
func New(base, deviceID, code string, opts ...Option) *Client {
	var o options
	for _, f := range opts {
		f(&o)
	}
	base = strings.TrimRight(base, "/")
	c := &Client{deviceID: deviceID, code: code}
	var up bool
	c.base, up = EffectiveBase(base, o.caFile)
	if up {
		c.upgraded = base
	}
	c.http, c.trust, c.err = HTTPClient(c.base, o.caFile)
	if up {
		c.trust += "; upgraded from " + base
	}
	return c
}

// EffectiveBase is the base URL actually used (decision-035 §1). When the
// pinned CA file exists, an http:// base is UPGRADED to https:// on the same
// host with the default port (the configured port is Kong's plain-HTTP
// NodePort, e.g. :8000) and the same path; the client never falls back to
// plain HTTP. Without the CA file, or for an https:// base, base is returned
// unchanged. upgraded reports whether it changed.
func EffectiveBase(base, caFile string) (eff string, upgraded bool) {
	base = strings.TrimRight(base, "/")
	if caFile == "" {
		return base, false
	}
	u, err := url.Parse(base)
	if err != nil || !strings.EqualFold(u.Scheme, "http") || u.Hostname() == "" {
		return base, false
	}
	if _, err := os.Stat(caFile); err != nil {
		return base, false
	}
	u.Scheme = "https"
	u.Host = u.Hostname()
	if strings.Contains(u.Host, ":") { // IPv6 literal
		u.Host = "[" + u.Host + "]"
	}
	return strings.TrimRight(u.String(), "/"), true
}

// Base is the effective base URL (after an http→https upgrade).
func (c *Client) Base() string { return c.base }

// Upgraded is the configured http:// base when the client upgraded it to
// https:// because the pinned CA exists ("" otherwise).
func (c *Client) Upgraded() string { return c.upgraded }

// HTTPClient returns the HTTP client for base: for https:// with an existing
// caFile, one that trusts ONLY the CA(s) in it (pinned); for https:// without
// it, the system roots; for http://, plain HTTP. trust describes the choice.
// A CA file that exists but cannot be read or holds no certificate is an
// error: the client must never silently fall back to wider trust.
func HTTPClient(base, caFile string) (*http.Client, string, error) {
	hc := &http.Client{Timeout: 30 * time.Second}
	u, err := url.Parse(base)
	if err != nil || !strings.EqualFold(u.Scheme, "https") {
		return hc, "plain HTTP (no TLS)", nil
	}
	if caFile == "" {
		return hc, "TLS, system CA roots", nil
	}
	pem, err := os.ReadFile(caFile)
	if errors.Is(err, os.ErrNotExist) {
		return hc, "TLS, system CA roots (no " + caFile + ")", nil
	}
	if err != nil {
		return hc, "", fmt.Errorf("device-API CA %s: %w", caFile, err)
	}
	pool := x509.NewCertPool()
	if !pool.AppendCertsFromPEM(pem) {
		return hc, "", fmt.Errorf("device-API CA %s holds no PEM certificate", caFile)
	}
	tr := http.DefaultTransport.(*http.Transport).Clone()
	tr.TLSClientConfig = &tls.Config{RootCAs: pool, MinVersion: tls.VersionTLS12}
	hc.Transport = tr
	return hc, "TLS, CA pinned to " + caFile, nil
}

// Trust says how the server is authenticated (plain HTTP, system roots or
// the pinned CA) — for progress messages.
func (c *Client) Trust() string { return c.trust }

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
		if !strings.Contains(e.Message, "already enrolled") && !strings.Contains(e.Message, "WireGuard key") {
			hint = " — the device's domain is not linked to a pki-manager zone"
		}
	case http.StatusBadGateway, http.StatusServiceUnavailable:
		hint = " — the server could not reach its upstream (pki-manager / database)"
	}
	return fmt.Sprintf("HTTP %d: %s%s", e.Status, e.Message, hint)
}

// post sends body and returns the reply body of a 2xx, or an *APIError.
func (c *Client) post(ctx context.Context, fn, contentType string, body []byte, coded bool) ([]byte, int, error) {
	if c.err != nil {
		return nil, 0, c.err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.Endpoint(fn), bytes.NewReader(body))
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Content-Type", contentType)
	resp, err := c.http.Do(req)
	if err != nil {
		var ua x509.UnknownAuthorityError
		var he x509.HostnameError
		hint := ""
		switch {
		case errors.As(err, &ua):
			hint = " — the server's certificate is not issued by the trusted CA (" + c.trust + ")"
		case errors.As(err, &he):
			hint = " — the certificate does not name this API address (" + c.base + ")"
		}
		if c.upgraded != "" {
			hint += fmt.Sprintf(" [configured %s, upgraded to %s because the pinned device-API CA exists; no fallback to plain HTTP]", c.upgraded, c.base)
		}
		return nil, 0, fmt.Errorf("request failed: %w%s", err, hint)
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
