//! HDMI Viewer — shows a USB HDMI capture card (UVC / Media Foundation) in a
//! resizable window. The picture is stretched to the window by default.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod capture;
mod convert;
mod props;

use std::sync::mpsc::Receiver;

use eframe::egui::{self, Color32, Key, Rect, Sense, TextureHandle, TextureOptions, pos2, vec2};
use nokhwa::utils::{ControlValueDescription, ControlValueSetter};
use serde::{Deserialize, Serialize};

use capture::{Capture, Cmd, FormatSel, Status};
use convert::{ColorMatrix, ColorRange, ConvertOptions};

#[derive(Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
enum Scaling {
    Stretch,
    KeepAspect,
}

/// Persisted between runs (eframe storage, in %APPDATA%\hdmi-viewer).
#[derive(Clone, Serialize, Deserialize)]
#[serde(default)]
struct Settings {
    device_name: Option<String>,
    format: Option<FormatSel>,
    scaling: Scaling,
    smooth: bool,
    show_stats: bool,
    convert: ConvertOptions,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            device_name: None,
            format: None,
            scaling: Scaling::Stretch,
            smooth: true,
            show_stats: false,
            convert: ConvertOptions::default(),
        }
    }
}

struct App {
    capture: Capture,
    settings: Settings,
    texture: Option<TextureHandle>,
    show_menu: bool,
    show_controls: bool,
    show_about: bool,
    auto_opened: bool,
    props_dialog: Option<Receiver<Result<(), String>>>,
    message: Option<String>,
}

impl App {
    fn new(cc: &eframe::CreationContext<'_>) -> Self {
        let settings: Settings = cc
            .storage
            .and_then(|s| eframe::get_value(s, eframe::APP_KEY))
            .unwrap_or_default();
        Self {
            capture: Capture::spawn(cc.egui_ctx.clone(), settings.convert),
            settings,
            texture: None,
            show_menu: true,
            show_controls: false,
            show_about: false,
            auto_opened: false,
            props_dialog: None,
            message: None,
        }
    }

    /// Once the device list arrives: reopen the last device, else the first one
    /// that looks like a capture card, else the first device.
    fn auto_open(&mut self) {
        if self.auto_opened {
            return;
        }
        let devices = self.capture.lock().devices.clone();
        if devices.is_empty() {
            return;
        }
        self.auto_opened = true;
        let looks_like_capture = |n: &str| {
            let n = n.to_lowercase();
            [
                "hdmi",
                "capture",
                "cam link",
                "usb video",
                "video grabber",
                "uvc",
            ]
            .iter()
            .any(|k| n.contains(k))
        };
        let pick = devices
            .iter()
            .find(|d| Some(&d.name) == self.settings.device_name.as_ref())
            .or_else(|| devices.iter().find(|d| looks_like_capture(&d.name)))
            .or_else(|| devices.first());
        if let Some(d) = pick {
            let format = (Some(&d.name) == self.settings.device_name.as_ref())
                .then_some(self.settings.format)
                .flatten();
            self.open(d.index, d.name.clone(), format);
        }
    }

    fn open(&mut self, index: u32, name: String, format: Option<FormatSel>) {
        self.settings.device_name = Some(name);
        self.settings.format = format;
        self.capture.send(Cmd::Open { index, format });
    }

    fn set_convert(&mut self, convert: ConvertOptions) {
        self.settings.convert = convert;
        self.capture.lock().convert = convert;
    }

    fn toggle_fullscreen(&self, ctx: &egui::Context) {
        let fs = ctx.input(|i| i.viewport().fullscreen.unwrap_or(false));
        ctx.send_viewport_cmd(egui::ViewportCommand::Fullscreen(!fs));
    }

    fn shortcuts(&mut self, ctx: &egui::Context) {
        let (f11, esc, m, c, s) = ctx.input(|i| {
            (
                i.key_pressed(Key::F11) || (i.modifiers.alt && i.key_pressed(Key::Enter)),
                i.key_pressed(Key::Escape),
                i.key_pressed(Key::M) && i.modifiers.is_none(),
                i.key_pressed(Key::C) && i.modifiers.is_none(),
                i.key_pressed(Key::S) && i.modifiers.is_none(),
            )
        });
        if ctx.wants_keyboard_input() {
            return;
        }
        if f11 {
            self.toggle_fullscreen(ctx);
        }
        if esc && ctx.input(|i| i.viewport().fullscreen.unwrap_or(false)) {
            ctx.send_viewport_cmd(egui::ViewportCommand::Fullscreen(false));
        }
        if m {
            self.show_menu = !self.show_menu;
        }
        if c {
            self.show_controls = !self.show_controls;
        }
        if s {
            self.settings.show_stats = !self.settings.show_stats;
        }
    }

    fn menu_bar(&mut self, ctx: &egui::Context) {
        egui::TopBottomPanel::top("menu").show(ctx, |ui| {
            egui::MenuBar::new().ui(ui, |ui| {
                self.device_menu(ui);
                self.format_menu(ui);
                ui.menu_button("Capture", |ui| {
                    if ui.button("Capture settings…  (C)").clicked() {
                        self.show_controls = true;
                        ui.close();
                    }
                    let open = self.capture.lock().open_device.clone();
                    if ui
                        .add_enabled(open.is_some(), egui::Button::new("Driver properties…"))
                        .on_hover_text("The capture card driver's own settings dialog")
                        .clicked()
                    {
                        if let Some(d) = open {
                            self.props_dialog = Some(props::show(d.name));
                        }
                        ui.close();
                    }
                    ui.separator();
                    ui.label("Color conversion (YUY2 / NV12)");
                    let mut cv = self.settings.convert;
                    ui.radio_value(&mut cv.matrix, ColorMatrix::Bt709, "BT.709 (HD)");
                    ui.radio_value(&mut cv.matrix, ColorMatrix::Bt601, "BT.601 (SD)");
                    ui.separator();
                    ui.radio_value(&mut cv.range, ColorRange::Limited, "Limited range (16–235)");
                    ui.radio_value(&mut cv.range, ColorRange::Full, "Full range (0–255)");
                    ui.separator();
                    ui.checkbox(&mut cv.flip_horizontal, "Mirror horizontally");
                    ui.checkbox(&mut cv.flip_vertical, "Flip vertically");
                    if cv != self.settings.convert {
                        self.set_convert(cv);
                    }
                });
                ui.menu_button("View", |ui| {
                    ui.radio_value(
                        &mut self.settings.scaling,
                        Scaling::Stretch,
                        "Stretch to window",
                    );
                    ui.radio_value(
                        &mut self.settings.scaling,
                        Scaling::KeepAspect,
                        "Keep aspect ratio",
                    );
                    ui.separator();
                    ui.checkbox(&mut self.settings.smooth, "Smooth scaling");
                    ui.checkbox(&mut self.settings.show_stats, "Show stats  (S)");
                    ui.separator();
                    if ui.button("Window 1920×1080 (1:1)").clicked() {
                        let ppp = ctx.pixels_per_point();
                        let menu_h = ui.min_rect().height() + 8.0;
                        ctx.send_viewport_cmd(egui::ViewportCommand::InnerSize(vec2(
                            1920.0 / ppp,
                            1080.0 / ppp + menu_h,
                        )));
                        ui.close();
                    }
                    if ui.button("Fullscreen  (F11 / double-click)").clicked() {
                        self.toggle_fullscreen(ctx);
                        ui.close();
                    }
                    if ui.button("Hide menu bar  (M)").clicked() {
                        self.show_menu = false;
                        ui.close();
                    }
                });
                ui.menu_button("Help", |ui| {
                    if ui.button("About / shortcuts").clicked() {
                        self.show_about = true;
                        ui.close();
                    }
                });
            });
        });
    }

    fn device_menu(&mut self, ui: &mut egui::Ui) {
        ui.menu_button("Device", |ui| {
            let (devices, open) = {
                let s = self.capture.lock();
                (s.devices.clone(), s.open_device.as_ref().map(|d| d.index))
            };
            if devices.is_empty() {
                ui.label("No video capture devices found");
            }
            for d in devices {
                if ui.radio(open == Some(d.index), &d.name).clicked() {
                    self.open(d.index, d.name, None);
                    ui.close();
                }
            }
            ui.separator();
            if ui.button("Refresh device list").clicked() {
                self.capture.send(Cmd::RefreshDevices);
                ui.close();
            }
            if ui
                .add_enabled(open.is_some(), egui::Button::new("Disconnect"))
                .clicked()
            {
                self.capture.send(Cmd::Close);
                ui.close();
            }
            ui.separator();
            if ui.button("Exit").clicked() {
                ui.ctx().send_viewport_cmd(egui::ViewportCommand::Close);
            }
        });
    }

    fn format_menu(&mut self, ui: &mut egui::Ui) {
        ui.menu_button("Format", |ui| {
            let (formats, current, open) = {
                let s = self.capture.lock();
                (s.formats.clone(), s.current, s.open_device.clone())
            };
            let Some(dev) = open else {
                ui.label("Open a device first");
                return;
            };
            if ui.button("Auto (1920×1080, highest fps)").clicked() {
                self.open(dev.index, dev.name.clone(), None);
                ui.close();
            }
            ui.separator();
            egui::ScrollArea::vertical()
                .max_height(480.0)
                .show(ui, |ui| {
                    for f in formats {
                        let label = f.label();
                        let text = if (f.width, f.height) == capture::TARGET {
                            egui::RichText::new(label).strong()
                        } else {
                            egui::RichText::new(label)
                        };
                        if ui.radio(current == Some(f), text).clicked() {
                            self.open(dev.index, dev.name.clone(), Some(f));
                            ui.close();
                        }
                    }
                });
        });
    }

    fn controls_window(&mut self, ctx: &egui::Context) {
        let mut open = self.show_controls;
        egui::Window::new("Capture settings")
            .open(&mut open)
            .resizable(false)
            .default_pos(pos2(40.0, 60.0))
            .show(ctx, |ui| {
                let (controls, notice, has_dev) = {
                    let s = self.capture.lock();
                    (
                        s.controls.clone(),
                        s.notice.clone(),
                        s.open_device.is_some(),
                    )
                };
                if !has_dev {
                    ui.label("No device open.");
                    return;
                }
                if controls.is_empty() {
                    ui.label("This device exposes no adjustable image controls.");
                    ui.label("Try Capture → Driver properties….");
                }
                egui::Grid::new("controls")
                    .num_columns(3)
                    .striped(true)
                    .show(ui, |ui| {
                        for c in &controls {
                            let id = c.control();
                            match c.description().clone() {
                                ControlValueDescription::IntegerRange {
                                    min,
                                    max,
                                    value,
                                    step,
                                    default,
                                } => {
                                    ui.label(c.name());
                                    let mut v = value;
                                    let r = ui.add(
                                        egui::Slider::new(&mut v, min..=max)
                                            .step_by(step.max(1) as f64),
                                    );
                                    // Apply on release / keyboard to avoid flooding the driver.
                                    if (r.drag_stopped() || (r.changed() && !r.dragged()))
                                        && v != value
                                    {
                                        self.capture.send(Cmd::SetControl(
                                            id,
                                            ControlValueSetter::Integer(v),
                                        ));
                                    }
                                    if ui
                                        .add_enabled(value != default, egui::Button::new("↺"))
                                        .on_hover_text(format!("Default: {default}"))
                                        .clicked()
                                    {
                                        self.capture.send(Cmd::SetControl(
                                            id,
                                            ControlValueSetter::Integer(default),
                                        ));
                                    }
                                    ui.end_row();
                                }
                                ControlValueDescription::Integer { value, default, .. } => {
                                    ui.label(c.name());
                                    let mut v = value;
                                    if ui.add(egui::DragValue::new(&mut v)).changed() {
                                        self.capture.send(Cmd::SetControl(
                                            id,
                                            ControlValueSetter::Integer(v),
                                        ));
                                    }
                                    if ui
                                        .add_enabled(value != default, egui::Button::new("↺"))
                                        .clicked()
                                    {
                                        self.capture.send(Cmd::SetControl(
                                            id,
                                            ControlValueSetter::Integer(default),
                                        ));
                                    }
                                    ui.end_row();
                                }
                                ControlValueDescription::Boolean { value, default } => {
                                    ui.label(c.name());
                                    let mut v = value;
                                    if ui.checkbox(&mut v, "").changed() {
                                        self.capture.send(Cmd::SetControl(
                                            id,
                                            ControlValueSetter::Boolean(v),
                                        ));
                                    }
                                    if ui
                                        .add_enabled(value != default, egui::Button::new("↺"))
                                        .clicked()
                                    {
                                        self.capture.send(Cmd::SetControl(
                                            id,
                                            ControlValueSetter::Boolean(default),
                                        ));
                                    }
                                    ui.end_row();
                                }
                                _ => {}
                            }
                        }
                    });
                ui.separator();
                ui.horizontal(|ui| {
                    if ui.button("Reset all to defaults").clicked() {
                        self.capture.send(Cmd::ResetControls);
                    }
                    if ui.button("Reload").clicked() {
                        self.capture.send(Cmd::ReloadControls);
                    }
                    if ui.button("Driver properties…").clicked()
                        && let Some(d) = self.capture.lock().open_device.clone()
                    {
                        self.props_dialog = Some(props::show(d.name));
                    }
                });
                if let Some(n) = notice {
                    ui.colored_label(Color32::YELLOW, n);
                }
            });
        self.show_controls = open;
    }

    fn about_window(&mut self, ctx: &egui::Context) {
        egui::Window::new("About HDMI Viewer")
            .open(&mut self.show_about)
            .resizable(false)
            .collapsible(false)
            .anchor(egui::Align2::CENTER_CENTER, vec2(0.0, 0.0))
            .show(ctx, |ui| {
                ui.label(format!("HDMI Viewer v{}", env!("CARGO_PKG_VERSION")));
                ui.label("Live view of a USB HDMI capture card (Media Foundation / UVC).");
                ui.separator();
                egui::Grid::new("keys").show(ui, |ui| {
                    for (k, what) in [
                        ("F11 / Alt+Enter / double-click", "Toggle fullscreen"),
                        ("Esc", "Leave fullscreen"),
                        ("M", "Show / hide menu bar"),
                        ("C", "Capture settings"),
                        ("S", "Show / hide stats"),
                    ] {
                        ui.monospace(k);
                        ui.label(what);
                        ui.end_row();
                    }
                });
            });
    }

    fn video(&mut self, ctx: &egui::Context) {
        let (frame, status, stats) = {
            let mut s = self.capture.lock();
            let stats = s.current.map(|f| {
                format!(
                    "{}  |  {:.1} fps shown of {:.1} from the card ({:.0}% damaged, dropped)  |  convert {:.1} ms",
                    f.label(),
                    s.fps,
                    s.card_fps,
                    s.dropped_pct,
                    s.decode_ms
                )
            });
            (s.frame.take(), s.status.clone(), stats)
        };
        let tex_opts = if self.settings.smooth {
            TextureOptions::LINEAR
        } else {
            TextureOptions::NEAREST
        };
        if let Some(img) = frame {
            match &mut self.texture {
                Some(t) => t.set(img, tex_opts),
                None => self.texture = Some(ctx.load_texture("video", img, tex_opts)),
            }
        }
        if !matches!(status, Status::Streaming) && self.capture.lock().open_device.is_none() {
            self.texture = None;
        }

        egui::CentralPanel::default()
            .frame(egui::Frame::NONE.fill(Color32::BLACK))
            .show(ctx, |ui| {
                let (rect, resp) = ui.allocate_exact_size(ui.available_size(), Sense::click());
                if resp.double_clicked() {
                    self.toggle_fullscreen(ctx);
                }
                if !self.show_menu {
                    resp.clone()
                        .on_hover_text_at_pointer("Press M to show the menu");
                }
                resp.context_menu(|ui| {
                    if ui
                        .button(if self.show_menu {
                            "Hide menu bar"
                        } else {
                            "Show menu bar"
                        })
                        .clicked()
                    {
                        self.show_menu = !self.show_menu;
                        ui.close();
                    }
                    if ui.button("Capture settings…").clicked() {
                        self.show_controls = true;
                        ui.close();
                    }
                    if ui.button("Toggle fullscreen").clicked() {
                        self.toggle_fullscreen(ctx);
                        ui.close();
                    }
                });

                let painter = ui.painter_at(rect);
                if let Some(tex) = &self.texture {
                    let dst = match self.settings.scaling {
                        Scaling::Stretch => rect,
                        Scaling::KeepAspect => fit(rect, tex.size_vec2()),
                    };
                    let uv = Rect::from_min_max(pos2(0.0, 0.0), pos2(1.0, 1.0));
                    painter.image(tex.id(), dst, uv, Color32::WHITE);
                } else {
                    let text = match &status {
                        Status::Idle => {
                            "No device open — choose one in the Device menu".to_string()
                        }
                        Status::Opening(n) => format!("Opening {n}…"),
                        Status::Streaming => "Waiting for frames…".to_string(),
                        Status::Error(e) => e.clone(),
                    };
                    let color = if matches!(status, Status::Error(_)) {
                        Color32::LIGHT_RED
                    } else {
                        Color32::GRAY
                    };
                    let galley = painter.layout(
                        text,
                        egui::FontId::proportional(18.0),
                        color,
                        (rect.width() - 40.0).max(100.0),
                    );
                    let pos = rect.center() - galley.size() / 2.0;
                    painter.galley(pos, galley, color);
                }

                if self.settings.show_stats
                    && let Some(stats) = stats
                {
                    let pos = rect.left_bottom() + vec2(8.0, -8.0);
                    let galley = painter.layout_no_wrap(
                        stats,
                        egui::FontId::monospace(13.0),
                        Color32::WHITE,
                    );
                    let bg = Rect::from_min_size(pos - vec2(0.0, galley.size().y), galley.size())
                        .expand(4.0);
                    painter.rect_filled(bg, 4.0, Color32::from_black_alpha(160));
                    painter.galley(bg.min + vec2(4.0, 4.0), galley, Color32::WHITE);
                }
            });
    }
}

/// Largest rect with the frame's aspect ratio, centred in `area`.
fn fit(area: Rect, size: egui::Vec2) -> Rect {
    let scale = (area.width() / size.x).min(area.height() / size.y);
    Rect::from_center_size(area.center(), size * scale)
}

impl eframe::App for App {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        self.auto_open();
        self.shortcuts(ctx);

        if let Some(rx) = &self.props_dialog
            && let Ok(r) = rx.try_recv()
        {
            self.props_dialog = None;
            match r {
                Ok(()) => self.capture.send(Cmd::ReloadControls),
                Err(e) => self.message = Some(format!("Driver properties: {e}")),
            }
        }

        if self.show_menu {
            self.menu_bar(ctx);
        }
        self.video(ctx);
        self.controls_window(ctx);
        self.about_window(ctx);

        if let Some(msg) = self.message.clone() {
            let mut open = true;
            egui::Window::new("Notice")
                .open(&mut open)
                .collapsible(false)
                .resizable(false)
                .anchor(egui::Align2::CENTER_CENTER, vec2(0.0, 0.0))
                .show(ctx, |ui| ui.label(msg));
            if !open {
                self.message = None;
            }
        }
        if self.props_dialog.is_some() {
            ctx.request_repaint_after(std::time::Duration::from_millis(200));
        }
    }

    fn save(&mut self, storage: &mut dyn eframe::Storage) {
        // Remember the format actually in use (covers "Auto").
        if let Some(cur) = self.capture.lock().current {
            self.settings.format = Some(cur);
        }
        eframe::set_value(storage, eframe::APP_KEY, &self.settings);
    }
}

/// Logs to stderr (debug build console) and to %TEMP%\hdmi-viewer.log.
/// Level via RUST_LOG, default `info` for this crate.
fn init_logging() {
    struct Tee(Option<std::fs::File>);
    impl std::io::Write for Tee {
        fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
            let _ = std::io::stderr().write_all(buf);
            if let Some(f) = &mut self.0 {
                f.write_all(buf)?;
            }
            Ok(buf.len())
        }
        fn flush(&mut self) -> std::io::Result<()> {
            self.0.as_mut().map_or(Ok(()), |f| f.flush())
        }
    }
    let file = std::fs::File::create(std::env::temp_dir().join("hdmi-viewer.log")).ok();
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("hdmi_viewer=info"))
        .target(env_logger::Target::Pipe(Box::new(Tee(file))))
        .init();
}

fn main() -> eframe::Result {
    init_logging();
    log::info!("HDMI Viewer v{}", env!("CARGO_PKG_VERSION"));
    let options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_title("HDMI Viewer")
            .with_inner_size([1280.0, 744.0])
            .with_min_inner_size([320.0, 200.0]),
        ..Default::default()
    };
    eframe::run_native(
        "hdmi-viewer",
        options,
        Box::new(|cc| Ok(Box::new(App::new(cc)))),
    )
}
