CREATE TABLE planner_preferences (
    singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
    retention INTEGER NOT NULL CHECK(retention IN (0, 30, 90, 365))
);
INSERT INTO planner_preferences VALUES (1, 0);
