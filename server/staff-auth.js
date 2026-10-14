import { dashboardStore } from './dashboard-store.js';

const encoder = new TextEncoder();
const COOKIE = 'budget_staff';
const HOURS = 8 * 60 * 60;
const encode = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
const decode = text => Uint8Array.from(atob(text.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));
const key = secret => crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
const digest = async value => encode(await crypto.subtle.digest('SHA-256', encoder.encode(value)));

export async function hashPassword(password, salt = encode(crypto.getRandomValues(new Uint8Array(16)))) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const hash = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: decode(salt), iterations: 100000, hash: 'SHA-256' }, material, 256);
  return `pbkdf2$100000$${salt}$${encode(hash)}`;
}
async function equal(a, b) {
  const k = await key('constant-time-password-comparison');
  return crypto.subtle.verify('HMAC', k, await crypto.subtle.sign('HMAC', k, encoder.encode(a)), encoder.encode(b));
}
async function bootstrap(env) {
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD || env.REVIEWER_SESSION_SECRET?.length < 32 || !env.REVIEWER_SESSION_SECRET) return null;
  return { id: 'bootstrap', name: 'Site administrator', email: env.ADMIN_EMAIL.toLowerCase(), role: 'admin', active: 1, password_hash: await digest(env.ADMIN_PASSWORD) };
}
export function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, active: Boolean(user.active), createdAt: user.created_at || null };
}
export async function authenticateStaff(email, password, env) {
  if (!env.REVIEWER_SESSION_SECRET || env.REVIEWER_SESSION_SECRET.length < 32) return null;
  const owner = await bootstrap(env);
  if (owner && email.toLowerCase() === owner.email && await equal(await digest(password), owner.password_hash)) return owner;
  if (!env.DASHBOARD_DB) return null;
  const user = await dashboardStore(env).userByEmail(email.toLowerCase());
  // Run the same expensive derivation for missing users to avoid a fast account probe.
  const salt = user?.password_hash.split('$')[2] || 'AAAAAAAAAAAAAAAAAAAAAA';
  const actual = await hashPassword(password, salt);
  return user?.active && await equal(actual, user.password_hash) ? user : null;
}
export async function staffCookie(request, user, env) {
  const payload = encode(encoder.encode(JSON.stringify({ id: user.id, exp: Math.floor(Date.now() / 1000) + HOURS, version: await digest(user.password_hash + user.role + (user.session_version || 0)) })));
  const signature = encode(await crypto.subtle.sign('HMAC', await key(env.REVIEWER_SESSION_SECRET), encoder.encode(payload)));
  return `${COOKIE}=${payload}.${signature}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${HOURS}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
}
export const clearStaffCookie = request => `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
export async function staffSession(request, env) {
  if (!env.REVIEWER_SESSION_SECRET || env.REVIEWER_SESSION_SECRET.length < 32) return null;
  const token = request.headers.get('Cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!token || token.length > 2048) return null;
  try {
    const [payload, signature, extra] = token.split('.');
    if (!signature || extra !== undefined || !await crypto.subtle.verify('HMAC', await key(env.REVIEWER_SESSION_SECRET), decode(signature), encoder.encode(payload))) return null;
    const session = JSON.parse(new TextDecoder().decode(decode(payload)));
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isInteger(session.exp) || session.exp <= now || session.exp > now + HOURS) return null;
    const user = session.id === 'bootstrap' ? await bootstrap(env) : env.DASHBOARD_DB ? await dashboardStore(env).user(session.id) : null;
    return user?.active && session.version === await digest(user.password_hash + user.role + (user.session_version || 0)) ? user : null;
  } catch { return null; }
}
