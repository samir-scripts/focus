use crate::browser_setup;
use focus_core::{db::{Db, Error, Result}, model::{Accessibility, ContentRules, DesktopState, EntryPolicy, OpenIntent}, protocol};
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
pub async fn scan_browsers() -> Result<browser_setup::Scan, &'static str> {
    tauri::async_runtime::spawn_blocking(browser_setup::scan).await.map_err(|_| "scan_failed")
}

#[tauri::command]
pub async fn start_browser_installation(target_id: String) -> Result<browser_setup::Outcome, &'static str> {
    browser_change(target_id, false).await
}

#[tauri::command]
pub async fn remove_browser_installation(target_id: String) -> Result<browser_setup::Outcome, &'static str> {
    browser_change(target_id, true).await
}

async fn browser_change(target_id: String, remove: bool) -> Result<browser_setup::Outcome, &'static str> {
    tauri::async_runtime::spawn_blocking(move || browser_setup::change(&target_id, remove))
        .await.map_err(|_| "setup_failed")?.map_err(browser_setup::SetupError::code)
}

#[tauri::command]
pub async fn set_content_rules(expected_revision: u64, rules: ContentRules) -> Result<(), &'static str> {
    database(move |db| db.set_content_rules(expected_revision, rules)).await
}

#[tauri::command]
pub async fn open_paired_browser(profile_id: String, site_id: String, expected_revision: u64) -> Result<(), &'static str> {
    database(move |db| {
        let id = db.enqueue_browser_open(&profile_id, &site_id, expected_revision)?;
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(8);
        loop {
            match db.browser_open_state(&id)? {
                Some(true) => return Ok(()),
                Some(false) => return Err(Error::OpenFailed),
                None if std::time::Instant::now() >= deadline => return Err(Error::OpenFailed),
                None => std::thread::sleep(std::time::Duration::from_millis(150)),
            }
        }
    }).await
}

#[tauri::command]
pub async fn set_grayscale(expected_revision: u64, site_id: String, enabled: bool) -> Result<(), &'static str> {
    database(move |db| db.set_grayscale(expected_revision, &site_id, enabled)).await
}

#[tauri::command]
pub async fn set_entry(expected_revision: u64, site_id: String, entry: EntryPolicy) -> Result<(), &'static str> {
    database(move |db| db.set_entry(expected_revision, &site_id, entry)).await
}

#[tauri::command]
pub async fn set_accessibility(expected_revision: u64, accessibility: Accessibility) -> Result<(), &'static str> {
    database(move |db| db.set_accessibility(expected_revision, accessibility)).await
}

#[tauri::command]
pub async fn designate_site(host: String) -> Result<String, &'static str> {
    database(move |db| db.designate_site(&host)).await
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
