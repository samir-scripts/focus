use focus_core::{db::{Db, Error}, model::{Browser, EntryPolicy}};
use rusqlite::Connection;

#[test]
fn unqualified_entry_cannot_be_saved_or_acknowledged() {
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().join("focus.sqlite3");
    let mut db = Db::open(&path).unwrap();
    db.set_hide_shorts(0, true).unwrap();
    assert_eq!(db.set_entry(1, "youtube", EntryPolicy::Block), Err(Error::VersionMismatch));
    assert_eq!(db.policy().unwrap(), (1, true));

    let id = "9dde51fb-a37a-4e76-9d7f-4cdfb02ddb90";
    db.begin_pair(id, Browser::Chrome, "Local", "token").unwrap();
    db.decide_pair(&db.state().unwrap().pending[0].id, true, None).unwrap();
    db.hello(id, false, "token", "session", 2).unwrap();
    Connection::open(&path).unwrap().execute_batch(
        "UPDATE site_policy SET entry='{\"mode\":\"block\"}',revision=2 WHERE site_id='youtube'; UPDATE meta SET revision=2;"
    ).unwrap();
    assert_eq!(db.applied(id, "session", 2, &["https://www.youtube.com/*".into()]), Err(Error::VersionMismatch));
    let state = db.state().unwrap();
    assert!(state.profiles[0].update_required);
    assert_ne!(state.profiles[0].ack_revision, Some(2));
    assert!(state.hide_shorts);
}
