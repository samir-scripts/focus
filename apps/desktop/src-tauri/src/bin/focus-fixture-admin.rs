#[cfg(debug_assertions)]
fn run() -> Result<(), &'static str> {
    use focus_core::{db::Db, protocol::{profile_label, valid_profile}};
    if !std::env::var_os("FOCUS_DATA_DIR").is_some_and(|path| std::path::Path::new(&path).is_absolute()) {
        return Err("Absolute disposable FOCUS_DATA_DIR required");
    }
    let args: Vec<_> = std::env::args().skip(1).collect();
    let mut db = Db::open_default().map_err(|e| e.code())?;
    match args.iter().map(String::as_str).collect::<Vec<_>>().as_slice() {
        ["state"] => {
            let state = db.state().map_err(|e| e.code())?;
            println!("{}", serde_json::to_string(&state).map_err(|_| "invalid_state")?);
            Ok(())
        }
        ["approve", id] if valid_profile(id) => db.decide_pair(id, true, None).map_err(|e| e.code()),
        ["approve", id, label] if valid_profile(id) => {
            let label = profile_label(label).map_err(|e| e.code())?;
            db.decide_pair(id, true, Some(label)).map_err(|e| e.code())
        }
        ["deny", id] if valid_profile(id) => db.decide_pair(id, false, None).map_err(|e| e.code()),
        ["revoke", id] if valid_profile(id) => db.revoke(id).map_err(|e| e.code()),
        ["rule", revision, value] => {
            let revision = revision.parse().map_err(|_| "invalid_revision")?;
            let enabled = value.parse().map_err(|_| "invalid_enabled")?;
            db.set_hide_shorts(revision, enabled).map_err(|e| e.code())
        }
        ["content", revision, rules] => db.set_content_rules(
            revision.parse().map_err(|_| "invalid_revision")?,
            serde_json::from_str(rules).map_err(|_| "invalid_content_rules")?,
        ).map_err(|e| e.code()),
        ["browser-open", profile, site, revision] if valid_profile(profile) => {
            let id = db.enqueue_browser_open(profile, site, revision.parse().map_err(|_| "invalid_revision")?)
                .map_err(|e| e.code())?;
            println!("{id}");
            Ok(())
        }
        ["browser-open-state", id] if valid_profile(id) => {
            println!("{}", serde_json::to_string(&db.browser_open_state(id).map_err(|e| e.code())?)
                .map_err(|_| "invalid_state")?);
            Ok(())
        }
        ["entry", revision, site, policy] => db.set_entry(
            revision.parse().map_err(|_| "invalid_revision")?, site,
            serde_json::from_str(policy).map_err(|_| "invalid_policy")?,
        ).map_err(|e| e.code()),
        ["accessibility", revision, settings] => db.set_accessibility(
            revision.parse().map_err(|_| "invalid_revision")?,
            serde_json::from_str(settings).map_err(|_| "invalid_accessibility")?,
        ).map_err(|e| e.code()),
        ["grayscale", revision, site, value] => db.set_grayscale(
            revision.parse().map_err(|_| "invalid_revision")?, site,
            value.parse().map_err(|_| "invalid_grayscale")?,
        ).map_err(|e| e.code()),
        ["designate", host] => {
            println!("{}", db.designate_site(host).map_err(|e| e.code())?);
            Ok(())
        }
        _ => Err("invalid_arguments"),
    }
}

fn main() -> std::process::ExitCode {
    #[cfg(debug_assertions)]
    if let Err(error) = run() {
        eprintln!("{error}");
        return std::process::ExitCode::FAILURE;
    } else {
        return std::process::ExitCode::SUCCESS;
    }
    #[cfg(not(debug_assertions))]
    std::process::ExitCode::FAILURE
}
