use serde::{Deserialize, Serialize};
use std::{io, path::PathBuf, sync::LazyLock, time::{SystemTime, UNIX_EPOCH}};

pub const DESKTOP_ID: &str = "com.focus-local.desktop";
pub const HOST_NAME: &str = "com.focus_local.bridge";
pub const GECKO_ID: &str = "focus@focus-local";
pub const YOUTUBE: &str = "youtube";
pub const HIDE_SHORTS: &str = "youtube.hide-shorts";
pub const POLL_SECONDS: u64 = 2;
pub const LEASE_SECONDS: u64 = 9;
pub const PAIR_SECONDS: u64 = 120;

#[derive(Deserialize)]
pub struct Site<'a> {
    pub id: &'a str,
    pub label: &'a str,
    pub hosts: Vec<&'a str>,
}

pub static SITES: LazyLock<Vec<Site<'static>>> = LazyLock::new(|| {
    serde_json::from_str(include_str!("../../../../../extension/src/sites/catalog.json"))
        .expect("bundled site catalog")
});

pub fn data_path() -> io::Result<PathBuf> {
    #[cfg(debug_assertions)]
    if let Some(path) = std::env::var_os("FOCUS_DATA_DIR") {
        let path = PathBuf::from(path);
        if !path.is_absolute() {
            return Err(io::Error::new(io::ErrorKind::InvalidInput, "Absolute data directory required"));
        }
        return Ok(path.join("focus.sqlite3"));
    }
    let base = dirs::data_dir().ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "No app data directory"))?;
    Ok(base.join(DESKTOP_ID).join("focus.sqlite3"))
}

pub fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs()
}

pub fn origin_host(origin: &str) -> Option<&str> {
    origin.strip_prefix("https://").or_else(|| origin.strip_prefix("http://"))?.strip_suffix("/*")
}

pub fn valid_origin(origin: &str) -> bool {
    origin_host(origin).is_some_and(|host| SITES.iter().any(|site| site.hosts.contains(&host)))
}

#[derive(Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Browser { Chrome, Chromium, Brave, Firefox, Zen }

impl Browser {
    pub const ALL: [Self; 5] = [Self::Chrome, Self::Chromium, Self::Brave, Self::Firefox, Self::Zen];

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Chrome => "chrome", Self::Chromium => "chromium", Self::Brave => "brave",
            Self::Firefox => "firefox", Self::Zen => "zen",
        }
    }

    pub fn is_gecko(self) -> bool { matches!(self, Self::Firefox | Self::Zen) }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopState {
    pub revision: u64,
    pub hide_shorts: bool,
    pub pending: Vec<PairLabel>,
    pub profiles: Vec<ProfileStatus>,
}

#[derive(Serialize)]
pub struct PairLabel { pub id: String, pub label: String, pub browser: String }

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileStatus {
    pub id: String,
    pub label: String,
    pub browser: String,
    pub online: bool,
    pub ack_revision: Option<u64>,
    pub origins: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenIntent { pub site_id: Option<String> }
