mod discovery;
mod types;
#[cfg(unix)]
mod bridge_registration;
#[cfg(unix)]
mod install;
#[cfg(target_os = "linux")]
mod linux_policy;
#[cfg(unix)]
mod policy;
#[cfg(unix)]
mod release;
#[cfg(unix)]
mod setup_files;

use focus_core::model::Browser;
use serde::Serialize;
use discovery::{Source, Target};
pub use types::{Outcome, SetupError};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Scan { supported: bool, targets: Vec<Row> }

#[derive(Serialize)]
struct Row { id: String, browser: Browser, source: Source, label: String, capability: Capability }

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
enum Capability {
    Store, Managed, ManagedPending, ManagedCleanup, ManagedOrphan, MissingArtifact, InvalidArtifact, MissingBridge,
    #[cfg(target_os = "linux")]
    MissingAuthorization,
    ManagedElsewhere, SharedTarget, ConflictingSetup, MissingPortal, UnverifiedChannel,
}

pub fn scan() -> Scan {
    let targets = discovery::scan();
    #[cfg(unix)]
    let portal = targets.iter().any(install::sandboxed) && install::portal_available();
    let rows: Vec<Row> = targets.iter().map(|target: &Target| Row {
        #[cfg(unix)]
        capability: install::capability(target, &targets, portal),
        #[cfg(not(unix))]
        capability: Capability::UnverifiedChannel,
        id: target.id.clone(), browser: target.browser, source: target.source, label: target.label.clone(),
    }).collect();
    #[cfg(unix)]
    let rows = rows.into_iter().chain(install::orphaned_rows(&targets)).collect();
    Scan { supported: discovery::SUPPORTED, targets: rows }
}

pub fn change(id: &str, remove: bool) -> Result<Outcome, SetupError> {
    if !discovery::SUPPORTED { return Err(SetupError::Unsupported); }
    static CHANGE_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
    let _change = CHANGE_LOCK.try_lock().map_err(|_| SetupError::Busy)?;
    if !discovery::valid_id(id) { return Err(SetupError::TargetChanged); }
    #[cfg(unix)]
    if remove {
        if let Some(outcome) = install::remove_claim(id)? { return Ok(outcome); }
    }
    let targets = discovery::scan();
    let target = discovery::selected(&targets, id).ok_or(SetupError::TargetChanged)?;
    #[cfg(unix)]
    return install::change(target, &targets, remove);
    #[cfg(not(unix))]
    { let _ = (target, remove); Err(SetupError::Unsupported) }
}
