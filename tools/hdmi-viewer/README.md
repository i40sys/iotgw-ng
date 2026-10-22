# HDMI Viewer

A small Windows tool written in Rust. It opens a **USB HDMI capture card** (any UVC /
Media Foundation device, e.g. Razer Ripsaw HD, Elgato Cam Link, MS2109 dongles) and
shows the captured screen (1920×1080 by default) live in a resizable window. The picture
is **stretched to fill the window**, and a menu bar lets you set up the capture card.

It is a single self-contained `hdmi-viewer.exe` (~6 MB). It needs no runtime, no DLLs
next to it, and no installer.

## Features

- Auto-opens the last-used device. Otherwise it picks the first device that looks like a
  capture card ("HDMI", "capture", "Cam Link", …).
- Auto format: **1920×1080 at the highest frame rate**. On a tie it prefers an
  uncompressed format (NV12/YUY2) over MJPEG.
- Stretches to the window by default. *View → Keep aspect ratio* switches to letterboxing.
- Menus:
  - **Device**: pick a capture device, refresh the list, disconnect, exit.
  - **Format**: every resolution / fps / pixel format the card offers (1080p modes in bold).
  - **Capture**:
    - *Capture settings…*: sliders for the card's UVC controls (brightness, contrast,
      saturation, hue, sharpness, gamma, gain, …), each with a reset button.
    - *Driver properties…*: opens the card driver's own property dialog, the same one
      AMCap/OBS show.
    - YUV→RGB conversion: BT.709/BT.601 and limited/full range. Use these to fix
      washed-out or over-saturated colours.
    - Mirror / flip.
  - **View**: stretch or keep aspect, smooth/pixel scaling, stats overlay, a 1:1 1920×1080
    window, fullscreen, hide the menu bar.
- Remembers its settings in `%APPDATA%\hdmi-viewer`.
- Writes a log to `%TEMP%\hdmi-viewer.log`.

### Keyboard / mouse

| Key | Action |
|---|---|
| `F11`, `Alt+Enter`, double-click | Toggle fullscreen |
| `Esc` | Leave fullscreen |
| `M` | Show / hide the menu bar |
| `C` | Capture settings window |
| `S` | Stats overlay (format, fps shown / from the card, % damaged frames dropped, convert time) |
| Right-click | Context menu |

## Building the .exe

Pick one of the two options below. Both write **`dist/hdmi-viewer.exe`**.

### Option A: from Linux / WSL (cross-compile)

Prerequisites (one-time):

```bash
curl https://sh.rustup.rs -sSf | sh            # Rust, if missing
sudo apt install gcc-mingw-w64-x86-64 cmake    # MinGW-w64 linker; cmake builds libjpeg-turbo
```

Build:

```bash
cd tools/hdmi-viewer
./build.sh            # or: just build
```

`build.sh` adds the `x86_64-pc-windows-gnu` Rust target automatically if it is missing.

Other recipes (`just --list`):

| Recipe | What it does |
|---|---|
| `just build` | Release `.exe` → `dist/` |
| `just build-debug` | Debug `.exe` (keeps a console window for log output) |
| `just run` | WSL only: build, copy to the Windows `%TEMP%` and launch on the desktop |
| `just test` | Unit tests (pixel conversion, damaged-MJPEG detection) |
| `just lint` | Clippy against the Windows target |
| `just clean` | Remove `target/` and `dist/` |

### Option B: natively on Windows

Prerequisites (one-time): install Rust from <https://rustup.rs>. When `rustup-init`
asks, also install the *Visual Studio C++ Build Tools*, and install **CMake**
(<https://cmake.org/download/>, “add to PATH”): it builds libjpeg-turbo, the MJPEG decoder.
Without `nasm` on the PATH libjpeg-turbo builds without SIMD (~6 ms per 1080p frame, plenty for 60 fps).

Build: double-click **`build.cmd`**, or run in PowerShell:

```powershell
cd tools\hdmi-viewer
.\build.ps1           # -Debug for a debug build
```

The C runtime is linked statically on both toolchains (`.cargo/config.toml`), so the
`.exe` runs on any Windows 10/11 x64 machine.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| *Hardware MFT failed to start streaming due to lack of hardware resources* | Another app (OBS, Zoom, Teams, Camera, …) is using the card. Close it, then *Device → pick the card* again. |
| Black window, "Opening…" stays forever | The card delivers no frames. Check the HDMI source is on and not HDCP-protected. Try another format. |
| Low fps at 1080p | USB 2 cards only do 1080p uncompressed at ~5 fps. Pick an **MJPEG** 1080p mode in *Format*. |
| Colours washed out / too contrasty | *Capture → Full range* or *Limited range*. Only affects YUY2/NV12 formats. |
| Picture flickers: half of it shifted sideways and tinted blue, now and then | Damaged MJPEG frames from the card (see below). Fixed since frames are checked; if the stats overlay shows a high damaged share, try another USB port (not through a hub). |
| Log says `stream open: … @ 1 fps` | Cosmetic: the capture library reads Media Foundation's frame-rate ratio wrongly. The stats overlay shows the real rate. |
| Card not listed | *Device → Refresh device list*. Check it appears under *Cameras* in Device Manager. |

Run `just build-debug`, or look at `%TEMP%\hdmi-viewer.log`, for details.
`RUST_LOG=hdmi_viewer=debug` adds per-second fps / timing lines.

## Damaged MJPEG frames

Cheap USB capture cards (MS2109 class) lose USB data now and then: the JPEG
then ends before its last blocks. Measured on one at 1080p60: **392 of 600 frames
damaged**, 95 of them visibly broken (everything below the loss shifted and
tinted blue). Lenient decoders (zune-jpeg, jpeg-decoder) fill the missing data
with zeros without a word, so those frames reached the screen as a flicker.

MJPEG is decoded with **libjpeg-turbo** (TurboJPEG, built from source and
linked statically), which reports damaged data. Such a frame is **dropped** and
the last good one stays on screen. On the 600 frames above it flagged every
damaged one and no clean one. Drops are summarised in the log every 10 s
(`dropped N of M frames from the card as damaged`) and shown in the stats overlay.

Diagnostics: with `HDMI_VIEWER_DUMP=<dir>` set, the first 600 raw frames are
written there (`frame-0000.bin`, …) as they came from the card — check them
with `djpeg -outfile /dev/null frame-0000.bin` (libjpeg-turbo-progs). They show
whatever is on the captured screen: treat them as sensitive.

## How it works

```
capture thread (owns the COM / Media Foundation objects)
  nokhwa Camera (MSMF backend) ── frame() ──► raw MJPEG / NV12 / YUY2 / RGB24
  convert.rs: TurboJPEG / fixed-point YUV→RGB ──► egui ColorImage ──┐
                                                                     │ Arc<Mutex<Shared>>
UI thread (eframe / egui, OpenGL)                                    ▼
  menus + settings window ── Cmd channel ──► capture thread     texture ── painted over the
                                                                whole window (stretch) or fitted
```

- `src/capture.rs`: device enumeration, format choice, the frame loop, UVC controls.
- `src/convert.rs`: pixel-format conversion and the damaged-frame check, with unit tests.
- `src/props.rs`: driver property pages (DirectShow `ISpecifyPropertyPages` +
  `OleCreatePropertyFrame`, on their own STA thread).
- `src/main.rs`: window, menus, rendering, persistence.
