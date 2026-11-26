-- Short-lived intents bind to one authenticated browser session, never to a URL.
CREATE TABLE paired_open (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL REFERENCES profile(id),
    session_id TEXT NOT NULL,
    site_id TEXT NOT NULL REFERENCES site(id),
    revision INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    delivered INTEGER NOT NULL DEFAULT 0,
    opened INTEGER
);
