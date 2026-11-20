#[cfg(target_os = "linux")]
#[allow(dead_code)]
#[path = "../browser_setup/types.rs"]
mod types;
#[cfg(target_os = "linux")]
#[allow(dead_code)]
#[path = "../browser_setup/setup_files.rs"]
mod setup_files;
#[cfg(target_os = "linux")]
#[allow(dead_code)]
#[path = "../browser_setup/release.rs"]
mod release;
#[cfg(target_os = "linux")]
#[allow(dead_code)]
#[path = "../browser_setup/policy.rs"]
mod policy;
#[cfg(target_os = "linux")]
#[allow(dead_code)]
#[path = "../browser_setup/linux_policy.rs"]
mod linux_policy;

#[cfg(target_os = "linux")]
fn main() {
    let mut args = std::env::args_os().skip(1);
    let (Some(operation), Some(slot), None) = (args.next(), args.next(), args.next()) else { std::process::exit(1) };
    let (Some(operation), Some(slot)) = (operation.to_str(), slot.to_str()) else { std::process::exit(1) };
    match linux_policy::helper(operation, slot) {
        Ok(true) => println!("changed"),
        Ok(false) => println!("unchanged"),
        Err(types::SetupError::Conflict) => std::process::exit(2),
        Err(types::SetupError::RollbackFailed) => std::process::exit(3),
        Err(types::SetupError::ManagedElsewhere) => std::process::exit(4),
        Err(_) => std::process::exit(1),
    }
}

#[cfg(not(target_os = "linux"))]
fn main() { std::process::exit(1); }
