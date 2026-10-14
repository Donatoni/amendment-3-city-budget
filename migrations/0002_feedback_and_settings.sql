CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  submitted_at TEXT NOT NULL,
  helpful TEXT NOT NULL CHECK(helpful IN ('yes', 'somewhat', 'no')),
  comment TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new', 'reviewed'))
);
CREATE INDEX IF NOT EXISTS feedback_date ON feedback(submitted_at DESC);
CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT OR IGNORE INTO site_settings(key, value) VALUES ('coming_soon', 'true');
