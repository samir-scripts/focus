WITH new_rules(rule_id) AS (VALUES
    ('instagram.hide-suggested-home'),
    ('instagram.hide-reels-discovery')
)
INSERT INTO site_rule(site_id, rule_id, enabled)
SELECT site.id, new_rules.rule_id, 0 FROM new_rules JOIN site ON site.id = 'instagram';

CREATE TABLE profile_runtime_v6 (
    profile_id TEXT PRIMARY KEY REFERENCES profile(id), session_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL, ack_revision INTEGER, origins TEXT NOT NULL DEFAULT '[]',
    protocol INTEGER NOT NULL DEFAULT 1 CHECK (protocol IN (1, 2, 3, 4, 5, 6))
);
INSERT INTO profile_runtime_v6 SELECT profile_id, session_id, expires_at, ack_revision, origins, protocol FROM profile_runtime;
DROP TABLE profile_runtime;
ALTER TABLE profile_runtime_v6 RENAME TO profile_runtime;
