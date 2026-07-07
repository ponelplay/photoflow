use image::DynamicImage;
use std::path::{Path, PathBuf};

use crate::catalog::Recipe;
use crate::fileops::unique_dest;
use crate::thumbs::apply_orientation;

/// Aplica una recepta d'edició a una imatge ja orientada.
pub fn apply_recipe(img: DynamicImage, r: &Recipe) -> DynamicImage {
    let img = match r.rot % 360 {
        90 => img.rotate90(),
        180 => img.rotate180(),
        270 => img.rotate270(),
        _ => img,
    };

    let img = if let Some([x, y, w, h]) = r.crop {
        let (iw, ih) = (img.width() as f64, img.height() as f64);
        let cx = ((x.clamp(0.0, 1.0)) * iw) as u32;
        let cy = ((y.clamp(0.0, 1.0)) * ih) as u32;
        let cw = ((w.clamp(0.0, 1.0)) * iw) as u32;
        let ch = ((h.clamp(0.0, 1.0)) * ih) as u32;
        img.crop_imm(
            cx.min(img.width() - 1),
            cy.min(img.height() - 1),
            cw.max(1).min(img.width() - cx),
            ch.max(1).min(img.height() - cy),
        )
    } else {
        img
    };

    let img = if r.brightness != 0 {
        // -100..100 → -255..255 d'addició per canal
        img.brighten((r.brightness as f32 * 2.55) as i32)
    } else {
        img
    };

    let img = if r.contrast != 0 {
        img.adjust_contrast(r.contrast as f32)
    } else {
        img
    };

    if r.saturation != 0 {
        saturate(img, r.saturation)
    } else {
        img
    }
}

/// Saturació: interpola cada píxel entre el seu gris (Rec. 709) i el color.
fn saturate(img: DynamicImage, s: i32) -> DynamicImage {
    let f = (1.0 + s as f32 / 100.0).max(0.0);
    let mut rgba = img.to_rgba8();
    for p in rgba.pixels_mut() {
        let [r, g, b, a] = p.0;
        let y = 0.2126 * r as f32 + 0.7152 * g as f32 + 0.0722 * b as f32;
        let adj = |v: u8| (y + (v as f32 - y) * f).clamp(0.0, 255.0) as u8;
        p.0 = [adj(r), adj(g), adj(b), a];
    }
    DynamicImage::ImageRgba8(rgba)
}

/// Exporta una còpia amb la recepta aplicada al costat de l'original
/// («nom (editada).ext»). L'original no es toca. Retorna la ruta nova.
#[tauri::command]
pub async fn export_edited(path: String, recipe: Recipe) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let src = PathBuf::from(&path);
        let img = image::ImageReader::open(&src)
            .map_err(|e| e.to_string())?
            .with_guessed_format()
            .map_err(|e| e.to_string())?
            .decode()
            .map_err(|e| e.to_string())?;
        let img = apply_recipe(apply_orientation(img, &src), &recipe);

        let stem = src
            .file_stem()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_default();
        let ext = src
            .extension()
            .map(|e| e.to_string_lossy().to_lowercase())
            .unwrap_or_default();
        let parent = src.parent().unwrap_or(Path::new("")).to_path_buf();

        // TIFF/BMP s'exporten a JPEG (més útils i compatibles)
        let (out_ext, format): (&str, &str) = match ext.as_str() {
            "png" => ("png", "png"),
            "webp" => ("webp", "webp"),
            "gif" => ("png", "png"),
            _ => ("jpg", "jpeg"),
        };
        let target = unique_dest(&parent, &format!("{stem} (editada).{out_ext}"));

        let out = std::fs::File::create(&target).map_err(|e| e.to_string())?;
        let mut w = std::io::BufWriter::new(out);
        match format {
            "png" => img
                .write_to(&mut w, image::ImageFormat::Png)
                .map_err(|e| e.to_string())?,
            "webp" => image::codecs::webp::WebPEncoder::new_lossless(&mut w)
                .encode(
                    img.to_rgba8().as_raw(),
                    img.width(),
                    img.height(),
                    image::ExtendedColorType::Rgba8,
                )
                .map_err(|e| e.to_string())?,
            _ => image::codecs::jpeg::JpegEncoder::new_with_quality(&mut w, 92)
                .encode_image(&img.to_rgb8())
                .map_err(|e| e.to_string())?,
        }
        Ok(target.to_string_lossy().into_owned())
    })
    .await
    .map_err(|e| e.to_string())?
}
