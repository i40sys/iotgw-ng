package netinfo

import "testing"

func TestHexIP(t *testing.T) {
	ip, err := hexIP("0100020A") // 10.2.0.1 in /proc/net/route byte order
	if err != nil || ip.String() != "10.2.0.1" {
		t.Fatalf("got %v %v", ip, err)
	}
}
