use std::{fs, io::Read, net::{Ipv4Addr, TcpListener}, path::PathBuf, process::{Child, Command, Stdio}, sync::Mutex, time::{Duration, Instant}};

use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use url::Url;

const CONTENT: &str = "api/pages/reading/content/";
const MAX_HTML: u64 = 2 * 1024 * 1024;

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize)]
pub(crate) struct Settings {
    enabled: bool,
    page: Option<String>,
    feeds: Vec<Subscription>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
struct Subscription { url: String, name: String }

fn web_url(raw: &str) -> Result<Url, &'static str> {
    let url = Url::parse(raw).map_err(|_| "Use an absolute HTTP or HTTPS URL.")?;
    if raw.len() > 4096 || !matches!(url.scheme(), "http" | "https") || url.host().is_none()
        || !url.username().is_empty() || url.password().is_some() {
        return Err("Use an absolute HTTP or HTTPS URL without credentials.");
    }
    Ok(url)
}

impl Settings {
    fn validate(mut self) -> Result<Self, &'static str> {
        if self.feeds.len() > 30 { return Err("Reading supports up to 30 subscriptions."); }
        if let Some(page) = &mut self.page { *page = web_url(page)?.into(); }
        let mut seen = std::collections::HashSet::new();
        for feed in &mut self.feeds {
            let mut url = web_url(&feed.url)?;
            url.set_fragment(None);
            feed.url = url.into();
            feed.name = feed.name.trim().to_owned();
            if feed.name.chars().count() > 100 || feed.name.chars().any(char::is_control) {
                return Err("Subscription names must be at most 100 characters, on one line.");
            }
            if !seen.insert(&feed.url) { return Err("That feed is already subscribed."); }
        }
        if self.enabled && self.page.is_none() && self.feeds.is_empty() {
            return Err("Add a feed or connect a Glance page before enabling Reading.");
        }
        Ok(self)
    }
}

pub(crate) struct Reading(Mutex<Runtime>);

struct Runtime {
    path: PathBuf,
    settings: Settings,
    child: Option<Glance>,
}

impl Reading {
    pub(crate) fn load(path: PathBuf) -> std::io::Result<Self> {
        let settings = match fs::read(&path) {
            Ok(data) => serde_json::from_slice::<Settings>(&data).map_err(std::io::Error::other)?
                .validate().map_err(std::io::Error::other)?,
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => Settings::default(),
            Err(err) => return Err(err),
        };
        Ok(Self(Mutex::new(Runtime { path, settings, child: None })))
    }

    pub(crate) fn stop(&self) {
        if let Ok(mut rt) = self.0.lock() { rt.child = None; }
    }
}

impl Runtime {
    fn sidecar(&mut self) -> Result<Url, &'static str> {
        if !self.settings.enabled || self.settings.feeds.is_empty() { return Err("Reading feeds are not enabled."); }
        if let Some(glance) = &mut self.child {
            if matches!(glance.child.try_wait(), Ok(None)) { return Ok(glance.base.clone()); }
        }
        self.child = None;
        let glance = Glance::start(&self.settings.feeds)?;
        let base = glance.base.clone();
        self.child = Some(glance);
        Ok(base)
    }

    fn save(&mut self, settings: Settings) -> Result<bool, &'static str> {
        if settings == self.settings { return Ok(false); }
        let parent = self.path.parent().ok_or("Reading settings path is unavailable.")?;
        fs::create_dir_all(parent).map_err(|_| "Could not create the Reading settings folder.")?;
        let mut file = tempfile::NamedTempFile::new_in(parent).map_err(|_| "Could not save Reading settings.")?;
        serde_json::to_writer(&mut file, &settings).map_err(|_| "Could not save Reading settings.")?;
        file.as_file().sync_all().map_err(|_| "Could not save Reading settings.")?;
        file.persist(&self.path).map_err(|_| "Could not save Reading settings.")?;
        self.child = None;
        self.settings = settings;
        Ok(true)
    }
}

struct Glance { child: Child, base: Url, _dir: tempfile::TempDir }
impl Drop for Glance {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn glance_binary() -> &'static [u8] { include_bytes!(env!("FOCUS_GLANCE_BINARY")) }

impl Glance {
    fn start(feeds: &[Subscription]) -> Result<Self, &'static str> {
        if glance_binary().is_empty() { return Err("This build does not include Glance."); }
        let directory = tempfile::tempdir().map_err(|_| "Could not prepare Glance.")?;
        let executable = directory.path().join(if cfg!(windows) { "glance.exe" } else { "glance" });
        fs::write(&executable, glance_binary()).map_err(|_| "Could not unpack Glance.")?;
        #[cfg(unix)] {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&executable, fs::Permissions::from_mode(0o700)).map_err(|_| "Could not enable Glance.")?;
        }
        let config = directory.path().join("glance.yml");
        let client = client(Duration::from_millis(250))?;
        for _ in 0..3 {
            let reservation = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).map_err(|_| "Could not reserve a local port.")?;
            let port = reservation.local_addr().map_err(|_| "Could not reserve a local port.")?.port();
            let slug = format!("health-{}", uuid::Uuid::new_v4().simple());
            fs::write(&config, config_text(port, feeds, &slug)).map_err(|_| "Could not configure Glance.")?;
            let base = Url::parse(&format!("http://127.0.0.1:{port}/")).unwrap();
            drop(reservation);
            let mut child = Command::new(&executable).args([std::ffi::OsStr::new("--config"), config.as_os_str()])
                .current_dir(directory.path()).env_clear().stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null())
                .spawn().map_err(|_| "Could not start Glance.")?;
            let deadline = Instant::now() + Duration::from_secs(3);
            let probe = base.join(&format!("api/pages/{slug}/content/")).unwrap();
            while Instant::now() < deadline && matches!(child.try_wait(), Ok(None)) {
                if client.get(probe.clone()).send().is_ok_and(|response| response.status().is_success()) {
                    return Ok(Self { child, base, _dir: directory });
                }
                std::thread::sleep(Duration::from_millis(40));
            }
            let _ = child.kill();
            let _ = child.wait();
        }
        Err("Glance could not acquire a local listener. Try again.")
    }
}

fn config_text(port: u16, feeds: &[Subscription], health_slug: &str) -> String {
    let feeds: Vec<_> = feeds.iter().map(|feed| {
        if feed.name.is_empty() { json!({"url": feed.url}) }
        else { json!({"url": feed.url, "title": feed.name}) }
    }).collect();
    // Glance expands variables on the raw YAML. Encode dollars before parsing
    // so subscription data cannot trigger interpolation or secret resolution.
    json!({
        "server": {"host": "127.0.0.1", "port": port},
        "pages": [
            {"name": "Reading", "slug": "reading", "hide-desktop-navigation": true,
             "columns": [{"size": "full", "widgets": [{"type": "rss", "title": "Reading", "feeds": feeds, "limit": 25, "collapse-after": -1}]}]},
            {"name": "Status", "slug": health_slug, "columns": [{"size": "full", "widgets": [{"type": "html", "source": "Ready"}]}]}
        ]
    }).to_string().replace('$', "\\u0024")
}

fn client(timeout: Duration) -> Result<reqwest::blocking::Client, &'static str> {
    reqwest::blocking::Client::builder().timeout(timeout).no_proxy().redirect(reqwest::redirect::Policy::none())
        .build().map_err(|_| "Could not connect to Glance.")
}

#[tauri::command]
pub(crate) async fn reading_settings(app: AppHandle) -> Result<Settings, &'static str> {
    tauri::async_runtime::spawn_blocking(move || {
        Ok(app.state::<Reading>().0.lock().map_err(|_| "Reading is unavailable.")?.settings.clone())
    }).await.map_err(|_| "Reading is unavailable.")?
}

#[tauri::command]
pub(crate) async fn save_reading_settings(app: AppHandle, settings: Settings) -> Result<Settings, &'static str> {
    tauri::async_runtime::spawn_blocking(move || {
        let settings = settings.validate()?;
        let changed = app.state::<Reading>().0.lock().map_err(|_| "Reading is unavailable.")?.save(settings.clone())?;
        if changed {
            if let Some(reader) = app.get_webview_window("reading") { let _ = reader.close(); }
        }
        Ok(settings)
    }).await.map_err(|_| "Could not save Reading settings.")?
}

#[tauri::command]
pub(crate) async fn reading_preview(app: AppHandle) -> Result<String, &'static str> {
    tauri::async_runtime::spawn_blocking(move || {
        let base = app.state::<Reading>().0.lock().map_err(|_| "Reading is unavailable.")?.sidecar()?;
        let response = client(Duration::from_secs(20))?.get(base.join(CONTENT).unwrap()).send()
            .and_then(reqwest::blocking::Response::error_for_status).map_err(|_| "Could not load feeds.")?;
        let mut output = String::new();
        let bytes = response.take(MAX_HTML + 1).read_to_string(&mut output).map_err(|_| "Could not load feeds.")?;
        if bytes as u64 > MAX_HTML { return Err("Glance returned too much content."); }
        Ok(output)
    }).await.map_err(|_| "Reading is unavailable.")?
}

#[tauri::command]
pub(crate) async fn open_reading(app: AppHandle, external: bool) -> Result<(), String> {
    let worker = app.clone();
    let url = tauri::async_runtime::spawn_blocking(move || {
        let state = worker.state::<Reading>();
        let mut rt = state.0.lock().map_err(|_| "Reading is unavailable.")?;
        if !rt.settings.enabled { return Err("Reading is disabled."); }
        match &rt.settings.page {
            Some(page) => web_url(page),
            None if external => Err("Only a connected Glance page can open in your browser."),
            None => rt.sidecar(),
        }
    }).await.map_err(|err| err.to_string())??;
    if external { return open_in_browser(url); }
    let (tx, mut rx) = tauri::async_runtime::channel(1);
    let handle = app.clone();
    app.run_on_main_thread(move || {
        let result = (|| -> Result<(), String> {
            let state = handle.state::<Reading>();
            let rt = state.0.lock().map_err(|_| "Reading is unavailable.")?;
            if !rt.settings.enabled || match &rt.settings.page {
                Some(page) => page != url.as_str(),
                None => rt.child.as_ref().is_none_or(|child| child.base != url),
            } { return Err("Reading settings changed. Try again.".into()); }
            let reader = match handle.get_webview_window("reading") {
                Some(reader) => {
                    if rt.settings.page.is_none() && reader.url().is_ok_and(|current| current.origin() != url.origin()) {
                        reader.navigate(url).map_err(|err| err.to_string())?;
                    }
                    reader
                }
                None => WebviewWindowBuilder::new(&handle, "reading", WebviewUrl::External(url))
                    .title("focus. — Reading").inner_size(860.0, 650.0)
                    .on_navigation(|url| web_url(url.as_str()).is_ok())
                    .on_new_window(|url, _| {
                        if let Ok(valid) = web_url(url.as_str()) { let _ = open_in_browser(valid); }
                        tauri::webview::NewWindowResponse::Deny
                    }).build().map_err(|err| err.to_string())?,
            };
            reader.show().and_then(|()| reader.unminimize()).and_then(|()| reader.set_focus()).map_err(|err| err.to_string())
        })();
        let _ = tx.try_send(result);
    }).map_err(|err| err.to_string())?;
    rx.recv().await.ok_or_else(|| "Could not open Reading.".to_owned())?
}

#[cfg(target_os = "macos")]
pub(crate) fn confirmed_start(app: &AppHandle, id: uuid::Uuid) {
    use tauri::Emitter;
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Some(reader) = handle.get_webview_window("reading") {
            let _ = reader.close();
        }
        let _ = handle.emit_to("main", "grace-start-confirmed", id.to_string());
    });
}

#[tauri::command]
pub(crate) fn open_article(url: String) -> Result<(), String> { open_in_browser(web_url(&url)?) }

#[cfg(target_os = "macos")]
fn open_in_browser(url: Url) -> Result<(), String> {
    use objc2_app_kit::NSWorkspace;
    use objc2_foundation::{NSString, NSURL};

    let url = NSURL::URLWithString(&NSString::from_str(url.as_str()))
        .ok_or("Could not prepare the browser URL.")?;
    if NSWorkspace::sharedWorkspace().openURL(&url) { Ok(()) }
    else { Err("The system could not open the default browser.".into()) }
}

#[cfg(not(target_os = "macos"))]
fn open_in_browser(url: Url) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    let mut command = Command::new("xdg-open");
    #[cfg(target_os = "windows")]
    let mut command = { let mut child = Command::new("rundll32.exe"); child.arg("url.dll,FileProtocolHandler"); child };
    let mut child = command.arg(url.as_str()).spawn().map_err(|err| err.to_string())?;
    std::thread::spawn(move || { let _ = child.wait(); });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stores_disabled_feeds_without_starting_glance() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("reading.json");
        let state = Reading::load(path.clone()).unwrap();
        let mut runtime = state.0.lock().unwrap();
        let settings = Settings {
            feeds: vec![Subscription { url: "https://example.com/rss".into(), name: " News ".into() }],
            ..Settings::default()
        }.validate().unwrap();
        runtime.save(settings.clone()).unwrap();
        assert!(runtime.sidecar().is_err());
        assert!(runtime.child.is_none());
        assert_eq!(settings, Reading::load(path).unwrap().0.into_inner().unwrap().settings);
    }

    #[test]
    #[ignore = "requires the pinned Glance executable staged by scripts/stage-glance.mjs"]
    fn pinned_glance_is_reused_and_stopped_after_disable() {
        let root = tempfile::tempdir().unwrap();
        let state = Reading::load(root.path().join("reading.json")).unwrap();
        let mut runtime = state.0.lock().unwrap();
        let mut settings = Settings {
            enabled: true,
            feeds: vec![Subscription { url: "http://127.0.0.1:1/offline".into(), name: "Offline".into() }],
            ..Settings::default()
        }.validate().unwrap();
        runtime.save(settings.clone()).unwrap();
        let url = runtime.sidecar().unwrap();
        assert_eq!(url, runtime.sidecar().unwrap());
        let status = client(Duration::from_secs(2)).unwrap().get(url.join(CONTENT).unwrap()).send().unwrap();
        assert!(status.status().is_success());
        assert!(status.text().unwrap().contains("widget-error-header"));
        settings.enabled = false;
        runtime.save(settings).unwrap();
        assert!(runtime.child.is_none());
        assert!(client(Duration::from_secs(1)).unwrap().get(url).send().is_err());
    }
}
