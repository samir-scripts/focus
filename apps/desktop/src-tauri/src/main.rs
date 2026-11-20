#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(target_os = "macos")]
mod titlebar;
mod commands;

use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .invoke_handler(tauri::generate_handler![
            commands::browser_state,
            commands::browser_registrations,
            commands::set_hide_shorts,
            commands::decide_browser_pair,
            commands::revoke_browser_profile
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            titlebar::install(app)?;
            #[cfg(not(target_os = "macos"))]
            let _ = app;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to run focus desktop");
}
