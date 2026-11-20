use focus_core::{db::{Db, Error, Result}, model::{DesktopState, OpenIntent}, protocol, registration};
use serde::Serialize;

#[derive(Serialize)]
struct BrowserState {
    #[serde(flatten)]
    state: DesktopState,
    open: Option<OpenIntent>,
}

async fn database<T: Send + 'static>(op: impl FnOnce(&mut Db) -> Result<T> + Send + 'static) -> std::result::Result<T, &'static str> {
    tauri::async_runtime::spawn_blocking(move || op(&mut Db::open_default()?))
        .await.map_err(|_| Error::Database.code())?.map_err(Error::code)
}

#[tauri::command]
pub async fn browser_state() -> std::result::Result<impl Serialize, &'static str> {
    database(|db| Ok(BrowserState { state: db.state()?, open: db.take_open()? })).await
}

#[tauri::command]
pub async fn browser_registrations() -> std::result::Result<Vec<registration::Registration>, &'static str> {
    tauri::async_runtime::spawn_blocking(registration::checks).await.map_err(|_| Error::Database.code())
}

#[tauri::command]
pub async fn set_hide_shorts(expected_revision: u64, enabled: bool) -> std::result::Result<(), &'static str> {
    database(move |db| db.set_hide_shorts(expected_revision, enabled)).await
}

#[tauri::command]
pub async fn decide_browser_pair(id: String, approved: bool, label: Option<String>) -> std::result::Result<(), &'static str> {
    database(move |db| {
        if !protocol::valid_profile(&id) { return Err(Error::Invalid); }
        let label = if approved { label.as_deref().map(protocol::profile_label).transpose()? } else { None };
        db.decide_pair(&id, approved, label)
    }).await
}

#[tauri::command]
pub async fn revoke_browser_profile(id: String) -> std::result::Result<(), &'static str> {
    database(move |db| {
        if !protocol::valid_profile(&id) { return Err(Error::Invalid); }
        db.revoke(&id)
    }).await
}
