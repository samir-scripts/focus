ALTER TABLE meta ADD COLUMN hold_seconds INTEGER NOT NULL DEFAULT 15 CHECK (hold_seconds BETWEEN 15 AND 600);
ALTER TABLE meta ADD COLUMN two_step_confirmation INTEGER NOT NULL DEFAULT 0 CHECK (two_step_confirmation IN (0, 1));

-- Runtime leases are transient, but preserve them while extending the protocol constraint.
CREATE TABLE profile_runtime_v3 (
    profile_id TEXT PRIMARY KEY REFERENCES profile(id), session_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL, ack_revision INTEGER, origins TEXT NOT NULL DEFAULT '[]',
    protocol INTEGER NOT NULL DEFAULT 1 CHECK (protocol IN (1, 2, 3))
);
INSERT INTO profile_runtime_v3 SELECT profile_id, session_id, expires_at, ack_revision, origins, protocol FROM profile_runtime;
DROP TABLE profile_runtime;
ALTER TABLE profile_runtime_v3 RENAME TO profile_runtime;
