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
    tauri_build::build()
}
