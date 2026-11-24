use focus_core::{db::{Db, Result as DbResult}, planner::{Entry, Issue, Resolved}};
use serde::Serialize;
use std::{collections::HashMap, sync::Mutex, time::{SystemTime, UNIX_EPOCH}};
use uuid::Uuid;

pub(super) static MUTATION: Mutex<()> = Mutex::new(());

#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "snake_case")]
pub(super) enum AlertStatus {
    #[cfg(target_os = "macos")]
    Scheduled,
    #[cfg(target_os = "macos")]
    Denied,
    #[cfg(target_os = "macos")]
    Failed,
    Elapsed,
    Unavailable,
}

pub(super) fn now() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs() as i64
}

pub(super) async fn with_db<T: Send + 'static>(operation: impl FnOnce(Db) -> DbResult<T> + Send + 'static) -> Result<T, &'static str> {
    tauri::async_runtime::spawn_blocking(move || operation(Db::open_default()?))
        .await.map_err(|_| "database_unavailable")?.map_err(|error| error.code())
}

#[tauri::command]
pub(crate) async fn planner_day(date: String) -> Result<Vec<Entry>, &'static str> {
    let date = date.parse().map_err(|_| "invalid_request")?;
    with_db(move |db| db.planner_day(date)).await
}

#[tauri::command]
pub(crate) fn planner_validate(entry: Entry) -> Result<Resolved, Issue> {
    entry.validate()
}

#[tauri::command]
pub(crate) async fn planner_save(entry: Entry) -> Result<Option<AlertStatus>, &'static str> {
    let at = entry.reminder_at().map_err(|_| "invalid_request")?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = MUTATION.lock().map_err(|_| "database_unavailable")?;
        if at.is_some_and(|value| value <= now()) { return Err("alert_elapsed"); }
        let mut db = Db::open_default().map_err(|e| e.code())?;
        #[cfg(target_os = "macos")]
        crate::planner_notifications::cancel_before_change(&db, entry.id).map_err(|e| e.code())?;
        db.save_planner_entry(&entry).map_err(|e| e.code())?;
        #[cfg(target_os = "macos")]
        return Ok(at.map(|at| crate::planner_notifications::schedule(&entry, at)));
        #[cfg(not(target_os = "macos"))]
        Ok(at.map(|_| AlertStatus::Unavailable))
    }).await.map_err(|_| "database_unavailable")?
}

#[tauri::command]
pub(crate) async fn planner_alert_statuses(date: String) -> Result<HashMap<Uuid, AlertStatus>, &'static str> {
    let date = date.parse().map_err(|_| "invalid_request")?;
    with_db(move |db| {
        let entries = db.planner_day(date)?;
        #[cfg(target_os = "macos")]
        return Ok(crate::planner_notifications::statuses(entries));
        #[cfg(not(target_os = "macos"))]
        Ok(entries.into_iter().filter_map(|entry| entry.reminder_at().ok().flatten()
            .map(|at| (entry.id, if at <= now() { AlertStatus::Elapsed } else { AlertStatus::Unavailable }))).collect())
    }).await
}

#[tauri::command]
pub(crate) fn planner_alerts_available() -> bool {
    #[cfg(target_os = "macos")]
    return crate::planner_notifications::available();
    #[cfg(not(target_os = "macos"))]
    false
}

#[tauri::command]
pub(crate) async fn planner_delete(id: String) -> Result<(), &'static str> {
    let id = Uuid::parse_str(&id).map_err(|_| "invalid_request")?;
    with_db(move |mut db| {
        let _guard = MUTATION.lock().map_err(|_| focus_core::db::Error::Database)?;
        #[cfg(target_os = "macos")]
        crate::planner_notifications::cancel_before_change(&db, id)?;
        db.delete_planner_entry(id)
    }).await
}
