use crate::model::{Browser, GECKO_ID, HOST_NAME};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::{ffi::OsString, fs, io::Read, path::{Path, PathBuf}, sync::LazyLock};

const FILENAME: &str = "com.focus_local.bridge.json";

static TEST_ID: LazyLock<String> = LazyLock::new(|| {
    let manifest: serde_json::Value = serde_json::from_str(include_str!("../../../../../extension/chromium-test-key.json")).expect("test public key");
    let der = STANDARD.decode(manifest["key"].as_str().expect("test public key")).expect("DER public key");
    let digest = Sha256::digest(der);
    digest[..16].iter().flat_map(|n| [char::from(b'a' + (n >> 4)), char::from(b'a' + (n & 15))]).collect()
});

pub fn production_chromium_id() -> Option<&'static str> {
    #[derive(Deserialize)]
    struct Release<'a> {
        #[serde(borrow)]
        chromium: Option<Store<'a>>,
    }
    #[derive(Deserialize)]
    struct Store<'a> {
        extension_id: &'a str,
        published: bool,
        publisher: &'a str,
        provenance: &'a str,
    }
    let release: Release<'_> = serde_json::from_str(include_str!("../../../../../extension/browser-release.json")).ok()?;
    let release = release.chromium?;
    let id = release.extension_id;
    (release.published && !release.publisher.trim().is_empty() && !release.provenance.trim().is_empty()
        && id.len() == 32 && id.bytes().all(|c| (b'a'..=b'p').contains(&c))
        && id != TEST_ID.as_str()).then_some(id)
}

pub fn is_test_chromium_id(id: &str) -> bool { id == TEST_ID.as_str() }

#[derive(Deserialize)]
struct Manifest {
    name: String,
    #[serde(rename = "type")]
    kind: String,
    path: PathBuf,
    #[serde(default)]
    allowed_origins: Vec<String>,
    #[serde(default)]
    allowed_extensions: Vec<String>,
}

fn read_manifest(path: &Path) -> Option<Manifest> {
    if path.file_name()?.to_str()? != FILENAME || !path.is_absolute() { return None; }
    let mut data = Vec::new();
    fs::File::open(path).ok()?.take(16_385).read_to_end(&mut data).ok()?;
    if data.len() > 16_384 { return None; }
    let manifest: Manifest = serde_json::from_slice(&data).ok()?;
    (manifest.name == HOST_NAME && manifest.kind == "stdio" && manifest.path.is_absolute() && manifest.path.is_file()).then_some(manifest)
}

fn chromium_caller(origin: &str) -> bool {
    let Some(id) = origin.strip_prefix("chrome-extension://") else { return false };
    let id = id.strip_suffix('/').unwrap_or(id);
    Some(id) == production_chromium_id() || (cfg!(debug_assertions) && is_test_chromium_id(id))
}

// Chrome supplies an origin from its origin allowlist. Firefox supplies both the
// registration path and stable add-on ID; verify the registration and binary too.
pub fn caller_is_gecko(args: &[OsString]) -> Option<bool> {
    let first = args.first()?;
    if first.to_str().is_some_and(chromium_caller) {
        return Some(false);
    }
    if args.len() != 2 || args[1] != GECKO_ID { return None; }
    let manifest = read_manifest(Path::new(first))?;
    if manifest.allowed_extensions.as_slice() != [GECKO_ID] || !manifest.allowed_origins.is_empty() { return None; }
    let exe = std::env::current_exe().ok()?;
    let target = manifest.path.canonicalize().ok()?;
    #[cfg(debug_assertions)]
    if std::env::var_os("FOCUS_DATA_DIR").is_some() {
        if let Some(wrapper) = std::env::var_os("FOCUS_FIXTURE_HOST_WRAPPER") {
            if Path::new(&wrapper).is_absolute() && Path::new(&wrapper).canonicalize().ok().as_ref() == Some(&target) { return Some(true); }
        }
    }
    (exe.canonicalize().ok().as_ref() == Some(&target)).then_some(true)
}

pub fn manifest_for(browser: Browser, host: &Path) -> Option<Vec<u8>> {
    let mut manifest = serde_json::json!({
        "name": HOST_NAME, "description": "focus. local bridge", "type": "stdio", "path": host,
    });
    if browser.is_gecko() {
        manifest["allowed_extensions"] = serde_json::json!([GECKO_ID]);
    } else {
        manifest["allowed_origins"] = serde_json::json!([format!("chrome-extension://{}/", production_chromium_id()?)]);
    }
    serde_json::to_vec_pretty(&manifest).ok()
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
fn registration_home() -> Option<PathBuf> {
    #[cfg(debug_assertions)]
    if let Some(data) = std::env::var_os("FOCUS_DATA_DIR") {
        let home = std::env::var_os("FOCUS_REGISTRATION_HOME").map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from(data).join("registration-home"));
        return home.is_absolute().then_some(home);
    }
    dirs::home_dir()
}

pub fn registration_path(browser: Browser) -> Option<PathBuf> {
    #[cfg(target_os = "macos")]
    let dir = registration_home()?.join("Library/Application Support").join(match browser {
        Browser::Chrome => "Google/Chrome/NativeMessagingHosts",
        Browser::Chromium => "Chromium/NativeMessagingHosts",
        Browser::Brave => "BraveSoftware/Brave-Browser/NativeMessagingHosts",
        Browser::Firefox | Browser::Zen => "Mozilla/NativeMessagingHosts",
    });
    #[cfg(target_os = "linux")]
    let dir = {
        let home = registration_home()?;
        let config = if cfg!(debug_assertions) && std::env::var_os("FOCUS_DATA_DIR").is_some() {
            home.join(".config")
        } else {
            dirs::config_dir()?
        };
        match browser {
            Browser::Chrome => config.join("google-chrome/NativeMessagingHosts"),
            Browser::Chromium => config.join("chromium/NativeMessagingHosts"),
            Browser::Brave => config.join("BraveSoftware/Brave-Browser/NativeMessagingHosts"),
            Browser::Firefox | Browser::Zen => home.join(".mozilla/native-messaging-hosts"),
        }
    };
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    { Some(dir.join(FILENAME)) }
    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    { let _ = browser; None }
}
