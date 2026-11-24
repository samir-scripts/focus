use std::{thread, time::Duration};

use chrono::{Local, NaiveDate};
use focus_core::{db::{Db, Error}, planner::{Retention, RetentionPreview, RetentionUpdate}};
use tauri::WebviewWindow;

use crate::{planner::{with_db, MUTATION}, planner_export::choose_and_write};

fn local_now() -> (NaiveDate, i64) {
    let now = Local::now();
    (now.date_naive(), now.timestamp())
}

pub(super) fn run() {
    thread::spawn(|| {
        let mut last_day = None;
        loop {
            let (today, now) = local_now();
            if last_day != Some(today) {
                let cleaned = MUTATION.lock().ok().is_some_and(|_guard| {
                    Db::open_default().and_then(|mut db| db.clean_planner_retention(today, now)).is_ok()
                });
                if cleaned { last_day = Some(today); }
            }
            thread::sleep(Duration::from_secs(30));
        }
    });
}

#[tauri::command]
pub(crate) async fn planner_retention() -> Result<Retention, &'static str> {
    with_db(|db| db.planner_retention()).await
}

#[tauri::command]
pub(crate) async fn planner_retention_preview(policy: Retention) -> Result<RetentionPreview, &'static str> {
    with_db(move |db| {
        let _guard = MUTATION.lock().map_err(|_| Error::Database)?;
        let (today, now) = local_now();
        db.planner_retention_preview(policy, today, now)
    }).await
}

#[tauri::command]
pub(crate) async fn planner_retention_apply(policy: Retention, token: Option<String>) -> Result<RetentionUpdate, &'static str> {
    with_db(move |mut db| {
        let _guard = MUTATION.lock().map_err(|_| Error::Database)?;
        let (today, now) = local_now();
        db.apply_planner_retention(policy, today, now, token.as_deref())
    }).await
}

#[tauri::command]
pub(crate) async fn planner_retention_export(window: WebviewWindow, policy: Retention, token: String) -> Result<bool, &'static str> {
    let entries = with_db(move |db| {
        let _guard = MUTATION.lock().map_err(|_| Error::Database)?;
        let (today, now) = local_now();
        db.planner_retention_export(policy, today, now, &token)
    }).await?.ok_or("stale_preview")?;
    tauri::async_runtime::spawn_blocking(move || choose_and_write(&window, "focus-planner-cleanup.csv", &entries))
        .await.map_err(|_| "export_failed")?
}
