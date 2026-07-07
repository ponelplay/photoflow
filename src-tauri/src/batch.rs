use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;
use std::time::UNIX_EPOCH;
use tauri::ipc::Channel;

use crate::fileops::unique_dest;
use crate::thumbs::apply_orientation;

/* ── Dates sense dependències: algorisme civil de Howard Hinnant ── */

fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

/// (data "YYYY-MM-DD", hora "HH-MM-SS") a partir de mil·lisegons d'època (hora local aproximada: UTC)
fn date_time_from_ms(ms: u64) -> (String, String) {
    let secs = ms / 1000;
    let (y, mo, d) = civil_from_days((secs / 86_400) as i64);
    let rem = secs % 86_400;
    (
        format!("{y:04}-{mo:02}-{d:02}"),
        format!("{:02}-{:02}-{:02}", rem / 3600, (rem % 3600) / 60, rem % 60),
    )
}

/// Data i hora de captura EXIF; si no n'hi ha, cau a la data de modificació
fn capture_date_time(path: &Path) -> (String, String) {
    let from_exif = fs::File::open(path).ok().and_then(|f| {
        let meta = exif::Reader::new()
            .read_from_container(&mut std::io::BufReader::new(f))
            .ok()?;
        let s = meta
            .get_field(exif::Tag::DateTimeOriginal, exif::In::PRIMARY)?
            .display_value()
            .to_string();
        // Formats "2026:07:01 18:42:33" o "2026-07-01 18:42:33"
        let mut it = s.split_whitespace();
        let d = it.next()?.replace(':', "-");
        let t = it.next().unwrap_or("00-00-00").replace(':', "-");
        Some((d, t))
    });
    from_exif.unwrap_or_else(|| {
        let ms = fs::metadata(path)
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        date_time_from_ms(ms)
    })
}

/* ── Renomenat per lots ─────────────────────────────────────── */

#[derive(Serialize)]
pub struct RenamePair {
    pub path: String,
    pub old_name: String,
    pub new_name: String,
}

/// Calcula els noms nous segons el patró, resolent col·lisions amb sufixos.
/// Tokens: {data} {hora} {contador} {nom}
#[tauri::command]
pub fn batch_rename_preview(
    paths: Vec<String>,
    pattern: String,
    start: u32,
) -> Vec<RenamePair> {
    let digits = format!("{}", start as usize + paths.len()).len().max(3);
    let mut taken: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut out = Vec::with_capacity(paths.len());

    for (i, p) in paths.iter().enumerate() {
        let path = Path::new(p);
        let old_name = path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();
        let stem = path
            .file_stem()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_default();
        let ext = path
            .extension()
            .map(|e| format!(".{}", e.to_string_lossy()))
            .unwrap_or_default();

        let needs_date = pattern.contains("{data}") || pattern.contains("{hora}");
        let (data, hora) = if needs_date {
            capture_date_time(path)
        } else {
            (String::new(), String::new())
        };

        let mut base = pattern
            .replace("{data}", &data)
            .replace("{hora}", &hora)
            .replace("{contador}", &format!("{:0digits$}", start as usize + i))
            .replace("{nom}", &stem);
        if base.trim().is_empty() {
            base = stem.clone();
        }

        // Resol col·lisions dins el lot i amb fitxers existents al disc
        let parent = path.parent().unwrap_or(Path::new(""));
        let mut candidate = format!("{base}{ext}");
        let mut n = 2;
        while taken.contains(&candidate.to_lowercase())
            || (parent.join(&candidate).exists() && candidate != old_name)
        {
            candidate = format!("{base} ({n}){ext}");
            n += 1;
        }
        taken.insert(candidate.to_lowercase());

        out.push(RenamePair {
            path: p.clone(),
            old_name,
            new_name: candidate,
        });
    }
    out
}

#[derive(Deserialize)]
pub struct ApplyPair {
    pub path: String,
    pub new_name: String,
}

/// Aplica el renomenat en dues fases (via noms temporals) perquè els
/// intercanvis de noms dins el mateix lot no xoquin mai.
#[tauri::command]
pub fn batch_rename_apply(
    pairs: Vec<ApplyPair>,
    state: tauri::State<crate::catalog::CatalogState>,
) -> Result<u32, String> {
    let mut temps: Vec<(PathBuf, PathBuf, String)> = Vec::with_capacity(pairs.len());
    for (i, pair) in pairs.iter().enumerate() {
        let src = PathBuf::from(&pair.path);
        if src.file_name().map(|n| n.to_string_lossy().into_owned())
            == Some(pair.new_name.clone())
        {
            continue; // ja té el nom final
        }
        let parent = src
            .parent()
            .ok_or_else(|| "Ruta sense carpeta pare".to_string())?
            .to_path_buf();
        let tmp = parent.join(format!(".pf-tmp-{i}"));
        fs::rename(&src, &tmp).map_err(|e| format!("{}: {e}", pair.path))?;
        temps.push((tmp, parent.join(&pair.new_name), pair.path.clone()));
    }
    let mut done = 0;
    let mut cat = state.lock().unwrap();
    for (tmp, fin, old) in temps {
        fs::rename(&tmp, &fin).map_err(|e| format!("{}: {e}", fin.display()))?;
        cat.move_key(&old, &fin.to_string_lossy());
        done += 1;
    }
    Ok(done)
}

/* ── Conversió per lots ─────────────────────────────────────── */

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConvertOpts {
    /// "jpeg" | "png" | "webp" (webp sense pèrdua)
    pub format: String,
    pub quality: u8,
    /// Costat llarg màxim en px; None = mida original
    pub max_side: Option<u32>,
    /// Carpeta de sortida; None = subcarpeta "PhotoFlow" al costat dels originals
    pub dest_dir: Option<String>,
}

#[derive(Serialize, Clone)]
pub struct ConvertProgress {
    pub done: u32,
    pub total: u32,
    pub current: String,
}

#[derive(Serialize)]
pub struct ConvertResult {
    pub done: u32,
    pub dest: String,
    pub errors: Vec<String>,
}

#[tauri::command]
pub async fn batch_convert(
    paths: Vec<String>,
    opts: ConvertOpts,
    on_progress: Channel<ConvertProgress>,
) -> Result<ConvertResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let total = paths.len() as u32;
        let first_parent = Path::new(&paths[0])
            .parent()
            .unwrap_or(Path::new(""))
            .to_path_buf();
        let dest = opts
            .dest_dir
            .as_ref()
            .map(PathBuf::from)
            .unwrap_or_else(|| first_parent.join("PhotoFlow"));
        fs::create_dir_all(&dest).map_err(|e| e.to_string())?;

        let ext = match opts.format.as_str() {
            "png" => "png",
            "webp" => "webp",
            _ => "jpg",
        };
        let counter = AtomicU32::new(0);
        let errors: Mutex<Vec<String>> = Mutex::new(Vec::new());
        let dest_lock = Mutex::new(()); // unique_dest no és atòmic entre fils

        // Una imatge per fil: decodifica → orienta → redueix → codifica → allibera
        paths.par_iter().for_each(|p| {
            let result = (|| -> Result<(), String> {
                let src = Path::new(p);
                let img = image::ImageReader::open(src)
                    .map_err(|e| e.to_string())?
                    .with_guessed_format()
                    .map_err(|e| e.to_string())?
                    .decode()
                    .map_err(|e| e.to_string())?;
                let img = apply_orientation(img, src);
                let img = match opts.max_side {
                    Some(m) if img.width().max(img.height()) > m => {
                        img.resize(m, m, image::imageops::FilterType::CatmullRom)
                    }
                    _ => img,
                };

                let stem = src
                    .file_stem()
                    .map(|s| s.to_string_lossy().into_owned())
                    .unwrap_or_default();
                let target = {
                    let _g = dest_lock.lock().unwrap();
                    let t = unique_dest(&dest, &format!("{stem}.{ext}"));
                    // Reserva el nom creant el fitxer buit dins el candau
                    fs::File::create(&t).map_err(|e| e.to_string())?;
                    t
                };

                let out = fs::File::create(&target).map_err(|e| e.to_string())?;
                let mut w = std::io::BufWriter::new(out);
                match opts.format.as_str() {
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
                    _ => image::codecs::jpeg::JpegEncoder::new_with_quality(
                        &mut w,
                        opts.quality.clamp(1, 100),
                    )
                    .encode_image(&img.to_rgb8())
                    .map_err(|e| e.to_string())?,
                }
                Ok(())
            })();

            if let Err(e) = result {
                errors.lock().unwrap().push(format!("{p}: {e}"));
            }
            let done = counter.fetch_add(1, Ordering::Relaxed) + 1;
            let name = Path::new(p)
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_default();
            let _ = on_progress.send(ConvertProgress {
                done,
                total,
                current: name,
            });
        });

        let errors = errors.into_inner().unwrap();
        Ok(ConvertResult {
            done: total - errors.len() as u32,
            dest: dest.to_string_lossy().into_owned(),
            errors,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}
