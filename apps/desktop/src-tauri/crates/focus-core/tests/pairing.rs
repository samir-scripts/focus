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

#[test]
fn v1_cannot_acknowledge_a_grayscale_revision() {
    use focus_core::protocol::Session;
    use serde_json::json;

    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("focus.sqlite3");
    let id = "9dde51fb-a37a-4e76-9d7f-4cdfb02ddb90";
    let token = "a".repeat(64);
    let mut db = Db::open(&path).unwrap();
    db.begin_pair(id, Browser::Chrome, "Legacy", &token).unwrap();
    let request = db.state().unwrap().pending.remove(0).id;
    db.decide_pair(&request, true, None).unwrap();
    db.set_hide_shorts(0, true).unwrap();
    let mut db = Ok(db);
    let mut session = Session::new(false);
    let mut send = |op: &str, body| session.message(
        &serde_json::to_vec(&json!({"v":1,"id":"1","op":op,"body":body})).unwrap(),
        &mut db, || Ok(()));
    assert_eq!(send("hello", json!({"profileId":id,"token":token}))["ok"], true);
    assert_eq!(send("applied", json!({"revision":1,"origins":["https://www.youtube.com/*"]}))["ok"], true);
    Connection::open(&path).unwrap().execute_batch(
        "UPDATE site_policy SET grayscale=1, revision=2 WHERE site_id='youtube';
         UPDATE meta SET revision=2;"
    ).unwrap();
    assert_eq!(send("applied", json!({"revision":2,"origins":["https://www.youtube.com/*"]}))["error"]["code"], "version_mismatch");
    assert_eq!(send("snapshot", json!({"afterRevision":1}))["error"]["code"], "version_mismatch");
    let state = serde_json::to_value(db.unwrap().state().unwrap()).unwrap();
    assert_eq!(state["profiles"][0]["updateRequired"], true);
    assert_ne!(state["profiles"][0]["ackRevision"], 2);
    assert_eq!(state["hideShorts"], true);
}
