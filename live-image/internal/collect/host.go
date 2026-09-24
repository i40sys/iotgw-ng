package collect

import (
	"bufio"
	"context"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"

	"github.com/i40sys/iotgw-ng/live-image/internal/cmdline"
	"github.com/i40sys/iotgw-ng/live-image/internal/platform"
	"github.com/i40sys/iotgw-ng/live-image/internal/uci"
	"github.com/i40sys/iotgw-ng/live-image/internal/version"
)

// CollectHost summarises the machine from procfs/sysfs (no commands).
func CollectHost(ctx context.Context) Host {
	h := Host{
		Arch:         runtime.GOARCH,
		CPUs:         runtime.NumCPU(),
		ImageRelease: version.ImageRelease(),
		ToolVersion:  version.Version,
	}
	h.Hostname, _ = os.Hostname()
	if b, err := os.ReadFile("/proc/sys/kernel/osrelease"); err == nil {
		h.Kernel = strings.TrimSpace(string(b))
	}
	if b, err := os.ReadFile("/proc/sys/kernel/arch"); err == nil {
		h.Arch = strings.TrimSpace(string(b))
	}
	h.CPUModel = cpuModel()
	h.MemTotal = memTotal()
	h.Disks = disks()
	if platform.IsOpenWRT() {
		// Installed gateway: identity from /etc/config/iotgw, OS from OpenWRT.
		h.DeviceID = uci.New().Get(ctx, "iotgw.main.device_id")
		h.BootSource = "installed disk"
		if r := platform.Release(); r != "" {
			h.ImageRelease = r
		}
		return h
	}
	if args, err := cmdline.Read(); err == nil {
		h.DeviceID = args["device_id"]
		h.BootSource = bootSource(args)
	}
	return h
}

func cpuModel() string {
	f, err := os.Open("/proc/cpuinfo")
	if err != nil {
		return ""
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		k, v, ok := strings.Cut(sc.Text(), ":")
		if ok && strings.TrimSpace(k) == "model name" {
			return strings.Join(strings.Fields(v), " ")
		}
	}
	return ""
}

func memTotal() uint64 {
	f, err := os.Open("/proc/meminfo")
	if err != nil {
		return 0
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		fs := strings.Fields(sc.Text())
		if len(fs) >= 2 && fs[0] == "MemTotal:" {
			kb, _ := strconv.ParseUint(fs[1], 10, 64)
			return kb * 1024
		}
	}
	return 0
}

func readTrim(path string) string {
	b, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(b))
}

func disks() []Disk {
	entries, err := os.ReadDir("/sys/block")
	if err != nil {
		return nil
	}
	var out []Disk
	for _, e := range entries {
		name := e.Name()
		if strings.HasPrefix(name, "loop") || strings.HasPrefix(name, "ram") || strings.HasPrefix(name, "zram") || strings.HasPrefix(name, "dm-") {
			continue
		}
		base := filepath.Join("/sys/block", name)
		sectors, _ := strconv.ParseUint(readTrim(filepath.Join(base, "size")), 10, 64)
		if sectors == 0 {
			continue
		}
		out = append(out, Disk{
			Name:      name,
			SizeBytes: sectors * 512,
			Model:     strings.Join(strings.Fields(readTrim(filepath.Join(base, "device", "model"))), " "),
			Removable: readTrim(filepath.Join(base, "removable")) == "1",
		})
	}
	return out
}

// bootSource describes where the live system came from.
func bootSource(args map[string]string) string {
	if f := args["fetch"]; f != "" {
		return "network (PXE) " + f
	}
	if _, ok := args["boot"]; ok {
		return "live medium (" + args["boot"] + ")"
	}
	return "unknown"
}
