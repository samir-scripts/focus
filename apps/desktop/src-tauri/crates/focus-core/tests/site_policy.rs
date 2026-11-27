use focus_core::{db::{Db, Error}, model::EntryPolicy};

#[test]
fn designation_is_exact_and_duplicate_hosts_select_the_existing_site() {
    let temp = tempfile::tempdir().unwrap();
    let mut db = Db::open(&temp.path().join("focus.sqlite3")).unwrap();
    assert_eq!(db.designate_site("WWW.YouTube.com.").unwrap(), "youtube");
    let id = db.designate_site("Bücher.Example.").unwrap();
    assert_eq!(db.designate_site("xn--bcher-kva.example").unwrap(), id);
    let state = db.state().unwrap();
    assert_eq!(state.revision, 1);
    let site = state.sites.iter().find(|site| site.id == id).unwrap();
    assert_eq!(site.hosts, ["xn--bcher-kva.example"]);
    assert!(!site.grayscale);
    assert_eq!(site.entry, EntryPolicy::Allow);
    for input in ["*.example.com", "example.com:443", "example.com/path", "user@example.com", "https://example.com"] {
        assert_eq!(db.designate_site(input), Err(Error::Invalid), "{input}");
    }
    assert_eq!(db.state().unwrap().revision, 1);
}

#[cfg(debug_assertions)]
#[test]
fn entry_validation_and_grayscale_edits_preserve_other_policy() {
    let temp = tempfile::tempdir().unwrap();
    let mut db = Db::open_entry_fixture(&temp.path().join("focus.sqlite3")).unwrap();
    db.set_hide_shorts(0, true).unwrap();
    db.set_grayscale(1, "youtube", true).unwrap();
    let invalid = serde_json::from_str(r#"{"mode":"pause","seconds":601,"frequency":"visit","finish":"manual"}"#).unwrap();
    assert_eq!(db.set_entry(2, "youtube", invalid), Err(Error::Invalid));
    assert_eq!(db.set_entry(1, "youtube", EntryPolicy::Block), Err(Error::Stale));
    let current = db.state().unwrap();
    assert_eq!(current.revision, 2);
    assert!(current.hide_shorts);
    assert!(current.sites[0].grayscale);
    assert_eq!(current.sites[0].entry, EntryPolicy::Allow);
    db.set_entry(2, "youtube", EntryPolicy::Block).unwrap();
    assert_eq!(db.state().unwrap().sites[0].entry, EntryPolicy::Block);
}

#[test]
fn accessibility_defaults_are_global_and_survive_reopening() {
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().join("focus.sqlite3");
    let db = Db::open(&path).unwrap();
    let state = serde_json::to_value(db.state().unwrap()).unwrap();
    assert_eq!(state["revision"], 0);
    assert_eq!(state["accessibility"], serde_json::json!({
        "holdSeconds": 15,
        "twoStepConfirmation": false
    }));
    drop(db);

    let db = Db::open(&path).unwrap();
    let state = serde_json::to_value(db.state().unwrap()).unwrap();
    assert_eq!(state["revision"], 0);
    assert_eq!(state["accessibility"], serde_json::json!({
        "holdSeconds": 15,
        "twoStepConfirmation": false
    }));
}

#[test]
fn current_protocol_snapshot_includes_global_accessibility_defaults() {
    use focus_core::{model::Browser, protocol::{Session, VERSION}};
    use serde_json::json;

    let temp = tempfile::tempdir().unwrap();
    let mut db = Db::open(&temp.path().join("focus.sqlite3")).unwrap();
    let id = "9dde51fb-a37a-4e76-9d7f-4cdfb02ddb90";
    let token = "a".repeat(64);
    db.begin_pair(id, Browser::Chrome, "Local", &token).unwrap();
    let request = db.state().unwrap().pending.remove(0).id;
    db.decide_pair(&request, true, None).unwrap();
    let mut db = Ok(db);
    let mut session = Session::new(false);
    let mut send = |op: &str, body| session.message(
        &serde_json::to_vec(&json!({"v":VERSION,"id":"1","op":op,"body":body})).unwrap(),
        &mut db, || Ok(()));
    assert_eq!(send("hello", json!({"profileId":id,"token":token}))["ok"], true);
    let snapshot = send("snapshot", json!({"afterRevision":null}));
    assert_eq!(snapshot["ok"], true);
    assert_eq!(snapshot["body"]["revision"], 0);
    assert_eq!(snapshot["body"]["accessibility"], json!({
        "holdSeconds": 15,
        "twoStepConfirmation": false
    }));
}

#[test]
fn accessibility_edits_validate_revision_and_persist_without_changing_site_policies() {
    use focus_core::model::Accessibility;
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().join("focus.sqlite3");
    let mut db = Db::open(&path).unwrap();
    let default = Accessibility { hold_seconds: 15, two_step_confirmation: false };
    let changed = Accessibility { hold_seconds: 600, two_step_confirmation: true };
    db.set_accessibility(0, default).unwrap();
    assert_eq!(db.state().unwrap().revision, 0);
    assert_eq!(db.set_accessibility(0, Accessibility { hold_seconds: 14, ..default }), Err(Error::Invalid));
    assert_eq!(db.set_accessibility(0, Accessibility { hold_seconds: 601, ..default }), Err(Error::Invalid));
    db.set_accessibility(0, changed).unwrap();
    assert_eq!(db.set_accessibility(0, default), Err(Error::Stale));
    drop(db);
    let state = Db::open(&path).unwrap().state().unwrap();
    assert_eq!(state.revision, 1);
    assert_eq!(state.accessibility, changed);
    assert_eq!(state.sites[0].entry, EntryPolicy::Allow);
}

#[test]
fn migrates_v2_with_existing_policy_and_live_lease() {
    use rusqlite::Connection;
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().join("focus.sqlite3");
    let conn = Connection::open(&path).unwrap();
    conn.execute_batch(include_str!("../migrations/001.sql")).unwrap();
    conn.execute_batch(include_str!("../migrations/002.sql")).unwrap();
    conn.execute_batch("INSERT INTO site VALUES ('youtube','YouTube');
        INSERT INTO site_policy(site_id) VALUES ('youtube');
        INSERT INTO site_rule VALUES ('youtube','youtube.hide-shorts',1);
        UPDATE meta SET revision=4;
        INSERT INTO profile(id,label,browser,token_hash) VALUES ('profile','Test','chrome',X'00');
        INSERT INTO profile_runtime(profile_id,session_id,expires_at,protocol) VALUES ('profile','session',9999999999,2);
        PRAGMA user_version=2;").unwrap();
    drop(conn);
    let db = Db::open(&path).unwrap();
    let state = db.state().unwrap();
    assert_eq!(state.revision, 4);
    assert!(state.hide_shorts);
    assert_eq!(state.accessibility.hold_seconds, 15);
    assert!(!state.accessibility.two_step_confirmation);
    assert!(state.profiles[0].online);
}

#[cfg(debug_assertions)]
#[test]
fn older_protocols_cannot_acknowledge_accessibility_or_manual_pause() {
    use focus_core::{model::{Accessibility, Browser, Finish, Frequency}, protocol::Session};
    use serde_json::json;
    let temp = tempfile::tempdir().unwrap();
    let mut db = Db::open_entry_fixture(&temp.path().join("focus.sqlite3")).unwrap();
    let id = "9dde51fb-a37a-4e76-9d7f-4cdfb02ddb90";
    let token = "a".repeat(64);
    db.begin_pair(id, Browser::Chrome, "Local", &token).unwrap();
    db.decide_pair(&db.state().unwrap().pending[0].id, true, None).unwrap();
    let mut db = Ok(db);
    let mut session = Session::new(false);
    let request = |op: &str, body| serde_json::to_vec(&json!({"v":2,"id":"1","op":op,"body":body})).unwrap();
    assert_eq!(session.message(&request("hello", json!({"profileId":id,"token":token})), &mut db, || Ok(()))["ok"], true);
    assert_eq!(session.message(&request("snapshot", json!({"afterRevision":null})), &mut db, || Ok(()))["body"]["accessibility"], serde_json::Value::Null);
    assert_eq!(session.message(&request("applied", json!({"revision":0,"origins":[]})), &mut db, || Ok(()))["ok"], true);
    db.as_mut().unwrap().set_accessibility(0, Accessibility { hold_seconds: 30, two_step_confirmation: false }).unwrap();
    assert_eq!(session.message(&request("snapshot", json!({"afterRevision":0})), &mut db, || Ok(()))["error"]["code"], "version_mismatch");
    assert_eq!(session.message(&request("applied", json!({"revision":1,"origins":[]})), &mut db, || Ok(()))["error"]["code"], "version_mismatch");
    assert!(db.as_ref().unwrap().state().unwrap().profiles[0].update_required);
    db.as_mut().unwrap().set_accessibility(1, Accessibility { hold_seconds: 15, two_step_confirmation: false }).unwrap();
    db.as_mut().unwrap().set_entry(2, "youtube", EntryPolicy::Pause { seconds: 15, finish: Finish::Manual, frequency: Frequency::Visit }).unwrap();
    assert_eq!(session.message(&request("applied", json!({"revision":3,"origins":[]})), &mut db, || Ok(()))["error"]["code"], "version_mismatch");
}

#[cfg(debug_assertions)]
#[test]
fn chromium_block_requires_v4_before_acknowledgement() {
    use focus_core::{model::Browser, protocol::Session};
    use serde_json::json;
    let temp = tempfile::tempdir().unwrap();
    let mut db = Db::open_entry_fixture(&temp.path().join("focus.sqlite3")).unwrap();
    let id = "9dde51fb-a37a-4e76-9d7f-4cdfb02ddb90";
    let token = "a".repeat(64);
    db.begin_pair(id, Browser::Chrome, "Local", &token).unwrap();
    db.decide_pair(&db.state().unwrap().pending[0].id, true, None).unwrap();
    let mut db = Ok(db);
    let mut old = Session::new(false);
    let request = |version, op: &str, body| serde_json::to_vec(&json!({"v":version,"id":"1","op":op,"body":body})).unwrap();
    assert_eq!(old.message(&request(3, "hello", json!({"profileId":id,"token":token})), &mut db, || Ok(()))["ok"], true);
    assert_eq!(old.message(&request(3, "applied", json!({"revision":0,"origins":[]})), &mut db, || Ok(()))["ok"], true);
    db.as_mut().unwrap().set_entry(0, "youtube", EntryPolicy::Block).unwrap();
    assert_eq!(old.message(&request(3, "snapshot", json!({"afterRevision":0})), &mut db, || Ok(()))["body"]["sites"][0]["entry"]["mode"], "block");
    assert_eq!(old.message(&request(3, "applied", json!({"revision":1,"origins":[]})), &mut db, || Ok(()))["error"]["code"], "version_mismatch");
    assert!(db.as_ref().unwrap().state().unwrap().profiles[0].update_required);
    let mut current = Session::new(false);
    assert_eq!(current.message(&request(4, "hello", json!({"profileId":id,"token":token})), &mut db, || Ok(()))["ok"], true);
    assert_eq!(current.message(&request(4, "snapshot", json!({"afterRevision":null})), &mut db, || Ok(()))["body"]["sites"][0]["entry"]["mode"], "block");
    assert_eq!(current.message(&request(4, "applied", json!({"revision":1,"origins":[]})), &mut db, || Ok(()))["ok"], true);
    assert!(!db.as_ref().unwrap().state().unwrap().profiles[0].update_required);
}

#[test]
fn selective_rules_are_atomic_and_require_v5_only_when_active() {
    use focus_core::{model::{Browser, ContentRules}, protocol::Session};
    use serde_json::json;
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().join("focus.sqlite3");
    let mut db = Db::open(&path).unwrap();
    let id = "9dde51fb-a37a-4e76-9d7f-4cdfb02ddb90";
    let token = "a".repeat(64);
    db.begin_pair(id, Browser::Chrome, "Local", &token).unwrap();
    db.decide_pair(&db.state().unwrap().pending[0].id, true, None).unwrap();
    let mut db = Ok(db);
    let mut old = Session::new(false);
    let mut current = Session::new(false);
    let request = |session: &mut Session, db: &mut Result<Db, Error>, v, op, body| {
        session.message(&serde_json::to_vec(&json!({"v":v,"id":"1","op":op,"body":body})).unwrap(), db, || Ok(()))
    };
    let hello = || json!({"profileId":id,"token":token});
    assert_eq!(request(&mut old, &mut db, 4, "hello", hello())["ok"], true);
    let snapshot = request(&mut old, &mut db, 4, "snapshot", json!({"afterRevision":null}));
    assert_eq!(snapshot["body"]["sites"][0]["rules"], json!({"youtube.hide-shorts":false}));
    assert_eq!(request(&mut old, &mut db, 4, "applied", json!({"revision":0,"origins":[]}))["ok"], true);
    let store = db.as_mut().unwrap();
    assert_eq!(store.set_content_rules(0, ContentRules::X { hide_for_you: true, open_following: true }), Err(Error::Invalid));
    assert_eq!(store.set_content_rules(0, ContentRules::Reddit { hide_recommendations: true, hide_all_home: true }), Err(Error::Invalid));
    store.set_content_rules(0, ContentRules::Youtube { hide_shorts: true, hide_home_recommendations: true, navigation_mode: None }).unwrap();
    assert_eq!(store.set_content_rules(0, ContentRules::Youtube { hide_shorts: false, hide_home_recommendations: false, navigation_mode: None }), Err(Error::Stale));
    assert_eq!(request(&mut old, &mut db, 4, "snapshot", json!({"afterRevision":0}))["error"]["code"], "version_mismatch");
    assert_eq!(request(&mut old, &mut db, 4, "applied", json!({"revision":1,"origins":[]}))["error"]["code"], "version_mismatch");
    let profile = db.as_ref().unwrap().state().unwrap().profiles.remove(0);
    assert_eq!(profile.ack_revision, Some(0));
    assert!(profile.update_required);
    assert_eq!(request(&mut current, &mut db, 5, "hello", hello())["ok"], true);
    let snapshot = request(&mut current, &mut db, 5, "snapshot", json!({"afterRevision":null}));
    assert_eq!(snapshot["body"]["sites"][0]["rules"], json!({"youtube.hide-shorts":true,"youtube.hide-home-recommendations":true}));
    assert_eq!(request(&mut current, &mut db, 5, "applied", json!({"revision":1,"origins":["https://www.youtube.com/*"]}))["ok"], true);
    let mut db = Db::open(&path).unwrap();
    db.set_content_rules(1, ContentRules::Youtube { hide_shorts: true, hide_home_recommendations: false, navigation_mode: None }).unwrap();
    assert_eq!(db.policy().unwrap(), (2, true));
    assert!(db.snapshot(None, 4).is_ok());
}

#[test]
fn instagram_defaults_are_visible_only_to_v6_clients() {
    let temp = tempfile::tempdir().unwrap();
    let db = Db::open(&temp.path().join("focus.sqlite3")).unwrap();
    for version in [5, 6] {
        let (revision, snapshot) = db.snapshot(None, version).unwrap();
        let site = snapshot.unwrap().0.into_iter().find(|site| site.id == "instagram").unwrap();
        assert_eq!(revision, 0);
        if version == 5 {
            assert!(site.rules.is_empty());
        } else {
            assert_eq!(site.rules.get("instagram.hide-suggested-home"), Some(&false));
            assert_eq!(site.rules.get("instagram.hide-reels-discovery"), Some(&false));
        }
    }
}

#[test]
fn short_video_navigation_defaults_off_in_v7() {
    let temp = tempfile::tempdir().unwrap();
    let db = Db::open(&temp.path().join("focus.sqlite3")).unwrap();
    let (_, snapshot) = db.snapshot(None, 7).unwrap();
    for site in snapshot.unwrap().0.into_iter().filter(|site| {
        matches!(site.id.as_str(), "instagram" | "youtube" | "tiktok")
    }) {
        for mode in ["lock-opened-videos", "lock-all-short-video-viewers"] {
            assert_eq!(site.rules.get(&format!("{}.{mode}", site.id)), Some(&false));
        }
    }
}

#[test]
fn navigation_mode_switch_is_atomic_and_requires_v7() {
    use focus_core::model::ContentRules;
    let temp = tempfile::tempdir().unwrap();
    let mut db = Db::open(&temp.path().join("focus.sqlite3")).unwrap();
    let edit = |mode| -> ContentRules {
        serde_json::from_value(serde_json::json!({
            "site": "instagram", "hideSuggestedHome": true, "hideReelsDiscovery": false,
            "navigationMode": mode
        })).unwrap()
    };
    db.set_content_rules(0, edit("openedVideos")).unwrap();
    assert_eq!(db.set_content_rules(0, edit("off")), Err(Error::Stale));
    assert!(matches!(db.snapshot(None, 6), Err(Error::VersionMismatch)));
    db.set_content_rules(1, edit("allShortVideoViewers")).unwrap();
    let (revision, snapshot) = db.snapshot(None, 7).unwrap();
    assert_eq!(revision, 2);
    let site = snapshot.unwrap().0.into_iter().find(|site| site.id == "instagram").unwrap();
    assert_eq!(site.rules["instagram.lock-opened-videos"], false);
    assert_eq!(site.rules["instagram.lock-all-short-video-viewers"], true);
    assert_eq!(site.rules["instagram.hide-suggested-home"], true);
    db.set_content_rules(2, edit("off")).unwrap();
    let (_, snapshot) = db.snapshot(None, 6).unwrap();
    let site = snapshot.unwrap().0.into_iter().find(|site| site.id == "instagram").unwrap();
    assert!(!site.rules.contains_key("instagram.lock-all-short-video-viewers"));
    assert_eq!(site.rules["instagram.hide-suggested-home"], true);
}

#[test]
fn instagram_choices_require_v6_until_both_are_disabled() {
    use focus_core::model::{Browser, ContentRules};
    use serde_json::json;
    let temp = tempfile::tempdir().unwrap();
    let mut db = Db::open(&temp.path().join("focus.sqlite3")).unwrap();
    let id = "9dde51fb-a37a-4e76-9d7f-4cdfb02ddb90";
    let token = "a".repeat(64);
    db.begin_pair(id, Browser::Chrome, "Local", &token).unwrap();
    db.decide_pair(&db.state().unwrap().pending[0].id, true, None).unwrap();
    db.hello(id, false, &token, "v5", 5).unwrap();
    db.applied(id, "v5", 0, &[]).unwrap();
    let choices = |suggested, reels| -> ContentRules {
        serde_json::from_value(json!({"site":"instagram","hideSuggestedHome":suggested,"hideReelsDiscovery":reels})).unwrap()
    };
    for (index, (suggested, reels)) in [(true, false), (false, true), (true, true), (false, false)].into_iter().enumerate() {
        let before = index as u64;
        db.set_content_rules(before, choices(suggested, reels)).unwrap();
        assert_eq!(db.set_content_rules(before, choices(false, false)), Err(Error::Stale));
        let revision = before + 1;
        let blocked = suggested || reels;
        assert_eq!(matches!(db.snapshot(None, 5), Err(Error::VersionMismatch)), blocked);
        let profile = db.state().unwrap().profiles.remove(0);
        assert_eq!(profile.update_required, blocked);
        assert_eq!(profile.ack_revision, Some(0));
        if blocked {
            assert_eq!(db.applied(id, "v5", revision, &[]), Err(Error::VersionMismatch));
        }
        let (current, snapshot) = db.snapshot(None, 6).unwrap();
        let site = snapshot.unwrap().0.into_iter().find(|site| site.id == "instagram").unwrap();
        assert_eq!(current, revision);
        assert_eq!(site.rules.get("instagram.hide-suggested-home"), Some(&suggested));
        assert_eq!(site.rules.get("instagram.hide-reels-discovery"), Some(&reels));
    }
    db.hello(id, false, &token, "v6", 6).unwrap();
    db.applied(id, "v6", 4, &[]).unwrap();
}
