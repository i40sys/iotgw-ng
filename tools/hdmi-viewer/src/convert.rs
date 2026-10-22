//! Raw capture-card frames (MJPEG / YUY2 / NV12 / RGB24 / GRAY) -> egui `ColorImage`.

use eframe::egui::{Color32, ColorImage};
use nokhwa::utils::FrameFormat;
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum ColorMatrix {
    Bt601,
    Bt709,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum ColorRange {
    /// Y in 16..235, UV in 16..240 (what HDMI/TV video normally uses).
    Limited,
    /// Y/UV in 0..255 (PC levels).
    Full,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct ConvertOptions {
    pub matrix: ColorMatrix,
    pub range: ColorRange,
    pub flip_vertical: bool,
    pub flip_horizontal: bool,
}

impl Default for ConvertOptions {
    fn default() -> Self {
        Self {
            matrix: ColorMatrix::Bt709,
            range: ColorRange::Limited,
            flip_vertical: false,
            flip_horizontal: false,
        }
    }
}

/// Fixed-point (<<8) YUV -> RGB coefficients for one matrix/range combination.
struct Yuv {
    y_off: i32,
    ky: i32,
    rv: i32,
    gu: i32,
    gv: i32,
    bu: i32,
}

impl Yuv {
    fn new(m: ColorMatrix, r: ColorRange) -> Self {
        let (kr, kb) = match m {
            ColorMatrix::Bt601 => (0.299, 0.114),
            ColorMatrix::Bt709 => (0.2126, 0.0722),
        };
        let kg = 1.0 - kr - kb;
        let (y_off, ys, cs) = match r {
            ColorRange::Limited => (16, 255.0 / 219.0, 255.0 / 224.0),
            ColorRange::Full => (0, 1.0, 1.0),
        };
        let f = |v: f64| (v * 256.0).round() as i32;
        Self {
            y_off,
            ky: f(ys),
            rv: f(2.0 * (1.0 - kr) * cs),
            gu: f(2.0 * (1.0 - kb) * kb / kg * cs),
            gv: f(2.0 * (1.0 - kr) * kr / kg * cs),
            bu: f(2.0 * (1.0 - kb) * cs),
        }
    }

    #[inline(always)]
    fn px(&self, y: u8, u: u8, v: u8) -> Color32 {
        let c = (y as i32 - self.y_off) * self.ky;
        let d = u as i32 - 128;
        let e = v as i32 - 128;
        let cl = |x: i32| ((x + 128) >> 8).clamp(0, 255) as u8;
        Color32::from_rgb(
            cl(c + self.rv * e),
            cl(c - self.gu * d - self.gv * e),
            cl(c + self.bu * d),
        )
    }
}

/// Why a frame was not converted.
#[derive(Debug)]
pub enum FrameError {
    /// The card sent a damaged frame (lost USB data): drop it and keep showing
    /// the previous one. Some cards do this for a large share of their frames.
    Corrupt(String),
    /// Anything else (wrong size for the format, …).
    Invalid(String),
}

impl std::fmt::Display for FrameError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Corrupt(e) => write!(f, "corrupt frame: {e}"),
            Self::Invalid(e) => f.write_str(e),
        }
    }
}

pub fn to_color_image(
    format: FrameFormat,
    width: usize,
    height: usize,
    data: &[u8],
    opts: &ConvertOptions,
) -> Result<ColorImage, FrameError> {
    let invalid = FrameError::Invalid;
    let mut img = match format {
        FrameFormat::MJPEG => mjpeg(data)?,
        FrameFormat::YUYV => yuyv(width, height, data, opts).map_err(invalid)?,
        FrameFormat::NV12 => nv12(width, height, data, opts).map_err(invalid)?,
        FrameFormat::RAWBGR => packed24(width, height, data, true).map_err(invalid)?,
        FrameFormat::RAWRGB => packed24(width, height, data, false).map_err(invalid)?,
        FrameFormat::GRAY => gray(width, height, data).map_err(invalid)?,
    };
    if opts.flip_vertical {
        let w = img.size[0];
        let rows: Vec<&[Color32]> = img.pixels.chunks_exact(w).rev().collect();
        img.pixels = rows.concat();
    }
    if opts.flip_horizontal {
        let w = img.size[0];
        img.pixels.chunks_exact_mut(w).for_each(|row| row.reverse());
    }
    Ok(img)
}

fn check_len(data: &[u8], need: usize, what: &str) -> Result<(), String> {
    if data.len() < need {
        return Err(format!(
            "{what} frame too short: {} < {need} bytes",
            data.len()
        ));
    }
    Ok(())
}

/// MJPEG with libjpeg-turbo, which REPORTS damaged data. Capture cards lose
/// USB data now and then: the JPEG then ends before its last blocks. Lenient
/// decoders (zune-jpeg, jpeg-decoder) zero-fill the rest without a word, and
/// such a frame shows everything below the loss shifted and tinted. Measured
/// on an MS2109-class card at 60 fps: 392 of 600 frames damaged, 95 of them
/// visibly broken; TurboJPEG flagged all 392 and none of the 208 clean ones.
/// Any warning rejects the frame.
fn mjpeg(data: &[u8]) -> Result<ColorImage, FrameError> {
    let corrupt = |e: turbojpeg::Error| FrameError::Corrupt(e.to_string());
    let mut dec = turbojpeg::Decompressor::new().map_err(|e| FrameError::Invalid(e.to_string()))?;
    let h = dec.read_header(data).map_err(corrupt)?;
    let mut img = turbojpeg::Image {
        pixels: vec![0u8; h.width * h.height * 4],
        width: h.width,
        pitch: h.width * 4,
        height: h.height,
        format: turbojpeg::PixelFormat::RGBA,
    };
    dec.decompress(data, img.as_deref_mut()).map_err(corrupt)?;
    Ok(ColorImage::from_rgba_unmultiplied([h.width, h.height], &img.pixels))
}

fn yuyv(w: usize, h: usize, data: &[u8], o: &ConvertOptions) -> Result<ColorImage, String> {
    check_len(data, w * h * 2, "YUY2")?;
    let k = Yuv::new(o.matrix, o.range);
    let mut px = Vec::with_capacity(w * h);
    for q in data[..w * h * 2].chunks_exact(4) {
        px.push(k.px(q[0], q[1], q[3]));
        px.push(k.px(q[2], q[1], q[3]));
    }
    Ok(ColorImage::new([w, h], px))
}

fn nv12(w: usize, h: usize, data: &[u8], o: &ConvertOptions) -> Result<ColorImage, String> {
    check_len(data, w * h * 3 / 2, "NV12")?;
    let k = Yuv::new(o.matrix, o.range);
    let (luma, chroma) = data.split_at(w * h);
    let mut px = Vec::with_capacity(w * h);
    for row in 0..h {
        let uv = &chroma[(row / 2) * w..];
        for (col, &y) in luma[row * w..(row + 1) * w].iter().enumerate() {
            let c = (col / 2) * 2;
            px.push(k.px(y, uv[c], uv[c + 1]));
        }
    }
    Ok(ColorImage::new([w, h], px))
}

fn packed24(w: usize, h: usize, data: &[u8], bgr: bool) -> Result<ColorImage, String> {
    check_len(data, w * h * 3, "RGB24")?;
    let px = data[..w * h * 3]
        .chunks_exact(3)
        .map(|p| match bgr {
            true => Color32::from_rgb(p[2], p[1], p[0]),
            false => Color32::from_rgb(p[0], p[1], p[2]),
        })
        .collect();
    Ok(ColorImage::new([w, h], px))
}

fn gray(w: usize, h: usize, data: &[u8]) -> Result<ColorImage, String> {
    check_len(data, w * h, "GRAY")?;
    let px = data[..w * h]
        .iter()
        .map(|&g| Color32::from_gray(g))
        .collect();
    Ok(ColorImage::new([w, h], px))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn limited_range_black_and_white() {
        let k = Yuv::new(ColorMatrix::Bt709, ColorRange::Limited);
        assert_eq!(k.px(16, 128, 128), Color32::from_rgb(0, 0, 0));
        assert_eq!(k.px(235, 128, 128), Color32::from_rgb(255, 255, 255));
    }

    #[test]
    fn yuyv_frame_size() {
        let img = yuyv(4, 2, &[128u8; 16], &ConvertOptions::default()).unwrap();
        assert_eq!(img.size, [4, 2]);
        assert_eq!(img.pixels.len(), 8);
    }

    fn jpeg(w: usize, h: usize) -> Vec<u8> {
        // A non-trivial picture, so the entropy-coded data is long enough to damage.
        let pixels: Vec<u8> = (0..w * h * 3).map(|i| ((i * 37) ^ (i / 97)) as u8).collect();
        let img = turbojpeg::Image { pixels: pixels.as_slice(), width: w, pitch: w * 3, height: h, format: turbojpeg::PixelFormat::RGB };
        turbojpeg::compress(img, 85, turbojpeg::Subsamp::Sub2x1).unwrap().to_vec()
    }

    #[test]
    fn mjpeg_decodes_a_clean_frame() {
        let img = to_color_image(FrameFormat::MJPEG, 0, 0, &jpeg(64, 48), &ConvertOptions::default()).unwrap();
        assert_eq!(img.size, [64, 48]);
    }

    #[test]
    fn mjpeg_rejects_a_frame_with_lost_data() {
        // What the card sends: a chunk of the entropy-coded data missing, the
        // end-of-image marker still there.
        let mut data = jpeg(64, 48);
        let mid = data.len() / 2;
        data.drain(mid..mid + 200);
        let r = to_color_image(FrameFormat::MJPEG, 0, 0, &data, &ConvertOptions::default());
        assert!(matches!(r, Err(FrameError::Corrupt(_))), "{r:?}");
    }

    #[test]
    fn mjpeg_rejects_garbage() {
        let r = to_color_image(FrameFormat::MJPEG, 0, 0, &[0xd9, 0xc1, 0, 1, 2, 3], &ConvertOptions::default());
        assert!(matches!(r, Err(FrameError::Corrupt(_))), "{r:?}");
    }

    #[test]
    fn short_frame_is_an_error() {
        assert!(nv12(4, 4, &[0u8; 10], &ConvertOptions::default()).is_err());
    }
}
