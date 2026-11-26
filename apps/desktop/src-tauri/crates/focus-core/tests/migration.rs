use focus_core::db::Db;
use rusqlite::Connection;

#[test]
fn a_failed_migration_preserves_an_existing_database_and_its_backup() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("focus.sqlite3");
    let old = Connection::open(&path).unwrap();
    old.execute_batch("CREATE TABLE site_policy(prior TEXT); INSERT INTO site_policy VALUES('keep');").unwrap();
    assert!(Db::open(&path).is_err());
    for recovered in [&path, &dir.path().join("focus.sqlite3.pre-v1")] {
        let db = Connection::open(recovered).unwrap();
        assert_eq!(db.query_row("SELECT prior FROM site_policy", [], |row| row.get::<_, String>(0)).unwrap(), "keep");
        assert_eq!(db.pragma_query_value(None, "user_version", |row| row.get::<_, u32>(0)).unwrap(), 0);
        assert_eq!(db.query_row("SELECT count(*) FROM sqlite_master WHERE name IN ('site', 'site_origin')", [], |row| row.get::<_, u32>(0)).unwrap(), 0);
    }
}

#[test]
fn v1_upgrade_preserves_rule_and_pairing_without_granting_hosts() {
    use focus_core::model::EntryPolicy;
    use sha2::{Digest, Sha256};
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("focus.sqlite3");
    let old = Connection::open(&path).unwrap();
    old.execute_batch(include_str!("../migrations/001.sql")).unwrap();
    old.execute_batch("
        INSERT INTO site VALUES ('youtube','YouTube');
        INSERT INTO site_origin VALUES ('youtube','www.youtube.com');
        INSERT INTO site_policy VALUES ('youtube',7,0,0);
        INSERT INTO site_rule VALUES ('youtube','youtube.hide-shorts',1);
        UPDATE meta SET revision=7;
        PRAGMA user_version=1;
    ").unwrap();
    let id = "9dde51fb-a37a-4e76-9d7f-4cdfb02ddb90";
    old.execute("INSERT INTO profile(id,label,browser,token_hash) VALUES(?1,'Local','firefox',?2)",
        rusqlite::params![id, Sha256::digest(b"token").as_slice()]).unwrap();
    let mut db = Db::open(&path).unwrap();
    let original = db.state().unwrap();
    assert_eq!(original.revision, 7);
    assert!(original.hide_shorts);
    assert_eq!(original.sites[0].entry, EntryPolicy::Allow);
    assert!(!original.sites[0].grayscale);
    let schema = Connection::open(&path).unwrap();
    let version: u32 = schema.pragma_query_value(None, "user_version", |row| row.get(0)).unwrap();
    assert_eq!(version, 8);
    assert!(db.schedules().unwrap().is_empty());
    assert_eq!(original.sites[0].rules.get("youtube.hide-home-recommendations"), Some(&false));
    let saved: (String, bool) = schema.query_row("SELECT entry, grayscale FROM site_policy WHERE site_id='youtube'", [], |row| {
        Ok((row.get(0)?, row.get(1)?))
    }).unwrap();
    assert_eq!(saved, (String::from(r#"{"mode":"allow"}"#), false));
    assert_eq!(db.hello(id, true, "token", "test-session", 2).unwrap(), 7);
    let state = db.state().unwrap();
    assert_eq!(state.profiles[0].label, "Local");
    assert!(state.profiles[0].origins.is_empty());
}

#[test]
fn upgrading_a_copy_of_v4_preserves_preferences_policy_and_pairing() {
    use sha2::{Digest, Sha256};
    let dir = tempfile::tempdir().unwrap();
    let original = dir.path().join("3d3.sqlite3");
    let old = Connection::open(&original).unwrap();
    for sql in [
        include_str!("../migrations/001.sql"), include_str!("../migrations/002.sql"),
        include_str!("../migrations/003.sql"), include_str!("../migrations/004.sql"),
    ] {
        old.execute_batch(sql).unwrap();
    }
    old.execute_batch("
        INSERT INTO site VALUES ('youtube','YouTube');
        INSERT INTO site_policy(site_id, revision, grayscale) VALUES ('youtube',7,1);
        INSERT INTO site_rule VALUES ('youtube','youtube.hide-shorts',1);
        UPDATE meta SET revision=7, hold_seconds=60, two_step_confirmation=1;
        PRAGMA user_version=4;
    ").unwrap();
    let id = "9dde51fb-a37a-4e76-9d7f-4dfcb02ddb90";
    old.execute("INSERT INTO profile(id,label,browser,token_hash) VALUES(?1,'Local','firefox',?2)",
        rusqlite::params![id, Sha256::digest(b"token").as_slice()]).unwrap();
    drop(old);
    let copy = dir.path().join("copy.sqlite3");
    std::fs::copy(original, &copy).unwrap();
    let mut db = Db::open(&copy).unwrap();
    assert!(db.schedules().unwrap().is_empty());
    let state = db.state().unwrap();
    assert_eq!(state.revision, 7);
    assert!(state.hide_shorts);
    assert!(state.sites.iter().any(|site| site.grayscale));
    assert_eq!(db.hello(id, true, "token", "test-session", 4).unwrap(), 7);
    let sql = Connection::open(copy).unwrap();
    let prefs: (u32, bool) = sql.query_row("SELECT hold_seconds, two_step_confirmation FROM meta", [],
        |row| Ok((row.get(0)?, row.get(1)?))).unwrap();
    assert_eq!(prefs, (60, true));
}

#[test]
fn v5_upgrade_preserves_policy_preferences_and_grace_schedule() {
    use focus_core::schedule::Schedule;
    use uuid::Uuid;

    for populated in [false, true] {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("focus.sqlite3");
        let old = Connection::open(&path).unwrap();
        for sql in [
            include_str!("../migrations/001.sql"), include_str!("../migrations/002.sql"),
            include_str!("../migrations/003.sql"), include_str!("../migrations/004.sql"),
            include_str!("../migrations/005.sql"),
        ] { old.execute_batch(sql).unwrap(); }
        old.pragma_update(None, "user_version", 5).unwrap();
        let id = Uuid::new_v4();
        if populated {
            old.execute_batch("
                INSERT INTO site VALUES ('youtube','YouTube');
                INSERT INTO site_policy(site_id, revision, grayscale) VALUES ('youtube',7,1);
                INSERT INTO site_rule VALUES ('youtube','youtube.hide-shorts',1);
                UPDATE meta SET revision=7, hold_seconds=60, two_step_confirmation=1;
            ").unwrap();
            old.execute("INSERT INTO grace_schedule VALUES (?1, '2027-01-05', '13:00', 'America/New_York', NULL)", [id.as_bytes()]).unwrap();
        }
        drop(old);
        let db = Db::open(&path).unwrap();
        assert!(db.planner_day("2027-01-05".parse().unwrap()).unwrap().is_empty());
        let schedules: Vec<Schedule> = db.schedules().unwrap();
        if populated {
            assert_eq!(schedules.len(), 1);
            assert_eq!(schedules[0].id, id);
            let state = db.state().unwrap();
            assert_eq!(state.revision, 7);
            assert!(state.hide_shorts);
            assert!(state.sites.iter().any(|site| site.grayscale));
            let upgraded = Connection::open(&path).unwrap();
            let prefs = upgraded.query_row("SELECT hold_seconds, two_step_confirmation FROM meta", [], |row| {
                Ok((row.get::<_, u32>(0)?, row.get::<_, bool>(1)?))
            }).unwrap();
            assert_eq!(prefs, (60, true));
        } else {
            assert!(schedules.is_empty());
        }
    }
}
