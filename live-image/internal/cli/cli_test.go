package cli

import (
	"testing"

	"github.com/i40sys/iotgw-ng/live-image/internal/platform"
)

func TestGatewayForPlatform(t *testing.T) {
	if _, ok := gatewayFor(platform.OpenWRT, nil).(openwrtGateway); !ok {
		t.Fatal("OpenWRT must use the agent (UCI + transactions)")
	}
	if _, ok := gatewayFor(platform.LiveImage, nil).(liveGateway); !ok {
		t.Fatal("the live image must use the bootstrap (wg-quick)")
	}
}

func TestUsageErrors(t *testing.T) {
	for _, argv := range [][]string{{"iotgw"}, {"iotgw", "nope"}, {"iotgw", "vpn"}, {"iotgw", "ssh", "x"}, {"iotgw", "internet"}} {
		if code := Main(argv); code != 2 {
			t.Errorf("%v exited %d, want 2 (usage)", argv, code)
		}
	}
	platform.Override = platform.LiveImage
	defer func() { platform.Override = "" }()
	if code := Main([]string{"iotgw", "daemon"}); code != 1 {
		t.Errorf("daemon on the live image exited %d, want 1", code)
	}
	if code := Main([]string{"iotgw", "hold", "status"}); code != 1 {
		t.Errorf("hold on the live image exited %d, want 1", code)
	}
}
