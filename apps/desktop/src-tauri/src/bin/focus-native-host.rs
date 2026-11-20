use focus_core::{db::{Db, Error, Result}, model, protocol::{self, Session}, registration};
use std::{io, path::PathBuf, process::{Command, Stdio}, sync::mpsc, thread, time::{Duration, Instant}};

fn main() {
    let args: Vec<_> = std::env::args_os().skip(1).collect();
    let Some(gecko) = registration::caller_is_gecko(&args) else {
        eprintln!("focus bridge: caller not registered");
        return;
    };
    if run(gecko).is_err() { eprintln!("focus bridge: connection ended"); }
}

fn run(gecko: bool) -> io::Result<()> {
    let (tx, rx) = mpsc::sync_channel(1);
    thread::spawn(move || {
        let mut input = io::stdin().lock();
        let mut bytes = Vec::new();
        loop {
            match protocol::read_frame(&mut input, &mut bytes) {
                Ok(true) => {
                    if tx.send(Ok(std::mem::take(&mut bytes))).is_err() { break; }
                }
                Ok(false) => break,
                Err(error) => { let _ = tx.send(Err(error)); break; }
            }
        }
    });
    let mut db = Db::open_default();
    let mut session = Session::new(gecko);
    let mut stdout = io::stdout().lock();
    let interval = Duration::from_secs(model::POLL_SECONDS);
    let mut next = Instant::now() + interval;
    let result = loop {
        if Instant::now() >= next {
            next = Instant::now() + interval;
            if let Ok(db) = &mut db {
                match session.tick(db) {
                    Ok(Some(event)) => if let Err(error) = protocol::write_frame(&mut stdout, &event) { break Err(error); },
                    Ok(None) => (),
                    Err(_) => break Err(io::ErrorKind::ConnectionAborted.into()),
                }
            }
        }
        match rx.recv_timeout(next.saturating_duration_since(Instant::now())) {
            Ok(Ok(bytes)) => {
                let message = session.message(&bytes, &mut db, foreground_desktop);
                if let Err(error) = protocol::write_frame(&mut stdout, &message) { break Err(error); }
            }
            Ok(Err(error)) => break Err(error),
            Err(mpsc::RecvTimeoutError::Disconnected) => break Ok(()),
            Err(mpsc::RecvTimeoutError::Timeout) => (),
        }
    };
    if let Ok(db) = &mut db { session.close(db); }
    result
}

fn foreground_desktop() -> Result<()> {
    #[cfg(debug_assertions)]
    if std::env::var_os("FOCUS_DATA_DIR").is_some() && std::env::var_os("FOCUS_FIXTURE_NO_DESKTOP").as_deref() == Some("1".as_ref()) {
        return Ok(());
    }
    let sibling = std::env::current_exe().map_err(|_| Error::OpenFailed)?
        .with_file_name(format!("focus-desktop{}", std::env::consts::EXE_SUFFIX));
    #[cfg(target_os = "macos")]
    if !cfg!(debug_assertions) || !sibling.is_file() {
        let status = Command::new("/usr/bin/open").args(["-b", model::DESKTOP_ID])
            .stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).status().map_err(|_| Error::OpenFailed)?;
        return if status.success() { Ok(()) } else { Err(Error::OpenFailed) };
    }
    spawn_desktop(sibling)
}

fn spawn_desktop(path: PathBuf) -> Result<()> {
    let mut child = Command::new(path).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null())
        .spawn().map_err(|_| Error::OpenFailed)?;
    thread::spawn(move || { let _ = child.wait(); });
    Ok(())
}
