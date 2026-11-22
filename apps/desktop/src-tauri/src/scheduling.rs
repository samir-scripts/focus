use std::time::{Duration, SystemTime, UNIX_EPOCH};

use focus_core::{db::{Db, Error}, schedule::Schedule};
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

use crate::grace_launch::{self, Outcome};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Entry {
    schedule: Schedule,
    next_at: Option<i64>,
    outcome: Option<String>,
}

fn now() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs() as i64
}

async fn database<T: Send + 'static>(operation: impl FnOnce(Db) -> focus_core::db::Result<T> + Send + 'static) -> Result<T, &'static str> {
    tauri::async_runtime::spawn_blocking(move || operation(Db::open_default()?))
        .await.map_err(|_| Error::Database.code())?.map_err(Error::code)
}

#[tauri::command]
pub(crate) fn scheduling_available() -> bool {
    cfg!(target_os = "macos")
}

#[tauri::command]
pub(crate) async fn list_schedules() -> Result<Vec<Entry>, &'static str> {
    database(|db| {
        let time = now();
        let mut entries = Vec::new();
        for schedule in db.schedules()? {
            let next_at = schedule.next_after(time)?.map(|instant| instant.timestamp());
            let outcome = db.latest_schedule_outcome(&schedule)?;
            if next_at.is_some() || outcome.as_deref() != Some("started") {
                entries.push(Entry { schedule, next_at, outcome });
            }
        }
        entries.sort_unstable_by_key(|entry| (entry.next_at.unwrap_or(i64::MAX), entry.schedule.id));
        Ok(entries)
    }).await
}

#[tauri::command]
pub(crate) fn preview_schedule(schedule: Schedule) -> Result<Option<i64>, &'static str> {
    schedule.next_after(now()).map(|next| next.map(|instant| instant.timestamp())).map_err(Error::code)
}

#[tauri::command]
pub(crate) async fn save_schedule(schedule: Schedule) -> Result<(), &'static str> {
    if !scheduling_available() { return Err("unsupported"); }
    database(move |mut db| {
        if schedule.next_after(now())?.is_none() { return Err(Error::Invalid); }
        db.save_schedule(&schedule)
    }).await
}
#[tauri::command]
pub(crate) async fn delete_schedule(id: Uuid) -> Result<(), &'static str> {
    database(move |mut db| db.delete_schedule(id)).await
}

pub(crate) fn run(app: AppHandle) {
    if !scheduling_available() { return; }
    std::thread::spawn(move || {
        let mut previous = now();
        let mut db = None;
        loop {
            std::thread::sleep(Duration::from_secs(1));
            let current = now();
            let from = std::mem::replace(&mut previous, current);
            // A delayed tick (including wake) must not backfill elapsed starts.
            if !(1..=2).contains(&(current - from)) { continue; }
            if db.is_none() { db = Db::open_default().ok(); }
            if let Some(db) = db.as_mut() {
                if let Err(error) = dispatch(&app, db, from, current) {
                    eprintln!("Grace scheduler: {}", error.code());
                }
            }
        }
    });
}

fn dispatch(app: &AppHandle, db: &mut Db, from: i64, current: i64) -> focus_core::db::Result<()> {
    let mut candidates = Vec::new();
    for schedule in db.schedules()? {
        if let Some(due) = schedule.next_after(from)?.map(|date| date.timestamp()).filter(|&due| due <= current) {
            candidates.push((due, schedule));
        }
    }
    candidates.sort_unstable_by_key(|(due, schedule)| (*due, schedule.id));
    let mut launched = false;
    let mut changed = false;
    for (due, schedule) in candidates {
        if let Some(id) = db.claim_schedule(&schedule, due)? {
            changed = true;
            let outcome = if launched { Outcome::Busy } else { grace_launch::launch(app, id, false) };
            launched |= matches!(outcome, Outcome::Started | Outcome::Busy | Outcome::Unconfirmed);
            db.finish_schedule_occurrence(id, outcome.code())?;
        }
    }
    if changed { let _ = app.emit("schedules-changed", ()); }
    Ok(())
}
