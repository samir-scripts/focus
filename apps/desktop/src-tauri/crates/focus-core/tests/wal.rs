use focus_core::db::Db;
use rusqlite::Connection;
use std::time::Duration;

#[test]
fn first_open_waits_for_a_reader_during_the_wal_transition() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("focus.sqlite3");
    let reader = Connection::open(&path).unwrap();
    reader.execute_batch("VACUUM; BEGIN; SELECT * FROM sqlite_master;").unwrap();
    std::thread::scope(|scope| {
        let (start, opened) = std::sync::mpsc::sync_channel(0);
        let shared_path = &path;
        let pending = scope.spawn(move || {
            start.send(()).unwrap();
            let db = Db::open(shared_path).unwrap();
            assert_eq!(db.policy().unwrap(), (0, false));
        });
        opened.recv().unwrap();
        std::thread::sleep(Duration::from_millis(200));
        reader.execute_batch("COMMIT;").unwrap();
        pending.join().unwrap();
    });
    // The original connection cached DELETE before the other connection changed it.
    drop(reader);
    let reopened = Connection::open(&path).unwrap();
    assert_eq!(reopened.pragma_query_value(None, "journal_mode", |row| row.get::<_, String>(0)).unwrap(), "wal");
}
