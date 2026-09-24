package bootstrap

import "github.com/i40sys/iotgw-ng/live-image/internal/wgconf"

// wgSummary is a parsed wg-quick configuration (internal/wgconf).
type wgSummary = wgconf.Config

// parseWGConf validates a wg-quick config and extracts its fields.
func parseWGConf(conf string) (wgSummary, error) { return wgconf.Parse(conf) }

func splitList(v string) []string { return wgconf.SplitList(v) }
