package collect

import (
	"context"
	"testing"

	"github.com/i40sys/iotgw-ng/live-image/internal/state"
)

func TestHostCAIsCheckedAgainstTheHostCertificate(t *testing.T) {
	ctx := context.Background()
	p := PKI{HostCAFPs: []string{"SHA256:ca"}, HostCertPresent: true, HostCertSignedBy: "SHA256:ca"}
	evalHostCA(ctx, &p, state.Healthy)
	if p.HostCAStatus != state.Healthy {
		t.Fatalf("signed by the Host CA → %s (%s)", p.HostCAStatus, p.HostCADetail)
	}
	p = PKI{HostCAFPs: []string{"SHA256:ca"}, HostCertPresent: true, HostCertSignedBy: "SHA256:other"}
	evalHostCA(ctx, &p, state.Healthy)
	if p.HostCAStatus != state.Failed {
		t.Fatalf("signed by another CA → %s", p.HostCAStatus)
	}
	p = PKI{}
	evalHostCA(ctx, &p, state.Healthy)
	if p.HostCAStatus != state.NotConfigured {
		t.Fatalf("no Host CA → %s", p.HostCAStatus)
	}
}
