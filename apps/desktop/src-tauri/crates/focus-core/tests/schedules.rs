use focus_core::{db::Db, schedule::Schedule};
use uuid::Uuid;

#[test]
fn schedules_survive_reopen_and_can_be_edited_and_removed() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("focus.sqlite3");
    let mut db = Db::open(&path).unwrap();
    assert!(db.schedules().unwrap().is_empty());
    let once = Schedule {
        id: Uuid::new_v4(),
        date: "2026-11-23".into(),
        time: "09:00".into(),
        zone: "America/New_York".into(),
        weekdays: None,
    };
    let mut weekly = Schedule { id: Uuid::new_v4(), weekdays: Some(0b0010101), ..once.clone() };
    db.save_schedule(&once).unwrap();
    db.save_schedule(&weekly).unwrap();
    drop(db);
    let mut db = Db::open(&path).unwrap();
    let saved = db.schedules().unwrap();
    assert_eq!(saved.len(), 2);
    assert!(saved.contains(&once));
    assert!(saved.contains(&weekly));
    weekly.time = "10:45".into();
    db.save_schedule(&weekly).unwrap();
    db.delete_schedule(once.id).unwrap();
    drop(db);
    assert_eq!(Db::open(&path).unwrap().schedules().unwrap(), vec![weekly]);
}

#[test]
fn spring_gap_is_skipped_and_fall_fold_fires_once() {
    let mut schedule = Schedule {
        id: Uuid::nil(),
        date: "2026-03-08".into(),
        time: "02:30".into(),
        zone: "America/New_York".into(),
        weekdays: Some(64),
    };
    assert_eq!(schedule.next_after(1772928000).unwrap().unwrap().to_rfc3339(), "2026-03-15T06:30:00+00:00");
    schedule.date = "2026-11-01".into();
    schedule.time = "01:30".into();
    let first = schedule.next_after(1793491200).unwrap().unwrap();
    assert_eq!(first.to_rfc3339(), "2026-11-01T05:30:00+00:00");
    assert_eq!(schedule.next_after(first.timestamp()).unwrap().unwrap().to_rfc3339(), "2026-11-08T06:30:00+00:00");
}

#[test]
fn weekday_selection_can_move_first_start_into_next_year() {
    let schedule = Schedule {
        id: Uuid::nil(),
        date: "2026-12-31".into(),
        time: "09:00".into(),
        zone: "America/New_York".into(),
        weekdays: Some(1),
    };
    assert_eq!(schedule.next_after(0).unwrap().unwrap().to_rfc3339(), "2027-01-04T14:00:00+00:00");
}

#[test]
fn racing_claims_and_restart_do_not_replay_an_interrupted_launch() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("focus.sqlite3");
    let mut db = Db::open(&path).unwrap();
    let schedule = Schedule {
        id: Uuid::new_v4(),
        date: "2026-11-23".into(),
        time: "09:00".into(),
        zone: "America/New_York".into(),
        weekdays: None,
    };
    db.save_schedule(&schedule).unwrap();
    let due = schedule.next_after(0).unwrap().unwrap().timestamp();
    let barrier = std::sync::Barrier::new(2);
    std::thread::scope(|scope| {
        let claim = || {
            let mut db = Db::open(&path).unwrap();
            barrier.wait();
            db.claim_schedule(&schedule, due).unwrap()
        };
        let a = scope.spawn(claim);
        let b = scope.spawn(claim);
        assert_ne!(a.join().unwrap().is_some(), b.join().unwrap().is_some());
    });
    drop(db);
    let mut db = Db::open(&path).unwrap();
    assert_eq!(db.latest_schedule_outcome(&schedule).unwrap().as_deref(), Some("unconfirmed"));
    let edited = Schedule { date: "2026-11-24".into(), ..schedule.clone() };
    db.save_schedule(&edited).unwrap();
    assert_eq!(db.latest_schedule_outcome(&edited).unwrap(), None);
    assert_eq!(db.claim_schedule(&schedule, due).unwrap(), None);
}

#[test]
fn edited_or_deleted_schedule_cannot_be_claimed_from_a_pending_tick() {
    let dir = tempfile::tempdir().unwrap();
    let mut db = Db::open(&dir.path().join("focus.sqlite3")).unwrap();
    let schedule = Schedule {
        id: Uuid::new_v4(),
        date: "2026-11-23".into(),
        time: "09:00".into(),
        zone: "America/New_York".into(),
        weekdays: None,
    };
    db.save_schedule(&schedule).unwrap();
    let due = schedule.next_after(0).unwrap().unwrap().timestamp();
    let updated = Schedule { time: "10:00".into(), ..schedule.clone() };
    db.save_schedule(&updated).unwrap();
    assert_eq!(db.claim_schedule(&schedule, due).unwrap(), None);
    db.delete_schedule(schedule.id).unwrap();
    assert_eq!(db.claim_schedule(&updated, updated.next_after(0).unwrap().unwrap().timestamp()).unwrap(), None);
}
