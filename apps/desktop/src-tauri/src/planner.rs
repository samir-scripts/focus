use focus_core::{db::{Db, Result as DbResult}, planner::{Entry, Issue, Resolved}};
use uuid::Uuid;

async fn with_db<T: Send + 'static>(operation: impl FnOnce(Db) -> DbResult<T> + Send + 'static) -> Result<T, &'static str> {
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
pub(crate) async fn planner_save(entry: Entry) -> Result<(), &'static str> {
    with_db(move |mut db| db.save_planner_entry(&entry)).await
}

#[tauri::command]
pub(crate) async fn planner_delete(id: String) -> Result<(), &'static str> {
    let id = Uuid::parse_str(&id).map_err(|_| "invalid_request")?;
    with_db(move |mut db| db.delete_planner_entry(id)).await
}
