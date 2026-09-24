package iproute

import "testing"

func TestParseLine(t *testing.T) {
	cases := []struct {
		in   string
		want Route
	}{
		{"1.1.1.1 via 10.2.0.1 dev eth0 src 10.2.0.210 uid 0", Route{Dst: "1.1.1.1", Gateway: "10.2.0.1", Dev: "eth0"}},
		{"216.45.62.117 dev eth0  src 10.2.0.210 ", Route{Dst: "216.45.62.117", Dev: "eth0"}},
		{"default dev wg0 table 51820 scope link", Route{Dst: "default", Dev: "wg0", Table: "51820"}},
		{"default via 10.2.0.1 dev eth0 proto dhcp src 10.2.0.210 metric 20", Route{Dst: "default", Gateway: "10.2.0.1", Dev: "eth0", Metric: "20"}},
		{"local 10.5.0.1 dev wg0 table local proto kernel scope host src 10.5.0.1", Route{Dst: "10.5.0.1", Dev: "wg0", Table: "local"}},
	}
	for _, c := range cases {
		got, ok := ParseLine(c.in)
		if !ok || got != c.want {
			t.Errorf("ParseLine(%q) = %+v, %v; want %+v", c.in, got, ok, c.want)
		}
	}
	if _, ok := ParseLine("   "); ok {
		t.Error("blank line parsed")
	}
}
