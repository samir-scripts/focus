use std::{borrow::Cow, io::Write, path::Path};

use chrono::NaiveDate;
use focus_core::{db::Db, planner::{Entry, Kind}};
use tauri::WebviewWindow;
use tauri_plugin_dialog::DialogExt;

const HEADER: [&str; 9] = ["type", "local_date", "start", "end", "log_time", "time_zone", "title", "notes", "reminder_setting"];

fn spreadsheet_text(value: &str) -> Cow<'_, str> {
    let first = value.trim_start_matches(|c: char| c.is_whitespace() || c == '\u{feff}');
    if first.starts_with(['=', '+', '-', '@', '＝', '＋', '－', '＠']) || value.starts_with(['\t', '\r', '\n']) {
        format!("'{value}").into()
    } else { value.into() }
}

fn write_csv(writer: impl Write, entries: &[Entry]) -> Result<(), csv::Error> {
    let mut csv = csv::WriterBuilder::new().terminator(csv::Terminator::CRLF).from_writer(writer);
    csv.write_record(HEADER)?;
    for entry in entries {
        let date = entry.date.to_string();
        let time = entry.time.format("%H:%M").to_string();
        let end = entry.end.map(|time| time.format("%H:%M").to_string());
        let (kind, start, log_time, reminder) = match entry.kind {
            Kind::Plan => ("Plan", time.as_str(), "", ""),
            Kind::Reminder => ("Reminder", time.as_str(), "", match entry.lead {
                Some(0) => "At start", Some(5) => "5 minutes before", Some(15) => "15 minutes before",
                Some(60) => "1 hour before", _ => "No alert",
            }),
            Kind::Log => ("Log", "", time.as_str(), ""),
        };
        csv.write_record([kind, &date, start, end.as_deref().unwrap_or(""), log_time, &entry.zone,
            &spreadsheet_text(&entry.title), &spreadsheet_text(entry.notes.as_deref().unwrap_or("")), reminder])?;
    }
    csv.flush()?;
    Ok(())
}

fn write_file(path: &Path, entries: &[Entry]) -> Result<(), &'static str> {
    let parent = path.parent().filter(|path| path.is_absolute()).ok_or("invalid_destination")?;
    let mut temporary = tempfile::NamedTempFile::new_in(parent).map_err(|_| "write_failed")?;
    write_csv(temporary.as_file_mut(), entries).map_err(|_| "write_failed")?;
    temporary.as_file().sync_all().map_err(|_| "write_failed")?;
    temporary.persist(path).map_err(|_| "write_failed")?;
    Ok(())
}

pub(super) fn choose_and_write(window: &WebviewWindow, name: &str, entries: &[Entry]) -> Result<bool, &'static str> {
    let Some(destination) = window.dialog().file().set_parent(window).set_title("Export planner entries")
        .add_filter("CSV", &["csv"]).set_file_name(name).blocking_save_file() else { return Ok(false) };
    let path = destination.into_path().map_err(|_| "invalid_destination")?;
    write_file(&path, entries)?;
    Ok(true)
}

#[tauri::command]
pub(crate) async fn planner_export_count(from: NaiveDate, through: NaiveDate) -> Result<usize, &'static str> {
    super::planner::with_db(move |db| db.planner_range_count(from, through)).await
}

#[tauri::command]
pub(crate) async fn planner_export(window: WebviewWindow, from: NaiveDate, through: NaiveDate, count: usize) -> Result<bool, &'static str> {
    tauri::async_runtime::spawn_blocking(move || {
        let entries = Db::open_default().and_then(|db| db.planner_range(from, through)).map_err(|e| e.code())?;
        if count != entries.len() { return Err("stale_export"); }
        choose_and_write(&window, &format!("focus-planner-{from}.csv"), &entries)
    }).await.map_err(|_| "export_failed")?
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    #[test]
    fn writes_parseable_utf8_and_escapes_formula_prefixes_without_editing_originals() {
        let entry = Entry { id: Uuid::nil(), kind: Kind::Log, title: "  =1+2".into(), notes: Some("Élan, \"review\"\nDone".into()),
            date: "2025-03-10".parse().unwrap(), time: "12:05".parse().unwrap(), end: None, zone: "UTC".into(), lead: None };
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("planner.csv");
        std::fs::write(&path, "previous").unwrap();
        write_file(&path, std::slice::from_ref(&entry)).unwrap();
        let mut reader = csv::Reader::from_path(&path).unwrap();
        assert_eq!(reader.headers().unwrap().iter().collect::<Vec<_>>(), HEADER);
        assert_eq!(reader.records().next().unwrap().unwrap().iter().collect::<Vec<_>>(),
            ["Log", "2025-03-10", "", "", "12:05", "UTC", "'  =1+2", "Élan, \"review\"\nDone", ""]);
        assert_eq!(entry.title, "  =1+2");
        assert_eq!(write_file(dir.path(), &[]), Err("write_failed"));
        write_file(&path, &[]).unwrap();
        assert_eq!(csv::Reader::from_path(path).unwrap().records().count(), 0);
    }
}
