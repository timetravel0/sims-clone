#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build());

    builder
        .run(tauri::generate_context!())
        .expect("failed to run tauri app");
}
