import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewerGate } from '../server/reviewer-access.js';
import { onRequest as middleware } from '../functions/_middleware.js';

const origin = 'https://budget.example.gov';
const env = { REVIEWER_USERNAME: 'reviewer', REVIEWER_PASSWORD: 'test-only-password', REVIEWER_SESSION_SECRET: 'test-signing-secret-with-at-least-32-characters' };
const loadPage = async name => new Response(name, { headers: { 'Content-Type': 'text/html' } });
const gate = (path = '/', headers = {}, config = env) => reviewerGate(new Request(origin + path, { headers }), config, loadPage);
let ip = 0;
const loginRequest = (fields = {}, headers = {}) => new Request(origin + '/auth/login', {
  method: 'POST', headers: { Origin: origin, Accept: 'application/json', 'CF-Connecting-IP': `test-${++ip}`, ...headers },
  body: new URLSearchParams({ username: 'reviewer', password: env.REVIEWER_PASSWORD, ...fields }),
});
async function signIn() {
  const response = await reviewerGate(loginRequest(), env, loadPage);
  assert.equal(response.status, 200);
  return response.headers.get('Set-Cookie').split(';')[0];
}

test('unauthenticated root and aliases show only the coming-soon page; private paths require login', async () => {
  for (const path of ['/', '/index', '/index.html', '/?cuts=fire-coverage', '/coming-soon']) {
    const response = await gate(path);
    assert.equal(await response.text(), 'coming-soon.html');
    assert.match(response.headers.get('Cache-Control'), /no-store/);
  }
  for (const path of ['/share/', '/share/image.png', '/assets/videos/police_safety.mp4', '/src/main.js', '/assets/index-app.js']) {
    const response = await gate(path);
    assert.equal(response.status, 303, path);
    assert.match(response.headers.get('Location'), /^\/login\?/);
  }
  assert.equal((await gate('/api/property')).status, 401);
  assert.equal(await (await gate('/login')).text(), 'login.html');
  assert.equal(await gate('/assets/launch.css'), null);
});

test('privacy notice is readable without sign-in while neighboring routes remain protected', async () => {
  for (const path of ['/privacy', '/privacy/', '/privacy.html']) {
    const response = await gate(path, {}, {});
    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'privacy.html');
    const head = await reviewerGate(new Request(origin + path, { method: 'HEAD' }), {}, loadPage);
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
    const post = await reviewerGate(new Request(origin + path, { method: 'POST' }), {}, loadPage);
    assert.equal(post.status, 405);
  }
  assert.equal(await gate('/assets/privacy.css', {}, {}), null);
  for (const path of ['/privacy/admin', '/privacy-export', '/admin/']) {
    assert.equal((await gate(path)).status, 303);
  }
  assert.equal((await gate('/api/admin/submissions')).status, 401);
  const response = await middleware({
    request: new Request(origin + '/privacy'),
    env: { ASSETS: { fetch: async request => {
      assert.equal(new URL(request.url).pathname, '/privacy');
      return new Response('Privacy notice');
    } } },
    next: () => { throw new Error('Privacy should load the public notice directly'); },
  });
  assert.equal(await response.text(), 'Privacy notice');
});

test('valid credentials create a secure HTTP-only session; invalid credentials and missing configuration fail closed', async () => {
  const response = await reviewerGate(loginRequest(), env, loadPage);
  const cookie = response.headers.get('Set-Cookie');
  assert.match(cookie, /HttpOnly; SameSite=Lax; Max-Age=28800; Secure/);
  assert.deepEqual(await response.json(), { redirect: '/' });
  assert.equal(await gate('/', { Cookie: cookie.split(';')[0] }), null);
  for (const fields of [{ password: 'wrong' }, { username: 'someone-else' }]) {
    const failed = await reviewerGate(loginRequest(fields), env, loadPage);
    assert.equal(failed.status, 401);
    assert.equal(failed.headers.get('Set-Cookie'), null);
    assert.match((await failed.json()).error, /username or password is incorrect/);
  }
  assert.equal((await reviewerGate(loginRequest(), {}, loadPage)).status, 503);
});

test('session forgery, expiration, password rotation, and secret rotation deny access', async () => {
  const cookie = await signIn();
  for (const candidate of ['budget_reviewer=forged', cookie + 'x', cookie + '.extra']) {
    assert.equal(await (await gate('/', { Cookie: candidate })).text(), 'coming-soon.html');
  }
  for (const config of [{ ...env, REVIEWER_PASSWORD: 'changed' }, { ...env, REVIEWER_SESSION_SECRET: 'another-signing-key-with-32-characters' }]) {
    assert.equal(await (await gate('/', { Cookie: cookie }, config)).text(), 'coming-soon.html');
  }
  const originalNow = Date.now;
  try {
    Date.now = () => originalNow() + 9 * 60 * 60 * 1000;
    assert.equal(await (await gate('/', { Cookie: cookie })).text(), 'coming-soon.html');
  } finally { Date.now = originalNow; }
});

test('footer session status distinguishes anonymous visitors, reviewers, and staff without exposing account details', async () => {
  for (const cookie of [undefined, 'budget_reviewer=forged']) {
    const response = await gate('/auth/session', cookie ? { Cookie: cookie } : {});
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { authenticated: false });
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  }
  const cookie = await signIn();
  assert.deepEqual(await (await gate('/auth/session', { Cookie: cookie })).json(), { authenticated: true });
  assert.deepEqual(await (await gate('/auth/session', { Cookie: cookie }, { ...env, REVIEWER_PASSWORD: 'rotated' })).json(), { authenticated: false });
  const staffEnv = { ...env, ADMIN_EMAIL: 'admin@example.gov', ADMIN_PASSWORD: 'test-administrator-password' };
  const login = await reviewerGate(loginRequest({ username: staffEnv.ADMIN_EMAIL, password: staffEnv.ADMIN_PASSWORD }), staffEnv, loadPage);
  assert.equal(login.status, 200);
  const staffCookie = login.headers.get('Set-Cookie').split(';')[0];
  assert.deepEqual(await (await gate('/auth/session', { Cookie: staffCookie }, staffEnv)).json(), { authenticated: true });
  const head = await reviewerGate(new Request(origin + '/auth/session', { method: 'HEAD' }), env, loadPage);
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  const post = await reviewerGate(new Request(origin + '/auth/session', { method: 'POST' }), env, loadPage);
  assert.equal(post.status, 405);
});

test('login rejects cross-origin posts and external return URLs; valid internal return paths survive', async () => {
  const rejected = await reviewerGate(loginRequest({}, { Origin: 'https://attacker.example' }), env, loadPage);
  assert.equal(rejected.status, 403);
  for (const next of ['https://attacker.example/', '//attacker.example/', '/\\attacker.example', '/auth/logout', '/login']) {
    const response = await reviewerGate(loginRequest({ next }), env, loadPage);
    assert.equal((await response.json()).redirect, '/');
  }
  const response = await reviewerGate(loginRequest({ next: '/?catalog=1&cuts=fire-coverage#builder' }), env, loadPage);
  assert.equal((await response.json()).redirect, '/?catalog=1&cuts=fire-coverage#builder');
});

test('repeated bad passwords are throttled and oversized form bodies are rejected', async () => {
  for (let i = 0; i < 8; i++) {
    assert.equal((await reviewerGate(loginRequest({ password: 'wrong' }, { 'CF-Connecting-IP': 'throttle-test' }), env, loadPage)).status, 401);
  }
  const limited = await reviewerGate(loginRequest({}, { 'CF-Connecting-IP': 'throttle-test' }), env, loadPage);
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('Retry-After'), '900');
  assert.equal((await reviewerGate(loginRequest({ password: 'x'.repeat(3000) }), env, loadPage)).status, 413);
});

test('native form submissions work and logout clears the cookie only for same-origin POST', async () => {
  const response = await reviewerGate(loginRequest({}, { Accept: 'text/html' }), env, loadPage);
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('Location'), '/');
  assert.equal((await gate('/auth/logout')).status, 405);
  const logout = await reviewerGate(new Request(origin + '/auth/logout', { method: 'POST', headers: { Origin: origin } }), env, loadPage);
  assert.match(logout.headers.get('Set-Cookie'), /Max-Age=0/);
  assert.equal(logout.headers.get('Location'), '/');
  assert.equal((await reviewerGate(new Request(origin + '/auth/logout', { method: 'POST', headers: { Origin: 'https://other.example' } }), env, loadPage)).status, 403);
});

test('Pages middleware blocks origin access before downstream handlers and prevents caching private HTML', async () => {
  let downstreamCalls = 0;
  const context = {
    request: new Request(origin), env: { ...env, ASSETS: { fetch: async request => new Response(new URL(request.url).pathname) } },
    next: async () => { downstreamCalls++; return new Response('Budget app', { headers: { 'Cache-Control': 'public, max-age=300', ETag: 'private' } }); },
  };
  assert.equal(await (await middleware(context)).text(), '/coming-soon');
  assert.equal(downstreamCalls, 0);
  context.request = new Request(origin, { headers: { Cookie: await signIn() } });
  const response = await middleware(context);
  assert.equal(await response.text(), 'Budget app');
  assert.equal(downstreamCalls, 1);
  assert.match(response.headers.get('Cache-Control'), /no-store/);
  assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, nofollow');
  assert.equal(response.headers.get('ETag'), null);
  assert.match(await (await gate('/robots.txt')).text(), /Disallow: \//);
  assert.equal((await gate('/sitemap.xml')).status, 404);
});
