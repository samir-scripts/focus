use focus_core::model::Browser;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
#[cfg(unix)]
use std::{fs, io::Read, os::unix::fs::PermissionsExt};
#[cfg(any(target_os = "linux", all(test, unix)))]
use std::ffi::OsStr;

pub const SUPPORTED: bool = cfg!(any(target_os = "macos", target_os = "linux"));

#[derive(Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Source {
    Bundle,
    Native,
    #[cfg(target_os = "linux")]
    Snap,
    #[cfg(target_os = "linux")]
    Flatpak,
    #[cfg(target_os = "linux")]
    Standalone,
}

pub struct Target {
    pub id: String,
    pub browser: Browser,
    pub source: Source,
    pub label: String,
    pub launcher: PathBuf,
    pub policy: Option<PathBuf>,
}

impl Target {
    fn new(browser: Browser, source: Source, label: &str, launcher: PathBuf, policy: Option<PathBuf>) -> Self {
        let mut hash = Sha256::new();
        // Stable across rescans, but not accepted without discovering the same installation again.
        hash.update([source as u8]);
        hash.update(browser.as_str());
        hash.update([0]);
        hash.update(launcher.as_os_str().as_encoded_bytes());
        hash.update([0]);
        if source != Source::Bundle {
            hash.update(label);
        }
        Self { id: format!("{:x}", hash.finalize()), browser, source, label: label.into(), launcher, policy }
    }

    #[cfg(any(target_os = "linux", all(test, unix)))]
    fn direct(browser: Browser, source: Source, label: &str, launcher: &Path, policy: Option<PathBuf>) -> Option<Self> {
        let launcher = launcher.canonicalize().ok()?;
        executable(&launcher).then(|| Self::new(browser, source, label, launcher, policy))
    }
}

pub fn valid_id(id: &str) -> bool {
    id.len() == 64 && id.bytes().all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
}

pub fn selected<'a>(targets: &'a [Target], id: &str) -> Option<&'a Target> {
    targets.iter().find(|target| target.id == id)
}

fn distinct(mut targets: Vec<Target>) -> Vec<Target> {
    targets.sort_by(|a, b| (a.browser.as_str(), a.source as u8, &a.label, &a.launcher)
        .cmp(&(b.browser.as_str(), b.source as u8, &b.label, &b.launcher)));
    targets.dedup_by(|a, b| a.id == b.id);
    targets
}

pub fn scan() -> Vec<Target> {
    distinct(platform_scan())
}

#[cfg(unix)]
pub fn executable(path: &Path) -> bool {
    path.is_absolute() && path.metadata().is_ok_and(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
}

#[cfg(any(target_os = "macos", all(test, unix)))]
fn verified_bundle(browser: Browser, id: &str, bundle: &Path) -> Option<Target> {
    let bundle = bundle.canonicalize().ok()?;
    if bundle.extension()? != "app" || !bundle.is_dir() {
        return None;
    }
    let contents = bundle.join("Contents");
    let info = plist::Value::from_reader(std::io::Cursor::new(read(&contents.join("Info.plist"))?)).ok()?;
    if info.as_dictionary()?.get("CFBundleIdentifier")?.as_string()? != id {
        return None;
    }
    let executable_name = info.as_dictionary()?.get("CFBundleExecutable")?.as_string()?;
    if !matches!(Path::new(executable_name).components().collect::<Vec<_>>().as_slice(), [std::path::Component::Normal(_)]) {
        return None;
    }
    let binary = contents.join("MacOS").join(executable_name).canonicalize().ok()?;
    if !binary.starts_with(&contents) || !executable(&binary) {
        return None;
    }
    let policy = None; // macOS uses the verified bundle's preference domain, not its signed contents.
    let label = bundle.to_str()?.to_owned();
    Some(Target::new(browser, Source::Bundle, &label, bundle, policy))
}

#[cfg(target_os = "macos")]
fn platform_scan() -> Vec<Target> {
    use objc2::{sel, runtime::NSObjectProtocol};
    use objc2_app_kit::NSWorkspace;
    use objc2_foundation::NSString;
    objc2::rc::autoreleasepool(|_| {
        let workspace = NSWorkspace::sharedWorkspace();
        let mut targets = Vec::new();
        // Query exact vendor application identities, not Spotlight names or running processes.
        for (browser, id) in [
            (Browser::Chrome, "com.google.Chrome"),
            (Browser::Chromium, "org.chromium.Chromium"),
            (Browser::Brave, "com.brave.Browser"),
            (Browser::Firefox, "org.mozilla.firefox"),
            (Browser::Zen, "app.zen-browser.zen"),
        ] {
            let id_string = NSString::from_str(id);
            let mut add = |app: &objc2_foundation::NSURL| {
                if let Some(path) = app.path() {
                    targets.extend(verified_bundle(browser, id, Path::new(&path.to_string())));
                }
            };
            if workspace.respondsToSelector(sel!(URLsForApplicationsWithBundleIdentifier:)) {
                let apps = workspace.URLsForApplicationsWithBundleIdentifier(&id_string);
                for index in 0..apps.count() { add(&apps.objectAtIndex(index)); }
            } else if let Some(app) = workspace.URLForApplicationWithBundleIdentifier(&id_string) {
                add(&app);
            }
        }
        targets
    })
}

#[cfg(not(any(target_os = "macos", target_os = "linux")))]
fn platform_scan() -> Vec<Target> { Vec::new() }

#[cfg(unix)]
fn read(path: &Path) -> Option<Vec<u8>> {
    if !path.metadata().ok()?.is_file() {
        return None;
    }
    let mut bytes = Vec::new();
    fs::File::open(path).ok()?.take(262_145).read_to_end(&mut bytes).ok()?;
    (bytes.len() <= 262_144).then_some(bytes)
}

#[cfg(any(target_os = "linux", all(test, unix)))]
fn desktop_exec(entry: &Path) -> Option<(String, Vec<String>)> {
    let data = String::from_utf8(read(entry)?).ok()?;
    let mut lines = data.lines().map(str::trim).skip_while(|line| *line != "[Desktop Entry]");
    lines.next()?;
    let lines: Vec<_> = lines.take_while(|line| !line.starts_with('[')).collect();
    if !lines.contains(&"Type=Application") || lines.contains(&"Hidden=true") {
        return None;
    }
    let exec = lines.iter().find_map(|line| line.strip_prefix("Exec="))?.trim();
    let (program, rest) = if let Some(quoted) = exec.strip_prefix('"') {
        quoted.split_once('"')?
    } else {
        exec.split_once(char::is_whitespace).unwrap_or((exec, ""))
    };
    if program.is_empty() || program.contains(['\\', '"', '%']) {
        return None;
    }
    Some((program.into(), rest.split_whitespace().map(str::to_owned).collect()))
}

#[cfg(any(target_os = "linux", all(test, unix)))]
fn native_target(
    browser: Browser, package: &str, files: &[PathBuf], entries: &[&Path], launchers: &[&Path], policy_binaries: &[&Path],
) -> Option<Target> {
    let desktop = entries.iter().filter(|entry| files.iter().any(|file| file == **entry)).filter_map(|entry| desktop_exec(entry));
    for (program, args) in desktop {
        if !args.iter().all(|arg| matches!(arg.as_str(), "%u" | "%U" | "%f" | "%F")) {
            continue;
        }
        for &exe in launchers {
            if (exe.as_os_str() != OsStr::new(&program) && exe.file_name() != Some(OsStr::new(&program)))
                || !files.iter().any(|file| file == exe)
            {
                continue;
            }
            let Some(canonical) = exe.canonicalize().ok() else { continue };
            // Reject aliases that exit the package, including distribution transitions to Snap.
            if !files.iter().any(|file| *file == canonical) {
                continue;
            }
            let policy = policy_binaries.iter().find(|binary| files.iter().any(|file| file == **binary)
                && executable(binary) && binary.canonicalize().as_deref().ok() == Some(**binary))
                .and_then(|binary| binary.parent()).map(|dir| dir.join("distribution/policies.json"));
            if let Some(target) = Target::direct(browser, Source::Native, package, exe, policy) {
                return Some(target);
            }
        }
    }
    None
}

#[cfg(target_os = "linux")]
fn platform_scan() -> Vec<Target> {
    let mut targets = Vec::new();
    for (browser, package, desktop, launchers, policy) in [
        (Browser::Chrome, "google-chrome-stable", "google-chrome.desktop", &["/usr/bin/google-chrome-stable", "/usr/bin/google-chrome", "/opt/google/chrome/google-chrome"][..], &[][..]),
        (Browser::Chromium, "chromium", "chromium.desktop", &["/usr/bin/chromium"], &[]),
        (Browser::Chromium, "chromium-browser", "chromium-browser.desktop", &["/usr/bin/chromium-browser"], &[]),
        (Browser::Brave, "brave-browser", "brave-browser.desktop", &["/usr/bin/brave-browser", "/usr/bin/brave-browser-stable", "/opt/brave.com/brave/brave-browser"], &[]),
        (Browser::Firefox, "firefox", "firefox.desktop|org.mozilla.firefox.desktop", &["/usr/bin/firefox", "/usr/lib/firefox/firefox", "/usr/lib64/firefox/firefox"], &["/usr/lib/firefox/firefox", "/usr/lib64/firefox/firefox"]),
        (Browser::Firefox, "firefox-esr", "firefox-esr.desktop", &["/usr/bin/firefox-esr"], &["/usr/lib/firefox-esr/firefox-esr", "/usr/lib/firefox-esr/firefox"]),
        (Browser::Zen, "zen-browser", "zen-browser.desktop", &["/usr/bin/zen-browser", "/usr/bin/zen"], &["/opt/zen-browser/zen", "/opt/zen/zen"]),
        (Browser::Zen, "zen-browser-bin", "zen.desktop", &["/usr/bin/zen-browser", "/usr/bin/zen"], &["/opt/zen-browser/zen", "/opt/zen/zen"]),
    ] {
        let entries: Vec<_> = desktop.split('|').map(|name| Path::new("/usr/share/applications").join(name)).collect();
        let entries: Vec<_> = entries.iter().map(|entry| entry.as_path()).collect();
        let launchers: Vec<_> = launchers.iter().map(Path::new).collect();
        let policy: Vec<_> = policy.iter().map(Path::new).collect();
        for files in package_files(package) {
            let files = files.lines().map(PathBuf::from).collect::<Vec<_>>();
            // Ubuntu transition packages own a shim, not the browser binary.
            if matches!(package, "firefox" | "chromium-browser")
                && !files.iter().any(|file| matches!(file.to_str(), Some("/usr/lib/firefox/firefox" | "/usr/lib64/firefox/firefox" | "/usr/lib/chromium-browser/chromium-browser")))
            {
                continue;
            }
            targets.extend(native_target(browser, package, &files, &entries, &launchers, &policy));
        }
    }
    sandbox_targets(&mut targets);
    standalone_zen(&mut targets);
    targets
}

#[cfg(target_os = "linux")]
fn output(program: &str, args: &[&str]) -> Option<String> {
    let out = std::process::Command::new(program).args(args).env("LC_ALL", "C")
        .stdin(std::process::Stdio::null()).stderr(std::process::Stdio::null()).output().ok()?;
    out.status.success().then(|| String::from_utf8(out.stdout).ok()).flatten()
}

#[cfg(target_os = "linux")]
fn package_files(package: &str) -> impl Iterator<Item = String> {
    let deb = output("/usr/bin/dpkg-query", &["-W", "-f=${Status}", package])
        .filter(|status| status.trim() == "install ok installed")
        .and_then(|_| output("/usr/bin/dpkg-query", &["-L", package]));
    [deb, output("/usr/bin/rpm", &["-ql", package]), output("/usr/bin/pacman", &["-Qlq", package])]
        .into_iter().flatten()
}

#[cfg(target_os = "linux")]
fn sandbox_targets(targets: &mut Vec<Target>) {
    if let Some(list) = output("/usr/bin/snap", &["list"]) {
        for (browser, name) in [(Browser::Chromium, "chromium"), (Browser::Brave, "brave"), (Browser::Firefox, "firefox")] {
            if !list.lines().any(|line| line.split_whitespace().next() == Some(name)) { continue; }
            let launcher = Path::new("/snap/bin").join(name);
            let entry = Path::new("/var/lib/snapd/desktop/applications").join(format!("{name}_{name}.desktop"));
            if dispatches_to_snap(&launcher, Path::new("/usr/bin/snap"))
                && snap_exec(&entry, &launcher)
            {
                targets.push(Target::new(browser, Source::Snap, "Snap", launcher, None));
            }
        }
    }

    let flatpak = Path::new("/usr/bin/flatpak");
    if !executable(flatpak) { return; }
    for scope in ["--system", "--user"] {
        let Some(list) = output("/usr/bin/flatpak", &["list", scope, "--app", "--columns=ref"]) else { continue };
        for reference in list.lines().filter_map(flatpak_ref) {
            let id = reference.split('/').next().unwrap_or_default();
            let browser = match id {
                "com.google.Chrome" => Browser::Chrome,
                "org.chromium.Chromium" => Browser::Chromium,
                "com.brave.Browser" => Browser::Brave,
                "org.mozilla.firefox" => Browser::Firefox,
                "app.zen_browser.zen" => Browser::Zen,
                _ => continue,
            };
            let full_ref = format!("app/{reference}");
            let Some(location) = output("/usr/bin/flatpak", &["info", scope, "--show-location", &full_ref]) else { continue };
            let location = Path::new(location.trim());
            let entry = location.join("export/share/applications").join(format!("{id}.desktop"));
            if !location.is_absolute() || !desktop_exec(&entry).is_some_and(|(program, args)|
                (program == "/usr/bin/flatpak" && args.iter().any(|arg| arg == id))
                    || (program.starts_with('/') && !program.ends_with("/flatpak") && executable(&location.join("files/bin").join(program.rsplit('/').next().unwrap_or_default())))
                    || (!program.contains('/') && executable(&location.join("files/bin").join(program))))
            {
                continue;
            }
            let installation = if scope == "--user" { "User" } else { "System" };
            let label = format!("{installation} Flatpak · {reference}");
            targets.push(Target::new(browser, Source::Flatpak, &label, flatpak.into(), None));
        }
    }
}

#[cfg(target_os = "linux")]
fn standalone_zen(targets: &mut Vec<Target>) {
    let Some(apps) = dirs::data_dir().map(|dir| dir.join("applications")) else { return };
    let Ok(entries) = fs::read_dir(apps) else { return };
    for entry in entries.flatten() {
        let name = entry.file_name();
        let Some(name) = name.to_str() else { continue };
        let appimage_entry = name.starts_with("appimagekit_")
            && (name.ends_with("-Zen_Browser.desktop") || name.ends_with("-Zen.desktop"));
        if !appimage_entry && !matches!(name, "zen.desktop" | "zen-browser.desktop" | "app.zen_browser.zen.desktop") { continue; }
        let Some((program, _)) = desktop_exec(&entry.path()) else { continue };
        let exe = Path::new(&program);
        if !executable(exe) { continue; }
        let Ok(exe) = exe.canonicalize() else { continue };
        let is_image = exe.extension() == Some(OsStr::new("AppImage"))
            && fs::File::open(&exe).ok().is_some_and(|mut file| {
                let mut head = [0; 11];
                file.read_exact(&mut head).is_ok() && &head[..4] == b"\x7fELF" && &head[8..11] == b"AI\x02"
            });
        let is_tarball = exe.file_name().is_some_and(|name| name == "zen" || name == "zen-bin")
            && exe.parent().is_some_and(|dir| read(&dir.join("application.ini")).is_some_and(|ini| {
                let ini = String::from_utf8_lossy(&ini);
                ini.lines().any(|line| matches!(line.trim(), "Name=Zen" | "Name=Zen Browser"))
            }));
        if is_image || is_tarball {
            let packaging = if is_image { "AppImage" } else { "Tarball" };
            let label = format!("{packaging} · {}", exe.display());
            targets.extend(Target::direct(Browser::Zen, Source::Standalone, &label, &exe, None));
        }
    }
}

#[cfg(any(target_os = "linux", all(test, unix)))]
fn flatpak_ref(line: &str) -> Option<&str> {
    let reference = line.trim().strip_prefix("app/").unwrap_or(line.trim());
    let mut parts = reference.split('/');
    let (id, arch, branch) = (parts.next()?, parts.next()?, parts.next()?);
    (parts.next().is_none() && [id, arch, branch].iter().all(|part| {
        !part.is_empty() && part.bytes().all(|c| c.is_ascii_alphanumeric() || b"._-".contains(&c))
    })).then_some(reference)
}

#[cfg(any(target_os = "linux", all(test, unix)))]
fn dispatches_to_snap(launcher: &Path, snap: &Path) -> bool {
    let Ok(dispatcher) = snap.canonicalize() else { return false };
    executable(&dispatcher) && launcher.canonicalize().is_ok_and(|target| target == dispatcher)
}

#[cfg(any(target_os = "linux", all(test, unix)))]
fn snap_exec(entry: &Path, launcher: &Path) -> bool {
    desktop_exec(entry).is_some_and(|(program, args)| {
        if Path::new(&program) == launcher { return true; }
        if !matches!(program.as_str(), "env" | "/usr/bin/env") { return false; }
        let [hint, exe, ..] = args.as_slice() else { return false };
        hint.strip_prefix("BAMF_DESKTOP_FILE_HINT=").is_some_and(|p| Path::new(p) == entry)
            && Path::new(exe) == launcher
    })
}

#[cfg(all(test, unix))]
mod tests {
    #[test]
    fn snap_browser_alias_may_dispatch_through_the_snap_cli_symlink() {
        use std::os::unix::fs::{symlink, PermissionsExt};
        let tmp = tempfile::tempdir().unwrap();
        let daemon = tmp.path().join("snapd");
        let cli = tmp.path().join("snap");
        let browser = tmp.path().join("firefox");
        std::fs::write(&daemon, b"fixture").unwrap();
        std::fs::set_permissions(&daemon, std::fs::Permissions::from_mode(0o755)).unwrap();
        symlink(&daemon, &cli).unwrap();
        symlink(&cli, &browser).unwrap();
        assert!(super::dispatches_to_snap(&browser, &cli));
        assert!(!super::dispatches_to_snap(&browser, &tmp.path().join("missing")));
    }

    use super::*;

    #[test]
    fn flatpak_accepts_installed_ref_formats_and_rejects_non_app_refs() {
        assert_eq!(flatpak_ref("org.mozilla.firefox/x86_64/stable"), Some("org.mozilla.firefox/x86_64/stable"));
        assert_eq!(flatpak_ref("app/app.zen_browser.zen/aarch64/stable"), Some("app.zen_browser.zen/aarch64/stable"));
        assert!(flatpak_ref("runtime/org.mozilla.firefox/x86_64/stable").is_none());
    }

    #[test]
    fn snap_accepts_the_exported_entry_without_running_env() {
        let dir = tempfile::tempdir().unwrap();
        let entry = dir.path().join("firefox_firefox.desktop");
        let launcher = Path::new("/snap/bin/firefox");
        fs::write(&entry, format!("[Desktop Entry]\nType=Application\nExec=env BAMF_DESKTOP_FILE_HINT={} /snap/bin/firefox %u\n", entry.display())).unwrap();
        assert!(snap_exec(&entry, launcher));
        assert!(!snap_exec(&entry, Path::new("/snap/bin/chromium")));
    }
    use std::os::unix::fs::PermissionsExt;

    fn launcher(dir: &Path, name: &str) -> PathBuf {
        let path = dir.join(name);
        fs::write(&path, b"#!/bin/sh\nexit 0\n").unwrap();
        fs::set_permissions(&path, fs::Permissions::from_mode(0o755)).unwrap();
        path
    }

    #[test]
    fn native_requires_an_installed_package_desktop_entry_and_its_exact_launcher() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().canonicalize().unwrap();
        let exe = launcher(&root, "firefox");
        let entry = root.join("firefox.desktop");
        fs::write(&entry, format!("[Desktop Entry]\nType=Application\nExec={} %u\n[Desktop Action Private]\nExec=unrelated\n", exe.display())).unwrap();
        let files = vec![entry.clone(), exe.clone()];
        assert!(native_target(Browser::Firefox, "firefox", &files, &[&entry], &[&exe], &[]).is_some());
        assert!(native_target(Browser::Firefox, "firefox", &[entry.clone()], &[&entry], &[&exe], &[]).is_none());
        let other = launcher(dir.path(), "other");
        fs::write(&entry, format!("[Desktop Entry]\nType=Application\nExec={} %u\n", other.display())).unwrap();
        assert!(native_target(Browser::Firefox, "firefox", &files, &[&entry], &[&exe], &[]).is_none());
        fs::write(&entry, format!("[Desktop Entry]\nType=Application\nExec={} --profile /other %u\n", exe.display())).unwrap();
        assert!(native_target(Browser::Firefox, "firefox", &files, &[&entry], &[&exe], &[]).is_none());
    }

    #[test]
    fn scans_deduplicate_aliases_but_keep_installations_and_reject_unknown_ids() {
        let dir = tempfile::tempdir().unwrap();
        let exe = launcher(dir.path(), "brave");
        let alias = dir.path().join("alias");
        std::os::unix::fs::symlink(&exe, &alias).unwrap();
        let other = launcher(dir.path(), "brave-other");
        let first = Target::direct(Browser::Brave, Source::Native, "brave-browser", &exe, None).unwrap();
        let duplicate = Target::direct(Browser::Brave, Source::Native, "brave-browser", &alias, None).unwrap();
        let second = Target::direct(Browser::Brave, Source::Native, "brave-browser", &other, None).unwrap();
        let second_id = second.id.clone();
        let targets = distinct(vec![first, duplicate, second]);
        assert_eq!(targets.len(), 2);
        assert_eq!(selected(&targets, &second_id).unwrap().launcher, other.canonicalize().unwrap());
        assert!(selected(&targets, exe.to_str().unwrap()).is_none());
    }

    #[test]
    fn bundle_metadata_must_match_the_launch_services_identity_and_executable() {
        let dir = tempfile::tempdir().unwrap();
        let contents = dir.path().join("Firefox.app/Contents");
        fs::create_dir_all(contents.join("MacOS")).unwrap();
        launcher(&contents.join("MacOS"), "firefox");
        let write_info = |id: &str, exe: &str| {
            plist::to_file_xml(contents.join("Info.plist"), &plist::Value::Dictionary(
                [("CFBundleIdentifier", plist::Value::from(id)), ("CFBundleExecutable", plist::Value::from(exe))].into_iter().collect(),
            )).unwrap();
        };
        let bundle = contents.parent().unwrap();
        write_info("org.mozilla.firefox", "firefox");
        assert!(verified_bundle(Browser::Firefox, "org.mozilla.firefox", bundle).is_some());
        assert!(verified_bundle(Browser::Firefox, "org.mozilla.firefoxdeveloperedition", bundle).is_none());
        write_info("org.mozilla.firefox", "../firefox");
        assert!(verified_bundle(Browser::Firefox, "org.mozilla.firefox", bundle).is_none());
    }
}
