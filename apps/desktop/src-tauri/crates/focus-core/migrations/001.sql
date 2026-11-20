CREATE TABLE site (id TEXT PRIMARY KEY, label TEXT NOT NULL);
CREATE TABLE site_origin (
    site_id TEXT NOT NULL REFERENCES site(id), hostname TEXT NOT NULL UNIQUE,
    PRIMARY KEY (site_id, hostname)
);
CREATE TABLE site_policy (
    site_id TEXT PRIMARY KEY REFERENCES site(id), revision INTEGER NOT NULL DEFAULT 0,
    grayscale INTEGER NOT NULL DEFAULT 0 CHECK (grayscale IN (0, 1)),
    track_time INTEGER NOT NULL DEFAULT 0 CHECK (track_time IN (0, 1))
);
CREATE TABLE site_rule (
    site_id TEXT NOT NULL REFERENCES site(id), rule_id TEXT NOT NULL,
    enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)), PRIMARY KEY (site_id, rule_id)
);
CREATE TABLE meta (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1), revision INTEGER NOT NULL
);
INSERT INTO meta VALUES (1, 0);
CREATE TABLE profile (
    id TEXT PRIMARY KEY, label TEXT NOT NULL, browser TEXT NOT NULL,
    token_hash BLOB NOT NULL, revoked INTEGER NOT NULL DEFAULT 0 CHECK (revoked IN (0, 1))
);
CREATE TABLE pending_pair (
    id TEXT PRIMARY KEY, label TEXT NOT NULL, browser TEXT NOT NULL,
    request_id TEXT NOT NULL UNIQUE,
    token_hash BLOB NOT NULL, expires_at INTEGER NOT NULL,
    denied INTEGER NOT NULL DEFAULT 0 CHECK (denied IN (0, 1))
);
-- The current lease only, never a log. Dead processes' leases expire automatically.
CREATE TABLE profile_runtime (
    profile_id TEXT PRIMARY KEY REFERENCES profile(id), session_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL, ack_revision INTEGER, origins TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE open_intent (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    site_id TEXT REFERENCES site(id), expires_at INTEGER NOT NULL
);
