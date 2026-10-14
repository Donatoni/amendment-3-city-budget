import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';
import { onRequest } from '../functions/_middleware.js';
import { localDatabase } from '../server/dashboard-local.js';
import { dashboardStore } from '../server/dashboard-store.js';
import { authenticateStaff, hashPassword, staffCookie } from '../server/staff-auth.js';
import { loadDraftConfig, publishedSiteConfig } from '../server/city-content.js';
import { editorPreviewHTML, renderConfiguredHTML } from '../server/site-html.js';
import { applyConfiguredDocument } from '../src/site-document.js';
import { defaultSiteConfig } from '../src/site-defaults.js';
import { renderPage } from '../src/seo.js';

const origin = 'https://city.example.gov';
const templates = {
  '/': renderPage(await readFile(new URL('../index.html', import.meta.url), 'utf8'), origin, false),
  '/privacy': await readFile(new URL('../public/privacy.html', import.meta.url), 'utf8'),
  '/login': await readFile(new URL('../public/login.html', import.meta.url), 'utf8'),
  '/coming-soon': await readFile(new URL('../public/coming-soon.html', import.meta.url), 'utf8'),
};
async function fixture(t) {
  const env = { DASHBOARD_DB: localDatabase(':memory:'), ADMIN_EMAIL: 'preview@example.invalid', ADMIN_PASSWORD: crypto.randomUUID(), REVIEWER_SESSION_SECRET: crypto.randomUUID() };
  t.after(() => env.DASHBOARD_DB.close());
  const assetRequests = [];
  env.ASSETS = { fetch: async request => {
    const path = new URL(request.url).pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';
    assetRequests.push(path);
    return new Response(templates[path] || 'Not found', { status: templates[path] ? 200 : 404, headers: { 'Content-Type': templates[path] ? 'text/html; charset=utf-8' : 'text/plain' } });
  } };
  const cookieFor = async (email, password) => {
    const user = await authenticateStaff(email, password, env);
    return (await staffCookie(new Request(origin), user, env)).split(';')[0];
  };
  const admin = await cookieFor(env.ADMIN_EMAIL, env.ADMIN_PASSWORD);
  const viewerPassword = crypto.randomUUID();
  await dashboardStore(env).createUser({ id: crypto.randomUUID(), name: 'Preview test viewer', email: 'viewer@example.invalid', role: 'viewer', password_hash: await hashPassword(viewerPassword), created_at: new Date().toISOString() });
  const viewer = await cookieFor('viewer@example.invalid', viewerPassword);
  const call = (path, cookie, method = 'GET') => {
    const request = new Request(origin + path, { method, headers: cookie ? { Cookie: cookie } : {} });
    return onRequest({ request, env, next: () => env.ASSETS.fetch(request) });
  };
  return { env, admin, viewer, call, assetRequests };
}

test('actual editor frames require an administrator on every supported page and never save draft content', async t => {
  const { env, admin, viewer, call } = await fixture(t);
  const beforeDraft = await loadDraftConfig(env), beforePublished = await publishedSiteConfig(env);
  for (const path of Object.keys(templates)) {
    const url = `${path}?contentPreview=1&editorPreview=1`;
    for (const cookie of [undefined, viewer]) assert.equal((await call(url, cookie)).status, 403, path);
    const response = await call(url, admin);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get('Cache-Control'), /no-store/);
    assert.match(response.headers.get('X-Robots-Tag'), /noindex/);
    assert.match(response.headers.get('Content-Security-Policy'), /frame-ancestors 'self'/);
    const document = parseHTML(await response.text()).document;
    assert.equal(document.documentElement.dataset.editorPreview, '1');
    assert.equal(document.querySelectorAll('script').length, 1);
    assert.equal(document.querySelector('script').getAttribute('type'), 'module');
    assert.equal(document.querySelector('script').getAttribute('src'), '/src/site-entry.js');
    assert.equal(document.querySelector('#city-site-config'), null, 'Unsaved content is delivered privately by the editor after the frame loads');
  }
  assert.deepEqual(await loadDraftConfig(env), beforeDraft);
  assert.deepEqual(await publishedSiteConfig(env), beforePublished);
  assert.equal(await env.DASHBOARD_DB.prepare('SELECT value FROM site_settings WHERE key = ?').bind('city_content_v1').first(), null);
});

test('editor frame URLs cannot open admin/API routes or accept mutations', async t => {
  const { admin, call } = await fixture(t);
  for (const path of ['/admin/', '/api/admin/users', '/auth/logout', '/missing-page']) {
    assert.ok([400, 404].includes((await call(`${path}?contentPreview=1&editorPreview=1`, admin)).status), path);
  }
  assert.equal((await call('/?contentPreview=1&editorPreview=1', admin, 'POST')).status, 405);
  assert.equal((await call('/?editorPreview=1', admin)).status, 400);
  assert.equal((await call('/?editorPreview=1')).status, 403);
});

test('actual-frame preparation retains public styles and shares the public content renderer without executing edited HTML', () => {
  const raw = editorPreviewHTML(templates['/']);
  const document = parseHTML(raw).document;
  assert.ok(document.querySelector('link[href="/src/styles.css"]'));
  assert.ok(document.querySelector('#hero'));
  assert.equal(document.querySelector('script[src*="googletagmanager"]'), null);
  const config = structuredClone(defaultSiteConfig);
  config.copy.home_hero_53 = '<img src=x onerror=alert(1)>';
  config.heroImages = [{ id: 'fixture-photo', url: '/assets/hero-planning-room.webp', alt: 'Preview photo', label: 'Local photo' }];
  config.faqs = [{ question: 'A local question', answer: 'A local answer' }];
  applyConfiguredDocument(document, config, { preview: true });
  const publicDocument = parseHTML(renderConfiguredHTML(templates['/'], config, { preview: true })).document;
  for (const selector of ['#hero h1', '.faq-list', '.hero-slideshow', '#methodology']) {
    assert.equal(document.querySelector(selector).outerHTML, publicDocument.querySelector(selector).outerHTML, selector);
  }
  assert.equal(document.querySelector('img[onerror]'), null);
});
