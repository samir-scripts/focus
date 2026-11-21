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
