WITH modes(id) AS (VALUES ('lock-opened-videos'), ('lock-all-short-video-viewers'))
INSERT INTO site_rule(site_id, rule_id, enabled)
SELECT site.id, site.id || '.' || modes.id, 0
FROM site CROSS JOIN modes WHERE site.id IN ('instagram', 'youtube', 'tiktok');

CREATE TABLE profile_runtime_v7 (
    profile_id TEXT PRIMARY KEY REFERENCES profile(id), session_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL, ack_revision INTEGER, origins TEXT NOT NULL DEFAULT '[]',
    protocol INTEGER NOT NULL DEFAULT 1 CHECK (protocol IN (1, 2, 3, 4, 5, 6, 7))
);
INSERT INTO profile_runtime_v7 SELECT profile_id, session_id, expires_at, ack_revision, origins, protocol FROM profile_runtime;
DROP TABLE profile_runtime;
ALTER TABLE profile_runtime_v7 RENAME TO profile_runtime;
