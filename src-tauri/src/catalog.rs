use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Manager;

/// Recepta d'edició no destructiva: l'original mai es toca,
/// això es guarda al catàleg i s'aplica en visualitzar o exportar.
#[derive(Serialize, Deserialize, Clone, Default, PartialEq)]
pub struct Recipe {
    /// Rotació en graus (0, 90, 180, 270)
    #[serde(default)]
    pub rot: u16,
    /// Retall en fraccions de la imatge (x, y, amplada, alçada), 0..1
    #[serde(default)]
    pub crop: Option<[f64; 4]>,
    /// Ajustos en percentatge -100..100
    #[serde(default)]
    pub brightness: i32,
    #[serde(default)]
    pub contrast: i32,
    #[serde(default)]
    pub saturation: i32,
}

impl Recipe {
    pub fn is_noop(&self) -> bool {
        self.rot == 0
            && self.crop.is_none()
            && self.brightness == 0
            && self.contrast == 0
            && self.saturation == 0
    }
}

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct Entry {
    #[serde(default)]
    pub rating: u8,
    #[serde(default)]
    pub label: Option<String>,
    #[serde(default)]
    pub recipe: Option<Recipe>,
}

impl Entry {
    fn is_empty(&self) -> bool {
        self.rating == 0 && self.label.is_none() && self.recipe.is_none()
    }
}

pub struct Catalog {
    file: PathBuf,
    map: HashMap<String, Entry>,
    dirty: bool,
}

pub type CatalogState = Mutex<Catalog>;

fn key(path: &str) -> String {
    path.to_lowercase()
}

impl Catalog {
    pub fn load(app: &tauri::AppHandle) -> Catalog {
        let file = app
            .path()
            .app_data_dir()
            .map(|d| d.join("catalog.json"))
            .unwrap_or_else(|_| PathBuf::from("catalog.json"));
        let map = fs::read(&file)
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default();
        Catalog {
            file,
            map,
            dirty: false,
        }
    }

    /// Desa de manera atòmica (fitxer temporal + rename) si hi ha canvis.
    pub fn save_if_dirty(&mut self) {
        if !self.dirty {
            return;
        }
        if let Some(dir) = self.file.parent() {
            let _ = fs::create_dir_all(dir);
        }
        if let Ok(json) = serde_json::to_vec(&self.map) {
            let tmp = self.file.with_extension("json.tmp");
            if fs::write(&tmp, &json).is_ok() && fs::rename(&tmp, &self.file).is_ok() {
                self.dirty = false;
            }
        }
    }

    fn entry_mut(&mut self, path: &str) -> &mut Entry {
        self.dirty = true;
        self.map.entry(key(path)).or_default()
    }

    fn cleanup(&mut self, path: &str) {
        let k = key(path);
        if self.map.get(&k).map(|e| e.is_empty()).unwrap_or(false) {
            self.map.remove(&k);
        }
    }

    /// Manté el catàleg coherent quan movem o renomenem fitxers.
    pub fn move_key(&mut self, from: &str, to: &str) {
        if let Some(e) = self.map.remove(&key(from)) {
            self.map.insert(key(to), e);
            self.dirty = true;
        }
    }

    pub fn remove_key(&mut self, path: &str) {
        if self.map.remove(&key(path)).is_some() {
            self.dirty = true;
        }
    }
}

/* ── Comandes ───────────────────────────────────────────────── */

#[tauri::command]
pub fn catalog_get(
    paths: Vec<String>,
    state: tauri::State<CatalogState>,
) -> HashMap<String, Entry> {
    let cat = state.lock().unwrap();
    paths
        .into_iter()
        .filter_map(|p| {
            let e = cat.map.get(&key(&p))?;
            Some((p, e.clone()))
        })
        .collect()
}

#[tauri::command]
pub fn catalog_set_rating(
    paths: Vec<String>,
    rating: u8,
    state: tauri::State<CatalogState>,
) {
    let mut cat = state.lock().unwrap();
    for p in &paths {
        cat.entry_mut(p).rating = rating.min(5);
        cat.cleanup(p);
    }
}

#[tauri::command]
pub fn catalog_set_label(
    paths: Vec<String>,
    label: Option<String>,
    state: tauri::State<CatalogState>,
) {
    let mut cat = state.lock().unwrap();
    for p in &paths {
        cat.entry_mut(p).label = label.clone();
        cat.cleanup(p);
    }
}

#[tauri::command]
pub fn catalog_set_recipe(
    path: String,
    recipe: Option<Recipe>,
    state: tauri::State<CatalogState>,
) {
    let mut cat = state.lock().unwrap();
    let normalized = recipe.filter(|r| !r.is_noop());
    cat.entry_mut(&path).recipe = normalized;
    cat.cleanup(&path);
}
