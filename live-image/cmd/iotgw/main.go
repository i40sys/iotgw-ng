// Command iotgw is the single binary of the iotgw gateway tooling
// (decision-032): the live image's provisioning (`iotgw bootstrap`, also
// installed as iotgw-bootstrap) and dashboard (`iotgw status`, also
// iotgw-status), and on the installed OpenWRT gateway the self-healing
// daemon and the on-demand VPN/SSH refresh. See internal/cli.
package main

import (
	"os"

	"github.com/i40sys/iotgw-ng/live-image/internal/cli"
)

func main() { os.Exit(cli.Main(os.Args)) }
