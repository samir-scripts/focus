use focus_core::{db::Db, model::Browser};
use rusqlite::Connection;

#[test]
fn an_expired_dialog_cannot_approve_a_replacement_for_the_same_profile_id() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("focus.sqlite3");
    let mut db = Db::open(&path).unwrap();
    let profile_id = "9dde51fb-a37a-4e76-9d7f-4cdfb02ddb90";
    db.begin_pair(profile_id, Browser::Chrome, "First", "old").unwrap();
    let old = db.state().unwrap().pending.remove(0).id;
    Connection::open(&path).unwrap().execute("UPDATE pending_pair SET expires_at=0", []).unwrap();
    db.begin_pair(profile_id, Browser::Chromium, "Replacement", "new").unwrap();
    assert!(db.decide_pair(&old, true, None).is_err());
    assert!(db.state().unwrap().profiles.is_empty());
}
