use chrono::{DateTime, NaiveDate, Utc};
use focus_core::{db::Db, planner::{Entry, Kind, Retention, RetentionUpdate}};
use uuid::Uuid;

fn date(s: &str) -> NaiveDate { s.parse().unwrap() }
fn put(db: &mut Db, id: u128, day: &str, zone: &str, kind: Kind, lead: Option<u16>) {
    db.save_planner_entry(&Entry { id: Uuid::from_u128(id), title: format!("Entry {id}"), notes: None,
        date: date(day), time: "18:00".parse().unwrap(), end: (kind == Kind::Plan).then(|| "20:00".parse().unwrap()),
        kind, zone: zone.into(), lead }).unwrap();
}

#[test]
fn refreshes_a_changed_preview_and_only_deletes_confirmed_old_rows() {
    let dir = tempfile::tempdir().unwrap();
    let mut db = Db::open(&dir.path().join("db.sqlite")).unwrap();
    let today = date("2026-02-15");
    let now = "2026-02-15T12:00:00Z".parse::<DateTime<Utc>>().unwrap().timestamp();
    put(&mut db, 1, "2026-01-15", "UTC", Kind::Log, None);
    put(&mut db, 2, "2026-01-16", "UTC", Kind::Log, None);
    put(&mut db, 3, "2026-02-16", "UTC", Kind::Plan, None);
    assert_eq!(db.planner_retention().unwrap(), Retention::Keep);
    let old = db.planner_retention_preview(Retention::Days30, today, now).unwrap();
    assert_eq!(old.cutoff, Some(date("2026-01-16")));
    assert_eq!(old.count, 1);
    // Equal count, different set: protection cannot rely on count alone.
    db.delete_planner_entry(Uuid::from_u128(1)).unwrap();
    put(&mut db, 4, "2026-01-14", "UTC", Kind::Reminder, Some(5));
    let RetentionUpdate::Changed(new) = db.apply_planner_retention(Retention::Days30, today, now, Some(&old.token)).unwrap() else { panic!("accepted stale preview") };
    assert_eq!(new.count, 1);
    assert_eq!(db.planner_retention().unwrap(), Retention::Keep);
    assert!(matches!(db.apply_planner_retention(Retention::Days30, today, now, Some(&new.token)).unwrap(), RetentionUpdate::Applied));
    assert!(db.planner_day(date("2026-01-14")).unwrap().is_empty());
    assert_eq!(db.planner_day(date("2026-01-16")).unwrap()[0].id, Uuid::from_u128(2));
    assert_eq!(db.planner_day(date("2026-02-16")).unwrap()[0].id, Uuid::from_u128(3));
    assert_eq!(db.planner_retention().unwrap(), Retention::Days30);
}

#[test]
fn a_saved_zone_can_keep_a_plan_or_alert_live_after_its_wall_date() {
    let dir = tempfile::tempdir().unwrap();
    let mut db = Db::open(&dir.path().join("db.sqlite")).unwrap();
    // Simulate a separate cleanup clock to directly exercise the UTC protections.
    let today = date("2026-02-15");
    let now = "2026-01-16T03:45:00Z".parse::<DateTime<Utc>>().unwrap().timestamp();
    put(&mut db, 1, "2026-01-15", "Pacific/Honolulu", Kind::Plan, None);
    put(&mut db, 2, "2026-01-15", "Pacific/Honolulu", Kind::Reminder, Some(5));
    put(&mut db, 3, "2026-01-15", "UTC", Kind::Log, None);
    let preview = db.planner_retention_preview(Retention::Days30, today, now).unwrap();
    assert_eq!(preview.count, 1);
    db.apply_planner_retention(Retention::Days30, today, now, Some(&preview.token)).unwrap();
    assert_eq!(db.planner_day(date("2026-01-15")).unwrap().len(), 2);
    assert_eq!(db.clean_planner_retention(today, now + 24 * 3600).unwrap(), 2);
}

#[test]
fn repeated_cleanup_reuses_freed_sqlite_pages() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("db.sqlite");
    let mut db = Db::open(&path).unwrap();
    let today = date("2026-02-15");
    let now = "2026-02-15T12:00:00Z".parse::<DateTime<Utc>>().unwrap().timestamp();
    let preview = db.planner_retention_preview(Retention::Days30, today, now).unwrap();
    db.apply_planner_retention(Retention::Days30, today, now, Some(&preview.token)).unwrap();
    let sql = rusqlite::Connection::open(&path).unwrap();
    let page_count = || sql.pragma_query_value(None, "page_count", |row| row.get::<_, u32>(0)).unwrap();
    let mut first = 0;
    for cycle in 0..4 {
        for id in 0..128 {
            db.save_planner_entry(&Entry { id: Uuid::from_u128(id), kind: Kind::Log, title: "Old log".into(),
                notes: Some("x".repeat(4096)), date: date("2026-01-01"), time: "12:00".parse().unwrap(),
                end: None, zone: "UTC".into(), lead: None }).unwrap();
        }
        assert_eq!(db.clean_planner_retention(today, now).unwrap(), 128);
        if cycle == 0 { first = page_count(); }
        assert_eq!(page_count(), first);
    }
}
