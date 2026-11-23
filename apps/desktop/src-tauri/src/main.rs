#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(target_os = "macos")]
mod titlebar;
mod commands;
mod browser_setup;
mod grace_launch;
mod scheduling;
#[cfg(target_os = "macos")]
mod focus_launch_identity;

use tauri::Manager;

#[tauri::command]
async fn open_sessions(app: tauri::AppHandle, caller: tauri::WebviewWindow) -> Result<(), String> {
    if caller.label() != "main" {
        return Err("Sessions can only be opened from Home".into());
    }
    let (tx, rx) = std::sync::mpsc::sync_channel(1);
    let handle = app.clone();
    app.run_on_main_thread(move || {
        let result = (|| -> tauri::Result<()> {
            let window = match handle.get_webview_window("sessions") {
                Some(window) => window,
                None => tauri::WebviewWindowBuilder::new(
                    &handle, "sessions", tauri::WebviewUrl::App("index.html".into()),
                ).title("focus. — Sessions").inner_size(960.0, 640.0).build()?,
            };
            window.show()?;
            window.unminimize()?;
            window.set_focus()
        })();
        let _ = tx.send(result);
    }).map_err(|err| err.to_string())?;
    rx.recv().map_err(|err| err.to_string())?.map_err(|err| err.to_string())
}

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
            open_sessions,
            commands::browser_state,
            grace_launch::start_grace,
            scheduling::scheduling_available,
            scheduling::list_schedules,
            scheduling::schedule_occurrences,
            scheduling::preview_schedule,
            scheduling::save_schedule,
            scheduling::delete_schedule,
            commands::scan_browsers,
            commands::start_browser_installation,
            commands::remove_browser_installation,
            commands::set_hide_shorts,
            commands::set_grayscale,
            commands::set_entry,
            commands::set_accessibility,
            commands::designate_site,
            commands::decide_browser_pair,
            commands::revoke_browser_profile
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            titlebar::install(app)?;
            scheduling::run(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to run focus desktop");
}
