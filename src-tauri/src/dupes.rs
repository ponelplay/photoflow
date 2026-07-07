use rayon::prelude::*;

/// dHash perceptual de 64 bits: escala a 9×8 en grisos i compara
/// cada píxel amb el seu veí. Robust a redimensionats i recompressions.
fn dhash(bytes: &[u8]) -> Option<u64> {
    let img = image::load_from_memory(bytes).ok()?;
    let gray = image::imageops::resize(
        &img.to_luma8(),
        9,
        8,
        image::imageops::FilterType::Triangle,
    );
    let mut hash: u64 = 0;
    for y in 0..8 {
        for x in 0..8 {
            hash <<= 1;
            if gray.get_pixel(x, y).0[0] > gray.get_pixel(x + 1, y).0[0] {
                hash |= 1;
            }
        }
    }
    Some(hash)
}

/// Troba grups de fotos duplicades o quasi-idèntiques dins la llista.
/// threshold = bits de diferència tolerats (0 = idèntiques, 5 = molt semblants).
#[tauri::command]
pub async fn find_duplicates(
    app: tauri::AppHandle,
    paths: Vec<String>,
    threshold: u32,
) -> Result<Vec<Vec<String>>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        // Fase 1: hash en paral·lel reutilitzant la cache de miniatures
        let hashes: Vec<(usize, u64)> = paths
            .par_iter()
            .enumerate()
            .filter_map(|(i, p)| {
                let bytes = crate::thumbs::thumb_bytes(&app, p).ok()?;
                Some((i, dhash(&bytes)?))
            })
            .collect();

        // Fase 2: agrupament per distància de Hamming (union-find)
        let n = paths.len();
        let mut parent: Vec<usize> = (0..n).collect();
        fn find(parent: &mut Vec<usize>, i: usize) -> usize {
            let mut i = i;
            while parent[i] != i {
                parent[i] = parent[parent[i]];
                i = parent[i];
            }
            i
        }
        for a in 0..hashes.len() {
            for b in (a + 1)..hashes.len() {
                let dist = (hashes[a].1 ^ hashes[b].1).count_ones();
                if dist <= threshold {
                    let (ra, rb) = (
                        find(&mut parent, hashes[a].0),
                        find(&mut parent, hashes[b].0),
                    );
                    if ra != rb {
                        parent[ra] = rb;
                    }
                }
            }
        }

        let mut groups: std::collections::HashMap<usize, Vec<String>> =
            std::collections::HashMap::new();
        for (i, _) in &hashes {
            let root = find(&mut parent, *i);
            groups.entry(root).or_default().push(paths[*i].clone());
        }
        let mut result: Vec<Vec<String>> = groups
            .into_values()
            .filter(|g| g.len() > 1)
            .collect();
        result.sort_by_key(|g| std::cmp::Reverse(g.len()));
        Ok(result)
    })
    .await
    .map_err(|e| e.to_string())?
}
