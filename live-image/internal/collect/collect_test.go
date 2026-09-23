package collect

import (
	"testing"

	"github.com/i40sys/iotgw-ng/live-image/internal/state"
)

func TestParseWGDump(t *testing.T) {
	out := "privkey\tpubkey\t44268\t0xca6c\n" +
		"MVrf5pB0sPD9pQjV62NDxJNfBuJj2borv9kv8Ba4NiY=\t(none)\t216.45.62.117:443\t0.0.0.0/0\t1790140793\t348\t1268\t20\n"
	peers := parseWGDump(out)
	if len(peers) != 1 || peers[0].Endpoint != "216.45.62.117:443" || peers[0].Rx != 348 || peers[0].LastHandshake.Unix() != 1790140793 {
		t.Fatalf("unexpected: %+v", peers)
	}
}

func TestParseCertListing(t *testing.T) {
	out := `live-cert.pub:
        Type: ecdsa-sha2-nistp256-cert-v01@openssh.com host certificate
        Public key: ECDSA-CERT SHA256:NScQ4e7vUpIhyplq3uaw33yxaohs7o8VlZPTmyEqmt0
        Signing CA: ECDSA SHA256:uLO/7gj+bYWe3IcBriQU68sUnZriTfPbDXVB8HmcyPE (using ecdsa-sha2-nistp256)
        Key ID: "live-gw-c3"
        Serial: 7
        Valid: from 2026-09-23T09:08:13 to 2026-09-23T21:13:13
        Principals: 
                live-gw-c3-9a8ce31d.c3.comforsa.iotgw
                live-gw-c3.c3.comforsa.iotgw
        Critical Options: (none)
        Extensions: (none)
`
	ci := parseCertListing(out)
	if ci.SignedBy != "SHA256:uLO/7gj+bYWe3IcBriQU68sUnZriTfPbDXVB8HmcyPE" || len(ci.Principals) != 2 || ci.ValidTo.Hour() != 21 {
		t.Fatalf("unexpected: %+v", ci)
	}
}

func TestWorst(t *testing.T) {
	if worst(state.Healthy, state.Warning, state.Healthy) != state.Warning {
		t.Fatal("warning must dominate healthy")
	}
	if worst(state.Warning, state.Failed) != state.Failed {
		t.Fatal("failed must dominate")
	}
}

func TestReachabilityNoEndpoint(t *testing.T) {
	r := CollectReachability(t.Context(), VPN{})
	if r.Status != state.NotConfigured {
		t.Fatalf("got %s", r.Status)
	}
}
