fn main() {
    use std::{env, fs, path::PathBuf};

    println!("cargo:rerun-if-env-changed=FOCUS_SIGNED_XPI");
    let staged = PathBuf::from(env::var_os("OUT_DIR").unwrap()).join("focus-release.xpi");
    if let Some(source) = env::var_os("FOCUS_SIGNED_XPI") {
        let source = PathBuf::from(source);
        assert!(source.is_absolute(), "FOCUS_SIGNED_XPI must be an absolute build input");
        println!("cargo:rerun-if-changed={}", source.display());
        assert!(fs::metadata(&source).is_ok_and(|m| m.is_file() && m.len() <= 8 * 1024 * 1024),
            "FOCUS_SIGNED_XPI must be a regular XPI no larger than 8 MiB");
        fs::copy(source, staged).expect("stage build-time XPI");
    } else {
        fs::write(staged, []).expect("mark signed XPI absent");
    }
    let target = env::var("TARGET").unwrap();
    let architecture = target.split('-').next().unwrap();
    let arch = match architecture { "aarch64" => "arm64", "x86_64" => "amd64", other => other };
    let platform = env::var("CARGO_CFG_TARGET_OS").unwrap();
    let platform = if platform == "macos" { "darwin" } else { &platform };
    let member = if platform == "windows" { "glance.exe" } else { "glance" };
    let binary = PathBuf::from(env::var_os("CARGO_MANIFEST_DIR").unwrap())
        .join(format!("target/focus-glance/{platform}-{arch}-{member}"));
    println!("cargo:rerun-if-changed={}", binary.display());
    let embedded = PathBuf::from(env::var_os("OUT_DIR").unwrap()).join("focus-glance.bin");
    if binary.is_file() {
        fs::copy(binary, &embedded).expect("stage pinned Glance");
    } else {
        // Plain cargo checks/tests do not download build inputs. Tauri dev/build stage first.
        fs::write(&embedded, []).expect("mark Glance absent");
    }
    println!("cargo:rustc-env=FOCUS_GLANCE_BINARY={}", embedded.display());
    tauri_build::build()
}
