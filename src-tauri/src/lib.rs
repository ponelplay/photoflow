mod batch;
mod catalog;
mod commands;
mod dupes;
mod edit;
mod fileops;
mod thumbs;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .invoke_handler(tauri::generate_handler![
      commands::list_drives,
      commands::quick_links,
      commands::list_dir,
      commands::file_info,
      thumbs::histogram,
      fileops::delete_files,
      fileops::copy_files,
      fileops::move_files,
      fileops::rename_file,
      fileops::import_file,
      batch::batch_rename_preview,
      batch::batch_rename_apply,
      batch::batch_convert,
      catalog::catalog_get,
      catalog::catalog_set_rating,
      catalog::catalog_set_label,
      catalog::catalog_set_recipe,
      edit::export_edited,
      dupes::find_duplicates,
    ])
    .register_asynchronous_uri_scheme_protocol("thumb", |ctx, request, responder| {
      let app = ctx.app_handle().clone();
      let uri = request.uri().clone();
      // La descodificació d'imatges és costosa: fora del fil principal
      rayon::spawn(move || {
        responder.respond(thumbs::serve(&app, &uri));
      });
    })
    .register_asynchronous_uri_scheme_protocol("photo", |_ctx, request, responder| {
      let uri = request.uri().clone();
      rayon::spawn(move || {
        responder.respond(thumbs::serve_photo(&uri));
      });
    })
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // Catàleg (valoracions, etiquetes, receptes): en memòria,
      // desat a disc cada 2 s només si hi ha canvis
      app.manage(std::sync::Mutex::new(catalog::Catalog::load(app.handle())));
      let handle = app.handle().clone();
      std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_secs(2));
        if let Some(state) = handle.try_state::<catalog::CatalogState>() {
          state.lock().unwrap().save_if_dirty();
        }
      });

      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|app, event| {
      // Desat final garantit en tancar
      if let tauri::RunEvent::Exit = event {
        if let Some(state) = app.try_state::<catalog::CatalogState>() {
          state.lock().unwrap().save_if_dirty();
        }
      }
    });
}
