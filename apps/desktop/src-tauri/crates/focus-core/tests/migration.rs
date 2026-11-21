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
    assert_eq!(version, 3);
    let saved: (String, bool) = schema.query_row("SELECT entry, grayscale FROM site_policy WHERE site_id='youtube'", [], |row| {
        Ok((row.get(0)?, row.get(1)?))
    }).unwrap();
    assert_eq!(saved, (String::from(r#"{"mode":"allow"}"#), false));
    assert_eq!(db.hello(id, true, "token", "test-session", 2).unwrap(), 7);
    let state = db.state().unwrap();
    assert_eq!(state.profiles[0].label, "Local");
    assert!(state.profiles[0].origins.is_empty());
}
