import { comingSoonEnabled } from './site-settings.js';
import { loadPublishedConfig } from './city-content.js';
import { getHeroImages, isLegacyHeroImage } from '../src/hero-images.js';
import { authenticateStaff, staffCookie, staffSession, clearStaffCookie } from './staff-auth.js';
const COOKIE = 'budget_reviewer';
const SESSION_SECONDS = 8 * 60 * 60;
const encoder = new TextEncoder();
const attempts = new Map();
// Files the coming-soon screen needs, including the starter logo and artwork.
const publicAssets = new Set([
  '/assets/launch.css', '/assets/launch.js', '/assets/city-of-deland-seal.png',
  '/assets/launch-deland-illustration.webp', '/assets/fonts/inter-latin.woff2',
  '/assets/privacy.css',
  '/favicon.ico', '/favicon.png',
]);

export function privateResponse(response, method = 'GET') {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'private, no-store');
  headers.set('X-Robots-Tag', 'noindex, nofollow');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'same-origin');
  headers.set('X-Frame-Options', 'DENY');
  for (const name of ['ETag', 'Last-Modified']) headers.delete(name);
  return new Response(method === 'HEAD' ? null : response.body, { status: response.status, headers });
}

function redirect(location, headers = {}) {
  return new Response(null, { status: 303, headers: { Location: location, ...headers } });
}

function destination(value, origin) {
  try {
    if (!value?.startsWith('/') || value.startsWith('//') || /[\\\r\n]/.test(value)) return '/';
    const url = new URL(value, origin);
    if (url.origin !== origin || /^\/(?:auth|login|coming-soon)(?:[/.]|$)/.test(url.pathname)) return '/';
    return url.pathname + url.search + url.hash;
  } catch { return '/'; }
}

const encode = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
const decode = text => Uint8Array.from(atob(text.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));
const configured = env => Boolean(env.REVIEWER_PASSWORD && env.REVIEWER_SESSION_SECRET?.length >= 32);
const username = env => env.REVIEWER_USERNAME || 'reviewer';
const signingKey = env => crypto.subtle.importKey('raw', encoder.encode(`${env.REVIEWER_SESSION_SECRET}\0${env.REVIEWER_PASSWORD}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);

async function validSession(request, env) {
  if (!configured(env)) return false;
  const token = request.headers.get('Cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!token || token.length > 2048) return false;
  try {
    const [payload, signature, extra] = token.split('.');
    if (!signature || extra !== undefined) return false;
    const verified = await crypto.subtle.verify('HMAC', await signingKey(env), decode(signature), encoder.encode(payload));
    if (!verified) return false;
    const session = JSON.parse(new TextDecoder().decode(decode(payload)));
    const now = Math.floor(Date.now() / 1000);
    return session.u === username(env) && Number.isInteger(session.exp) && session.exp > now && session.exp <= now + SESSION_SECONDS;
  } catch { return false; }
}

function cookie(request, value, maxAge) {
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
}

function loginError(request, code, status, next = '/') {
  const messages = {
    invalid: 'The username or password is incorrect. Please try again.',
    unavailable: 'Reviewer access is not configured yet. Please try again later.',
    limited: 'Too many sign-in attempts. Please try again in 15 minutes.',
    request: 'We couldn’t sign you in. Refresh this page and try again.',
  };
  const headers = code === 'limited' ? { 'Retry-After': '900' } : {};
  return request.headers.get('Accept')?.includes('application/json')
    ? Response.json({ error: messages[code] }, { status, headers })
    : redirect(`/login?${new URLSearchParams({ error: code, next })}`, headers);
}

async function login(request, env) {
  if (request.headers.get('Origin') !== new URL(request.url).origin) return loginError(request, 'request', 403);
  if (!configured(env) && !(env.REVIEWER_SESSION_SECRET?.length >= 32 && (env.ADMIN_PASSWORD || env.DASHBOARD_DB))) return loginError(request, 'unavailable', 503);
  if (!request.headers.get('Content-Type')?.startsWith('application/x-www-form-urlencoded')) return loginError(request, 'request', 415);
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  const now = Date.now();
  for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
  const attempt = attempts.get(ip) || { count: 0, until: now + 900000 };
  if (attempt.count >= 8 || (!attempts.has(ip) && attempts.size >= 10000)) return loginError(request, 'limited', 429);
  attempt.count++;
  attempts.set(ip, attempt);

  const reader = request.body?.getReader();
  let size = 0;
  const chunks = [];
  if (reader) {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 2048) { await reader.cancel(); return loginError(request, 'request', 413); }
      chunks.push(value);
    }
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const form = new URLSearchParams(new TextDecoder().decode(bytes));
  const next = destination(form.get('next'), new URL(request.url).origin);
  const staff = await authenticateStaff(form.get('username') || '', form.get('password') || '', env);
  if (staff) {
    attempts.delete(ip);
    const target = next === '/' ? '/admin/' : next;
    const headers = { 'Set-Cookie': await staffCookie(request, staff, env) };
    return request.headers.get('Accept')?.includes('application/json')
      ? Response.json({ redirect: target }, { headers }) : redirect(target, headers);
  }
  if (!configured(env)) return loginError(request, 'invalid', 401, next);
  const key = await signingKey(env);
  // Web Crypto verifies the comparison in constant time; secrets never enter a client bundle.
  const expected = await crypto.subtle.sign('HMAC', key, encoder.encode(JSON.stringify([username(env), env.REVIEWER_PASSWORD])));
  const matches = await crypto.subtle.verify('HMAC', key, expected, encoder.encode(JSON.stringify([form.get('username'), form.get('password')])));
  if (!matches) return loginError(request, 'invalid', 401, next);
  attempts.delete(ip);
  const payload = encode(encoder.encode(JSON.stringify({ u: username(env), exp: Math.floor(now / 1000) + SESSION_SECONDS, nonce: encode(crypto.getRandomValues(new Uint8Array(16))) })));
  const signature = encode(await crypto.subtle.sign('HMAC', key, encoder.encode(payload)));
  const headers = { 'Set-Cookie': cookie(request, `${payload}.${signature}`, SESSION_SECONDS) };
  return request.headers.get('Accept')?.includes('application/json')
    ? Response.json({ redirect: next }, { headers })
    : redirect(next, headers);
}

// Return null only when the downstream app may handle this request.
export async function reviewerGate(request, env, loadPage) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (path === '/auth/session') {
    const response = ['GET', 'HEAD'].includes(request.method)
      ? Response.json({ authenticated: Boolean(await staffSession(request, env)) || await validSession(request, env) })
      : new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    return privateResponse(response, request.method);
  }
  if (publicAssets.has(path) && ['GET', 'HEAD'].includes(request.method)) return null;
  if (path.startsWith('/api/media/') && ['GET', 'HEAD'].includes(request.method)) {
    // Published uploads remain available to the public holding page. An upload
    // referenced only by a draft still follows the reviewer/staff gate below.
    const config = await loadPublishedConfig(env);
    const publishedMedia = [config.city.logo, config.city.socialImage, config.city.shareImage,
      ...Object.entries(config.media).filter(([key]) => !isLegacyHeroImage(key)).map(([, image]) => image.url),
      ...getHeroImages(config).map(image => image.url),
      ...Object.values(config.videos).flat().flatMap(video => [video.url, video.poster])];
    if (publishedMedia.includes(path)) return null;
  }
  // Keep the notice readable before sign-in, including during coming-soon mode.
  if (['/privacy', '/privacy/', '/privacy.html'].includes(path)) {
    const response = ['GET', 'HEAD'].includes(request.method)
      ? await loadPage('privacy.html')
      : new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    return privateResponse(response, request.method);
  }
  const comingSoon = await comingSoonEnabled(env);
  let response;
  if (path === '/auth/login' || path === '/auth/logout') {
    if (request.method !== 'POST') response = new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
    else if (path === '/auth/login') response = await login(request, env);
    else if (request.headers.get('Origin') !== url.origin) response = new Response('Forbidden', { status: 403 });
    else {
      response = redirect('/', { 'Set-Cookie': cookie(request, '', 0) });
      response.headers.append('Set-Cookie', clearStaffCookie(request));
    }
  } else if (path === '/robots.txt' && comingSoon) {
    response = new Response('User-agent: *\nDisallow: /\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  } else if (path === '/sitemap.xml' && comingSoon) {
    response = new Response('Not found', { status: 404 });
  } else {
    const staff = await staffSession(request, env);
    const authenticated = Boolean(staff) || await validSession(request, env);
    if (['/login', '/login/', '/login.html'].includes(path)) {
      response = (staff || (authenticated && !url.searchParams.has('staff') && !url.searchParams.get('next')?.startsWith('/admin'))) ? redirect(destination(url.searchParams.get('next'), url.origin)) : await loadPage('login.html');
    } else if (['/coming-soon', '/coming-soon/', '/coming-soon.html'].includes(path)) {
      response = await loadPage('coming-soon.html');
    } else if (/^\/admin(?:[/.]|$)/.test(path) && !staff) {
      response = redirect('/login?next=%2Fadmin%2F&staff=1');
    } else if (/^\/api\/admin(?:\/|$)/.test(path) && !staff) {
      response = Response.json({ error: 'Staff sign-in required.' }, { status: 401 });
    } else if (authenticated || !comingSoon) {
      return null;
    } else if (['/', '/index', '/index.html'].includes(path) && ['GET', 'HEAD'].includes(request.method)) {
      response = await loadPage('coming-soon.html');
    } else if (path.startsWith('/api/') || !['GET', 'HEAD'].includes(request.method)) {
      response = Response.json({ error: 'Reviewer sign-in required.' }, { status: 401 });
    } else {
      response = redirect(`/login?${new URLSearchParams({ next: destination(path + url.search, url.origin) })}`);
    }
  }
  return privateResponse(response, request.method);
}

export { publicAssets };
