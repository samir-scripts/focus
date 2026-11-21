ALTER TABLE site_policy ADD COLUMN entry TEXT NOT NULL DEFAULT '{"mode":"allow"}';
ALTER TABLE profile_runtime ADD COLUMN protocol INTEGER NOT NULL DEFAULT 1 CHECK (protocol IN (1, 2));
