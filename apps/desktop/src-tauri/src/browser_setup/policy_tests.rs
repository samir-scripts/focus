use super::*;
use serde_json::json;

#[test]
fn removes_only_focus_and_preserves_other_policy_changes() {
    let temp = tempfile::tempdir().unwrap();
    let dir = temp.path().canonicalize().unwrap();
    let path = dir.join("policies.json");
    let mut baseline = json!({"policies": {"DisableTelemetry":true, "ExtensionSettings": {
        "*":{"installation_mode":"blocked"}, "a@other":{"installation_mode":"allowed"}}}});
    fs::write(&path, serde_json::to_vec(&baseline).unwrap()).unwrap();
    let store = Policy::json(&path);
    assert!(store.install(b"trusted artifact").unwrap());
    assert!(!store.install(b"trusted artifact").unwrap());
    let mut applied: Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
    assert_eq!(applied["policies"]["ExtensionSettings"]["focus@focus-local"]["installation_mode"], "force_installed");
    let xpi = Url::parse(applied["policies"]["ExtensionSettings"]["focus@focus-local"]["install_url"].as_str().unwrap()).unwrap().to_file_path().unwrap();
    assert_eq!(fs::read(&xpi).unwrap(), b"trusted artifact");
    applied["policies"]["ExtensionSettings"]["a@other"]["updates_disabled"] = json!(true);
    baseline["policies"]["ExtensionSettings"]["a@other"]["updates_disabled"] = json!(true);
    fs::write(&path, serde_json::to_vec(&applied).unwrap()).unwrap();
    assert!(store.remove().unwrap());
    assert!(!store.remove().unwrap());
    assert_eq!(serde_json::from_slice::<Value>(&fs::read(&path).unwrap()).unwrap(), baseline);
    assert!(!xpi.exists());
}

#[test]
fn rejects_preexisting_focus_or_changed_owned_policy_instead_of_replacing_it() {
    let temp = tempfile::tempdir().unwrap();
    let dir = temp.path().canonicalize().unwrap();
    let path = dir.join("policies.json");
    let previous = br#"{"policies":{"ExtensionSettings":{"focus@focus-local":{"installation_mode":"blocked"}}}}"#;
    fs::write(&path, previous).unwrap();
    let store = Policy::json(&path);
    assert!(store.install(b"trusted artifact").is_err());
    assert_eq!(fs::read(&path).unwrap(), previous);
    fs::remove_file(&path).unwrap();
    store.install(b"trusted artifact").unwrap();
    fs::write(&path, previous).unwrap();
    assert!(store.remove().is_err());
    assert_eq!(fs::read(&path).unwrap(), previous);
}

#[test]
fn rollback_restores_absence_and_never_follows_the_policy_symlink() {
    let temp = tempfile::tempdir().unwrap();
    let dir = temp.path().canonicalize().unwrap();
    let path = dir.join("policies.json");
    let store = Policy::json(&path);
    let unrelated = dir.join("unrelated");
    fs::write(&unrelated, b"{}").unwrap();
    std::os::unix::fs::symlink(&unrelated, &path).unwrap();
    assert!(store.install(b"trusted artifact").is_err());
    assert_eq!(fs::read(&unrelated).unwrap(), b"{}");
    fs::remove_file(&path).unwrap();
    assert!(store.install(b"trusted artifact").unwrap());
    assert!(store.remove().unwrap());
    assert!(!path.exists());
}
