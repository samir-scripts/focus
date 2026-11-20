use crate::model::{self, Browser, DesktopState, OpenIntent, PairLabel, ProfileStatus};
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior::Immediate};
use sha2::{Digest, Sha256};
use std::{fs, path::Path, time::Duration};
use subtle::ConstantTimeEq;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Error {
    Database, Invalid, Unauthorized, Pending, Denied, Unpaired, Stale, PairLimit, OpenFailed,
}

impl Error {
    pub fn code(self) -> &'static str {
        match self {
            Self::Database => "database_unavailable", Self::Invalid => "invalid_request",
            Self::Unauthorized => "unauthorized", Self::Pending => "pair_pending", Self::Denied => "pair_denied",
            Self::Unpaired => "unpaired", Self::Stale => "stale_revision",
            Self::PairLimit => "pair_limit", Self::OpenFailed => "desktop_unavailable",
        }
    }
}

impl From<rusqlite::Error> for Error { fn from(_: rusqlite::Error) -> Self { Self::Database } }
impl From<std::io::Error> for Error { fn from(_: std::io::Error) -> Self { Self::Database } }
pub type Result<T, E = Error> = std::result::Result<T, E>;

pub struct Db(Connection);

impl Db {
    pub fn open_default() -> Result<Self> { Self::open(&model::data_path()?) }

    pub fn open(path: &Path) -> Result<Self> {
        fs::create_dir_all(path.parent().ok_or(Error::Database)?)?;
        let mut db = Connection::open(path)?;
        db.busy_timeout(Duration::from_secs(3))?;
        db.pragma_update(None, "foreign_keys", "ON")?;
        // This is a no-op once the WAL mode has been established for the file.
        db.pragma_update(None, "journal_mode", "WAL")?;
        let version = |db: &Connection| db.pragma_query_value(None, "user_version", |row| row.get::<_, u32>(0));
        if version(&db)? == 0 {
            let tx = db.transaction_with_behavior(Immediate)?;
            if version(&tx)? == 0 {
                let has_tables: bool = tx.query_row("SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table')", [], |r| r.get(0))?;
                if has_tables {
                    // Reserve the write lock before backing up from a separate read connection.
                    let backup = path.with_extension("sqlite3.pre-v1");
                    if !backup.exists() {
                        let source = Connection::open_with_flags(path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)?;
                        source.backup(rusqlite::MAIN_DB, &backup, None)?;
                    }
                }
                tx.execute_batch(include_str!("../migrations/001.sql"))?;
                for site in model::SITES.iter() {
                    tx.execute("INSERT INTO site VALUES (?1, ?2)", params![site.id, site.label])?;
                    for host in &site.hosts {
                        tx.execute("INSERT INTO site_origin VALUES (?1, ?2)", params![site.id, host])?;
                    }
                    tx.execute("INSERT INTO site_policy(site_id) VALUES (?1)", [site.id])?;
                }
                tx.execute("INSERT INTO site_rule VALUES (?1, ?2, 0)", params![model::YOUTUBE, model::HIDE_SHORTS])?;
                tx.pragma_update(None, "user_version", 1)?;
            }
            tx.commit()?;
        }
        if version(&db)? != 1 { return Err(Error::Database); }
        Ok(Self(db))
    }

    pub fn policy(&self) -> Result<(u64, bool)> { policy(&self.0) }

    pub fn begin_pair(&mut self, id: &str, browser: Browser, label: &str, token: &str) -> Result<bool> {
        let tx = self.0.transaction_with_behavior(Immediate)?;
        let now = model::now();
        tx.execute("DELETE FROM pending_pair WHERE expires_at <= ?1", [now])?;
        if tx.query_row("SELECT 1 FROM profile WHERE id=?1", [id], |_| Ok(())).optional()?.is_some() {
            return Err(Error::Unauthorized);
        }
        let existing = tx.query_row("SELECT browser, label, token_hash, denied FROM pending_pair WHERE id=?1", [id], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, Vec<u8>>(2)?, r.get::<_, bool>(3)?))
        }).optional()?;
        if let Some((kind, previous_label, hash, denied)) = existing {
            verify_token(&hash, token)?;
            if kind != browser.as_str() || previous_label != label { return Err(Error::Unauthorized); }
            return if denied { Err(Error::Denied) } else { Ok(false) };
        }
        let count: u32 = tx.query_row("SELECT count(*) FROM pending_pair WHERE denied=0", [], |r| r.get(0))?;
        if count >= 16 { return Err(Error::PairLimit); }
        let hash = Sha256::digest(token);
        tx.execute("INSERT INTO pending_pair(id,browser,label,token_hash,expires_at) VALUES(?1,?2,?3,?4,?5)",
            params![id, browser.as_str(), label, hash.as_slice(), now + model::PAIR_SECONDS])?;
        tx.commit()?;
        Ok(true)
    }

    pub fn decide_pair(&mut self, id: &str, approve: bool, label: Option<&str>) -> Result<()> {
        let tx = self.0.transaction_with_behavior(Immediate)?;
        let now = model::now();
        let changed = if approve {
            tx.execute("INSERT INTO profile(id,label,browser,token_hash)
                SELECT id,COALESCE(?3,label),browser,token_hash FROM pending_pair WHERE id=?1 AND expires_at>?2 AND denied=0",
                params![id, now, label])?
        } else {
            tx.execute("UPDATE pending_pair SET denied=1 WHERE id=?1 AND expires_at>?2 AND denied=0", params![id, now])?
        };
        if changed == 0 { return Err(Error::Invalid); }
        if approve { tx.execute("DELETE FROM pending_pair WHERE id=?1", [id])?; }
        tx.commit()?;
        Ok(())
    }

    pub fn hello(&mut self, id: &str, gecko: bool, token: &str, session: &str) -> Result<u64> {
        let tx = self.0.transaction_with_behavior(Immediate)?;
        let now = model::now();
        let found = tx.query_row("SELECT token_hash, revoked, browser IN ('firefox','zen') FROM profile WHERE id=?1", [id], |r| {
            Ok((r.get::<_, Vec<u8>>(0)?, r.get::<_, bool>(1)?, r.get::<_, bool>(2)?))
        }).optional()?;
        let Some((hash, revoked, is_gecko)) = found else {
            let pending = tx.query_row("SELECT token_hash, denied, browser IN ('firefox','zen') FROM pending_pair WHERE id=?1 AND expires_at>?2",
                params![id, now], |r| Ok((r.get::<_, Vec<u8>>(0)?, r.get::<_, bool>(1)?, r.get::<_, bool>(2)?))).optional()?;
            if let Some((hash, denied, is_gecko)) = pending {
                verify_token(&hash, token)?;
                if gecko != is_gecko { return Err(Error::Unauthorized); }
                return Err(if denied { Error::Denied } else { Error::Pending });
            }
            return Err(Error::Unauthorized);
        };
        verify_token(&hash, token)?;
        if gecko != is_gecko { return Err(Error::Unauthorized); }
        if revoked { return Err(Error::Unpaired); }
        tx.execute("INSERT INTO profile_runtime(profile_id,session_id,expires_at) VALUES (?1,?2,?3)
            ON CONFLICT(profile_id) DO UPDATE SET session_id=excluded.session_id, expires_at=excluded.expires_at,
            ack_revision=NULL, origins='[]' WHERE session_id<>excluded.session_id",
            params![id, session, now + model::LEASE_SECONDS])?;
        let revision = policy(&tx)?.0;
        tx.commit()?;
        Ok(revision)
    }

    pub fn check_session(&self, id: &str, session: &str) -> Result<()> { check_session(&self.0, id, session) }

    pub fn heartbeat(&mut self, id: &str, session: &str) -> Result<u64> {
        let tx = self.0.transaction_with_behavior(Immediate)?;
        check_session(&tx, id, session)?;
        tx.execute("UPDATE profile_runtime SET expires_at=?3 WHERE profile_id=?1 AND session_id=?2",
            params![id, session, model::now() + model::LEASE_SECONDS])?;
        let revision = policy(&tx)?.0;
        tx.commit()?;
        Ok(revision)
    }

    pub fn close_session(&mut self, id: &str, session: &str) -> Result<()> {
        let tx = self.0.transaction_with_behavior(Immediate)?;
        tx.execute("DELETE FROM profile_runtime WHERE profile_id=?1 AND session_id=?2", params![id, session])?;
        tx.commit()?;
        Ok(())
    }

    pub fn applied(&mut self, id: &str, session: &str, revision: u64, origins: &[String]) -> Result<()> {
        let tx = self.0.transaction_with_behavior(Immediate)?;
        check_session(&tx, id, session)?;
        if policy(&tx)?.0 != revision { return Err(Error::Stale); }
        let origins = serde_json::to_string(origins).map_err(|_| Error::Invalid)?;
        tx.execute("UPDATE profile_runtime SET ack_revision=?3, origins=?4 WHERE profile_id=?1 AND session_id=?2",
            params![id, session, revision, origins])?;
        tx.commit()?;
        Ok(())
    }

    pub fn set_hide_shorts(&mut self, expected_revision: u64, enabled: bool) -> Result<()> {
        let tx = self.0.transaction_with_behavior(Immediate)?;
        let (revision, current) = policy(&tx)?;
        if expected_revision != revision { return Err(Error::Stale); }
        if current == enabled { return Ok(()); }
        tx.execute("UPDATE meta SET revision=revision+1 WHERE singleton=1", [])?;
        tx.execute("UPDATE site_policy SET revision=?2 WHERE site_id=?1", params![model::YOUTUBE, revision + 1])?;
        tx.execute("UPDATE site_rule SET enabled=?2 WHERE site_id=?1 AND rule_id=?3", params![model::YOUTUBE, enabled, model::HIDE_SHORTS])?;
        tx.commit()?;
        Ok(())
    }

    pub fn revoke(&mut self, id: &str) -> Result<()> {
        let tx = self.0.transaction_with_behavior(Immediate)?;
        tx.execute("UPDATE profile SET revoked=1 WHERE id=?1", [id])?;
        tx.execute("DELETE FROM profile_runtime WHERE profile_id=?1", [id])?;
        tx.commit()?;
        Ok(())
    }

    pub fn state(&self) -> Result<DesktopState> {
        let tx = self.0.unchecked_transaction()?;
        let now = model::now();
        let (revision, hide_shorts) = policy(&tx)?;
        let pending = {
            let mut q = tx.prepare("SELECT id,label,browser FROM pending_pair WHERE expires_at>?1 AND denied=0 ORDER BY rowid")?;
            let rows = q.query_map([now], |r| Ok(PairLabel { id: r.get(0)?, label: r.get(1)?, browser: r.get(2)? }))?;
            rows.collect::<rusqlite::Result<Vec<_>>>()?
        };
        let profiles = {
            let mut q = tx.prepare("SELECT p.id,p.label,p.browser,r.session_id IS NOT NULL,r.ack_revision,r.origins
                FROM profile p LEFT JOIN profile_runtime r ON r.profile_id=p.id AND r.expires_at>?1
                WHERE NOT p.revoked ORDER BY p.rowid")?;
            let rows = q.query_map([now], |r| Ok(ProfileStatus {
                id: r.get(0)?, label: r.get(1)?, browser: r.get(2)?, online: r.get(3)?, ack_revision: r.get(4)?,
                origins: r.get::<_, Option<String>>(5)?.map(|value| serde_json::from_str(&value)).transpose()
                    .map_err(|err| rusqlite::Error::FromSqlConversionFailure(5, rusqlite::types::Type::Text, Box::new(err)))?.unwrap_or_default(),
            }))?;
            rows.collect::<rusqlite::Result<Vec<_>>>()?
        };
        tx.commit()?;
        Ok(DesktopState { revision, hide_shorts, pending, profiles })
    }

    pub fn request_open(&mut self, id: &str, session: &str, site_id: Option<&str>) -> Result<()> {
        let tx = self.0.transaction_with_behavior(Immediate)?;
        check_session(&tx, id, session)?;
        tx.execute("INSERT OR REPLACE INTO open_intent VALUES(1,?1,?2)", params![site_id, model::now() + 20])?;
        tx.commit()?;
        Ok(())
    }

    pub fn take_open(&mut self) -> Result<Option<OpenIntent>> {
        if !self.0.query_row("SELECT EXISTS(SELECT 1 FROM open_intent)", [], |r| r.get::<_,bool>(0))? { return Ok(None); }
        let tx = self.0.transaction_with_behavior(Immediate)?;
        let result = tx.query_row("DELETE FROM open_intent RETURNING site_id, expires_at", [], |r| {
            Ok((OpenIntent { site_id: r.get(0)? }, r.get::<_, u64>(1)?))
        }).optional()?;
        tx.commit()?;
        Ok(result.filter(|(_, expires)| *expires > model::now()).map(|(intent, _)| intent))
    }
}

fn policy(conn: &Connection) -> Result<(u64, bool)> {
    Ok(conn.query_row("SELECT revision,enabled FROM meta CROSS JOIN site_rule WHERE site_id=?1 AND rule_id=?2",
        params![model::YOUTUBE,model::HIDE_SHORTS], |r| Ok((r.get(0)?,r.get(1)?)))?)
}

fn check_session(conn: &Connection, id: &str, session: &str) -> Result<()> {
    let (revoked, active): (bool, bool) = conn.query_row("SELECT p.revoked,
         EXISTS(SELECT 1 FROM profile_runtime r WHERE r.profile_id=p.id AND r.session_id=?2)
         FROM profile p WHERE id=?1", params![id, session], |r| Ok((r.get(0)?, r.get(1)?)))?;
    if revoked { Err(Error::Unpaired) } else if !active { Err(Error::Unauthorized) } else { Ok(()) }
}

fn verify_token(hash: &[u8], token: &str) -> Result<()> {
    if bool::from(hash.ct_eq(Sha256::digest(token).as_slice())) { Ok(()) } else { Err(Error::Unauthorized) }
}
