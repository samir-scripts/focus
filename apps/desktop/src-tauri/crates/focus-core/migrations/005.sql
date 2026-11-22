CREATE TABLE grace_schedule (
    id BLOB PRIMARY KEY NOT NULL CHECK(length(id) = 16),
    first_date TEXT NOT NULL,
    wall_time TEXT NOT NULL,
    zone TEXT NOT NULL,
    weekdays INTEGER CHECK(weekdays BETWEEN 1 AND 127)
) WITHOUT ROWID;

CREATE TABLE grace_occurrence (
    schedule_id BLOB NOT NULL REFERENCES grace_schedule(id) ON DELETE CASCADE,
    due INTEGER NOT NULL,
    request_id BLOB NOT NULL UNIQUE CHECK(length(request_id) = 16),
    outcome TEXT NOT NULL DEFAULT 'unconfirmed',
    PRIMARY KEY(schedule_id, due)
) WITHOUT ROWID;
