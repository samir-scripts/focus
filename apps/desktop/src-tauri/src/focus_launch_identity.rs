//! macOS peer identity for Grace launch protocol v1. Mirrored in focus.
use std::ffi::{c_void, OsStr};
use std::io;
use std::os::fd::{AsRawFd, RawFd};
use std::os::unix::{ffi::OsStrExt, fs::MetadataExt};
use std::path::{Path, PathBuf};
use std::ptr::{null, null_mut, NonNull};

use objc2_foundation::{NSData, NSString, NSURL};

#[link(name = "Security", kind = "framework")]
extern "C" {
    static kSecGuestAttributeAudit: *const c_void;
    fn SecCodeCopyGuestWithAttributes(host: *const c_void, attributes: *const c_void, flags: u32, result: *mut *mut c_void) -> i32;
    fn SecCodeCheckValidity(code: *mut c_void, flags: u32, requirement: *mut c_void) -> i32;
    fn SecStaticCodeCreateWithPath(path: *const c_void, flags: u32, result: *mut *mut c_void) -> i32;
    fn SecStaticCodeCheckValidity(code: *mut c_void, flags: u32, requirement: *mut c_void) -> i32;
    fn SecRequirementCreateWithString(text: *const c_void, flags: u32, result: *mut *mut c_void) -> i32;
}

#[link(name = "CoreFoundation", kind = "framework")]
extern "C" {
    fn CFDictionaryCreate(allocator: *const c_void, keys: *const *const c_void, values: *const *const c_void,
        count: isize, key_callbacks: *const c_void, value_callbacks: *const c_void) -> *const c_void;
    fn CFRelease(object: *const c_void);
}

struct Owned(NonNull<c_void>);
impl Owned {
    fn create(call: impl FnOnce(*mut *mut c_void) -> i32) -> Option<Self> {
        let mut raw = null_mut();
        (call(&mut raw) == 0).then(|| Self::from_raw(raw)).flatten()
    }
    fn from_raw(raw: *mut c_void) -> Option<Self> { NonNull::new(raw).map(Self) }
    fn ptr(&self) -> *mut c_void { self.0.as_ptr() }
}
impl Drop for Owned {
    fn drop(&mut self) {
        // SAFETY: Only retained Create/Copy results are wrapped.
        unsafe { CFRelease(self.ptr()); }
    }
}

pub(super) fn requirement(id: &str, team: Option<&str>) -> Option<String> {
    if let Some(team) = team {
        if team.len() != 10 || !team.bytes().all(|byte| byte.is_ascii_uppercase() || byte.is_ascii_digit()) {
            return None;
        }
        return Some(format!("identifier \"{id}\" and anchor apple generic and certificate leaf[subject.OU] = \"{team}\""));
    }
    // Explicitly enabled only for debug builds tested as ad-hoc bundles in a disposable user session.
    if cfg!(debug_assertions) && option_env!("FOCUS_GRACE_ADHOC_FIXTURE") == Some("1") {
        return Some(format!("identifier \"{id}\""));
    }
    None
}

fn code_requirement(text: &str) -> Option<Owned> {
    let text = NSString::from_str(text);
    // SAFETY: NSString is toll-free bridged with CFString; the function retains its returned object.
    Owned::create(|out| unsafe { SecRequirementCreateWithString(std::ptr::from_ref(&*text).cast(), 0, out) })
}

#[allow(dead_code)] // Static check is used by the client before opening the bundle.
pub(super) fn verify_bundle(url: &NSURL, text: &str) -> bool {
    let Some(required) = code_requirement(text) else { return false; };
    // SAFETY: NSURL is toll-free bridged with CFURL. Inputs outlive the call.
    let code = Owned::create(|out| unsafe { SecStaticCodeCreateWithPath(std::ptr::from_ref(url).cast(), 0, out) });
    code.is_some_and(|code| unsafe { SecStaticCodeCheckValidity(code.ptr(), 0, required.ptr()) == 0 })
}

pub(super) fn verify_peer(socket: &impl AsRawFd, text: &str, expected_pid: Option<libc::pid_t>) -> bool {
    objc2::rc::autoreleasepool(|_| verify_peer_fd(socket.as_raw_fd(), text, expected_pid).unwrap_or(false))
}

fn verify_peer_fd(fd: RawFd, text: &str, expected_pid: Option<libc::pid_t>) -> Option<bool> {
    let mut uid = 0;
    let mut gid = 0;
    // SAFETY: Live socket and valid writable outputs of the required types.
    if unsafe { libc::getpeereid(fd, &mut uid, &mut gid) } != 0 || uid != unsafe { libc::geteuid() } {
        return None;
    }
    if let Some(expected_pid) = expected_pid {
        let mut pid: libc::pid_t = 0;
        let mut length = size_of_val(&pid) as libc::socklen_t;
        // SAFETY: pid and length are writable; length is exactly the size of pid.
        if unsafe { libc::getsockopt(fd, libc::SOL_LOCAL, libc::LOCAL_PEERPID, std::ptr::from_mut(&mut pid).cast(), &mut length) } != 0
            || length as usize != size_of_val(&pid) || pid != expected_pid
        {
            return None;
        }
    }
    let mut token = [0_u8; 32]; // Darwin audit_token_t: eight 32-bit words.
    let mut length = token.len() as libc::socklen_t;
    // SAFETY: token and length are writable and length describes the complete token buffer.
    if unsafe { libc::getsockopt(fd, libc::SOL_LOCAL, libc::LOCAL_PEERTOKEN, token.as_mut_ptr().cast(), &mut length) } != 0
        || length as usize != token.len()
    {
        return None;
    }
    let data = NSData::with_bytes(&token);
    let required = code_requirement(text)?;
    // SAFETY: The system constant and bridged NSData remain live until the dictionary is released.
    // No callbacks are needed: its sole key is the identical Security framework constant.
    unsafe {
        let key = kSecGuestAttributeAudit;
        let value = std::ptr::from_ref(&*data).cast();
        let attributes = Owned::from_raw(CFDictionaryCreate(null(), &key, &value, 1, null(), null()).cast_mut())?;
        let code = Owned::create(|out| SecCodeCopyGuestWithAttributes(null(), attributes.ptr(), 0, out))?;
        Some(SecCodeCheckValidity(code.ptr(), 0, required.ptr()) == 0)
    }
}

pub(super) fn socket_path(pid: u32) -> io::Result<PathBuf> {
    let mut buffer = [0_u8; 256];
    // SAFETY: confstr writes no more than buffer.len() bytes into the supplied buffer.
    let len = unsafe { libc::confstr(libc::_CS_DARWIN_USER_TEMP_DIR, buffer.as_mut_ptr().cast(), buffer.len()) };
    if len <= 1 || len > buffer.len() { return Err(io::Error::other("missing private macOS temporary directory")); }
    let directory = Path::new(OsStr::from_bytes(&buffer[..len - 1]));
    let info = directory.metadata()?;
    if !directory.is_absolute() || !info.is_dir() || info.uid() != unsafe { libc::geteuid() } || info.mode() & 0o077 != 0 {
        return Err(io::Error::other("unsafe macOS temporary directory"));
    }
    Ok(directory.join(format!("grace-f-{pid}.sock")))
}
