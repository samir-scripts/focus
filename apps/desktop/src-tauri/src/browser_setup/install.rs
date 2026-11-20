use super::{bridge_registration::BridgeRegistration, discovery::{self, Source, Target}, release, setup_files as files, types::ManagedClaim, Capability, Outcome, Row, SetupError};
use focus_core::registration;
use std::{path::{Path, PathBuf}, process::{Command, Stdio}, time::Duration};

pub fn sandboxed(target: &Target) -> bool {
    #[cfg(target_os = "linux")]
    return matches!(target.source, Source::Snap | Source::Flatpak);
    #[cfg(not(target_os = "linux"))]
    { let _ = target; false }
}

pub fn portal_available() -> bool {
    #[cfg(target_os = "linux")]
    return Command::new("/usr/bin/gdbus").args([
        "call", "--session", "--timeout", "3", "--dest", "org.freedesktop.portal.Desktop",
        "--object-path", "/org/freedesktop/portal/desktop", "--method", "org.freedesktop.DBus.Properties.Get",
        "org.freedesktop.portal.WebExtensions", "version",
    ]).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).status().is_ok_and(|status| status.success());
    #[cfg(not(target_os = "linux"))]
    false
}

fn native(target: &Target) -> bool { matches!(target.source, Source::Bundle | Source::Native) }

fn shares_install_scope(target: &Target, targets: &[Target]) -> bool {
    targets.iter().any(|other| other.id != target.id && other.browser == target.browser && native(other)
        && (!target.browser.is_gecko() || target.source == Source::Bundle || target.policy == other.policy))
}

fn debug_fixture() -> bool { cfg!(debug_assertions) && std::env::var_os("FOCUS_DATA_DIR").is_some() }

fn bridge_path() -> Result<PathBuf, SetupError> {
    let app = std::env::current_exe()?.canonicalize()?;
    let sibling = app.with_file_name("focus-native-host");
    #[cfg(target_os = "linux")]
    if sibling != Path::new("/usr/bin/focus-native-host") || !files::protected_executable(&sibling) {
        return Err(SetupError::MissingBridge);
    }
    if discovery::executable(&sibling) && sibling.symlink_metadata().is_ok_and(|meta| meta.is_file()) {
        return Ok(sibling);
    }
    Err(SetupError::MissingBridge)
}

fn registration_path(target: &Target) -> Result<PathBuf, SetupError> {
    registration::registration_path(target.browser).map(files::user_path).ok_or(SetupError::MissingBridge)
}

fn registration(target: &Target) -> Result<(PathBuf, Vec<u8>), SetupError> {
    let path = registration_path(target)?;
    let manifest = registration::manifest_for(target.browser, &bridge_path()?).ok_or(SetupError::InvalidArtifact)?;
    Ok((path, manifest))
}

pub fn orphaned_rows(targets: &[Target]) -> Vec<Row> {
    let Ok(path) = managed_registration_path() else { return Vec::new() };
    let Ok(claims) = BridgeRegistration::managed_claims(&path) else { return Vec::new() };
    claims.filter(|(id, claim)| discovery::valid_id(id) && claim.browser.is_gecko()
        && !targets.iter().any(|target| target.id == *id)).map(|(id, claim)| Row {
        id, browser: claim.browser, label: claim.label,
        source: if cfg!(target_os = "macos") { Source::Bundle } else { Source::Native },
        capability: Capability::ManagedOrphan,
    }).collect()
}

fn managed_registration_path() -> Result<PathBuf, SetupError> {
    registration::registration_path(focus_core::model::Browser::Firefox)
        .map(files::user_path).ok_or(SetupError::MissingBridge)
}

pub fn remove_claim(id: &str) -> Result<Option<Outcome>, SetupError> {
    if debug_fixture() { return Err(SetupError::Unsupported); }
    let path = managed_registration_path()?;
    let Some((_, claim)) = BridgeRegistration::managed_claims(&path)?.find(|(key, _)| key == id) else { return Ok(None) };
    if !claim.browser.is_gecko() { return Err(SetupError::Conflict); }
    let route = Managed::for_claim(&claim)?;
    finish_removal(&path, id, || {
        if route.managed()? { route.apply(false) } else { Ok(Some(false)) }
    }).map(Some)
}

pub fn capability(target: &Target, targets: &[Target], portal: bool) -> Capability {
    if !native(target) {
        return if sandboxed(target) && !portal { Capability::MissingPortal } else { Capability::UnverifiedChannel };
    }
    if target.browser.is_gecko() {
        let result = (|| {
            let route = Managed::for_target(target)?;
            route.preflight(false)?;
            let owned = BridgeRegistration::owned(&registration_path(target)?, &target.id)?;
            if route.managed()? {
                return Ok(if owned { Capability::ManagedPending } else { Capability::SharedTarget });
            }
            if owned { return Ok(Capability::ManagedCleanup); }
            if shares_install_scope(target, targets) { return Ok(Capability::SharedTarget); }
            release::gecko_release()?;
            route.preflight(true)?;
            if !trusted_launcher(target) { return Err(SetupError::Unsupported); }
            bridge_path()?;
            Ok(Capability::Managed)
        })();
        return result.unwrap_or_else(problem);
    }
    if shares_install_scope(target, targets) { return Capability::SharedTarget; }
    match release::chromium_release().and_then(|_| bridge_path()) {
        Ok(_) if trusted_launcher(target) => Capability::Store,
        Ok(_) => Capability::UnverifiedChannel,
        Err(error) => problem(error),
    }
}

fn problem(error: SetupError) -> Capability {
    match error {
        SetupError::MissingArtifact => Capability::MissingArtifact,
        SetupError::InvalidArtifact => Capability::InvalidArtifact,
        SetupError::MissingBridge => Capability::MissingBridge,
        #[cfg(target_os = "linux")]
        SetupError::MissingAuthorization => Capability::MissingAuthorization,
        SetupError::ManagedElsewhere => Capability::ManagedElsewhere,
        SetupError::Conflict => Capability::ConflictingSetup,
        _ => Capability::UnverifiedChannel,
    }
}

pub fn change(target: &Target, targets: &[Target], remove: bool) -> Result<Outcome, SetupError> {
    if !native(target) || shares_install_scope(target, targets) || debug_fixture() { return Err(SetupError::Unsupported); }
    if !target.browser.is_gecko() {
        if remove { return Err(SetupError::Unsupported); }
        let url = release::chromium_release()?;
        if !trusted_launcher(target) { return Err(SetupError::Unsupported); }
        let (path, manifest) = registration(target)?;
        return BridgeRegistration::open(&path, &manifest)?.during(&target.id, None, || {
            launch(target, Some(&url))?;
            Ok(Outcome::StoreOpened)
        });
    }
    let route = Managed::for_target(target)?;
    if remove {
        let path = registration_path(target)?;
        return finish_removal(&path, &target.id, || {
            route.preflight(false)?;
            if route.managed()? { route.apply(false) } else { Ok(Some(false)) }
        });
    }
    release::gecko_release()?;
    if !trusted_launcher(target) { return Err(SetupError::Unsupported); }
    if route.managed()? && !BridgeRegistration::owned(&registration_path(target)?, &target.id)? {
        return Err(SetupError::Conflict);
    }
    route.preflight(true)?;
    let (path, manifest) = registration(target)?;
    let claim = ManagedClaim { browser: target.browser, label: target.label.clone(), slot: route.key().into() };
    BridgeRegistration::open(&path, &manifest)?.during(&target.id, Some(claim), || {
        let Some(changed) = route.apply(true)? else { return Ok(Outcome::Cancelled) };
        if let Err(error) = launch(target, Some("about:addons")) {
            if changed && !matches!(route.apply(false), Ok(Some(_))) { return Err(SetupError::RollbackFailed); }
            return Err(error);
        }
        Ok(Outcome::SignedPending)
    })
}

fn finish_removal(
    path: &Path, id: &str, remove_policy: impl FnOnce() -> Result<Option<bool>, SetupError>,
) -> Result<Outcome, SetupError> {
    if remove_policy()?.is_none() { return Ok(Outcome::Cancelled); }
    BridgeRegistration::finish_cleanup(path, id).map_err(|_| SetupError::RollbackFailed)?;
    Ok(Outcome::PolicyRemoved)
}

enum Managed {
    #[cfg(target_os = "linux")]
    Linux(super::linux_policy::Slot),
    #[cfg(target_os = "macos")]
    Mac { domain: &'static str, stage: PathBuf, bundle_policy: Option<PathBuf> },
}

impl Managed {
    fn key(&self) -> &'static str {
        match self {
            #[cfg(target_os = "linux")]
            Self::Linux(slot) => slot.key(),
            #[cfg(target_os = "macos")]
            Self::Mac { domain, .. } => domain,
        }
    }

    #[cfg(target_os = "macos")]
    fn mac_root(domain: &'static str, bundle_policy: Option<PathBuf>) -> Result<Self, SetupError> {
        let stage = files::user_path(focus_core::model::data_path()?).parent().ok_or(SetupError::Conflict)?
            .join("browser-policy").join(domain);
        Ok(Self::Mac { domain, stage, bundle_policy })
    }

    fn for_claim(claim: &ManagedClaim) -> Result<Self, SetupError> {
        #[cfg(target_os = "linux")]
        {
            let prefix = if claim.browser == focus_core::model::Browser::Firefox { "firefox" } else { "zen" };
            if !claim.slot.starts_with(prefix) { return Err(SetupError::Conflict); }
            return super::linux_policy::Slot::for_key(&claim.slot).map(Self::Linux).ok_or(SetupError::Conflict);
        }
        #[cfg(target_os = "macos")]
        return match (claim.browser, claim.slot.as_str()) {
            (focus_core::model::Browser::Firefox, "org.mozilla.firefox") => Self::mac_root("org.mozilla.firefox", None),
            (focus_core::model::Browser::Zen, "app.zen-browser.zen") => Self::mac_root("app.zen-browser.zen", None),
            _ => Err(SetupError::Conflict),
        };
    }

    fn for_target(target: &Target) -> Result<Self, SetupError> {
        #[cfg(target_os = "linux")]
        return target.policy.as_deref().and_then(super::linux_policy::Slot::for_path).map(Self::Linux).ok_or(SetupError::Unsupported);
        #[cfg(target_os = "macos")]
        {
            if target.source != Source::Bundle { return Err(SetupError::Unsupported); }
            let domain = match target.browser {
                focus_core::model::Browser::Firefox => "org.mozilla.firefox",
                focus_core::model::Browser::Zen => "app.zen-browser.zen",
                _ => return Err(SetupError::Unsupported),
            };
            return Self::mac_root(domain, Some(target.launcher.join("Contents/Resources/distribution/policies.json")));
        }
        #[cfg(not(any(target_os = "macos", target_os = "linux")))]
        { let _ = target; Err(SetupError::Unsupported) }
    }

    fn preflight(&self, installation: bool) -> Result<(), SetupError> {
        match self {
            #[cfg(target_os = "linux")]
            Self::Linux(slot) => {
                if installation && slot.has_alternate_policy() { return Err(SetupError::Conflict); }
                if installation && !slot.authorized(true) { return Err(SetupError::MissingAuthorization); }
                Ok(())
            }
            #[cfg(target_os = "macos")]
            Self::Mac { bundle_policy, .. } => {
                if installation {
                    let path = bundle_policy.as_deref().ok_or(SetupError::TargetChanged)?;
                    if super::policy::conflicting_bundle_policy(path)? { return Err(SetupError::Conflict); }
                }
                Ok(())
            }
        }
    }

    fn managed(&self) -> Result<bool, SetupError> {
        match self {
            #[cfg(target_os = "linux")]
            Self::Linux(slot) => slot.managed(),
            #[cfg(target_os = "macos")]
            Self::Mac { domain, stage, .. } => super::policy::Policy::mac(domain, stage).managed(),
        }
    }

    fn apply(&self, install: bool) -> Result<Option<bool>, SetupError> {
        match self {
            #[cfg(target_os = "linux")]
            Self::Linux(slot) => slot.apply(install),
            #[cfg(target_os = "macos")]
            Self::Mac { domain, stage, .. } => {
                let policy = super::policy::Policy::mac(domain, stage);
                if install { policy.install(release::gecko_release()?).map(Some) } else { policy.remove().map(Some) }
            }
        }
    }
}

#[cfg(target_os = "macos")]
fn trusted_launcher(target: &Target) -> bool {
    use focus_core::model::Browser::*;
    let (id, team) = match target.browser {
        Chrome => ("com.google.Chrome", "EQHXZ8M8AV"),
        Chromium => ("org.chromium.Chromium", "EQHXZ8M8AV"),
        Brave => ("com.brave.Browser", "KL8N8XSYF4"),
        Firefox => ("org.mozilla.firefox", "43AQ936H96"),
        Zen => ("app.zen-browser.zen", "9V5K9TP787"),
    };
    let requirement = format!("=identifier \"{id}\" and anchor apple generic and certificate leaf[subject.OU] = \"{team}\"");
    Command::new("/usr/bin/codesign").args(["--verify", "-R", &requirement]).arg(&target.launcher)
        .stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).status().is_ok_and(|status| status.success())
}

#[cfg(not(target_os = "macos"))]
fn trusted_launcher(target: &Target) -> bool {
    #[cfg(target_os = "linux")]
    return files::protected_executable(&target.launcher);
    #[cfg(not(target_os = "linux"))]
    { let _ = target; false }
}

fn launch(target: &Target, url: Option<&str>) -> Result<(), SetupError> {
    #[cfg(target_os = "macos")]
    if target.source == Source::Bundle {
        let result = Command::new("/usr/bin/open").arg("-a").arg(&target.launcher).args(url)
            .stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).status();
        return if result.is_ok_and(|status| status.success()) { Ok(()) } else { Err(SetupError::LaunchFailed) };
    }
    launch_direct(&target.launcher, url)
}

fn launch_direct(path: &Path, url: Option<&str>) -> Result<(), SetupError> {
    if !discovery::executable(path) { return Err(SetupError::LaunchFailed); }
    let mut child = Command::new(path).args(url).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null())
        .spawn().map_err(|_| SetupError::LaunchFailed)?;
    // CLI forwarding often exits immediately. A running GUI must not block the command.
    let end = std::time::Instant::now() + Duration::from_millis(350);
    loop {
        if let Some(status) = child.try_wait().map_err(|_| SetupError::LaunchFailed)? {
            return if status.success() { Ok(()) } else { Err(SetupError::LaunchFailed) };
        }
        if std::time::Instant::now() >= end { break; }
        std::thread::sleep(Duration::from_millis(15));
    }
    std::thread::spawn(move || { let _ = child.wait(); });
    Ok(())
}

#[cfg(test)]
#[path = "install_tests.rs"]
mod tests;
