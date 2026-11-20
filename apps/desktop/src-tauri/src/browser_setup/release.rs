use super::types::SetupError;
use focus_core::{model::GECKO_ID, registration};
use serde::Deserialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{io::{Cursor, Read}, sync::LazyLock};
use url::Url;

const METADATA: &str = include_str!("../../../../extension/browser-release.json");
static SIGNED_XPI: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/focus-release.xpi"));

#[derive(Deserialize)]
struct Metadata {
    chromium: Option<Value>,
    gecko: Option<Gecko>,
}

#[derive(Deserialize)]
struct Gecko {
    sha256: String,
    version: String,
    amo_source: String,
    provenance: String,
}

pub fn chromium_release() -> Result<String, SetupError> {
    let metadata: Metadata = serde_json::from_str(METADATA).map_err(|_| SetupError::InvalidArtifact)?;
    if metadata.chromium.is_none() { return Err(SetupError::MissingArtifact); }
    let id = registration::production_chromium_id().ok_or(SetupError::InvalidArtifact)?;
    store_link(Some(id), registration::is_test_chromium_id(id))
}

pub(super) fn store_link(id: Option<&str>, is_test: bool) -> Result<String, SetupError> {
    let id = id.ok_or(SetupError::MissingArtifact)?;
    if is_test || id.len() != 32 || !id.bytes().all(|byte| (b'a'..=b'p').contains(&byte)) {
        return Err(SetupError::InvalidArtifact);
    }
    Ok(format!("https://chromewebstore.google.com/detail/{id}"))
}

pub fn gecko_release() -> Result<&'static [u8], SetupError> {
    static VALIDATED: LazyLock<Result<&'static [u8], SetupError>> = LazyLock::new(|| {
        let metadata: Metadata = serde_json::from_str(METADATA).map_err(|_| SetupError::InvalidArtifact)?;
        let gecko = metadata.gecko.ok_or(SetupError::MissingArtifact)?;
        if SIGNED_XPI.is_empty() { return Err(SetupError::MissingArtifact); }
        let source = Url::parse(&gecko.amo_source).map_err(|_| SetupError::InvalidArtifact)?;
        if source.scheme() != "https" || !matches!(source.host_str(), Some("addons.mozilla.org" | "addons.cdn.mozilla.net"))
            || !source.username().is_empty() || source.password().is_some() || source.port().is_some()
            || gecko.provenance.trim().is_empty()
        {
            return Err(SetupError::InvalidArtifact);
        }
        verify_xpi(SIGNED_XPI, &gecko.sha256, &gecko.version)?;
        Ok(SIGNED_XPI)
    });
    *VALIDATED
}

pub(super) fn verify_xpi(bytes: &[u8], sha256: &str, version: &str) -> Result<(), SetupError> {
    let invalid = SetupError::InvalidArtifact;
    if bytes.is_empty() || bytes.len() > 8 * 1024 * 1024 || format!("{:x}", Sha256::digest(bytes)) != sha256 {
        return Err(invalid);
    }
    let mut zip = zip::ZipArchive::new(Cursor::new(bytes)).map_err(|_| invalid)?;
    for name in ["manifest.json", "META-INF/manifest.mf", "META-INF/mozilla.sf", "META-INF/mozilla.rsa"] {
        if zip.file_names().filter(|entry| *entry == name).count() != 1
            || !zip.by_name(name).is_ok_and(|file| file.is_file() && file.size() > 0)
        {
            return Err(invalid);
        }
    }
    // The release digest pins the AMO output; Firefox still enforces its Mozilla signature.
    let mut manifest = Vec::new();
    zip.by_name("manifest.json").map_err(|_| invalid)?.take(65_537).read_to_end(&mut manifest).map_err(|_| invalid)?;
    if manifest.len() > 65_536 { return Err(invalid); }
    let m: Value = serde_json::from_slice(&manifest).map_err(|_| invalid)?;
    let permissions = m["permissions"].as_array().ok_or(invalid)?;
    if m["manifest_version"] != 3 || m["name"] != "focus." || m["version"].as_str() != Some(version)
        || m["browser_specific_settings"]["gecko"]["id"] != GECKO_ID
        || m.get("applications").is_some()
        || !permissions.iter().any(|p| p == "nativeMessaging")
        || !permissions.iter().all(|p| matches!(p.as_str(), Some("storage" | "nativeMessaging" | "scripting" | "alarms")))
        || ["host_permissions", "content_scripts"].iter().any(|key| m.get(key).is_some_and(|v| !v.as_array().is_some_and(Vec::is_empty)))
    {
        return Err(invalid);
    }
    Ok(())
}
