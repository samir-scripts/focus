use crate::{db::{Db, Error, Result}, model::{self, Browser}};
use serde::{de::DeserializeOwned, Deserialize};
use serde_json::{json, Value};
use std::io::{self, Read, Write};
use uuid::Uuid;

pub const VERSION: u16 = 4;
pub const MAX_BYTES: usize = 64 * 1024;
const MAX_REVISION: u64 = 9_007_199_254_740_991;

pub fn read_frame(reader: &mut impl Read, buffer: &mut Vec<u8>) -> io::Result<bool> {
    let mut size = [0; 4];
    if reader.read(&mut size[..1])? == 0 { return Ok(false); }
    reader.read_exact(&mut size[1..])?;
    let size = u32::from_ne_bytes(size) as usize;
    if size == 0 || size > MAX_BYTES { return Err(io::ErrorKind::InvalidData.into()); }
    buffer.resize(size, 0);
    reader.read_exact(buffer)?;
    Ok(true)
}

pub fn write_frame(writer: &mut impl Write, response: &Value) -> io::Result<()> {
    let bytes = serde_json::to_vec(response)?;
    if bytes.len() > MAX_BYTES { return Err(io::ErrorKind::InvalidData.into()); }
    writer.write_all(&(bytes.len() as u32).to_ne_bytes())?;
    writer.write_all(&bytes)?;
    writer.flush()
}

pub fn valid_profile(id: &str) -> bool {
    id.len() == 36 && Uuid::parse_str(id).is_ok_and(|uuid| {
        uuid.get_version() == Some(uuid::Version::Random) && uuid.get_variant() == uuid::Variant::RFC4122 &&
        uuid.hyphenated().encode_lower(&mut Uuid::encode_buffer()) == id
    })
}

pub fn profile_label(label: &str) -> Result<&str> {
    let label = label.trim();
    if label.is_empty() || label.len() > 192 || label.chars().count() > 48 || label.chars().any(|c| {
        c.is_control() || matches!(c, '\u{061C}' | '\u{200B}'..='\u{200F}' | '\u{2028}'..='\u{202E}' | '\u{2060}'..='\u{206F}' | '\u{FEFF}')
    }) { return Err(Error::Invalid); }
    Ok(label)
}

fn token_ok(token: &str) -> bool {
    token.len() == 64 && token.bytes().all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Request { v: u16, id: String, op: String, body: Value }

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Pair { profile_id: String, browser: Browser, label: String, token: String }

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Hello { profile_id: String, token: String }

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Snapshot { after_revision: Option<u64> }

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Applied { revision: u64, origins: Vec<String> }

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Open { site_id: Option<String> }

pub struct Session {
    gecko: bool,
    session: String,
    profile: Option<String>,
    revision: u64,
    negotiated: Option<u16>,
}

impl Session {
    pub fn new(gecko: bool) -> Self {
        Self { gecko, session: Uuid::new_v4().to_string(), profile: None, revision: 0, negotiated: None }
    }

    pub fn message(&mut self, bytes: &[u8], db: &mut Result<Db>, open: impl FnOnce() -> Result<()>) -> Value {
        let input = serde_json::from_slice::<Value>(bytes).unwrap_or(Value::Null);
        let id = input.get("id").and_then(Value::as_str).filter(|id| {
            (1..=64).contains(&id.len()) && id.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
        }).unwrap_or_default();
        let version = input.get("v").and_then(Value::as_u64);
        if version.is_some_and(|v| !(1..=u64::from(VERSION)).contains(&v)) {
            return failure(1, id, "version_mismatch");
        }
        let version = version.and_then(|v| u16::try_from(v).ok()).unwrap_or(1);
        if id.is_empty() { return failure(version, id, Error::Invalid.code()); }
        let Ok(request) = Request::deserialize(&input) else { return failure(version, id, Error::Invalid.code()); };
        if !request.body.is_object() { return failure(version, &request.id, Error::Invalid.code()); }
        if self.negotiated.is_some_and(|v| v != request.v) { return failure(version, id, "version_mismatch"); }
        let result = match db {
            Ok(db) => self.dispatch(db, &request, open),
            Err(code) => Err(*code),
        };
        match result {
            Ok(body) => json!({"v":version,"id":request.id,"ok":true,"body":body}),
            Err(error) => failure(version, &request.id, error.code()),
        }
    }

    fn dispatch(&mut self, db: &mut Db, req: &Request, open: impl FnOnce() -> Result<()>) -> Result<Value> {
        let body = &req.body;
        match req.op.as_str() {
            "pair_begin" => {
                let Pair { profile_id, browser, label, token } = decode(body)?;
                if self.profile.is_some() || !valid_profile(&profile_id) || !token_ok(&token) || browser.is_gecko() != self.gecko {
                    return Err(Error::Unauthorized);
                }
                db.begin_pair(&profile_id, browser, profile_label(&label)?, &token)?;
                open()?;
                Ok(json!({}))
            }
            "hello" => {
                let Hello { profile_id, token } = decode(body)?;
                if !valid_profile(&profile_id) || !token_ok(&token) || self.profile.as_ref().is_some_and(|id| *id != profile_id) {
                    return Err(Error::Unauthorized);
                }
                let revision = db.hello(&profile_id, self.gecko, &token, &self.session, req.v)?;
                self.revision = revision;
                self.profile = Some(profile_id);
                self.negotiated = Some(req.v);
                Ok(json!({"revision":revision}))
            }
            "snapshot" => {
                let profile = self.profile.as_deref().ok_or(Error::Unauthorized)?;
                db.check_session(profile, &self.session)?;
                let Snapshot { after_revision } = decode(body)?;
                if body.get("afterRevision").is_none() || after_revision.is_some_and(|r| r > MAX_REVISION) { return Err(Error::Invalid); }
                if req.v >= 2 {
                    let (revision, snapshot) = db.snapshot(after_revision, req.v)?;
                    return Ok(match snapshot {
                        Some((sites, accessibility)) if req.v >= 3 => json!({"revision":revision,"sites":sites,"accessibility":accessibility}),
                        Some((sites, _)) => json!({"revision":revision,"sites":sites}),
                        None => json!({"revision":revision}),
                    });
                }
                let (revision, enabled) = db.legacy_policy()?;
                if after_revision == Some(revision) { Ok(json!({"revision":revision})) }
                else { Ok(json!({"revision":revision,"sites":[{"id":model::YOUTUBE,"rules":{(model::HIDE_SHORTS):enabled}}]})) }
            }
            "applied" => {
                let profile = self.profile.as_deref().ok_or(Error::Unauthorized)?;
                let Applied { revision, mut origins } = decode(body)?;
                if revision > MAX_REVISION || origins.len() > 160 || origins.iter().any(|origin| origin.len() > 264) {
                    return Err(Error::Invalid);
                }
                origins.sort_unstable();
                origins.dedup();
                db.applied(profile, &self.session, revision, &origins)?;
                Ok(json!({}))
            }
            "open_desktop" => {
                let profile = self.profile.as_deref().ok_or(Error::Unauthorized)?;
                let Open { site_id } = decode(body)?;
                if body.get("siteId").is_none() { return Err(Error::Invalid); }
                db.request_open(profile, &self.session, site_id.as_deref())?;
                open()?;
                Ok(json!({}))
            }
            _ => Err(Error::Invalid),
        }
    }

    pub fn tick(&mut self, db: &mut Db) -> Result<Option<Value>> {
        let Some(profile) = self.profile.as_deref() else { return Ok(None); };
        let version = self.negotiated.unwrap_or(1);
        match db.heartbeat(profile, &self.session) {
            Ok(revision) if self.revision != revision => {
                self.revision = revision;
                Ok(Some(json!({"v":version,"event":"revision","revision":revision})))
            }
            Ok(_) => Ok(None),
            Err(Error::Unpaired) => {
                self.profile = None;
                Ok(Some(json!({"v":version,"event":"revoked"})))
            }
            Err(error) => Err(error),
        }
    }

    pub fn close(&self, db: &mut Db) {
        if let Some(profile) = self.profile.as_deref() { let _ = db.close_session(profile, &self.session); }
    }
}

fn failure(version: u16, id: &str, code: &str) -> Value { json!({"v":version,"id":id,"ok":false,"error":{"code":code}}) }
fn decode<T: DeserializeOwned>(body: &Value) -> Result<T> { T::deserialize(body).map_err(|_| Error::Invalid) }
