import { randomBytes } from 'node:crypto';
import { localDatabase } from '../server/dashboard-local.js';
import { dashboardStore } from '../server/dashboard-store.js';
import { hashPassword } from '../server/staff-auth.js';

const email = process.argv[2]?.trim().toLowerCase();
const name = process.argv[3]?.trim() || 'Local administrator';
if (!email || email.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || name.length > 100) {
  console.error('Usage: npm run admin:create -- email@example.gov "Full Name"');
  process.exit(1);
}
const db = localDatabase();
try {
  const store = dashboardStore({ DASHBOARD_DB: db });
  if (await store.userByEmail(email)) throw new Error('This local account already exists. Manage it in the dashboard.');
  const password = randomBytes(24).toString('base64url');
  await store.createUser({ id: crypto.randomUUID(), name, email, role: 'admin', password_hash: await hashPassword(password), created_at: new Date().toISOString() });
  console.log(`Local dashboard account created.\nEmail: ${email}\nPassword: ${password}\n\nSign in at /login?next=%2Fadmin%2F. This account exists only in .cache/dashboard.sqlite.\nThe Vite server also needs REVIEWER_SESSION_SECRET (32+ characters) in .env.local.\nStore this password securely; it will not be shown again.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally { db.close(); }
