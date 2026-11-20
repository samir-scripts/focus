use super::{setup_files as files, types::{ManagedClaim, Outcome, SetupError}};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{collections::BTreeMap, path::{Path, PathBuf}};

const LIMIT: u64 = 64 * 1024;

#[derive(Serialize, Deserialize)]
struct Receipt { created: bool, digest: String, owners: BTreeMap<String, Option<ManagedClaim>> }

pub struct BridgeRegistration<'a> {
    path: &'a Path,
    expected: &'a [u8],
    receipt_path: PathBuf,
    owner: u32,
    _lock: files::SetupLock,
}

fn matching(actual: &[u8], expected: &[u8]) -> bool {
    fn contents(bytes: &[u8]) -> Option<serde_json::Map<String, Value>> {
        let mut manifest: serde_json::Map<String, Value> = serde_json::from_slice(bytes).ok()?;
        if !manifest.remove("description")?.as_str().is_some_and(|text| !text.trim().is_empty()) {
            return None;
        }
        Some(manifest)
    }
    contents(actual).zip(contents(expected)).is_some_and(|(left, right)| left == right)
}

fn digest(bytes: &[u8]) -> String { format!("{:x}", Sha256::digest(bytes)) }

impl<'a> BridgeRegistration<'a> {
    pub fn open(path: &'a Path, expected: &'a [u8]) -> Result<Self, SetupError> {
        let registration = Self::locked(path, expected)?;
        if files::read(path, registration.owner, LIMIT)?.is_some_and(|actual| !matching(&actual, expected)) {
            return Err(SetupError::Conflict);
        }
        Ok(registration)
    }

    fn locked(path: &'a Path, expected: &'a [u8]) -> Result<Self, SetupError> {
        let owner = files::current_uid();
        let parent = path.parent().ok_or(SetupError::Conflict)?;
        files::checked_dir(parent, owner, true)?;
        let lock = files::lock(&parent.join(".focus-local-bridge.lock"), owner, 0o600)?;
        Ok(Self { path, expected, receipt_path: parent.join(".focus-local-bridge.json"), owner, _lock: lock })
    }

    fn owners(path: &Path) -> Result<BTreeMap<String, Option<ManagedClaim>>, SetupError> {
        let owner = files::current_uid();
        let parent = path.parent().ok_or(SetupError::Conflict)?;
        match std::fs::symlink_metadata(parent) {
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(BTreeMap::new()),
            Err(error) => return Err(error.into()),
            Ok(_) => files::checked_dir(parent, owner, false)?,
        }
        Ok(read_receipt(&parent.join(".focus-local-bridge.json"), owner)?
            .map_or_else(BTreeMap::new, |(_, receipt)| receipt.owners))
    }

    pub fn managed_claims(path: &Path) -> Result<impl Iterator<Item = (String, ManagedClaim)>, SetupError> {
        Ok(Self::owners(path)?.into_iter().filter_map(|(id, claim)| claim.map(|claim| (id, claim))))
    }

    pub fn owned(path: &Path, id: &str) -> Result<bool, SetupError> {
        Ok(Self::owners(path)?.contains_key(id))
    }

    pub fn finish_cleanup(path: &Path, id: &str) -> Result<(), SetupError> {
        if !Self::owned(path, id)? { return Ok(()); }
        BridgeRegistration::locked(path, &[])?.release(id)
    }

    pub fn during(
        &mut self, id: &str, claim: Option<ManagedClaim>, run: impl FnOnce() -> Result<Outcome, SetupError>,
    ) -> Result<Outcome, SetupError> {
        let actual = files::read(self.path, self.owner, LIMIT)?;
        if actual.as_deref().is_some_and(|value| !matching(value, self.expected)) { return Err(SetupError::Conflict); }
        let previous = read_receipt(&self.receipt_path, self.owner)?;
        let expected_digest = digest(self.expected);
        let (old, mut receipt) = match previous {
            Some((bytes, receipt)) if receipt.digest == expected_digest => (Some(bytes), receipt),
            Some(_) => return Err(SetupError::Conflict),
            None => (None, Receipt { created: actual.is_none(), digest: expected_digest, owners: BTreeMap::new() }),
        };
        if receipt.created && actual.as_deref().is_some_and(|value| value != self.expected) { return Err(SetupError::Conflict); }
        if !receipt.created && actual.is_none() { return Err(SetupError::Conflict); }
        let added = !receipt.owners.contains_key(id);
        if added {
            receipt.owners.insert(id.to_owned(), claim);
            let new = serde_json::to_vec(&receipt).map_err(|_| SetupError::Io)?;
            files::replace(&self.receipt_path, self.owner, old.as_deref(), Some(&new), 0o600)?;
        }
        if actual.is_none() {
            if let Err(error) = files::replace(self.path, self.owner, None, Some(self.expected), 0o644) {
                if error == SetupError::RollbackFailed { return Err(error); }
                // A competing writer may have created the path; never remove that file.
                if added { self.release_inner(id, false).map_err(|_| SetupError::RollbackFailed)?; }
                return Err(error);
            }
        }
        let result = run();
        if matches!(result, Ok(Outcome::Cancelled)) || result.is_err_and(|e| e != SetupError::RollbackFailed) {
            if actual.is_none() {
                files::replace(self.path, self.owner, Some(self.expected), None, 0o644)
                    .map_err(|_| SetupError::RollbackFailed)?;
            }
            if added {
                self.release_inner(id, false).map_err(|_| SetupError::RollbackFailed)?;
            }
        }
        result
    }

    pub fn release(&mut self, id: &str) -> Result<(), SetupError> { self.release_inner(id, true) }

    fn release_inner(&mut self, id: &str, remove_manifest: bool) -> Result<(), SetupError> {
        let Some((bytes, mut receipt)) = read_receipt(&self.receipt_path, self.owner)? else { return Ok(()); };
        if receipt.owners.remove(id).is_none() { return Ok(()); }
        if receipt.owners.is_empty() {
            if receipt.created && remove_manifest {
                if let Some(actual) = files::read(self.path, self.owner, LIMIT)? {
                    if digest(&actual) == receipt.digest {
                        files::replace(self.path, self.owner, Some(&actual), None, 0o644)?;
                    }
                }
            }
            files::replace(&self.receipt_path, self.owner, Some(&bytes), None, 0o600)
        } else {
            let new = serde_json::to_vec(&receipt).map_err(|_| SetupError::Io)?;
            files::replace(&self.receipt_path, self.owner, Some(&bytes), Some(&new), 0o600)
        }
    }
}

fn read_receipt(path: &Path, owner: u32) -> Result<Option<(Vec<u8>, Receipt)>, SetupError> {
    files::read(path, owner, LIMIT)?.map(|bytes| {
        let receipt = serde_json::from_slice(&bytes).map_err(|_| SetupError::Conflict)?;
        Ok((bytes, receipt))
    }).transpose()
}
