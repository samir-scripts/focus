use focus_core::{db::{Db, Error}, model::Browser, protocol::Session};
use serde_json::{json, Value};

fn send(session: &mut Session, db: &mut Result<Db, Error>, op: &str, body: Value) -> Value {
    let bytes = serde_json::to_vec(&json!({"v":5,"id":"test","op":op,"body":body})).unwrap();
    session.message(&bytes, db, || Ok(()))
}

#[test]
fn open_is_delivered_once_to_the_selected_acknowledged_profile() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = Db::open(&dir.path().join("focus.sqlite3")).unwrap();
    let profile = "9dde51fb-a37a-4e76-9d7f-4cdfb02ddb90";
    let other = "8dde51fb-a37a-4e76-9d7f-4cdfb02ddb90";
    let token = "a".repeat(64);
    for id in [profile, other] {
        store.begin_pair(id, Browser::Chrome, "Fixture", &token).unwrap();
        let request = store.state().unwrap().pending.remove(0);
        store.decide_pair(&request.id, true, None).unwrap();
    }
    let mut db = Ok(store);
    let mut recipient = Session::new(false);
    let mut second = Session::new(false);
    for (id, session) in [(profile, &mut recipient), (other, &mut second)] {
        assert_eq!(send(session, &mut db, "hello", json!({"profileId":id,"token":token}))["ok"], true);
        assert_eq!(send(session, &mut db, "applied", json!({"revision":0,"origins":["https://x.com/*"]}))["ok"], true);
    }
    let store = db.as_mut().unwrap();
    assert!(matches!(store.enqueue_browser_open(profile, "https://x.com/home", 0), Err(Error::Invalid)));
    assert!(matches!(store.enqueue_browser_open(profile, "x", 1), Err(Error::Stale)));
    let id = store.enqueue_browser_open(profile, "x", 0).unwrap();
    assert!(second.tick(db.as_mut().unwrap()).unwrap().is_none());
    let event = recipient.tick(db.as_mut().unwrap()).unwrap().unwrap();
    assert_eq!(event["requestId"], id);
    assert_eq!(event["siteId"], "x");
    assert_eq!(event["revision"], 0);
    assert!(event.get("url").is_none());
    assert!(recipient.tick(db.as_mut().unwrap()).unwrap().is_none());
    let report = json!({"requestId":id,"opened":true});
    assert_eq!(send(&mut second, &mut db, "browser_open_result", report.clone())["ok"], false);
    assert_eq!(send(&mut recipient, &mut db, "browser_open_result", report.clone())["ok"], true);
    assert_eq!(send(&mut recipient, &mut db, "browser_open_result", report)["ok"], false);
    assert_eq!(db.as_mut().unwrap().browser_open_state(&id).unwrap(), Some(true));

    let store = db.as_mut().unwrap();
    let expired = store.enqueue_browser_open(profile, "x", 0).unwrap();
    let sql = rusqlite::Connection::open(dir.path().join("focus.sqlite3")).unwrap();
    sql.execute("UPDATE paired_open SET expires_at=0 WHERE id=?1", [&expired]).unwrap();
    assert!(recipient.tick(db.as_mut().unwrap()).unwrap().is_none());
    assert_eq!(db.as_mut().unwrap().browser_open_state(&expired).unwrap(), Some(false));
    let dropped = db.as_mut().unwrap().enqueue_browser_open(profile, "x", 0).unwrap();
    recipient.close(db.as_mut().unwrap());
    assert_eq!(db.as_mut().unwrap().browser_open_state(&dropped).unwrap(), Some(false));
}
