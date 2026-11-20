use super::{policy::Policy, release, setup_files as files, types::SetupError};
use std::{os::unix::fs::MetadataExt, path::{Path, PathBuf}, process::{Command, Stdio}};

const HELPER: &str = "/usr/libexec/focus-browser-policy";
const PKEXEC: &str = "/usr/bin/pkexec";
const SLOTS: &[(&str, &str)] = &[
    ("firefox", "/usr/lib/firefox/firefox"),
    ("firefox-lib64", "/usr/lib64/firefox/firefox"),
    ("firefox-esr", "/usr/lib/firefox-esr/firefox-esr"),
    ("firefox-esr-alt", "/usr/lib/firefox-esr/firefox"),
    ("zen", "/opt/zen-browser/zen"),
    ("zen-opt", "/opt/zen/zen"),
];

#[derive(Clone, Copy)]
pub struct Slot { key: &'static str, binary: &'static str }

fn policy_path(binary: &str) -> PathBuf {
    Path::new(binary).parent().unwrap().join("distribution/policies.json")
}

impl Slot {
    pub fn for_path(path: &Path) -> Option<Self> {
        SLOTS.iter().find(|(_, binary)| policy_path(binary) == path && files::protected_executable(Path::new(binary)))
            .map(|&(key, binary)| Self { key, binary })
    }

    pub fn for_key(key: &str) -> Option<Self> {
        SLOTS.iter().find(|(name, _)| *name == key).map(|&(key, binary)| Self { key, binary })
    }

    pub fn key(self) -> &'static str { self.key }

    pub fn authorized(self, installation: bool) -> bool {
        files::protected_executable(Path::new(HELPER))
            && files::protected_executable(Path::new(PKEXEC))
            && Path::new(PKEXEC).metadata().is_ok_and(|m| m.mode() & 0o4000 != 0)
            && (!installation || files::protected_executable(Path::new(self.binary)))
    }

    pub fn has_alternate_policy(self) -> bool {
        let other = if self.key.starts_with("firefox") { "/etc/firefox/policies/policies.json" }
            else { "/etc/zen/policies/policies.json" };
        match std::fs::symlink_metadata(other) {
            Err(error) => error.kind() != std::io::ErrorKind::NotFound,
            Ok(_) => true,
        }
    }

    pub fn managed(self) -> Result<bool, SetupError> {
        Policy::root_json(&policy_path(self.binary), files::current_uid()).managed()
    }

    // `None` means the system cancelled authorization before invoking the helper.
    pub fn apply(self, install: bool) -> Result<Option<bool>, SetupError> {
        if !self.authorized(install) { return Err(SetupError::MissingAuthorization); }
        let output = Command::new(PKEXEC).arg("--disable-internal-agent").args([HELPER, if install { "install" } else { "remove" }, self.key])
            .stdin(Stdio::null()).stderr(Stdio::null()).output().map_err(|_| SetupError::MissingAuthorization)?;
        match (output.status.code(), output.stdout.as_slice()) {
            (Some(126), _) => Ok(None),
            (Some(127), _) => Err(SetupError::MissingAuthorization),
            (Some(0), b"changed\n") => Ok(Some(true)),
            (Some(0), b"unchanged\n") => Ok(Some(false)),
            (Some(2), _) => Err(SetupError::Conflict),
            (Some(3), _) => Err(SetupError::RollbackFailed),
            (Some(4), _) => Err(SetupError::ManagedElsewhere),
            _ => Err(SetupError::Io),
        }
    }
}

pub fn helper(operation: &str, key: &str) -> Result<bool, SetupError> {
    let slot = Slot::for_key(key).ok_or(SetupError::Unsupported)?;
    // Never elevate a desktop/debug binary, nor trust any caller-supplied path or artifact.
    if files::current_uid() != 0 || std::env::current_exe().as_deref().ok() != Some(Path::new(HELPER))
        || !files::protected_executable(Path::new(HELPER))
        || (operation == "install" && !files::protected_executable(Path::new(slot.binary)))
    {
        return Err(SetupError::MissingAuthorization);
    }
    let path = policy_path(slot.binary);
    let root = path.parent().and_then(Path::parent).ok_or(SetupError::Conflict)?;
    files::protected_directory(root)?;
    // When distribution exists, reject symlinked or non-root-writable directories before any mutation.
    let distribution = path.parent().ok_or(SetupError::Conflict)?;
    match std::fs::symlink_metadata(distribution) {
        Ok(_) => files::protected_directory(distribution)?,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => (),
        Err(e) => return Err(e.into()),
    }
    let controller = std::env::var("PKEXEC_UID").ok().and_then(|uid| uid.parse::<u32>().ok())
        .ok_or(SetupError::MissingAuthorization)?;
    let policy = Policy::root_json(&path, controller);
    match operation {
        "install" if !slot.has_alternate_policy() => policy.install(release::gecko_release()?),
        "install" => Err(SetupError::Conflict),
        "remove" => policy.remove(),
        _ => Err(SetupError::Unsupported),
    }
}
