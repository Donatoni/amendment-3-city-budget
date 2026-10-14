// The same prepared SQL runs in Cloudflare D1 and local SQLite.
export function dashboardStore(env) {
  const db = env.DASHBOARD_DB;
  if (!db) throw Object.assign(new Error('Submission storage is not configured. Please contact the site administrator.'), { status: 503 });
  return {
    deleteSubmission: id => db.prepare('DELETE FROM submissions WHERE id = ?').bind(id).run(),
    deleteFeedback: id => db.prepare('DELETE FROM feedback WHERE id = ?').bind(id).run(),
    setting: key => db.prepare('SELECT value FROM site_settings WHERE key = ?').bind(key).first(),
    setSetting: (key, value) => db.prepare('INSERT INTO site_settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(key, value).run(),
    feedbackById: id => db.prepare('SELECT * FROM feedback WHERE id = ?').bind(id).first(),
    createFeedback: row => db.prepare('INSERT OR IGNORE INTO feedback(id, submitted_at, helpful, comment) VALUES (?, ?, ?, ?)').bind(row.id, row.submitted_at, row.helpful, row.comment).run(),
    feedback: async (from, to) => (await db.prepare('SELECT * FROM feedback WHERE submitted_at >= ? AND submitted_at < ? ORDER BY submitted_at DESC, id DESC').bind(from, to).all()).results,
    reviewFeedback: (id, status) => db.prepare('UPDATE feedback SET status = ? WHERE id = ?').bind(status, id).run(),
    user: id => db.prepare('SELECT * FROM staff_users WHERE id = ?').bind(id).first(),
    userByEmail: email => db.prepare('SELECT * FROM staff_users WHERE email = ? COLLATE NOCASE').bind(email).first(),
    users: async () => (await db.prepare('SELECT id, name, email, role, active, created_at FROM staff_users ORDER BY created_at DESC').all()).results,
    createUser: user => db.prepare('INSERT INTO staff_users (id, name, email, role, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(user.id, user.name, user.email, user.role, user.password_hash, user.created_at).run(),
    updateUser: user => db.prepare('UPDATE staff_users SET role = ?, active = ?, password_hash = ?, session_version = session_version + 1 WHERE id = ?').bind(user.role, user.active, user.password_hash, user.id).run(),
    submission: id => db.prepare('SELECT * FROM submissions WHERE id = ?').bind(id).first(),
    createSubmission: row => db.prepare('INSERT OR IGNORE INTO submissions (id, submitted_at, catalog_version, reduction, snapshot) VALUES (?, ?, ?, ?, ?)').bind(row.id, row.submitted_at, row.catalog_version, row.reduction, row.snapshot).run(),
    submissions: async (from, to) => (await db.prepare('SELECT * FROM submissions WHERE submitted_at >= ? AND submitted_at < ? ORDER BY submitted_at DESC, id DESC').bind(from, to).all()).results,
    review: (id, status) => db.prepare('UPDATE submissions SET status = ? WHERE id = ?').bind(status, id).run(),
  };
}
