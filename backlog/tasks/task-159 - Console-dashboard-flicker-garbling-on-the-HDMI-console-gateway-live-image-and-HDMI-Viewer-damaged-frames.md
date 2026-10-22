---
id: TASK-159
title: >-
  Console dashboard flicker/garbling on the HDMI console (gateway + live image)
  and HDMI Viewer damaged frames
status: Done
assignee: []
created_date: '2026-10-22 07:45'
updated_date: '2026-10-22 07:45'
labels:
  - console
  - tui
  - hdmi-viewer
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Problem.** On the gateway's local console (and the live image), the iotgw dashboard looked garbled and "blinked" after a VPN refresh, and on the Details view: panels overlapping, the lower half shifted sideways and tinted blue (seen on gw-c3 through the HDMI capture tool, `tools/hdmi-viewer`).

**Two independent causes were found:**
- **Dashboard (iotgw agent):** other processes write to the same VT. procd runs hotplug/init scripts with `/dev/console` as stdout/stderr, so every network reload (VPN refresh, self-healing repair, boot) drops text on tty1. Bubble Tea only rewrites lines it believes changed, so that text stayed.
- **HDMI Viewer:** the USB capture card (MS2109 class) sends damaged MJPEG frames (lost USB data), and the lenient decoder showed them.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Stray console output is wiped from the dashboard without flashing (gateway and live image)
- [x] #2 The gateway's own screen (/dev/vcsa1) is shown to be intact while the capture showed garbage
- [x] #3 HDMI Viewer drops damaged MJPEG frames and keeps the last good one, with no clean frame rejected
- [x] #4 Validated on gw-c3 (10.2.0.210) through the HDMI capture
- [x] #5 Documented (live-image README, tools/hdmi-viewer README) and released
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
**Done in v0.7.2.** Both causes fixed and validated on gw-c3 via the HDMI capture.

**Diagnosis / evidence:**
- Reproduced the dashboard bug in tmux by writing kernel/hotplug-style lines to the TUI's pty: the garbage stayed until those lines changed.
- Kernel messages were already off (`iotgw-console` sets printk to 1); the writers are procd's hotplug/init scripts on `/dev/console`.
- Read the gateway's real screen buffer (`/dev/vcsa1`) at the same moments as HDMI Viewer captures: the VT was intact while a capture showed the shifted, blue-tinted frame. So the Details-view "failure" was the capture tool.
- Dumped 600 raw frames (`HDMI_VIEWER_DUMP`): the card sends 60 fps; 392/600 are damaged ("premature end of data segment") and 95 are visibly broken. zune-jpeg (even strict) and jpeg-decoder zero-fill silently; TurboJPEG flagged 392/392 with 0 false rejects.

**What changed:**
- `live-image/internal/tui/repaint.go`: a full in-place repaint (replays the terminal size, so the renderer rewrites every line from home; no clear, no flash) every 10 s, and every 1 s during a console action and for 10 s after it. A generation counter keeps one tick chain. The old 60 s `tea.ClearScreen` (it flashed) is removed; `[r]` still clears.
- `tools/hdmi-viewer`: MJPEG is decoded with TurboJPEG (libjpeg-turbo built via cmake, linked statically). Damaged frames are dropped and the last good one is kept; a log summary every 10 s; the stats overlay shows fps shown/from the card and % dropped; diagnostic `HDMI_VIEWER_DUMP=<dir>`.
- Tests: `repaint_test.go` (size replay, intervals, stale chain dropped); `convert.rs` (clean frame, frame with lost data, garbage).

**Known, not fixed:**
- The log line `stream open: … @ 1 fps` is cosmetic: nokhwa reads MF_MT_FRAME_RATE (num<<32|den) as `u32`.
- The damage rate is the card's; another USB port or card may lower it.
<!-- SECTION:NOTES:END -->
