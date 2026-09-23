// Command iotgw-status is the live image's operational console
// (decision-031): a read-only Bubble Tea dashboard showing the machine,
// networking, Internet, VPN, VPN-server reachability, SSH PKI and the
// boot-time provisioning record. `q` exits cleanly to the shell it was
// started from; run `iotgw-status` again to reopen it.
package main

import (
	"flag"
	"fmt"
	"io"
	"log"
	"log/syslog"
	"os"

	tea "github.com/charmbracelet/bubbletea"

	"github.com/i40sys/iotgw-ng/live-image/internal/tui"
	"github.com/i40sys/iotgw-ng/live-image/internal/version"
)

func main() {
	showVersion := flag.Bool("version", false, "print the version and exit")
	flag.Parse()
	if *showVersion {
		fmt.Println("iotgw-status", version.String(), "| live image:", version.ImageRelease())
		return
	}

	// Never write diagnostics to the terminal the TUI owns: log to journald
	// through syslog, or nowhere.
	if w, err := syslog.New(syslog.LOG_INFO|syslog.LOG_USER, "iotgw-status"); err == nil {
		log.SetOutput(w)
		log.SetFlags(0)
	} else {
		log.SetOutput(io.Discard)
	}
	log.Printf("iotgw-status %s starting (uid %d)", version.String(), os.Getuid())

	p := tea.NewProgram(tui.New(), tea.WithAltScreen())
	if _, err := p.Run(); err != nil {
		log.Printf("dashboard error: %v", err)
		fmt.Fprintln(os.Stderr, "iotgw-status:", err)
		os.Exit(1)
	}
	log.Printf("iotgw-status exited by the operator")
	fmt.Println("iotgw-status closed — you are in a normal shell. Run 'iotgw-status' to reopen the dashboard.")
}
