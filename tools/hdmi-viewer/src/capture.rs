//! Capture worker: one thread owns the Media Foundation camera (COM objects stay on
//! the thread that created them). The UI talks to it with `Cmd`s and reads `Shared`.

use std::sync::mpsc::{Receiver, RecvTimeoutError, Sender, channel};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use eframe::egui::{self, ColorImage};
use nokhwa::Camera;
use nokhwa::utils::{
    ApiBackend, CameraControl, CameraFormat, CameraIndex, ControlValueSetter, FrameFormat,
    KnownCameraControl, RequestedFormat, RequestedFormatType,
};
use serde::{Deserialize, Serialize};

use crate::convert::{ConvertOptions, FrameError, to_color_image};

/// Pixel formats we know how to convert.
static FORMATS: &[FrameFormat] = &[
    FrameFormat::MJPEG,
    FrameFormat::YUYV,
    FrameFormat::NV12,
    FrameFormat::RAWBGR,
    FrameFormat::RAWRGB,
    FrameFormat::GRAY,
];

/// Preferred resolution when the user did not pick a format.
pub const TARGET: (u32, u32) = (1920, 1080);

#[derive(Clone, Debug)]
pub struct Device {
    pub index: u32,
    pub name: String,
}

/// Serializable format choice (persisted between runs).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct FormatSel {
    pub width: u32,
    pub height: u32,
    pub fps: u32,
    pub fourcc: Fourcc,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum Fourcc {
    Mjpeg,
    Yuyv,
    Nv12,
    Bgr,
    Rgb,
    Gray,
}

impl From<FrameFormat> for Fourcc {
    fn from(f: FrameFormat) -> Self {
        match f {
            FrameFormat::MJPEG => Self::Mjpeg,
            FrameFormat::YUYV => Self::Yuyv,
            FrameFormat::NV12 => Self::Nv12,
            FrameFormat::RAWBGR => Self::Bgr,
            FrameFormat::RAWRGB => Self::Rgb,
            FrameFormat::GRAY => Self::Gray,
        }
    }
}

impl From<Fourcc> for FrameFormat {
    fn from(f: Fourcc) -> Self {
        match f {
            Fourcc::Mjpeg => Self::MJPEG,
            Fourcc::Yuyv => Self::YUYV,
            Fourcc::Nv12 => Self::NV12,
            Fourcc::Bgr => Self::RAWBGR,
            Fourcc::Rgb => Self::RAWRGB,
            Fourcc::Gray => Self::GRAY,
        }
    }
}

impl From<&CameraFormat> for FormatSel {
    fn from(f: &CameraFormat) -> Self {
        Self {
            width: f.width(),
            height: f.height(),
            fps: f.frame_rate(),
            fourcc: f.format().into(),
        }
    }
}

impl FormatSel {
    pub fn to_camera_format(self) -> CameraFormat {
        CameraFormat::new_from(self.width, self.height, self.fourcc.into(), self.fps)
    }

    pub fn label(&self) -> String {
        let cc = match self.fourcc {
            Fourcc::Mjpeg => "MJPEG",
            Fourcc::Yuyv => "YUY2",
            Fourcc::Nv12 => "NV12",
            Fourcc::Bgr => "RGB24",
            Fourcc::Rgb => "RGB",
            Fourcc::Gray => "GRAY",
        };
        format!("{}x{} @ {} fps  {}", self.width, self.height, self.fps, cc)
    }
}

#[derive(Clone, Debug, Default)]
pub enum Status {
    #[default]
    Idle,
    Opening(String),
    Streaming,
    Error(String),
}

#[derive(Default)]
pub struct Shared {
    pub devices: Vec<Device>,
    pub open_device: Option<Device>,
    pub formats: Vec<FormatSel>,
    pub current: Option<FormatSel>,
    pub controls: Vec<CameraControl>,
    pub status: Status,
    /// Latest decoded frame, taken by the UI.
    pub frame: Option<ColorImage>,
    /// Frames per second shown (clean frames).
    pub fps: f32,
    /// Frames per second the card delivers, damaged ones included.
    pub card_fps: f32,
    /// Share of the card's frames dropped as damaged over the last second, in %.
    pub dropped_pct: f32,
    pub decode_ms: f32,
    pub convert: ConvertOptions,
    /// Last non-fatal message (e.g. a control the driver refused).
    pub notice: Option<String>,
}

pub enum Cmd {
    RefreshDevices,
    Open {
        index: u32,
        format: Option<FormatSel>,
    },
    Close,
    SetControl(KnownCameraControl, ControlValueSetter),
    ResetControls,
    ReloadControls,
}

pub struct Capture {
    pub shared: Arc<Mutex<Shared>>,
    tx: Sender<Cmd>,
}

impl Capture {
    pub fn spawn(ctx: egui::Context, convert: ConvertOptions) -> Self {
        let shared = Arc::new(Mutex::new(Shared {
            convert,
            ..Default::default()
        }));
        let (tx, rx) = channel();
        let worker_shared = shared.clone();
        // The camera is created on (and never leaves) the capture thread.
        std::thread::Builder::new()
            .name("capture".into())
            .spawn(move || {
                Worker {
                    shared: worker_shared,
                    ctx,
                    camera: None,
                }
                .run(rx)
            })
            .expect("spawn capture thread");
        Self { shared, tx }
    }

    pub fn send(&self, cmd: Cmd) {
        let _ = self.tx.send(cmd);
    }

    pub fn lock(&self) -> std::sync::MutexGuard<'_, Shared> {
        self.shared.lock().unwrap_or_else(|e| e.into_inner())
    }
}

struct Worker {
    shared: Arc<Mutex<Shared>>,
    ctx: egui::Context,
    camera: Option<Camera>,
}

impl Worker {
    fn lock(&self) -> std::sync::MutexGuard<'_, Shared> {
        self.shared.lock().unwrap_or_else(|e| e.into_inner())
    }

    fn set_status(&self, s: Status) {
        self.lock().status = s;
        self.ctx.request_repaint();
    }

    fn run(mut self, rx: Receiver<Cmd>) {
        self.refresh_devices();
        let mut frames = 0u32;
        let mut window_start = Instant::now();
        let mut errors = 0u32;
        // Damaged frames dropped: per stats window, and per log summary.
        let (mut shown, mut dropped) = (0u32, 0u32);
        let (mut log_start, mut log_frames, mut log_dropped) = (Instant::now(), 0u32, 0u32);
        let mut last_corrupt = String::new();

        loop {
            // Commands: block briefly when idle, only poll while streaming.
            if self.camera.is_none() {
                match rx.recv_timeout(Duration::from_millis(250)) {
                    Ok(cmd) => self.handle(cmd),
                    Err(RecvTimeoutError::Timeout) => {}
                    Err(RecvTimeoutError::Disconnected) => return,
                }
            }
            while let Ok(cmd) = rx.try_recv() {
                self.handle(cmd);
            }
            let Some(cam) = self.camera.as_mut() else {
                continue;
            };

            match cam.frame() {
                Ok(buf) => {
                    errors = 0;
                    dump_frame(buf.buffer());
                    let res = buf.resolution();
                    let t0 = Instant::now();
                    let opts = self.lock().convert;
                    let img = to_color_image(
                        buf.source_frame_format(),
                        res.width() as usize,
                        res.height() as usize,
                        buf.buffer(),
                        &opts,
                    );
                    let decode_ms = t0.elapsed().as_secs_f32() * 1000.0;
                    frames += 1;
                    log_frames += 1;
                    let mut s = self.lock();
                    s.decode_ms = decode_ms;
                    match img {
                        Ok(img) => {
                            shown += 1;
                            s.frame = Some(img);
                            s.status = Status::Streaming;
                        }
                        // Keep showing the previous frame; one summary line
                        // in the log instead of one line per frame.
                        Err(FrameError::Corrupt(e)) => {
                            dropped += 1;
                            log_dropped += 1;
                            last_corrupt = e;
                        }
                        Err(e @ FrameError::Invalid(_)) => {
                            log::warn!("{e}");
                            s.notice = Some(e.to_string());
                        }
                    }
                    let elapsed = window_start.elapsed().as_secs_f32();
                    if elapsed >= 1.0 {
                        s.fps = shown as f32 / elapsed;
                        s.card_fps = frames as f32 / elapsed;
                        s.dropped_pct = 100.0 * dropped as f32 / frames.max(1) as f32;
                        log::debug!("{:.1} fps shown of {:.1}, convert {decode_ms:.1} ms", s.fps, s.card_fps);
                        (frames, shown, dropped) = (0, 0, 0);
                        window_start = Instant::now();
                    }
                    if log_start.elapsed() >= Duration::from_secs(10) {
                        if log_dropped > 0 {
                            log::warn!(
                                "dropped {log_dropped} of {log_frames} frames from the card as damaged (last: {last_corrupt})"
                            );
                        }
                        (log_start, log_frames, log_dropped) = (Instant::now(), 0, 0);
                    }
                    drop(s);
                    self.ctx.request_repaint();
                }
                Err(e) => {
                    errors += 1;
                    log::warn!("frame error #{errors}: {e}");
                    if errors >= 20 {
                        self.close();
                        self.set_status(Status::Error(format!("Capture stopped: {e}")));
                    } else {
                        std::thread::sleep(Duration::from_millis(20));
                    }
                }
            }
        }
    }

    fn handle(&mut self, cmd: Cmd) {
        match cmd {
            Cmd::RefreshDevices => self.refresh_devices(),
            Cmd::Close => {
                self.close();
                self.set_status(Status::Idle);
            }
            Cmd::Open { index, format } => {
                self.close();
                let name = self
                    .lock()
                    .devices
                    .iter()
                    .find(|d| d.index == index)
                    .map(|d| d.name.clone())
                    .unwrap_or_else(|| format!("device #{index}"));
                self.set_status(Status::Opening(name.clone()));
                match open(index, format) {
                    Ok((cam, chosen, formats, controls)) => {
                        let mut s = self.lock();
                        // MSMF misreports the frame rate after opening; show what we asked for.
                        s.current = chosen.or_else(|| Some(FormatSel::from(&cam.camera_format())));
                        s.formats = formats;
                        s.controls = controls;
                        s.open_device = Some(Device { index, name });
                        s.notice = None;
                        drop(s);
                        self.camera = Some(cam);
                    }
                    Err(e) => self.set_status(Status::Error(format!("Cannot open {name}: {e}"))),
                }
            }
            Cmd::SetControl(id, value) => {
                if let Some(cam) = self.camera.as_mut() {
                    let r = cam.set_camera_control(id, value);
                    self.after_control_change(r.err().map(|e| format!("{id}: {e}")));
                }
            }
            Cmd::ResetControls => {
                if let Some(cam) = self.camera.as_mut() {
                    let mut failed = Vec::new();
                    for c in cam.camera_controls().unwrap_or_default() {
                        if let Some(v) = default_setter(&c)
                            && let Err(e) = cam.set_camera_control(c.control(), v)
                        {
                            failed.push(format!("{}: {e}", c.control()));
                        }
                    }
                    self.after_control_change((!failed.is_empty()).then(|| failed.join("; ")));
                }
            }
            Cmd::ReloadControls => self.after_control_change(None),
        }
    }

    fn after_control_change(&mut self, notice: Option<String>) {
        let controls = self
            .camera
            .as_ref()
            .and_then(|c| c.camera_controls().ok())
            .unwrap_or_default();
        let mut s = self.lock();
        s.controls = controls;
        s.notice = notice;
        drop(s);
        self.ctx.request_repaint();
    }

    fn refresh_devices(&mut self) {
        let devices = match nokhwa::query(ApiBackend::MediaFoundation) {
            Ok(list) => list
                .iter()
                .filter_map(|info| match info.index() {
                    CameraIndex::Index(i) => Some(Device {
                        index: *i,
                        name: info.human_name(),
                    }),
                    CameraIndex::String(_) => None,
                })
                .collect(),
            Err(e) => {
                self.lock().notice = Some(format!("Device enumeration failed: {e}"));
                Vec::new()
            }
        };
        self.lock().devices = devices;
        self.ctx.request_repaint();
    }

    fn close(&mut self) {
        if let Some(mut cam) = self.camera.take() {
            let _ = cam.stop_stream();
        }
        let mut s = self.lock();
        s.open_device = None;
        s.frame = None;
        s.formats.clear();
        s.controls.clear();
        s.current = None;
        s.fps = 0.0;
        s.card_fps = 0.0;
        s.dropped_pct = 0.0;
    }
}

type Opened = (
    Camera,
    Option<FormatSel>,
    Vec<FormatSel>,
    Vec<CameraControl>,
);

fn open(index: u32, wanted: Option<FormatSel>) -> Result<Opened, nokhwa::NokhwaError> {
    let mut cam = Camera::with_backend(
        CameraIndex::Index(index),
        RequestedFormat::with_formats(RequestedFormatType::AbsoluteHighestResolution, FORMATS),
        ApiBackend::MediaFoundation,
    )?;

    let mut formats: Vec<FormatSel> = cam
        .compatible_camera_formats()?
        .iter()
        .filter(|f| FORMATS.contains(&f.format()))
        .map(FormatSel::from)
        .collect();
    formats.sort_by_key(|f| {
        (
            std::cmp::Reverse(f.width * f.height),
            std::cmp::Reverse(f.fps),
            f.fourcc as u8,
        )
    });
    formats.dedup();
    log::info!("device #{index}: {} formats", formats.len());
    for f in &formats {
        log::debug!("  {}", f.label());
    }

    let chosen = wanted
        .filter(|w| formats.contains(w))
        .or_else(|| pick_default(&formats));
    log::info!("requested format: {:?}", chosen.map(|f| f.label()));
    if let Some(f) = chosen {
        cam.set_camera_requset(RequestedFormat::with_formats(
            RequestedFormatType::Exact(f.to_camera_format()),
            FORMATS,
        ))?;
    }
    cam.open_stream()?;
    log::info!(
        "stream open: {}",
        FormatSel::from(&cam.camera_format()).label()
    );
    let controls = cam.camera_controls().unwrap_or_default();
    Ok((cam, chosen, formats, controls))
}

/// 1920x1080 at the highest frame rate; on a tie prefer uncompressed (better
/// quality) over MJPEG. Falls back to the largest resolution available.
fn pick_default(formats: &[FormatSel]) -> Option<FormatSel> {
    let rank = |f: &&FormatSel| {
        let uncompressed = f.fourcc != Fourcc::Mjpeg;
        (f.fps, uncompressed)
    };
    formats
        .iter()
        .filter(|f| (f.width, f.height) == TARGET)
        .max_by_key(rank)
        .or_else(|| formats.first())
        .copied()
}

pub fn default_setter(c: &CameraControl) -> Option<ControlValueSetter> {
    use nokhwa::utils::ControlValueDescription as D;
    match c.description() {
        D::IntegerRange { default, .. } | D::Integer { default, .. } => {
            Some(ControlValueSetter::Integer(*default))
        }
        D::Boolean { default, .. } => Some(ControlValueSetter::Boolean(*default)),
        _ => None,
    }
}

/// Diagnostics: with `HDMI_VIEWER_DUMP=<dir>` set, the first 600 raw frames
/// are written there as they came from the card (frame-0000.bin, …).
fn dump_frame(data: &[u8]) {
    use std::sync::OnceLock;
    use std::sync::atomic::{AtomicU32, Ordering};
    static DIR: OnceLock<Option<std::path::PathBuf>> = OnceLock::new();
    static N: AtomicU32 = AtomicU32::new(0);
    let Some(dir) = DIR.get_or_init(|| std::env::var_os("HDMI_VIEWER_DUMP").map(Into::into)) else {
        return;
    };
    let n = N.fetch_add(1, Ordering::Relaxed);
    if n < 600 {
        let _ = std::fs::write(dir.join(format!("frame-{n:04}.bin")), data);
    }
}
