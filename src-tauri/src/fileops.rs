use std::fs;
use std::path::{Path, PathBuf};

/// Troba un nom lliure dins `dir` per a `name`: si ja existeix,
/// prova "nom (2).ext", "nom (3).ext"… com fa l'Explorador.
pub fn unique_dest(dir: &Path, name: &str) -> PathBuf {
    let candidate = dir.join(name);
    if !candidate.exists() {
        return candidate;
    }
    let stem = Path::new(name)
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| name.to_string());
    let ext = Path::new(name)
        .extension()
        .map(|e| format!(".{}", e.to_string_lossy()))
        .unwrap_or_default();
    for n in 2.. {
        let c = dir.join(format!("{stem} ({n}){ext}"));
        if !c.exists() {
            return c;
        }
    }
    unreachable!()
}

fn file_name(path: &Path) -> Result<String, String> {
    path.file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .ok_or_else(|| format!("Ruta sense nom de fitxer: {}", path.display()))
}

/// Envia els fitxers a la paperera de reciclatge (mai unlink directe).
#[tauri::command]
pub fn delete_files(
    paths: Vec<String>,
    state: tauri::State<crate::catalog::CatalogState>,
) -> Result<u32, String> {
    trash::delete_all(&paths).map_err(|e| e.to_string())?;
    let mut cat = state.lock().unwrap();
    for p in &paths {
        cat.remove_key(p);
    }
    Ok(paths.len() as u32)
}

#[tauri::command]
pub fn copy_files(paths: Vec<String>, dest_dir: String) -> Result<u32, String> {
    let dest = PathBuf::from(&dest_dir);
    if !dest.is_dir() {
        return Err(format!("La destinació no és una carpeta: {dest_dir}"));
    }
    let mut done = 0;
    for p in &paths {
        let src = PathBuf::from(p);
        let target = unique_dest(&dest, &file_name(&src)?);
        fs::copy(&src, &target).map_err(|e| format!("{p}: {e}"))?;
        done += 1;
    }
    Ok(done)
}

#[tauri::command]
pub fn move_files(
    paths: Vec<String>,
    dest_dir: String,
    state: tauri::State<crate::catalog::CatalogState>,
) -> Result<u32, String> {
    let dest = PathBuf::from(&dest_dir);
    if !dest.is_dir() {
        return Err(format!("La destinació no és una carpeta: {dest_dir}"));
    }
    let mut done = 0;
    for p in &paths {
        let src = PathBuf::from(p);
        // Moure a la mateixa carpeta és un no-op, no un duplicat
        if src.parent() == Some(dest.as_path()) {
            continue;
        }
        let target = unique_dest(&dest, &file_name(&src)?);
        // rename no travessa unitats (C: → D:); en aquest cas copia+esborra
        if fs::rename(&src, &target).is_err() {
            fs::copy(&src, &target).map_err(|e| format!("{p}: {e}"))?;
            fs::remove_file(&src).map_err(|e| format!("{p}: {e}"))?;
        }
        state
            .lock()
            .unwrap()
            .move_key(p, &target.to_string_lossy());
        done += 1;
    }
    Ok(done)
}

/// Importa un fitxer arrossegat des de fora (l'Explorador no exposa rutes
/// al webview, així que rebem els bytes per IPC binari). Retorna la ruta nova.
#[tauri::command]
pub fn import_file(request: tauri::ipc::Request) -> Result<String, String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("S'esperava un cos binari".into());
    };
    let header = |name: &str| -> Result<String, String> {
        let raw = request
            .headers()
            .get(name)
            .and_then(|v| v.to_str().ok())
            .ok_or_else(|| format!("Falta la capçalera {name}"))?;
        percent_encoding::percent_decode_str(raw)
            .decode_utf8()
            .map(|s| s.into_owned())
            .map_err(|e| e.to_string())
    };
    let name = header("x-file-name")?;
    let dest_dir = PathBuf::from(header("x-dest-dir")?);
    if !dest_dir.is_dir() {
        return Err("La destinació no és una carpeta".into());
    }
    // Sense separadors de ruta al nom: només el nom de fitxer pelat
    let name = Path::new(&name)
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .ok_or_else(|| "Nom de fitxer no vàlid".to_string())?;
    let target = unique_dest(&dest_dir, &name);
    fs::write(&target, bytes).map_err(|e| e.to_string())?;
    Ok(target.to_string_lossy().into_owned())
}

/// Canvia el nom d'un fitxer dins la seva carpeta. Retorna la ruta nova.
#[tauri::command]
pub fn rename_file(
    path: String,
    new_name: String,
    state: tauri::State<crate::catalog::CatalogState>,
) -> Result<String, String> {
    if new_name.is_empty()
        || new_name.contains(['\\', '/', ':', '*', '?', '"', '<', '>', '|'])
    {
        return Err("Nom no vàlid".into());
    }
    let src = PathBuf::from(&path);
    let parent = src
        .parent()
        .ok_or_else(|| "Ruta sense carpeta pare".to_string())?;
    let target = parent.join(&new_name);
    if target.exists() {
        return Err(format!("Ja existeix un fitxer amb el nom «{new_name}»"));
    }
    fs::rename(&src, &target).map_err(|e| e.to_string())?;
    state
        .lock()
        .unwrap()
        .move_key(&path, &target.to_string_lossy());
    Ok(target.to_string_lossy().into_owned())
}
