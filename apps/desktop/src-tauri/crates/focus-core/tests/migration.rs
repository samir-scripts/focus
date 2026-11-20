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
