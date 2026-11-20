use super::types::SetupError;
use std::{fs::{self, File, OpenOptions}, io::{Read, Write}, os::unix::fs::{DirBuilderExt, MetadataExt, OpenOptionsExt, PermissionsExt}, path::{Path, PathBuf}};

pub fn checked_dir(path: &Path, owner: u32, create: bool) -> Result<(), SetupError> {
    directory(path, owner, create, false)
}

#[cfg(target_os = "linux")]
pub fn protected_directory(path: &Path) -> Result<(), SetupError> { directory(path, 0, false, true) }

fn directory(path: &Path, owner: u32, create: bool, protected: bool) -> Result<(), SetupError> {
    use std::path::Component::{Normal, RootDir};
    let mut next = PathBuf::new();
    for part in path.components() {
        match part {
            RootDir => next.push("/"),
            Normal(name) if next.is_absolute() => next.push(name),
            _ => return Err(SetupError::Conflict),
        }
        if create && !next.exists() {
            let result = fs::DirBuilder::new().mode(0o755).create(&next);
            if let Err(e) = result {
                if e.kind() != std::io::ErrorKind::AlreadyExists { return Err(e.into()); }
            }
        }
        let m = fs::symlink_metadata(&next)?;
        let unsafe_write = m.mode() & 0o022 != 0 && (protected || m.mode() & 0o1000 == 0);
        if !m.is_dir() || (m.uid() != 0 && m.uid() != owner) || unsafe_write {
            return Err(SetupError::Conflict);
        }
    }
    if !next.is_absolute() { return Err(SetupError::Conflict); }
    Ok(())
}

pub fn current_uid() -> u32 { unsafe { libc::geteuid() } }

fn checked_file(meta: &fs::Metadata, owner: u32) -> Result<(), SetupError> {
    if !meta.is_file() || meta.nlink() != 1 || meta.uid() != owner || meta.mode() & 0o022 != 0 {
        return Err(SetupError::Conflict);
    }
    Ok(())
}

#[cfg(target_os = "linux")]
pub fn protected_executable(path: &Path) -> bool {
    path.parent().is_some_and(|parent| protected_directory(parent).is_ok())
        && fs::symlink_metadata(path).is_ok_and(|m| checked_file(&m, 0).is_ok() && m.mode() & 0o111 != 0)
}

#[cfg(target_os = "linux")]
pub fn check_standard_policy_file(path: &Path) -> Result<(), SetupError> {
    use std::os::fd::AsRawFd;
    let file = OpenOptions::new().read(true).custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK).open(path)?;
    let meta = file.metadata()?;
    checked_file(&meta, 0)?;
    if meta.gid() != 0 || meta.mode() & 0o7777 != 0o644
        || unsafe { libc::flistxattr(file.as_raw_fd(), std::ptr::null_mut(), 0) } != 0
    {
        return Err(SetupError::Conflict);
    }
    Ok(())
}

pub fn read(path: &Path, owner: u32, limit: u64) -> Result<Option<Vec<u8>>, SetupError> {
    match fs::symlink_metadata(path) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(e.into()),
        Ok(m) => checked_file(&m, owner)?,
    }
    let file = OpenOptions::new().read(true).custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK).open(path)?;
    checked_file(&file.metadata()?, owner)?;
    let mut bytes = Vec::new();
    file.take(limit + 1).read_to_end(&mut bytes)?;
    if bytes.len() as u64 > limit { return Err(SetupError::Conflict); }
    Ok(Some(bytes))
}

pub fn lock(path: &Path, owner: u32, mode: u32) -> Result<File, SetupError> {
    let file = OpenOptions::new().read(true).write(true).create(true).truncate(false)
        .mode(mode).custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK).open(path)?;
    checked_file(&file.metadata()?, owner)?;
    file.try_lock().map_err(|_| SetupError::Busy)?;
    Ok(file)
}

pub fn replace(path: &Path, owner: u32, old: Option<&[u8]>, new: Option<&[u8]>, mode: u32) -> Result<(), SetupError> {
    let parent = path.parent().ok_or(SetupError::Conflict)?;
    checked_dir(parent, owner, false)?;
    if read(path, owner, old.map_or(0, |bytes| bytes.len()) as u64)?.as_deref() != old {
        return Err(SetupError::Conflict);
    }
    if let Some(new) = new {
        let mut temp = tempfile::NamedTempFile::new_in(parent)?;
        temp.as_file().set_permissions(fs::Permissions::from_mode(mode))?;
        temp.write_all(new)?;
        temp.as_file().sync_all()?;
        if let Some(old) = old {
            if read(path, owner, old.len() as u64)?.as_deref() != Some(old) { return Err(SetupError::Conflict); }
            temp.persist(path).map_err(|error| error.error)?;
        } else {
            temp.persist_noclobber(path).map_err(|error| error.error)?;
        }
    } else if old.is_some() {
        fs::remove_file(path)?;
    }
    File::open(parent).and_then(|file| file.sync_all()).map_err(|_| SetupError::RollbackFailed)?;
    Ok(())
}

pub fn user_path(path: PathBuf) -> PathBuf {
    // Darwin's documented temporary directory is often returned through /var.
    #[cfg(target_os = "macos")]
    if let Ok(tail) = path.strip_prefix("/var") { return Path::new("/private/var").join(tail); }
    path
}
