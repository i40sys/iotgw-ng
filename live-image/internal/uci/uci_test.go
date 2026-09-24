package uci

import (
	"reflect"
	"testing"
)

func TestParseShow(t *testing.T) {
	out := `network.wan=interface
network.wan.device='eth0'
network.wan.proto='dhcp'
network.wgserver=wireguard_wg0
network.wgserver.allowed_ips='10.5.0.0/24' '0.0.0.0/0'
network.wgserver.description='it'\''s here'
network.cfg0a1b2c=route
network.cfg0a1b2c.target='216.45.62.117'
other.x=y
`
	secs := ParseShow("network", out)
	if len(secs) != 3 {
		t.Fatalf("got %d sections: %+v", len(secs), secs)
	}
	if secs[0].Name != "wan" || secs[0].Type != "interface" || secs[0].Get("proto") != "dhcp" {
		t.Errorf("wan = %+v", secs[0])
	}
	if got := secs[1].Options["allowed_ips"]; !reflect.DeepEqual(got, []string{"10.5.0.0/24", "0.0.0.0/0"}) {
		t.Errorf("allowed_ips = %q", got)
	}
	if got := secs[1].Get("description"); got != "it's here" {
		t.Errorf("escaped quote = %q", got)
	}
	if secs[2].Type != "route" || secs[2].Get("target") != "216.45.62.117" {
		t.Errorf("anonymous route = %+v", secs[2])
	}
}
