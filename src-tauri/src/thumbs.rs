use percent_encoding::percent_decode_str;
use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::io::Cursor;
use std::path::{Path, PathBuf};
use tauri::http;
use tauri::Manager;

const THUMB_SIZE: u32 = 512;
const JPEG_QUALITY: u8 = 82;

/// Respon una petició thumb://<path-codificat> amb un JPEG de miniatura,
/// generant-lo (i desant-lo a la cache de disc) si cal.
pub fn serve(app: &tauri::AppHandle, uri: &http::Uri) -> http::Response<Vec<u8>> {
    match serve_inner(app, uri) {
        Ok(bytes) => http::Response::builder()
            .status(200)
            .header("Content-Type", "image/jpeg")
            .header("Cache-Control", "public, max-age=31536000, immutable")
            .body(bytes)
            .unwrap(),
        Err(e) => http::Response::builder()
            .status(404)
            .header("Content-Type", "text/plain")
            .body(e.into_bytes())
            .unwrap(),
    }
}

fn serve_inner(app: &tauri::AppHandle, uri: &http::Uri) -> Result<Vec<u8>, String> {
    let raw = uri.path().trim_start_matches('/');
    let src_path = percent_decode_str(raw)
        .decode_utf8()
        .map_err(|e| e.to_string())?
        .into_owned();
    thumb_bytes(app, &src_path)
}

/// Bytes JPEG de la miniatura d'un fitxer, de cache o generant-la.
pub fn thumb_bytes(app: &tauri::AppHandle, src_path: &str) -> Result<Vec<u8>, String> {
    let src = PathBuf::from(src_path);

    let md = fs::metadata(&src).map_err(|e| e.to_string())?;
    let mtime = md
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis())
        .unwrap_or(0);

    // Clau de cache: ruta + mtime + mida (si el fitxer canvia, la clau canvia)
    let mut hasher = DefaultHasher::new();
    src_path.hash(&mut hasher);
    mtime.hash(&mut hasher);
    md.len().hash(&mut hasher);
    let key = hasher.finish();

    let cache_dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("thumbs");
    fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;
    let cached = cache_dir.join(format!("{key:016x}.jpg"));

    if cached.exists() {
        return fs::read(&cached).map_err(|e| e.to_string());
    }

    let img = image::ImageReader::open(&src)
        .map_err(|e| e.to_string())?
        .with_guessed_format()
        .map_err(|e| e.to_string())?
        .decode()
        .map_err(|e| e.to_string())?;

    let thumb = apply_orientation(img.thumbnail(THUMB_SIZE, THUMB_SIZE), &src);

    let rgb = thumb.to_rgb8();
    let mut buf = Cursor::new(Vec::new());
    image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buf, JPEG_QUALITY)
        .encode_image(&rgb)
        .map_err(|e| e.to_string())?;

    let bytes = buf.into_inner();
    // Si el write de cache falla no és fatal: servim igualment
    let _ = fs::write(&cached, &bytes);
    Ok(bytes)
}

/// Respon una petició photo://<path-codificat> amb la imatge sencera.
/// Serveix els bytes originals; els formats que el webview no sap
/// renderitzar (TIFF) es reconverteixen a JPEG.
pub fn serve_photo(uri: &http::Uri) -> http::Response<Vec<u8>> {
    match serve_photo_inner(uri) {
        Ok((bytes, mime)) => http::Response::builder()
            .status(200)
            .header("Content-Type", mime)
            .header("Cache-Control", "public, max-age=3600")
            .body(bytes)
            .unwrap(),
        Err(e) => http::Response::builder()
            .status(404)
            .header("Content-Type", "text/plain")
            .body(e.into_bytes())
            .unwrap(),
    }
}

fn serve_photo_inner(uri: &http::Uri) -> Result<(Vec<u8>, &'static str), String> {
    let raw = uri.path().trim_start_matches('/');
    let path_str = percent_decode_str(raw)
        .decode_utf8()
        .map_err(|e| e.to_string())?
        .into_owned();
    let src = PathBuf::from(&path_str);

    let ext = src
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default();

    let mime = match ext.as_str() {
        "jpg" | "jpeg" | "jfif" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        // TIFF: el webview no el renderitza; reconvertim
        "tif" | "tiff" => {
            let img = image::open(&src).map_err(|e| e.to_string())?;
            let oriented = apply_orientation(img, &src);
            let mut buf = Cursor::new(Vec::new());
            image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buf, 90)
                .encode_image(&oriented.to_rgb8())
                .map_err(|e| e.to_string())?;
            return Ok((buf.into_inner(), "image/jpeg"));
        }
        _ => "application/octet-stream",
    };

    Ok((fs::read(&src).map_err(|e| e.to_string())?, mime))
}

#[derive(serde::Serialize)]
pub struct Histogram {
    pub luma: Vec<u32>,
    pub r: Vec<u32>,
    pub g: Vec<u32>,
    pub b: Vec<u32>,
}

/// Histograma de 256 bins per canal, calculat sobre la miniatura
/// (512px n'hi ha de sobres i aprofita la cache de disc).
#[tauri::command]
pub async fn histogram(app: tauri::AppHandle, path: String) -> Result<Histogram, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let bytes = thumb_bytes(&app, &path)?;
        let img = image::load_from_memory(&bytes).map_err(|e| e.to_string())?;
        let rgb = img.to_rgb8();

        let mut h = Histogram {
            luma: vec![0; 256],
            r: vec![0; 256],
            g: vec![0; 256],
            b: vec![0; 256],
        };
        for p in rgb.pixels() {
            let [r, g, b] = p.0;
            h.r[r as usize] += 1;
            h.g[g as usize] += 1;
            h.b[b as usize] += 1;
            // Luminància Rec. 709
            let y = (0.2126 * r as f32 + 0.7152 * g as f32 + 0.0722 * b as f32) as usize;
            h.luma[y.min(255)] += 1;
        }
        Ok(h)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Les fotos de càmera porten l'orientació a l'EXIF; el decodificador no
/// l'aplica, així que ho fem aquí perquè les miniatures no surtin girades.
pub fn apply_orientation(img: image::DynamicImage, path: &Path) -> image::DynamicImage {
    let orientation = fs::File::open(path)
        .ok()
        .and_then(|f| {
            exif::Reader::new()
                .read_from_container(&mut std::io::BufReader::new(f))
                .ok()
        })
        .and_then(|meta| {
            meta.get_field(exif::Tag::Orientation, exif::In::PRIMARY)
                .and_then(|f| f.value.get_uint(0))
        })
        .unwrap_or(1);

    match orientation {
        2 => img.fliph(),
        3 => img.rotate180(),
        4 => img.flipv(),
        5 => img.rotate90().fliph(),
        6 => img.rotate90(),
        7 => img.rotate270().fliph(),
        8 => img.rotate270(),
        _ => img,
    }
}
