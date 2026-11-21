-- Preserve live leases while accepting the new protocol version.
CREATE TABLE profile_runtime_v4 (
    profile_id TEXT PRIMARY KEY REFERENCES profile(id), session_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL, ack_revision INTEGER, origins TEXT NOT NULL DEFAULT '[]',
    protocol INTEGER NOT NULL DEFAULT 1 CHECK (protocol IN (1, 2, 3, 4))
);
INSERT INTO profile_runtime_v4 SELECT profile_id, session_id, expires_at, ack_revision, origins, protocol FROM profile_runtime;
DROP TABLE profile_runtime;
ALTER TABLE profile_runtime_v4 RENAME TO profile_runtime;
