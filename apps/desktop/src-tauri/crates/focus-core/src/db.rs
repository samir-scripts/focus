use crate::model::{self, Accessibility, Browser, DesktopState, EntryPolicy, OpenIntent, PairLabel, ProfileStatus, SitePolicy};
use rusqlite::{params, types::ValueRef, Connection, ErrorCode, OptionalExtension, TransactionBehavior::Immediate};
use sha2::{Digest, Sha256};
use std::{fs, path::Path, thread, time::{Duration, Instant}};
use subtle::ConstantTimeEq;
use uuid::Uuid;

const BUSY_TIMEOUT: Duration = Duration::from_secs(3);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Error {
    Database, Invalid, Unauthorized, Pending, Denied, Unpaired, Stale, PairLimit, OpenFailed, VersionMismatch,
}

impl Error {
    pub fn code(self) -> &'static str {
        match self {
            Self::Database => "database_unavailable", Self::Invalid => "invalid_request",
            Self::Unauthorized => "unauthorized", Self::Pending => "pair_pending", Self::Denied => "pair_denied",
            Self::Unpaired => "unpaired", Self::Stale => "stale_revision",
            Self::PairLimit => "pair_limit", Self::OpenFailed => "desktop_unavailable",
            Self::VersionMismatch => "version_mismatch",
        }
    }
}

impl From<rusqlite::Error> for Error { fn from(_: rusqlite::Error) -> Self { Self::Database } }
impl From<std::io::Error> for Error { fn from(_: std::io::Error) -> Self { Self::Database } }
pub type Result<T, E = Error> = std::result::Result<T, E>;

pub struct Db(Connection, bool);

fn enable_wal(db: &Connection) -> Result<()> {
    // SQLite may skip its busy handler while changing the journal mode.
    let deadline = Instant::now() + BUSY_TIMEOUT;
    loop {
        db.busy_timeout(deadline.saturating_duration_since(Instant::now()))?;
        let mode = db.pragma_update_and_check(None, "journal_mode", "WAL", |row| {
            Ok(row.get_ref(0)? == ValueRef::Text(b"wal"))
        });
        match mode {
            Ok(true) => return Ok(()),
            Ok(false) => (),
            Err(rusqlite::Error::SqliteFailure(error, _))
                if matches!(error.code, ErrorCode::DatabaseBusy | ErrorCode::DatabaseLocked) => (),
            Err(error) => return Err(error.into()),
        }
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() { return Err(Error::Database); }
        thread::sleep(remaining.min(Duration::from_millis(25)));
    }
}

impl Db {
    pub fn open_default() -> Result<Self> {
        let path = model::data_path()?;
        #[cfg(debug_assertions)]
        if std::env::var_os("FOCUS_DATA_DIR").is_some()
            && std::env::var_os("FOCUS_FIXTURE_NO_DESKTOP").as_deref() == Some("1".as_ref())
            && std::env::var_os("FOCUS_FIXTURE_ENTRY").as_deref() == Some("1".as_ref())
        {
            return Self::open_entry_fixture(&path);
        }
        Self::open(&path)
    }

    // Normal builds cannot enable entry until packaged pre-load interception is
    // qualified. Disposable Linux verification still exercises the real path.
    #[cfg(debug_assertions)]
    pub fn open_entry_fixture(path: &Path) -> Result<Self> {
        let mut db = Self::open(path)?;
        db.1 = true;
        Ok(db)
    }

    pub fn open(path: &Path) -> Result<Self> {
        fs::create_dir_all(path.parent().ok_or(Error::Database)?)?;
        let mut db = Connection::open(path)?;
        enable_wal(&db)?;
        db.busy_timeout(BUSY_TIMEOUT)?;
        db.pragma_update(None, "foreign_keys", "ON")?;
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
        if version(&db)? == 1 {
            let tx = db.transaction_with_behavior(Immediate)?;
            if version(&tx)? == 1 {
                tx.execute_batch(include_str!("../migrations/002.sql"))?;
                tx.pragma_update(None, "user_version", 2)?;
            }
            tx.commit()?;
        }
        if version(&db)? == 2 {
            let tx = db.transaction_with_behavior(Immediate)?;
            if version(&tx)? == 2 {
                tx.execute_batch(include_str!("../migrations/003.sql"))?;
                tx.pragma_update(None, "user_version", 3)?;
            }
            tx.commit()?;
        }
        if version(&db)? == 3 {
            let tx = db.transaction_with_behavior(Immediate)?;
            if version(&tx)? == 3 {
                tx.execute_batch(include_str!("../migrations/004.sql"))?;
                tx.pragma_update(None, "user_version", 4)?;
            }
            tx.commit()?;
        }
        if version(&db)? != 4 { return Err(Error::Database); }
        Ok(Self(db, false))
    }

    pub fn policy(&self) -> Result<(u64, bool)> { policy(&self.0) }

    pub fn legacy_policy(&self) -> Result<(u64, bool)> {
        let tx = self.0.unchecked_transaction()?;
        if requires_update(&tx)? || requires_v3(&tx)? { return Err(Error::VersionMismatch); }
        policy(&tx)
    }

    pub fn snapshot(&self, after: Option<u64>, version: u16) -> Result<(u64, Option<(Vec<SitePolicy>, Accessibility)>)> {
        let tx = self.0.unchecked_transaction()?;
        if !self.1 && has_entry_policy(&tx)? { return Err(Error::VersionMismatch); }
        if version < 3 && requires_v3(&tx)? { return Err(Error::VersionMismatch); }
        let revision = policy(&tx)?.0;
        let snapshot = if after == Some(revision) { None } else { Some((site_policies(&tx)?, accessibility(&tx)?)) };
        Ok((revision, snapshot))
    }

    pub fn designate_site(&mut self, hostname: &str) -> Result<String> {
        let host = model::normalize_host(hostname).ok_or(Error::Invalid)?;
        let tx = self.0.transaction_with_behavior(Immediate)?;
        if let Some(id) = tx.query_row("SELECT site_id FROM site_origin WHERE hostname=?1", [&host], |row| row.get(0)).optional()? {
            return Ok(id);
        }
        // Bound snapshots, acknowledgement frames and browser rule counts.
        if tx.query_row("SELECT count(*) FROM site WHERE id LIKE 'custom:%'", [], |row| row.get::<_, u32>(0))? >= 48 {
            return Err(Error::Invalid);
        }
        let id = format!("custom:{host}");
        tx.execute("INSERT INTO site VALUES(?1,?2)", params![id, host])?;
        tx.execute("INSERT INTO site_origin VALUES(?1,?2)", params![id, host])?;
        tx.execute("INSERT INTO site_policy(site_id) VALUES(?1)", [&id])?;
        bump(&tx, &id)?;
        tx.commit()?;
        Ok(id)
    }

    pub fn set_grayscale(&mut self, revision: u64, site: &str, value: bool) -> Result<()> {
        self.edit_site(revision, site, "UPDATE site_policy SET grayscale=?2 WHERE site_id=?1 AND grayscale<>?2", value)
    }

    pub fn set_entry(&mut self, revision: u64, site: &str, value: EntryPolicy) -> Result<()> {
        if matches!(value, EntryPolicy::Pause { seconds, .. } if !(5..=600).contains(&seconds)) { return Err(Error::Invalid); }
        if !self.1 && value != EntryPolicy::Allow { return Err(Error::VersionMismatch); }
        self.edit_site(revision, site, "UPDATE site_policy SET entry=?2 WHERE site_id=?1 AND entry<>?2",
            serde_json::to_string(&value).map_err(|_| Error::Invalid)?)
    }

    pub fn set_accessibility(&mut self, revision: u64, value: Accessibility) -> Result<()> {
        if !(15..=600).contains(&value.hold_seconds) { return Err(Error::Invalid); }
        let tx = self.0.transaction_with_behavior(Immediate)?;
        if policy(&tx)?.0 != revision { return Err(Error::Stale); }
        if accessibility(&tx)? != value {
            tx.execute("UPDATE meta SET hold_seconds=?1, two_step_confirmation=?2, revision=revision+1 WHERE singleton=1",
                params![value.hold_seconds, value.two_step_confirmation])?;
        }
        tx.commit()?;
        Ok(())
    }

    fn edit_site(&mut self, revision: u64, site: &str, sql: &str, value: impl rusqlite::ToSql) -> Result<()> {
        let tx = self.0.transaction_with_behavior(Immediate)?;
        if policy(&tx)?.0 != revision { return Err(Error::Stale); }
        if !site_exists(&tx, site)? { return Err(Error::Invalid); }
        if tx.execute(sql, params![site, value])? != 0 { bump(&tx, site)?; }
        tx.commit()?;
        Ok(())
    }

    pub fn begin_pair(&mut self, id: &str, browser: Browser, label: &str, token: &str) -> Result<()> {
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
            return if denied { Err(Error::Denied) } else { Ok(()) };
        }
        let count: u32 = tx.query_row("SELECT count(*) FROM pending_pair WHERE denied=0", [], |r| r.get(0))?;
        if count >= 16 { return Err(Error::PairLimit); }
        let hash = Sha256::digest(token);
        let request_id = Uuid::new_v4().to_string();
        tx.execute("INSERT INTO pending_pair(id,browser,label,token_hash,expires_at,request_id) VALUES(?1,?2,?3,?4,?5,?6)",
            params![id, browser.as_str(), label, hash.as_slice(), now + model::PAIR_SECONDS, request_id])?;
        tx.commit()?;
        Ok(())
    }

    pub fn decide_pair(&mut self, request_id: &str, approve: bool, label: Option<&str>) -> Result<()> {
        let tx = self.0.transaction_with_behavior(Immediate)?;
        let now = model::now();
        let changed = if approve {
            tx.execute("INSERT INTO profile(id,label,browser,token_hash)
                SELECT id,COALESCE(?3,label),browser,token_hash FROM pending_pair WHERE request_id=?1 AND expires_at>?2 AND denied=0",
                params![request_id, now, label])?
        } else {
            tx.execute("UPDATE pending_pair SET denied=1 WHERE request_id=?1 AND expires_at>?2 AND denied=0", params![request_id, now])?
        };
        if changed == 0 { return Err(Error::Invalid); }
        if approve { tx.execute("DELETE FROM pending_pair WHERE request_id=?1", [request_id])?; }
        tx.commit()?;
        Ok(())
    }

    pub fn hello(&mut self, id: &str, gecko: bool, token: &str, session: &str, protocol: u16) -> Result<u64> {
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
        tx.execute("INSERT INTO profile_runtime(profile_id,session_id,expires_at,protocol) VALUES (?1,?2,?3,?4)
            ON CONFLICT(profile_id) DO UPDATE SET session_id=excluded.session_id, expires_at=excluded.expires_at,
            protocol=excluded.protocol, ack_revision=NULL, origins='[]' WHERE session_id<>excluded.session_id",
            params![id, session, now + model::LEASE_SECONDS, protocol])?;
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
        let protocol: u16 = tx.query_row("SELECT protocol FROM profile_runtime WHERE profile_id=?1", [id], |r| r.get(0))?;
        if (protocol == 1 && requires_update(&tx)?) || (protocol < 3 && requires_v3(&tx)?) { return Err(Error::VersionMismatch); }
        if protocol < 4 && requires_chromium_block(&tx, id)? { return Err(Error::VersionMismatch); }
        if !self.1 && has_entry_policy(&tx)? { return Err(Error::VersionMismatch); }
        if policy(&tx)?.0 != revision { return Err(Error::Stale); }
        let mut check = tx.prepare("SELECT EXISTS(SELECT 1 FROM site_origin WHERE hostname=?1)")?;
        for origin in origins {
            let host = model::origin_host(origin).ok_or(Error::Invalid)?;
            if !check.query_row([host], |r| r.get::<_, bool>(0))? { return Err(Error::Invalid); }
        }
        drop(check);
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
        bump(&tx, model::YOUTUBE)?;
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
            let mut q = tx.prepare("SELECT request_id,label,browser FROM pending_pair WHERE expires_at>?1 AND denied=0 ORDER BY rowid")?;
            let rows = q.query_map([now], |r| Ok(PairLabel { id: r.get(0)?, label: r.get(1)?, browser: r.get(2)? }))?;
            rows.collect::<rusqlite::Result<Vec<_>>>()?
        };
        let profiles = {
            let update_required = requires_update(&tx)?;
            let v3_required = requires_v3(&tx)?;
            let block = has_block_policy(&tx)?;
            let entry_unsupported = !self.1 && has_entry_policy(&tx)?;
            let mut q = tx.prepare("SELECT p.id,p.label,p.browser,r.session_id IS NOT NULL,r.ack_revision,r.origins,r.protocol
                FROM profile p LEFT JOIN profile_runtime r ON r.profile_id=p.id AND r.expires_at>?1
                WHERE NOT p.revoked ORDER BY p.rowid")?;
            let rows = q.query_map([now], |r| {
                let browser: String = r.get(2)?;
                let gecko = matches!(browser.as_str(), "firefox" | "zen");
                Ok(ProfileStatus {
                    id: r.get(0)?, label: r.get(1)?, browser, online: r.get(3)?, ack_revision: r.get(4)?,
                    update_required: r.get::<_, Option<u16>>(6)?.is_some_and(|v| entry_unsupported || (v == 1 && update_required)
                        || (v < 3 && v3_required) || (v < 4 && block && !gecko)),
                    origins: r.get::<_, Option<String>>(5)?.map(|value| serde_json::from_str(&value)).transpose()
                        .map_err(|err| rusqlite::Error::FromSqlConversionFailure(5, rusqlite::types::Type::Text, Box::new(err)))?.unwrap_or_default(),
                })
            })?;
            rows.collect::<rusqlite::Result<Vec<_>>>()?
        };
        let sites = site_policies(&tx)?;
        let accessibility = accessibility(&tx)?;
        tx.commit()?;
        Ok(DesktopState { revision, hide_shorts, accessibility, pending, profiles, sites, entry_available: self.1 })
    }

    pub fn request_open(&mut self, id: &str, session: &str, site_id: Option<&str>) -> Result<()> {
        let tx = self.0.transaction_with_behavior(Immediate)?;
        check_session(&tx, id, session)?;
        if let Some(site) = site_id {
            if !site_exists(&tx, site)? { return Err(Error::Invalid); }
        }
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

fn accessibility(conn: &Connection) -> Result<Accessibility> {
    Ok(conn.query_row("SELECT hold_seconds, two_step_confirmation FROM meta WHERE singleton=1", [], |r| {
        Ok(Accessibility { hold_seconds: r.get(0)?, two_step_confirmation: r.get(1)? })
    })?)
}

fn requires_v3(conn: &Connection) -> Result<bool> {
    Ok(conn.query_row("SELECT hold_seconds<>15 OR two_step_confirmation<>0 OR EXISTS(
        SELECT 1 FROM site_policy WHERE json_extract(entry,'$.mode')='pause' AND json_extract(entry,'$.finish')='manual'
    ) FROM meta WHERE singleton=1", [], |r| r.get(0))?)
}

fn requires_update(conn: &Connection) -> Result<bool> {
    Ok(conn.query_row("SELECT EXISTS(SELECT 1 FROM site_policy WHERE grayscale=1 OR json_extract(entry,'$.mode')<>'allow'
        OR site_id LIKE 'custom:%')", [], |r| r.get(0))?)
}

fn has_entry_policy(conn: &Connection) -> Result<bool> {
    Ok(conn.query_row("SELECT EXISTS(SELECT 1 FROM site_policy WHERE json_extract(entry,'$.mode')<>'allow')",
        [], |r| r.get(0))?)
}

fn has_block_policy(conn: &Connection) -> Result<bool> {
    Ok(conn.query_row("SELECT EXISTS(SELECT 1 FROM site_policy WHERE json_extract(entry,'$.mode')='block')",
        [], |r| r.get(0))?)
}

fn requires_chromium_block(conn: &Connection, id: &str) -> Result<bool> {
    Ok(conn.query_row("SELECT browser NOT IN ('firefox','zen') AND EXISTS(
        SELECT 1 FROM site_policy WHERE json_extract(entry,'$.mode')='block'
    ) FROM profile WHERE id=?1", [id], |r| r.get(0))?)
}

fn bump(conn: &Connection, site: &str) -> Result<()> {
    conn.execute("UPDATE meta SET revision=revision+1 WHERE singleton=1", [])?;
    conn.execute("UPDATE site_policy SET revision=(SELECT revision FROM meta WHERE singleton=1) WHERE site_id=?1", [site])?;
    Ok(())
}

fn site_exists(conn: &Connection, site: &str) -> Result<bool> {
    Ok(conn.query_row("SELECT EXISTS(SELECT 1 FROM site WHERE id=?1)", [site], |row| row.get(0))?)
}

fn site_policies(conn: &Connection) -> Result<Vec<SitePolicy>> {
    let mut statement = conn.prepare("
        SELECT s.id, s.label, p.grayscale, p.entry,
            (SELECT json_group_array(hostname) FROM (SELECT hostname FROM site_origin WHERE site_id=s.id ORDER BY rowid)),
            (SELECT json_group_object(rule_id, enabled) FROM site_rule WHERE site_id=s.id)
        FROM site s JOIN site_policy p ON p.site_id=s.id ORDER BY s.rowid")?;
    let mut rows = statement.query([])?;
    let mut sites = Vec::new();
    while let Some(row) = rows.next()? {
        let json = |index| match row.get_ref(index)? { ValueRef::Text(value) => Ok(value), _ => Err(Error::Database) };
        let rules: std::collections::BTreeMap<String, u8> = serde_json::from_slice(json(5)?).map_err(|_| Error::Database)?;
        sites.push(SitePolicy {
            id: row.get(0)?, label: row.get(1)?, grayscale: row.get(2)?,
            entry: serde_json::from_slice(json(3)?).map_err(|_| Error::Database)?,
            hosts: serde_json::from_slice(json(4)?).map_err(|_| Error::Database)?,
            rules: rules.into_iter().map(|(id, value)| (id, value != 0)).collect(),
        });
    }
    Ok(sites)
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
