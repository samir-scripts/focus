CREATE TABLE planner_entry (
    id BLOB PRIMARY KEY NOT NULL CHECK(length(id) = 16),
    kind TEXT NOT NULL CHECK(kind IN ('plan', 'reminder', 'log')),
    title TEXT NOT NULL,
    notes TEXT,
    local_date TEXT NOT NULL,
    wall_time TEXT NOT NULL,
    end_time TEXT,
    zone TEXT NOT NULL,
    lead INTEGER CHECK(lead IS NULL OR (lead IN (0, 5, 15, 60) AND kind = 'reminder')),
    CHECK((kind = 'plan') = (end_time IS NOT NULL))
) WITHOUT ROWID;

CREATE INDEX planner_entry_day ON planner_entry(local_date, wall_time, id);
