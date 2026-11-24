use focus_core::{db::{Db, Error}, planner::{Entry, Kind}};
use uuid::Uuid;

#[test]
fn reads_inclusive_range_ordered_by_wall_time_and_id() {
    let dir = tempfile::tempdir().unwrap();
    let mut db = Db::open(&dir.path().join("planner.sqlite3")).unwrap();
    for (date, time, id) in [
        ("2025-03-12", "09:00", 1), ("2025-03-11", "15:00", 2),
        ("2025-03-10", "17:00", 4), ("2025-03-10", "17:00", 3),
        ("2025-03-09", "09:00", 5), ("2025-03-10", "12:00", 6),
    ] {
        db.save_planner_entry(&Entry { id: Uuid::from_u128(id), kind: Kind::Log, title: "Completed".into(),
            notes: None, date: date.parse().unwrap(), time: time.parse().unwrap(), end: None, zone: "UTC".into(), lead: None }).unwrap();
    }
    let from = "2025-03-10".parse().unwrap();
    let through = "2025-03-11".parse().unwrap();
    assert_eq!(db.planner_range(from, through).unwrap().into_iter().map(|row| row.id.as_u128()).collect::<Vec<_>>(), [6, 3, 4, 2]);
    assert_eq!(db.planner_range(through, from), Err(Error::Invalid));
    assert!(db.planner_range("2025-03-13".parse().unwrap(), "2025-03-13".parse().unwrap()).unwrap().is_empty());
}
