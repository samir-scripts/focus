use focus_core::{db::Db, planner::{Entry, Kind, Issue}};
use uuid::Uuid;

fn plan() -> Entry {
    Entry { id: Uuid::new_v4(), kind: Kind::Plan, title: "Write".into(), notes: None,
        date: "2025-11-02".parse().unwrap(), time: "01:30".parse().unwrap(),
        end: Some("02:30".parse().unwrap()), zone: "America/New_York".into(), lead: None }
}

#[test]
fn validates_wall_times_using_saved_zone() {
    let mut entry = plan();
    assert_eq!(entry.validate().unwrap().time_offset, Some(-4 * 3600));
    entry.date = "2025-03-09".parse().unwrap();
    assert_eq!(entry.validate().unwrap_err(), Issue::EndGap);
    entry.end = Some("01:00".parse().unwrap());
    assert_eq!(entry.validate().unwrap_err(), Issue::EndOrder);
}

#[test]
fn moving_and_reopening_keeps_identity_and_local_date() {
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().join("db.sqlite");
    let mut db = Db::open(&path).unwrap();
    let mut entry = plan();
    let first_date = entry.date;
    db.save_planner_entry(&entry).unwrap();
    entry.date = entry.date.succ_opt().unwrap();
    db.save_planner_entry(&entry).unwrap();
    drop(db);
    let mut db = Db::open(&path).unwrap();
    assert!(db.planner_day(first_date).unwrap().is_empty());
    assert_eq!(db.planner_day(entry.date).unwrap(), vec![entry.clone()]);
    db.delete_planner_entry(entry.id).unwrap();
    assert!(db.planner_day(entry.date).unwrap().is_empty());
}

#[test]
fn reminder_lead_is_subtracted_from_the_first_fold_instant() {
    let mut entry = plan();
    entry.kind = Kind::Reminder;
    entry.end = None;
    entry.lead = Some(60);
    let alert: chrono::DateTime<chrono::Utc> = "2025-11-02T04:30:00Z".parse().unwrap();
    assert_eq!(entry.reminder_at().unwrap(), Some(alert.timestamp()));
    entry.lead = None;
    assert_eq!(entry.reminder_at().unwrap(), None);
}
