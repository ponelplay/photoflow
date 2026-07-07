use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

const IMAGE_EXTS: &[&str] = &[
    "jpg", "jpeg", "jfif", "png", "gif", "bmp", "webp", "tif", "tiff",
];

pub fn is_image(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| IMAGE_EXTS.contains(&e.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

#[derive(Serialize)]
pub struct Drive {
    pub name: String,
    pub path: String,
}

#[derive(Serialize)]
pub struct QuickLink {
    pub name: String,
    pub path: String,
}

#[derive(Serialize)]
pub struct FolderEntry {
    pub name: String,
    pub path: String,
}

#[derive(Serialize)]
pub struct ImageEntry {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub modified_ms: u64,
}

#[derive(Serialize)]
pub struct DirListing {
    pub folders: Vec<FolderEntry>,
    pub images: Vec<ImageEntry>,
}

#[tauri::command]
pub fn list_drives() -> Vec<Drive> {
    (b'A'..=b'Z')
        .filter_map(|c| {
            let letter = c as char;
            let path = format!("{letter}:\\");
            Path::new(&path).exists().then(|| Drive {
                name: format!("{letter}:"),
                path,
            })
        })
        .collect()
}

#[tauri::command]
pub fn quick_links() -> Vec<QuickLink> {
    let mut links = Vec::new();
    let mut push = |name: &str, dir: Option<PathBuf>| {
        if let Some(d) = dir {
            if d.exists() {
                links.push(QuickLink {
                    name: name.to_string(),
                    path: d.to_string_lossy().into_owned(),
                });
            }
        }
    };
    push("Imatges", dirs::picture_dir());
    push("Escriptori", dirs::desktop_dir());
    push("Baixades", dirs::download_dir());
    links
}

#[cfg(windows)]
fn is_hidden_or_system(entry: &fs::DirEntry) -> bool {
    use std::os::windows::fs::MetadataExt;
    const HIDDEN: u32 = 0x2;
    const SYSTEM: u32 = 0x4;
    entry
        .metadata()
        .map(|m| m.file_attributes() & (HIDDEN | SYSTEM) != 0)
        .unwrap_or(false)
}

#[cfg(not(windows))]
fn is_hidden_or_system(_entry: &fs::DirEntry) -> bool {
    false
}

#[tauri::command]
pub fn list_dir(path: String) -> Result<DirListing, String> {
    let mut folders = Vec::new();
    let mut images = Vec::new();

    for entry in fs::read_dir(&path).map_err(|e| e.to_string())?.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') || name.starts_with('$') || is_hidden_or_system(&entry) {
            continue;
        }
        let p = entry.path();
        match entry.file_type() {
            Ok(t) if t.is_dir() => folders.push(FolderEntry {
                name,
                path: p.to_string_lossy().into_owned(),
            }),
            Ok(t) if t.is_file() && is_image(&p) => {
                let md = entry.metadata().ok();
                images.push(ImageEntry {
                    name,
                    path: p.to_string_lossy().into_owned(),
                    size: md.as_ref().map(|m| m.len()).unwrap_or(0),
                    modified_ms: md
                        .and_then(|m| m.modified().ok())
                        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                        .map(|d| d.as_millis() as u64)
                        .unwrap_or(0),
                });
            }
            _ => {}
        }
    }

    folders.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    images.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(DirListing { folders, images })
}

#[derive(Serialize, Default)]
pub struct FileInfo {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub modified_ms: u64,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub camera: Option<String>,
    pub lens: Option<String>,
    pub exposure: Option<String>,
    pub aperture: Option<String>,
    pub iso: Option<String>,
    pub focal: Option<String>,
    pub taken: Option<String>,
}

#[tauri::command]
pub fn file_info(path: String) -> Result<FileInfo, String> {
    let p = PathBuf::from(&path);
    let md = fs::metadata(&p).map_err(|e| e.to_string())?;

    let mut info = FileInfo {
        name: p
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default(),
        path: path.clone(),
        size: md.len(),
        modified_ms: md
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0),
        ..Default::default()
    };

    if let Ok((w, h)) = image::image_dimensions(&p) {
        info.width = Some(w);
        info.height = Some(h);
    }

    if let Ok(file) = fs::File::open(&p) {
        let mut reader = std::io::BufReader::new(file);
        if let Ok(meta) = exif::Reader::new().read_from_container(&mut reader) {
            let get = |tag: exif::Tag| {
                meta.get_field(tag, exif::In::PRIMARY).map(|f| {
                    f.display_value()
                        .with_unit(&meta)
                        .to_string()
                        .trim_matches('"')
                        .to_string()
                })
            };
            info.camera = get(exif::Tag::Model);
            info.lens = get(exif::Tag::LensModel);
            info.exposure = get(exif::Tag::ExposureTime);
            info.aperture = get(exif::Tag::FNumber);
            info.iso = get(exif::Tag::PhotographicSensitivity);
            info.focal = get(exif::Tag::FocalLength);
            info.taken = get(exif::Tag::DateTimeOriginal);
        }
    }

    Ok(info)
}
