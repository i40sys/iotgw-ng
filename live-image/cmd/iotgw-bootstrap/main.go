// Command iotgw-bootstrap provisions the live image at boot (decision-031):
// device identity → VPN (vpn API) → SSH PKI (ssh-ca API) → sshd, recording
// every step in /run/iotgw/bootstrap.json for the iotgw-status dashboard.
// It runs once per boot as root from iotgw-bootstrap.service.
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/i40sys/iotgw-ng/live-image/internal/bootstrap"
	"github.com/i40sys/iotgw-ng/live-image/internal/state"
	"github.com/i40sys/iotgw-ng/live-image/internal/version"
)

func main() {
	statePath := flag.String("state", state.File, "bootstrap state document")
	showVersion := flag.Bool("version", false, "print the version and exit")
	otp := flag.String("otp", "", "one-time code to use instead of the boot-time one (manual retry after it expired)")
	flag.Parse()
	if *showVersion {
		fmt.Println("iotgw-bootstrap", version.String())
		return
	}
	// systemd adds timestamps; keep lines clean for journald.
	log.SetFlags(0)
	if os.Geteuid() != 0 {
		log.Fatal("iotgw-bootstrap must run as root")
	}
	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()
	ctx, cancelT := context.WithTimeout(ctx, 10*time.Minute)
	defer cancelT()

	log.Printf("iotgw-bootstrap %s starting", version.String())
	r := bootstrap.NewRunner(*statePath)
	r.CodeOverride = *otp
	r.Run(ctx)
	log.Printf("iotgw-bootstrap finished; state in %s", *statePath)
}
