use super::*;
use serde_json::json;
use sha2::Digest;
use std::os::unix::fs::{symlink, PermissionsExt};

#[test]
fn rejects_missing_test_or_mismatched_store_identity_before_registration() {
    assert!(release::store_link(None, false).is_err());
    assert!(release::store_link(Some("abcdefghijklmnopabcdefghijklmnop"), true).is_err());
    assert!(release::store_link(Some("abcdefghijklmnopabcdefghijklmnox"), false).is_err());
    assert_eq!(release::store_link(Some("abcdefghijklmnopabcdefghijklmnop"), false).unwrap(),
        "https://chromewebstore.google.com/detail/abcdefghijklmnopabcdefghijklmnop");
}

#[test]
fn xpi_must_be_pinned_and_have_the_focus_id_without_required_origins() {
    let manifest = json!({"manifest_version": 3, "name": "focus.", "version": "0.1.0",
        "browser_specific_settings": {"gecko": {"id": "focus@focus-local"}}, "permissions": ["nativeMessaging"]});
    let xpi = xpi(&manifest, true);
    let digest = format!("{:x}", sha2::Sha256::digest(&xpi));
    assert!(release::verify_xpi(&[], &digest, "0.1.0").is_err());
    assert!(release::verify_xpi(&xpi, &"0".repeat(64), "0.1.0").is_err());
    assert!(release::verify_xpi(&xpi, &digest, "0.1.1").is_err());
    assert!(release::verify_xpi(&xpi, &digest, "0.1.0").is_ok());
    for (key, value) in [
        ("browser_specific_settings", json!({"gecko": {"id":"other@focus-local"}})),
        ("host_permissions", json!(["<all_urls>"])),
        ("content_scripts", json!([{"matches": ["*://*/*"], "js": ["content.js"]}])),
    ] {
        let mut changed = manifest.clone();
        changed[key] = value;
        let bytes = self::xpi(&changed, true);
        let digest = format!("{:x}", sha2::Sha256::digest(&bytes));
        assert!(release::verify_xpi(&bytes, &digest, "0.1.0").is_err());
    }
    let unsigned = self::xpi(&manifest, false);
    let digest = format!("{:x}", sha2::Sha256::digest(&unsigned));
    assert!(release::verify_xpi(&unsigned, &digest, "0.1.0").is_err());
}

fn xpi(manifest: &serde_json::Value, signed: bool) -> Vec<u8> {
    use std::io::{Cursor, Write};
    let mut zip = zip::ZipWriter::new(Cursor::new(Vec::new()));
    zip.start_file("manifest.json", zip::write::SimpleFileOptions::default()).unwrap();
    zip.write_all(&serde_json::to_vec(manifest).unwrap()).unwrap();
    if signed {
        // Shape fixture only: Firefox verifies Mozilla's actual signature at install time.
        for file in ["META-INF/manifest.mf", "META-INF/mozilla.sf", "META-INF/mozilla.rsa"] {
            zip.start_file(file, zip::write::SimpleFileOptions::default()).unwrap();
            zip.write_all(b"fixture").unwrap();
        }
    }
    zip.finish().unwrap().into_inner()
}

#[test]
fn selected_launcher_receives_only_the_release_listing() {
    let dir = tempfile::tempdir().unwrap();
    let exe = dir.path().join("selected browser");
    let log = dir.path().join("arguments");
    std::fs::write(&exe, format!("#!/bin/sh\nprintf '%s\\n' \"$@\" > '{}'\n", log.display())).unwrap();
    std::fs::set_permissions(&exe, std::fs::Permissions::from_mode(0o700)).unwrap();
    let listing = "https://chromewebstore.google.com/detail/abcdefghijklmnopabcdefghijklmnop";
    launch_direct(&exe, Some(listing)).unwrap();
    assert_eq!(std::fs::read_to_string(log).unwrap(), format!("{listing}\n"));
}

#[test]
fn cancelled_or_failed_launch_rolls_back_only_the_current_registration_claim() {
    let tmp = tempfile::tempdir().unwrap();
    let dir = tmp.path().canonicalize().unwrap();
    let path = dir.join("com.focus_local.bridge.json");
    let body = br#"{"name":"com.focus_local.bridge","description":"focus. local bridge","type":"stdio"}"#;
    let mut reg = BridgeRegistration::open(&path, body).unwrap();
    assert_eq!(reg.during("first", None, || Ok(Outcome::Cancelled)).unwrap(), Outcome::Cancelled);
    assert!(!path.exists());
    reg.during("first", None, || Ok(Outcome::SignedPending)).unwrap();
    assert_eq!(reg.during("second", None, || Err(SetupError::LaunchFailed)), Err(SetupError::LaunchFailed));
    assert_eq!(std::fs::read(&path).unwrap(), body);
    reg.during("second", None, || Ok(Outcome::SignedPending)).unwrap();
    reg.release("first").unwrap();
    assert!(path.exists());
    reg.release("second").unwrap();
    assert!(!path.exists());
}

#[test]
fn refuses_conflicting_or_symlink_registrations_and_preserves_an_existing_match() {
    let tmp = tempfile::tempdir().unwrap();
    let dir = tmp.path().canonicalize().unwrap();
    let path = dir.join("com.focus_local.bridge.json");
    let other = dir.join("other");
    let body = br#"{"name":"com.focus_local.bridge","description":"focus. local bridge","type":"stdio"}"#;
    std::fs::write(&other, body).unwrap();
    symlink(&other, &path).unwrap();
    assert!(BridgeRegistration::open(&path, body).is_err());
    std::fs::remove_file(&path).unwrap();
    std::fs::write(&path, br#"{"name":"other"}"#).unwrap();
    assert!(BridgeRegistration::open(&path, body).is_err());
    std::fs::write(&path, body).unwrap();
    let mut reg = BridgeRegistration::open(&path, body).unwrap();
    reg.during("first", None, || Ok(Outcome::StoreOpened)).unwrap();
    reg.release("first").unwrap();
    assert_eq!(std::fs::read(&path).unwrap(), body);
    assert_eq!(std::fs::read(&other).unwrap(), body);
}

#[test]
fn removal_can_retry_bridge_cleanup_after_policy_is_already_gone() {
    let temp = tempfile::tempdir().unwrap();
    let dir = temp.path().canonicalize().unwrap();
    let manifest = dir.join("com.focus_local.bridge.json");
    let bytes = br#"{"name":"com.focus_local.bridge","description":"focus. local bridge","type":"stdio"}"#;
    {
        let mut reg = BridgeRegistration::open(&manifest, bytes).unwrap();
        let claim = super::super::types::ManagedClaim {
            browser: focus_core::model::Browser::Firefox, label: "Removed Firefox".into(), slot: "firefox".into(),
        };
        reg.during("selected", Some(claim), || Ok(Outcome::SignedPending)).unwrap();
    }
    let before = dir.join("previous-manifest");
    std::fs::rename(&manifest, &before).unwrap();
    symlink(&before, &manifest).unwrap();

    let mut policy_exists = true;
    assert_eq!(finish_removal(&manifest, "selected", || {
        policy_exists = false;
        Ok(Some(true))
    }), Err(SetupError::RollbackFailed));
    assert!(!policy_exists);
    assert_eq!(std::fs::read(&before).unwrap(), bytes);
    assert!(BridgeRegistration::owned(&manifest, "selected").unwrap());
    let retained = BridgeRegistration::managed_claims(&manifest).unwrap().next().unwrap();
    assert_eq!((retained.0.as_str(), retained.1.slot.as_str()), ("selected", "firefox"));

    std::fs::remove_file(&manifest).unwrap();
    std::fs::rename(&before, &manifest).unwrap();
    assert_eq!(finish_removal(&manifest, "selected", || Ok(Some(false))).unwrap(), Outcome::PolicyRemoved);
    assert!(!BridgeRegistration::owned(&manifest, "selected").unwrap());
    assert!(!manifest.exists());
}
