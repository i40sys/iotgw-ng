package agent

import (
	"strings"
	"testing"

	"github.com/i40sys/iotgw-ng/live-image/internal/uci"
	"github.com/i40sys/iotgw-ng/live-image/internal/wgconf"
)

const dump = `{"interface":[
 {"interface":"lan","up":true,"proto":"static","l3_device":"br-lan","metric":0,"route":[]},
 {"interface":"wan","up":true,"proto":"dhcp","l3_device":"eth0","metric":0,
  "route":[{"target":"0.0.0.0","mask":0,"nexthop":"10.2.0.1","source":"10.2.0.210/32"}]},
 {"interface":"wg0","up":true,"proto":"wireguard","l3_device":"wg0","metric":5,
  "route":[{"target":"0.0.0.0","mask":0,"nexthop":"0.0.0.0"}]}
]}`

func TestParseUplink(t *testing.T) {
	u, err := ParseUplink(dump, "wg0")
	if err != nil {
		t.Fatal(err)
	}
	if u != (Uplink{Iface: "wan", Device: "eth0", Gateway: "10.2.0.1"}) {
		t.Fatalf("uplink = %+v", u)
	}
	if _, err := ParseUplink(`{"interface":[{"interface":"lan","up":true,"proto":"static"}]}`, "wg0"); err == nil {
		t.Fatal("found an uplink without a default route")
	}
}

// The gw-c3 configuration after install: an anonymous route to the endpoint
// with no gateway (on-link) and a full-tunnel peer without the network.
const gwc3 = `network.wan=interface
network.wan.device='eth0'
network.wan.proto='dhcp'
network.wg0=interface
network.wg0.proto='wireguard'
network.wg0.metric='5'
network.wgserver=wireguard_wg0
network.wgserver.endpoint_host='216.45.62.117'
network.wgserver.endpoint_port='443'
network.wgserver.route_allowed_ips='1'
network.wgserver.allowed_ips='0.0.0.0/0'
network.cfg0a1b2c=route
network.cfg0a1b2c.interface='wan'
network.cfg0a1b2c.target='216.45.62.117'
network.cfg0a1b2c.netmask='255.255.255.255'
`

func TestEndpointRouteReplacesTheInstallTimeRoute(t *testing.T) {
	secs := uci.ParseShow("network", gwc3)
	ops := EndpointRouteOps(secs, Uplink{Iface: "wan", Device: "eth0", Gateway: "10.2.0.1"}, "216.45.62.117")
	got := Describe(ops)
	for _, want := range []string{
		"delete network.cfg0a1b2c",
		"network.iotgw_endpoint=route",
		"network.iotgw_endpoint.interface=wan",
		"network.iotgw_endpoint.gateway=10.2.0.1",
	} {
		if !strings.Contains(got, want) {
			t.Errorf("ops %q lack %q", got, want)
		}
	}

	// Already right → nothing to do (idempotent).
	fixed := gwc3 + `network.iotgw_endpoint=route
network.iotgw_endpoint.interface='wan'
network.iotgw_endpoint.target='216.45.62.117'
network.iotgw_endpoint.netmask='255.255.255.255'
network.iotgw_endpoint.gateway='10.2.0.1'
`
	fixed = strings.Replace(fixed, "network.cfg0a1b2c=route", "network.cfg0a1b2c=rule", 1)
	if ops := EndpointRouteOps(uci.ParseShow("network", fixed), Uplink{Iface: "wan", Gateway: "10.2.0.1"}, "216.45.62.117"); len(ops) != 0 {
		t.Errorf("not idempotent: %s", Describe(ops))
	}

	// The router changed (new DHCP site) → only the gateway moves.
	ops = EndpointRouteOps(uci.ParseShow("network", fixed), Uplink{Iface: "wan", Gateway: "192.168.8.1"}, "216.45.62.117")
	if Describe(ops) != "network.iotgw_endpoint.gateway=192.168.8.1" {
		t.Errorf("router change ops = %s", Describe(ops))
	}

	// No router known → never install an on-link route; drop ours.
	ops = EndpointRouteOps(uci.ParseShow("network", fixed), Uplink{Iface: "wan"}, "216.45.62.117")
	if Describe(ops) != "delete network.iotgw_endpoint" {
		t.Errorf("no-gateway ops = %s", Describe(ops))
	}
}

func TestSplitRouteAddsTheNetworkOnce(t *testing.T) {
	secs := uci.ParseShow("network", gwc3)
	ops := SplitRouteOps(secs, "wg0", "10.5.0.0/24")
	if Describe(ops) != "network.wgserver.allowed_ips=[10.5.0.0/24 0.0.0.0/0]" {
		t.Fatalf("ops = %s", Describe(ops))
	}
	done := strings.Replace(gwc3, "allowed_ips='0.0.0.0/0'", "allowed_ips='10.5.0.0/24' '0.0.0.0/0'", 1)
	if ops := SplitRouteOps(uci.ParseShow("network", done), "wg0", "10.5.0.0/24"); len(ops) != 0 {
		t.Fatalf("not idempotent: %s", Describe(ops))
	}
}

func TestEgressOps(t *testing.T) {
	secs := uci.ParseShow("network", gwc3)
	up := Uplink{Iface: "wan"}
	if got := Describe(EgressOps(secs, up, "wg0", EgressVPN)); got != "network.wan.metric=20" {
		t.Fatalf("vpn ops = %s", got)
	}
	onVPN := uci.ParseShow("network", gwc3+"network.wan.metric='20'\n")
	if got := Describe(EgressOps(onVPN, up, "wg0", EgressLAN)); got != "delete network.wan.metric" {
		t.Fatalf("lan ops = %s", got)
	}
	// An operator's own metric is never touched.
	own := uci.ParseShow("network", gwc3+"network.wan.metric='7'\n")
	if ops := EgressOps(own, up, "wg0", EgressLAN); len(ops) != 0 {
		t.Fatalf("touched the operator's metric: %s", Describe(ops))
	}
}

func TestWGOpsAppliesTheServerConfigAndRedactsTheKey(t *testing.T) {
	conf, err := wgconf.Parse("# Network: 10.5.0.1/24\n[Interface]\nPrivateKey = S3CR3T\nAddress = 10.5.0.1/32\n[Peer]\nPublicKey = NEWPEER\nEndpoint = 216.45.62.117:443\nAllowedIPs = 0.0.0.0/0\n")
	if err != nil {
		t.Fatal(err)
	}
	ops := WGOps(uci.ParseShow("network", gwc3), "wg0", conf)
	got := Describe(ops)
	if strings.Contains(got, "S3CR3T") {
		t.Fatalf("private key leaked into %q", got)
	}
	for _, want := range []string{"network.wg0.private_key=<redacted>", "network.wg0.addresses=[10.5.0.1/32]", "network.wgserver.public_key=NEWPEER", "network.wgserver.allowed_ips=[10.5.0.0/24 0.0.0.0/0]"} {
		if !strings.Contains(got, want) {
			t.Errorf("ops %q lack %q", got, want)
		}
	}
	var key string
	for _, o := range ops {
		if o.Path == "network.wg0.private_key" {
			key = o.Value
		}
	}
	if key != "S3CR3T" {
		t.Fatalf("the op must still carry the real key, got %q", key)
	}
}
