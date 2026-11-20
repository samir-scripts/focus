use super::{setup_files as files, types::SetupError};
use focus_core::model::GECKO_ID;
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
use std::path::Path;
use url::Url;
#[cfg(test)]
use std::fs;

const LIMIT: u64 = 1024 * 1024;
const ASSET_LIMIT: u64 = 8 * 1024 * 1024;
const SETTINGS: &str = "ExtensionSettings";
const ENABLED: &str = "EnterprisePoliciesEnabled";
const STAGED: &str = ".focus-local.xpi";
const RECEIPT: &str = ".focus-local-policy.json";

#[derive(Serialize, Deserialize)]
struct Receipt {
    digest: String,
    controller: u32,
    created_document: bool,
    created_policies: bool,
    created_settings: bool,
    enabled_macos: bool,
}

#[derive(Clone, Copy)]
enum Location<'a> {
    #[cfg(any(target_os = "linux", test))]
    Json(&'a Path),
    #[cfg(target_os = "macos")]
    Mac(&'a str),
}

pub struct Policy<'a> { location: Location<'a>, stage: &'a Path, owner: u32, controller: u32 }

type Document = Map<String, Value>;

impl<'a> Policy<'a> {
    #[cfg(test)]
    pub fn json(path: &'a Path) -> Self {
        let uid = files::current_uid();
        Self { location: Location::Json(path), stage: path.parent().expect("qualified policy directory"), owner: uid, controller: uid }
    }

    #[cfg(target_os = "linux")]
    pub fn root_json(path: &'a Path, controller: u32) -> Self {
        Self { location: Location::Json(path), stage: path.parent().expect("qualified policy directory"), owner: 0, controller }
    }

    #[cfg(target_os = "macos")]
    pub fn mac(domain: &'a str, stage: &'a Path) -> Self {
        let uid = files::current_uid();
        Self { location: Location::Mac(domain), stage, owner: uid, controller: uid }
    }

    fn nested(&self) -> bool {
        match self.location {
            #[cfg(any(target_os = "linux", test))]
            Location::Json(_) => true,
            #[cfg(target_os = "macos")]
            Location::Mac(_) => false,
        }
    }

    fn snapshot(&self) -> Result<Option<Vec<u8>>, SetupError> {
        match self.location {
            #[cfg(any(target_os = "linux", test))]
            Location::Json(path) => files::read(path, self.owner, LIMIT),
            #[cfg(target_os = "macos")]
            Location::Mac(domain) => prefs::snapshot(domain),
        }
    }

    fn save(&self, previous: Option<&[u8]>, document: Document, remove_document: bool) -> Result<(), SetupError> {
        match self.location {
            #[cfg(any(target_os = "linux", test))]
            Location::Json(path) => {
                let bytes = if remove_document { None } else { Some(serde_json::to_vec_pretty(&document).map_err(|_| SetupError::Io)?) };
                if bytes.as_ref().is_some_and(|bytes| bytes.len() as u64 > LIMIT) { return Err(SetupError::Conflict); }
                #[cfg(target_os = "linux")]
                if self.owner == 0 && previous.is_some() { files::check_standard_policy_file(path)?; }
                files::replace(path, self.owner, previous, bytes.as_deref(), 0o644)
            }
            #[cfg(target_os = "macos")]
            Location::Mac(domain) => {
                let _ = remove_document;
                prefs::save(domain, previous, &document)
            }
        }
    }

    fn read_receipt(&self) -> Result<Option<(Vec<u8>, Receipt)>, SetupError> {
        files::read(&self.stage.join(RECEIPT), self.owner, LIMIT)?.map(|bytes| {
            let receipt: Receipt = serde_json::from_slice(&bytes).map_err(|_| SetupError::Conflict)?;
            if receipt.controller != self.controller { return Err(SetupError::ManagedElsewhere); }
            Ok((bytes, receipt))
        }).transpose()
    }

    pub fn managed(&self) -> Result<bool, SetupError> {
        if let Err(error) = std::fs::symlink_metadata(self.stage) {
            if error.kind() == std::io::ErrorKind::NotFound { return Ok(false); }
            return Err(error.into());
        }
        files::checked_dir(self.stage, self.owner, false)?;
        Ok(self.read_receipt()?.is_some())
    }

    fn document(previous: Option<&[u8]>) -> Result<Document, SetupError> {
        previous.map_or_else(|| Ok(Map::new()), |bytes| serde_json::from_slice(bytes).map_err(|_| SetupError::Conflict))
    }

    fn settings<'b>(&self, document: &'b mut Document) -> Result<(&'b mut Document, bool, bool), SetupError> {
        let mut created_policies = false;
        let parent = if self.nested() {
            object(document, "policies", &mut created_policies)?
        } else { document };
        let mut created_settings = false;
        let settings = object(parent, SETTINGS, &mut created_settings)?;
        Ok((settings, created_policies, created_settings))
    }

    fn entry(&self) -> Result<Value, SetupError> {
        let url = Url::from_file_path(self.stage.join(STAGED)).map_err(|_| SetupError::Conflict)?;
        Ok(json!({"installation_mode": "force_installed", "install_url": url.as_str(), "updates_disabled": true}))
    }

    pub fn install(&self, data: &[u8]) -> Result<bool, SetupError> {
        files::checked_dir(self.stage, self.owner, true)?;
        let _lock = files::lock(&self.stage.join(".focus-local-policy.lock"), self.owner, 0o600)?;
        let previous = self.snapshot()?;
        let mut document = Self::document(previous.as_deref())?;
        let mut enabled_macos = false;
        if !self.nested() {
            if document.keys().any(|key| key.starts_with("ExtensionSettings__")) { return Err(SetupError::Conflict); }
            match document.get(ENABLED) {
                None => { document.insert(ENABLED.to_owned(), json!(true)); enabled_macos = true; }
                Some(Value::Bool(true)) => (),
                _ => return Err(SetupError::Conflict),
            }
        }
        let entry = self.entry()?;
        let (settings, created_policies, created_settings) = self.settings(&mut document)?;
        let current = settings.get(GECKO_ID);
        let staged = self.stage.join(STAGED);
        let receipt_path = self.stage.join(RECEIPT);
        let digest = hex_digest(data);
        let stage_exists = files::read(&staged, self.owner, ASSET_LIMIT)?;
        let found = self.read_receipt()?;
        let new_receipt = if let Some((_, ref receipt)) = found {
            if receipt.digest != digest || current.is_some_and(|value| value != &entry)
                || stage_exists.as_deref().is_some_and(|bytes| bytes != data)
            {
                return Err(SetupError::Conflict);
            }
            if current.is_some() && stage_exists.is_some() { return Ok(false); }
            None
        } else {
            if current.is_some() || stage_exists.is_some() { return Err(SetupError::Conflict); }
            let receipt = Receipt { digest, controller: self.controller, created_document: previous.is_none(), created_policies, created_settings, enabled_macos };
            let bytes = serde_json::to_vec(&receipt).map_err(|_| SetupError::Io)?;
            files::replace(&receipt_path, self.owner, None, Some(&bytes), 0o644)?;
            Some(bytes)
        };
        settings.insert(GECKO_ID.to_owned(), entry);
        let result = (|| {
            if stage_exists.is_none() { files::replace(&staged, self.owner, None, Some(data), 0o644)?; }
            self.save(previous.as_deref(), document, false)
        })();
        if let Err(error) = result {
            if let Some(bytes) = new_receipt {
                if self.snapshot()?.as_deref() != previous.as_deref() {
                    return Err(SetupError::RollbackFailed);
                }
                if files::read(&staged, self.owner, ASSET_LIMIT)?.as_deref() == Some(data) {
                    files::replace(&staged, self.owner, Some(data), None, 0o644).map_err(|_| SetupError::RollbackFailed)?;
                }
                files::replace(&receipt_path, self.owner, Some(&bytes), None, 0o644).map_err(|_| SetupError::RollbackFailed)?;
            }
            return Err(error);
        }
        // A recovered/incomplete claim is not owned by this invocation for launch rollback.
        Ok(new_receipt.is_some())
    }

    pub fn remove(&self) -> Result<bool, SetupError> {
        let uid = self.owner;
        if !self.stage.exists() { return Ok(false); }
        files::checked_dir(self.stage, uid, false)?;
        let _lock = files::lock(&self.stage.join(".focus-local-policy.lock"), uid, 0o600)?;
        let Some((bytes, receipt)) = self.read_receipt()? else { return Ok(false); };
        let previous = self.snapshot()?;
        let mut document = Self::document(previous.as_deref())?;
        if !self.nested() && document.keys().any(|key| key.starts_with("ExtensionSettings__")) {
            return Err(SetupError::Conflict);
        }
        let staged = self.stage.join(STAGED);
        let data = files::read(&staged, uid, ASSET_LIMIT)?;
        if data.as_deref().is_some_and(|payload| hex_digest(payload) != receipt.digest) {
            return Err(SetupError::Conflict);
        }
        let entry = self.entry()?;
        let mut changed = false;
        let (settings, _, _) = self.settings(&mut document)?;
        if let Some(current) = settings.get(GECKO_ID) {
            if current != &entry { return Err(SetupError::Conflict); }
            settings.remove(GECKO_ID);
            changed = true;
        }
        if receipt.created_settings && settings.is_empty() {
            if self.nested() {
                let policies = document.get_mut("policies").and_then(Value::as_object_mut).ok_or(SetupError::Conflict)?;
                policies.remove(SETTINGS);
                if receipt.created_policies && policies.is_empty() { document.remove("policies"); }
            } else { document.remove(SETTINGS); }
        }
        if receipt.enabled_macos && !document.contains_key(SETTINGS) && document.get(ENABLED) == Some(&json!(true)) {
            // Other preference keys are never written. Keep enablement if other policy is present.
            if document.len() == 1 && self.macos_has_no_other_preferences()? {
                document.remove(ENABLED);
                changed = true;
            }
        }
        if changed {
            let absent = receipt.created_document && document.is_empty();
            self.save(previous.as_deref(), document, absent)?;
        }
        if let Some(data) = data { files::replace(&staged, uid, Some(&data), None, 0o644)?; }
        files::replace(&self.stage.join(RECEIPT), uid, Some(&bytes), None, 0o644)?;
        Ok(true)
    }

    fn macos_has_no_other_preferences(&self) -> Result<bool, SetupError> {
        match self.location {
            #[cfg(any(target_os = "linux", test))]
            Location::Json(_) => Ok(false),
            #[cfg(target_os = "macos")]
            Location::Mac(domain) => prefs::no_other_keys(domain),
        }
    }
}

fn object<'a>(parent: &'a mut Document, key: &str, created: &mut bool) -> Result<&'a mut Document, SetupError> {
    parent.entry(key.to_owned()).or_insert_with(|| { *created = true; json!({}) })
        .as_object_mut().ok_or(SetupError::Conflict)
}

fn hex_digest(data: &[u8]) -> String { format!("{:x}", Sha256::digest(data)) }

#[cfg(target_os = "macos")]
pub fn conflicting_bundle_policy(path: &Path) -> Result<bool, SetupError> {
    use std::io::Read;
    let meta = match std::fs::symlink_metadata(path) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(false),
        Err(e) => return Err(e.into()),
        Ok(meta) => meta,
    };
    if !meta.is_file() || meta.len() > LIMIT { return Err(SetupError::Conflict); }
    let mut bytes = Vec::new();
    std::fs::File::open(path)?.take(LIMIT + 1).read_to_end(&mut bytes)?;
    let value: Value = serde_json::from_slice(&bytes).map_err(|_| SetupError::Conflict)?;
    let policies = value.get("policies").and_then(Value::as_object).ok_or(SetupError::Conflict)?;
    // Gecko merges policy providers by top-level key, not by individual extension ID.
    Ok(policies.contains_key(SETTINGS) || policies.contains_key("Extensions")
        || policies.get("DisableMacOSUserPolicies").is_some_and(|value| value != &json!(false)))
}

#[cfg(target_os = "macos")]
#[path = "mac_preferences.rs"]
mod prefs;

#[cfg(test)]
#[path = "policy_tests.rs"]
mod tests;
