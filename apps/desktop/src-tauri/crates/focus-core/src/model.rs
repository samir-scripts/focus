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
    pub rules: Vec<ContentRule<'a>>,
}

#[derive(Deserialize)]
pub struct ContentRule<'a> {
    pub id: &'a str,
    #[serde(default = "first_wire_version")]
    pub since: u16,
}

fn first_wire_version() -> u16 { 1 }

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(tag = "site", rename_all = "lowercase", rename_all_fields = "camelCase", deny_unknown_fields)]
pub enum ContentRules {
    X { hide_for_you: bool, open_following: bool },
    Reddit { hide_recommendations: bool, hide_all_home: bool },
    Youtube { hide_shorts: bool, hide_home_recommendations: bool },
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

pub fn normalize_host(input: &str) -> Option<String> {
    let input = input.trim().trim_end_matches('.');
    if input.is_empty() || input.chars().any(|c| c.is_whitespace() || "/\\:?#@*%".contains(c)) { return None; }
    let url::Host::Domain(host) = url::Host::parse(input).ok()? else { return None; };
    if !host.contains('.') || host.len() > 253 || !host.split('.').all(|label| {
        !label.is_empty() && label.len() <= 63 && !label.starts_with('-') && !label.ends_with('-')
            && label.bytes().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-')
    }) { return None; }
    Some(host)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(tag = "mode", rename_all = "lowercase", deny_unknown_fields)]
pub enum EntryPolicy {
    Allow,
    Pause { seconds: u16, finish: Finish, frequency: Frequency },
    Block,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Finish { Manual, Auto }

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Frequency { Visit, Page }

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Accessibility {
    pub hold_seconds: u16,
    pub two_step_confirmation: bool,
}

#[derive(Serialize)]
pub struct SitePolicy {
    pub id: String,
    pub label: String,
    pub hosts: Vec<String>,
    pub grayscale: bool,
    pub entry: EntryPolicy,
    pub rules: std::collections::BTreeMap<String, bool>,
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
    pub accessibility: Accessibility,
    pub pending: Vec<PairLabel>,
    pub profiles: Vec<ProfileStatus>,
    pub sites: Vec<SitePolicy>,
    pub entry_available: bool,
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
    pub update_required: bool,
    pub ack_revision: Option<u64>,
    pub origins: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenIntent { pub site_id: Option<String> }
