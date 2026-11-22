use serde::Serialize;
use tauri::AppHandle;
use uuid::Uuid;

#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum Outcome {
    Started,
    Busy,
    Rejected,
    Unconfirmed,
    NotApproved,
    Missing,
    Incompatible,
    Unsupported,
}

#[tauri::command]
pub(crate) async fn start_grace(app: AppHandle) -> Outcome {
    tauri::async_runtime::spawn_blocking(move || launch(&app, Uuid::new_v4(), true))
        .await
        .unwrap_or(Outcome::Unconfirmed)
}

/// One dispatch per manual start or scheduled occurrence. Only a manual start
/// may request consent; 3E must pass its stable occurrence UUID and `false`.
pub(crate) fn launch(app: &AppHandle, request_id: Uuid, manual: bool) -> Outcome {
    #[cfg(target_os = "macos")]
    {
        macos::launch(app, request_id, manual)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, request_id, manual);
        Outcome::Unsupported
    }
}

#[cfg(target_os = "macos")]
const GRACE_ID: &str = "com.splode.pomotroid";
#[cfg(target_os = "macos")]
const VERSION: u8 = 1;

#[cfg(target_os = "macos")]
fn grace_protocol(info: &plist::Dictionary) -> Option<bool> {
    if info.get("CFBundleIdentifier")?.as_string()? != GRACE_ID
        || info.get("CFBundleName")?.as_string()? != "grace."
    {
        return None;
    }
    Some(info.get("GraceFocusLaunchProtocol").and_then(plist::Value::as_unsigned_integer) == Some(VERSION.into()))
}

#[cfg(target_os = "macos")]
fn decision(id: Uuid, reply: &[u8; 18]) -> Outcome {
    if reply[0] != VERSION {
        return Outcome::Incompatible;
    }
    if &reply[1..17] != id.as_bytes() {
        return Outcome::Unconfirmed;
    }
    match reply[17] {
        1 => Outcome::Started,
        2 => Outcome::Busy,
        3 => Outcome::Rejected,
        5 => Outcome::NotApproved,
        _ => Outcome::Unconfirmed,
    }
}

#[cfg(target_os = "macos")]
mod macos {
    use super::*;
    use crate::focus_launch_identity::{requirement, socket_path, verify_bundle, verify_peer};
    use hmac::{Hmac, Mac};
    use objc2::{runtime::NSObjectProtocol, sel};
    use objc2_app_kit::{NSRunningApplication, NSWorkspace, NSWorkspaceOpenConfiguration};
    use objc2_foundation::{NSError, NSString, NSURL};
    use sha2::Sha256;
    use std::io::{self, Read, Write};
    use std::os::unix::net::UnixStream;
    use std::path::PathBuf;
    use std::sync::{atomic::{AtomicBool, Ordering}, mpsc};
    use std::time::{Duration, Instant};

    #[link(name = "CoreServices", kind = "framework")]
    extern "C" {
        fn LSCopyApplicationURLsForBundleIdentifier(
            identifier: core_foundation_sys::string::CFStringRef,
            error: *mut core_foundation_sys::error::CFErrorRef,
        ) -> core_foundation_sys::array::CFArrayRef;
    }

    fn registered_urls(workspace: &NSWorkspace, id: &NSString) -> Option<objc2::rc::Retained<objc2_foundation::NSArray<NSURL>>> {
        if workspace.respondsToSelector(sel!(URLsForApplicationsWithBundleIdentifier:)) {
            return Some(workspace.URLsForApplicationsWithBundleIdentifier(id));
        }
        // macOS 10.15–11: the preferred URL alone can be another app with Grace's legacy identifier.
        // SAFETY: NSString and NSArray are toll-free bridged; Launch Services returns a retained array of URLs.
        unsafe {
            let urls = LSCopyApplicationURLsForBundleIdentifier(std::ptr::from_ref(id).cast(), std::ptr::null_mut());
            objc2::rc::Retained::from_raw(urls.cast_mut().cast())
        }
    }

    static START_PENDING: AtomicBool = AtomicBool::new(false);
    struct StartGuard;
    impl Drop for StartGuard {
        fn drop(&mut self) { START_PENDING.store(false, Ordering::Release); }
    }

    struct Opened { pid: libc::pid_t, cold: bool }

    pub(super) fn launch(app: &AppHandle, request_id: Uuid, manual: bool) -> Outcome {
        if START_PENDING.compare_exchange(false, true, Ordering::Acquire, Ordering::Relaxed).is_err() {
            return Outcome::Busy;
        }
        let _guard = StartGuard;
        let (reply, opened) = mpsc::channel();
        if app.run_on_main_thread(move || open_grace(reply)).is_err() {
            return Outcome::Unconfirmed;
        }
        let opened = match opened.recv_timeout(Duration::from_secs(15)) {
            Ok(Ok(opened)) => opened,
            Ok(Err(reason)) => return reason,
            Err(_) => return Outcome::Unconfirmed,
        };
        let required = requirement(GRACE_ID, option_env!("FOCUS_LAUNCH_GRACE_TEAM_ID")).expect("checked before launch");
        let Ok(socket) = socket_path(opened.pid as u32) else { return Outcome::Unconfirmed; };
        let deadline = Instant::now() + Duration::from_secs(if opened.cold { 10 } else { 2 });
        let stream = loop {
            match UnixStream::connect(&socket) {
                Ok(stream) => break stream,
                Err(error) if matches!(error.kind(), io::ErrorKind::NotFound | io::ErrorKind::ConnectionRefused)
                    && Instant::now() < deadline =>
                {
                    // Readiness only. Never reconnect or repeat a request after connecting.
                    std::thread::sleep(Duration::from_millis(50));
                }
                Err(_) => return Outcome::Unconfirmed,
            }
        };
        if !verify_peer(&stream, &required, Some(opened.pid)) {
            return Outcome::Incompatible;
        }
        exchange(stream, request_id, manual).unwrap_or(Outcome::Unconfirmed)
    }

    fn bundle_path(url: &NSURL) -> Option<PathBuf> {
        PathBuf::from(url.path()?.to_string()).canonicalize().ok()
    }

    fn protocol(url: &NSURL) -> Option<bool> {
        let info = plist::Value::from_file(bundle_path(url)?.join("Contents/Info.plist")).ok()?;
        grace_protocol(info.as_dictionary()?)
    }

    fn open_grace(reply: mpsc::Sender<Result<Opened, Outcome>>) {
        let workspace = NSWorkspace::sharedWorkspace();
        if !workspace.respondsToSelector(sel!(openApplicationAtURL:configuration:completionHandler:)) {
            let _ = reply.send(Err(Outcome::Unsupported));
            return;
        }
        let identifier = NSString::from_str(GRACE_ID);
        let required = requirement(GRACE_ID, option_env!("FOCUS_LAUNCH_GRACE_TEAM_ID"));
        let mut grace_found = false;
        let authenticated = |url: &NSURL| {
            required.as_ref().is_some_and(|text| verify_bundle(url, text))
        };

        let running = NSRunningApplication::runningApplicationsWithBundleIdentifier(&identifier);
        let mut warm = None;
        for url in running.iter().filter_map(|application| application.bundleURL()) {
            match protocol(&url) {
                None => continue,
                Some(true) if authenticated(&url) => { warm.get_or_insert(url); }
                Some(_) => {
                    // Grace copies share app data. Never start another copy
                    // while an incompatible Grace is running.
                    let _ = reply.send(Err(Outcome::Incompatible));
                    return;
                }
            }
        }
        let chosen = warm.map(|url| (url, false)).or_else(|| {
            registered_urls(&workspace, &identifier).and_then(|urls| {
                urls.iter().find_map(|url| {
                    let compatible = protocol(&url)?;
                    grace_found = true;
                    (compatible && authenticated(&url)).then_some((url, true))
                })
            })
        });
        let Some((url, cold)) = chosen else {
            let _ = reply.send(Err(if grace_found { Outcome::Incompatible } else { Outcome::Missing }));
            return;
        };
        let path = bundle_path(&url);
        let configuration = NSWorkspaceOpenConfiguration::new();
        configuration.setActivates(true);
        configuration.setAddsToRecentItems(false);
        configuration.setPromptsUserIfNeeded(false);
        configuration.setAllowsRunningApplicationSubstitution(false);
        let done = block2::RcBlock::new(move |application: *mut NSRunningApplication, _: *mut NSError| {
            // SAFETY: The callback supplies a borrowed NSRunningApplication or null.
            let result = unsafe { application.as_ref() }.ok_or(Outcome::Unconfirmed).and_then(|application| {
                let actual = application.bundleURL().and_then(|url| bundle_path(&url));
                let pid = application.processIdentifier();
                if actual.is_none() || actual != path || pid <= 0 {
                    Err(Outcome::Incompatible)
                } else {
                    Ok(Opened { pid, cold })
                }
            });
            let _ = reply.send(result);
        });
        workspace.openApplicationAtURL_configuration_completionHandler(&url, &configuration, Some(&done));
    }

    fn exchange(mut stream: UnixStream, id: Uuid, manual: bool) -> io::Result<Outcome> {
        let mut hello = [0; 18];
        hello[0] = VERSION;
        hello[1..17].copy_from_slice(id.as_bytes());
        hello[17] = u8::from(manual);
        stream.set_write_timeout(Some(Duration::from_secs(1)))?;
        stream.set_read_timeout(Some(Duration::from_secs(2)))?;
        stream.write_all(&hello)?;
        let mut challenge = [0; 32];
        stream.read_exact(&mut challenge)?;
        let mut proof = Hmac::<Sha256>::new_from_slice(&challenge).expect("HMAC accepts 32-byte keys");
        proof.update(b"focus-to-grace:start\0");
        proof.update(&hello);
        stream.write_all(&proof.finalize().into_bytes())?;
        stream.set_read_timeout(Some(Duration::from_secs(if manual { 90 } else { 10 })))?;
        let mut reply = [0; 18];
        stream.read_exact(&mut reply)?;
        Ok(decision(id, &reply))
    }
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::*;
    use plist::{Dictionary, Value};

    #[test]
    fn an_upstream_pomotroid_bundle_is_not_a_grace_candidate() {
        let mut info = Dictionary::new();
        info.insert("CFBundleIdentifier".into(), Value::String("com.splode.pomotroid".into()));
        info.insert("CFBundleName".into(), Value::String("Pomotroid".into()));
        assert_eq!(grace_protocol(&info), None);
        info.insert("CFBundleName".into(), Value::String("grace.".into()));
        assert_eq!(grace_protocol(&info), Some(false));
        info.insert("GraceFocusLaunchProtocol".into(), Value::Integer(1.into()));
        assert_eq!(grace_protocol(&info), Some(true));
        info.insert("GraceFocusLaunchProtocol".into(), Value::Integer(2.into()));
        assert_eq!(grace_protocol(&info), Some(false));
    }

    #[test]
    fn only_a_correlated_v1_acceptance_can_report_started() {
        let id = uuid::Uuid::new_v4();
        let mut reply = [0; 18];
        reply[0] = 1;
        reply[1..17].copy_from_slice(id.as_bytes());
        reply[17] = 1;
        assert_eq!(decision(id, &reply), Outcome::Started);
        assert_eq!(decision(uuid::Uuid::new_v4(), &reply), Outcome::Unconfirmed);
        reply[17] = 2;
        assert_eq!(decision(id, &reply), Outcome::Busy);
        reply[0] = 2;
        assert_eq!(decision(id, &reply), Outcome::Incompatible);
    }
}
