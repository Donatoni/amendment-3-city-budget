import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { localDatabase } from '../server/dashboard-local.js';
import { localMediaBucket } from '../server/city-media-local.js';
import { handleDashboardRequest, validateSubmission } from '../server/dashboard-api.js';
import { handleSiteConfig, handleCityMedia } from '../server/city-content.js';
import { authenticateStaff, staffCookie } from '../server/staff-auth.js';
import { defaultSiteConfig } from '../src/site-defaults.js';
import { validateSiteConfig } from '../src/site-config-schema.js';
import { budgetModel } from '../src/budget-model.js';
import { summarizeSubmissions, submissionBaseline } from '../src/dashboard-data.js';
import { reviewerAccess } from '../server/reviewer-vite.js';
import { reviewerGate } from '../server/reviewer-access.js';

const origin = 'https://city.example.gov';
const request = (path, method = 'GET', data, cookie, extra = {}) => new Request(origin + path, {
  method, headers: { Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...extra },
  ...(data === undefined ? {} : { body: JSON.stringify(data) }),
});
async function setup(t) {
  const env = { DASHBOARD_DB: localDatabase(':memory:'), ADMIN_EMAIL: 'admin@example.gov', ADMIN_PASSWORD: 'test-administrator-password', REVIEWER_SESSION_SECRET: 'test-dashboard-signing-secret-at-least-32' };
  t.after(() => env.DASHBOARD_DB.close());
  const user = await authenticateStaff(env.ADMIN_EMAIL, env.ADMIN_PASSWORD, env);
  const cookie = (await staffCookie(request('/'), user, env)).split(';')[0];
  const call = (path, method, data, extra) => handleDashboardRequest(request(path, method, data, cookie, extra), env);
  return { env, cookie, call };
}
test('draft edits stay private, publish is atomic, and catalog revisions follow city and budget changes', async t => {
  const { env, cookie, call } = await setup(t);
  let state = await (await call('/api/admin/content')).json();
  assert.equal(state.revision, 0);
  state.draft.copy['test.title'] = '<script>This stays plain text</script>';
  let response = await call('/api/admin/content', 'PATCH', { config: state.draft, revision: state.revision });
  assert.equal(response.status, 200);
  state = await response.json();
  assert.equal(state.revision, 1);
  assert.equal((await (await handleSiteConfig(request('/api/site-config'), env)).json()).copy['test.title'], undefined);
  assert.equal((await handleSiteConfig(request('/api/site-config?preview=1'), env)).status, 403);
  assert.equal((await (await handleSiteConfig(request('/api/site-config?preview=1', 'GET', undefined, cookie), env)).json()).copy['test.title'], state.draft.copy['test.title']);
  assert.equal((await call('/api/admin/content/publish', 'POST', { revision: 0 })).status, 409);
  state = await (await call('/api/admin/content/publish', 'POST', { revision: 1 })).json();
  assert.equal(state.published.budget.version, defaultSiteConfig.budget.version);
  assert.equal(state.published.copy['test.title'], state.draft.copy['test.title']);
  state.draft.budget.target -= 1;
  state = await (await call('/api/admin/content', 'PATCH', { config: state.draft, revision: state.revision })).json();
  assert.equal(state.published.budget.target, defaultSiteConfig.budget.target);
  state = await (await call('/api/admin/content/publish', 'POST', { revision: state.revision })).json();
  assert.notEqual(state.published.budget.version, defaultSiteConfig.budget.version);
  assert.equal(state.published.budget.target, defaultSiteConfig.budget.target - 1);
  assert.deepEqual(state.published, state.draft);
  const version = state.published.budget.version;
  state = await (await call('/api/admin/content/publish', 'POST', { revision: state.revision })).json();
  assert.equal(state.published.budget.version, version);
  state.draft.city.name = 'DeBary'; state.draft.city.authority = 'DEBARY';
  state = await (await call('/api/admin/content', 'PATCH', { config: state.draft, revision: state.revision })).json();
  state = await (await call('/api/admin/content/publish', 'POST', { revision: state.revision })).json();
  assert.notEqual(state.published.budget.version, version);
});
test('concurrent initial saves and stale updates cannot overwrite another administrator', async t => {
  const { call } = await setup(t);
  const a = structuredClone(defaultSiteConfig), b = structuredClone(defaultSiteConfig);
  a.copy.title = 'A'; b.copy.title = 'B';
  const responses = await Promise.all([a, b].map(config => call('/api/admin/content', 'PATCH', { config, revision: 0 })));
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
  const state = await (await call('/api/admin/content')).json();
  assert.equal(state.revision, 1);
  assert.equal((await call('/api/admin/content', 'PATCH', { config: a, revision: 0 })).status, 409);
});
test('new editable fields receive defaults without replacing saved text or blank values', async t => {
  const { env, call } = await setup(t);
  const [missing, blank] = Object.keys(defaultSiteConfig.copy);
  const config = structuredClone(defaultSiteConfig);
  delete config.copy[missing]; config.copy[blank] = '';
  await env.DASHBOARD_DB.prepare('INSERT INTO site_settings(key, value) VALUES (?, ?)').bind('city_content_v1', JSON.stringify({ draft: config, published: config, revision: 0 })).run();
  const state = await (await call('/api/admin/content')).json();
  assert.equal(state.draft.copy[missing], defaultSiteConfig.copy[missing]);
  assert.equal(state.published.copy[missing], defaultSiteConfig.copy[missing]);
  assert.equal(state.draft.copy[blank], '');
  assert.equal((await call('/api/admin/content', 'PATCH', { config: state.draft, revision: 0 })).status, 200);
});
test('content mutations require same-origin administrators and bounded JSON', async t => {
  const { env, call } = await setup(t);
  assert.equal((await handleDashboardRequest(request('/api/admin/content'), env)).status, 401);
  assert.equal((await call('/api/admin/content', 'PATCH', {}, { Origin: 'https://other.example.gov' })).status, 403);
  assert.equal((await call('/api/admin/content', 'PATCH', { text: 'x'.repeat(524289) })).status, 413);
  await call('/api/admin/users', 'POST', { name: 'Viewer', email: 'viewer@example.gov', role: 'viewer', password: 'test-viewer-long-password' });
  const viewer = await authenticateStaff('viewer@example.gov', 'test-viewer-long-password', env);
  const cookie = (await staffCookie(request('/'), viewer, env)).split(';')[0];
  for (const [path, method] of [['/api/admin/content', 'GET'], ['/api/admin/content', 'PATCH'], ['/api/admin/content/publish', 'POST'], ['/api/admin/media', 'POST']]) {
    assert.equal((await handleDashboardRequest(request(path, method, method === 'GET' ? undefined : {}, cookie), env)).status, 403);
  }
});
test('schema rejects unsafe links, invalid cities, duplicate cuts, and impossible targets', () => {
  assert.deepEqual(validateSiteConfig(defaultSiteConfig), defaultSiteConfig);
  const cases = [
    config => { config.city.name = 'Orlando'; },
    config => { config.city.authority = 'DAYTONA BEACH'; },
    config => { config.city.logo = 'javascript:alert(1)'; },
    config => { config.city.url = '/relative-url'; },
    config => { config.city.url = 'https://city.example.gov/subpath'; },
    config => { config.media.image = { url: '//evil.example/a.png', alt: '' }; },
    config => { config.links.link = 'data:text/html,hello'; },
    config => { config.budget.services[0].cuts.push(config.budget.services[0].cuts[0]); },
    config => { config.budget.target = 10000000000; },
    config => { config.budget.revenues[0].amount = -1; },
  ];
  for (const mutate of cases) { const config = structuredClone(defaultSiteConfig); mutate(config); assert.throws(() => validateSiteConfig(config)); }
  const netRevenue = structuredClone(defaultSiteConfig);
  netRevenue.budget.services[0].cuts[0].savings = -100;
  assert.equal(validateSiteConfig(netRevenue).budget.services[0].cuts[0].savings, -100);
  for (const cut of netRevenue.budget.services[0].cuts) cut.savings = -100;
  assert.throws(() => validateSiteConfig(netRevenue), /nonnegative total baseline/);
});
test('submissions use the published budget, reject stale versions, and retain historical baselines', async t => {
  const { env, call } = await setup(t);
  const oldModel = budgetModel(defaultSiteConfig);
  const plan = { id: crypto.randomUUID(), costCenterVersion: oldModel.version, cuts: oldModel.items.map(item => item.id) };
  assert.equal((await handleDashboardRequest(request('/api/submissions', 'POST', plan), env)).status, 201);
  let state = await (await call('/api/admin/content')).json();
  state.draft.city.name = 'DeBary'; state.draft.city.authority = 'DEBARY';
  state.draft.budget.target = 100;
  for (const service of state.draft.budget.services) for (const cut of service.cuts) cut.savings = Math.round(cut.savings * 50) / 100;
  state = await (await call('/api/admin/content', 'PATCH', { config: state.draft, revision: state.revision })).json();
  // Unsaved/public-preview changes never become the acceptance catalog.
  const beforePublish = await handleDashboardRequest(request('/api/submissions?preview=1', 'POST', { ...plan, id: crypto.randomUUID() }), env);
  assert.equal(beforePublish.status, 201);
  state = await (await call('/api/admin/content/publish', 'POST', { revision: state.revision })).json();
  assert.equal((await handleDashboardRequest(request('/api/submissions', 'POST', { ...plan, id: crypto.randomUUID() }), env)).status, 409);
  const current = { ...plan, id: crypto.randomUUID(), costCenterVersion: state.published.budget.version };
  assert.equal((await handleDashboardRequest(request('/api/submissions', 'POST', current), env)).status, 201);
  const report = await (await call('/api/admin/submissions')).json();
  assert.equal(report.submissions.length, 3);
  const old = report.submissions.find(row => row.id === plan.id);
  const fresh = report.submissions.find(row => row.id === current.id);
  assert.equal(old.cityName, 'DeLand'); assert.equal(fresh.cityName, 'DeBary');
  assert.equal(old.target, defaultSiteConfig.budget.target); assert.equal(fresh.target, 100);
  assert.equal(report.summary.baselineMixed, true);
  assert.equal(report.currentCatalog.version, current.costCenterVersion);
  assert.equal(old.baseline[0].proposed, Math.round(oldModel.services[0].proposed * 1e8) / 100);
  assert.ok(Math.abs(report.summary.departments[0].proposed - (old.baseline[0].proposed * 2 + fresh.baseline[0].proposed) / 3) < 0.01);
  const filtered = await (await call(`/api/admin/submissions?catalog=${current.costCenterVersion}`)).json();
  assert.equal(filtered.submissions.length, 1); assert.equal(filtered.summary.baselineMixed, false);
});
test('interleaved city validation and legacy reports do not use mutable current-city totals', () => {
  const a = structuredClone(defaultSiteConfig), b = structuredClone(defaultSiteConfig);
  b.city.name = 'DeBary'; b.city.authority = 'DEBARY'; b.budget.version = 'other-city'; b.budget.target = 1;
  for (const service of b.budget.services) for (const cut of service.cuts) cut.savings = 1;
  const validate = config => {
    const saved = validateSubmission({ id: crypto.randomUUID(), costCenterVersion: config.budget.version, cuts: budgetModel(config).items.map(item => item.id) }, config);
    return { ...JSON.parse(saved.snapshot), reduction: saved.reduction };
  };
  const firstA = validate(a), firstB = validate(b), secondA = validate(a);
  assert.equal(firstA.reduction, secondA.reduction); assert.notEqual(firstA.reduction, firstB.reduction);
  assert.deepEqual(firstA.baseline, secondA.baseline);
  const legacy = { ...firstA, baseline: undefined, catalogVersion: a.budget.version, submittedAt: new Date().toISOString() };
  assert.deepEqual(submissionBaseline(legacy), firstA.baseline);
  const summary = summarizeSubmissions([legacy], budgetModel(b).services);
  assert.deepEqual(summary.baselineSources, ['reconstructed']);
  assert.equal(summary.departments[0].proposed, firstA.baseline[0].proposed);
});
test('local middleware renders downstream HTML from published content and guards draft previews', async t => {
  const { env, cookie, call } = await setup(t);
  await env.DASHBOARD_DB.prepare('INSERT INTO site_settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind('coming_soon', 'false').run();
  const config = structuredClone(defaultSiteConfig);
  config.city.searchTitle = 'Published local city';
  let state = await (await call('/api/admin/content', 'PATCH', { config, revision: 0 })).json();
  state = await (await call('/api/admin/content/publish', 'POST', { revision: state.revision })).json();
  state.draft.city.searchTitle = 'Private local draft';
  await call('/api/admin/content', 'PATCH', { config: state.draft, revision: state.revision });
  let middleware;
  reviewerAccess(env).configureServer({ middlewares: { use(handler) { middleware = handler; } } });
  const server = createServer((req, res) => middleware(req, res, error => {
    if (error) { res.statusCode = 500; res.end(error.message); return; }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Length', '15');
    res.write('<!doctype html><html><head><title>Old title</title></head>');
    res.end('<body><main id="hero">City page</main></body></html>');
  }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const url = `http://127.0.0.1:${server.address().port}/`;
  const publicPage = await fetch(url);
  assert.equal(publicPage.status, 200);
  assert.match(await publicPage.text(), /<title>Published local city<\/title>/);
  assert.equal((await fetch(`${url}?contentPreview=1`)).status, 403);
  const preview = await fetch(`${url}?contentPreview=1`, { headers: { Cookie: cookie } });
  assert.equal(preview.status, 200);
  assert.match(await preview.text(), /<title>Private local draft<\/title>/);
  await env.DASHBOARD_DB.prepare('UPDATE site_settings SET value = ? WHERE key = ?').bind('true', 'coming_soon').run();
  const head = await fetch(url, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
});
test('media uploads validate types and size, persist locally, and support video seeking', async t => {
  const { env, cookie } = await setup(t);
  const directory = await mkdtemp(join(tmpdir(), 'city-media-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  env.CITY_MEDIA = localMediaBucket(directory);
  const bytes = Uint8Array.from([0,0,0,20,102,116,121,112,105,115,111,109,0,0,0,0,0,0,0,0]);
  const upload = (body, type = 'video/mp4', extra = {}) => handleDashboardRequest(new Request(origin + '/api/admin/media', { method: 'POST', headers: { Origin: origin, Cookie: cookie, 'Content-Type': type, ...extra }, body }), env);
  assert.equal((await upload('<svg></svg>', 'image/svg+xml')).status, 415);
  assert.equal((await upload('<html>bad</html>', 'image/png')).status, 415);
  assert.equal((await upload(bytes, 'video/mp4', { 'Content-Length': String(26 * 1024 * 1024) })).status, 413);
  const saved = await upload(bytes);
  assert.equal(saved.status, 201);
  const { url } = await saved.json();
  assert.match(url, /^\/api\/media\/[-a-f0-9]+\.mp4$/);
  assert.equal((await reviewerGate(request(url), env, async () => new Response('holding page'))).status, 401);
  const config = structuredClone(defaultSiteConfig);
  config.videos.fire[0].url = url;
  const savedDraft = await handleDashboardRequest(request('/api/admin/content', 'PATCH', { config, revision: 0 }, cookie), env);
  const draft = await savedDraft.json();
  assert.equal((await reviewerGate(request(url), env, async () => new Response('holding page'))).status, 401);
  await handleDashboardRequest(request('/api/admin/content/publish', 'POST', { revision: draft.revision }, cookie), env);
  assert.equal(await reviewerGate(request(url), env, async () => new Response('holding page')), null);
  const full = await handleCityMedia(request(url), env);
  assert.equal(full.status, 200); assert.equal(full.headers.get('Content-Type'), 'video/mp4');
  assert.deepEqual(new Uint8Array(await full.arrayBuffer()), bytes);
  const partial = await handleCityMedia(request(url, 'GET', undefined, undefined, { Range: 'bytes=4-7' }), env);
  assert.equal(partial.status, 206); assert.equal(partial.headers.get('Content-Range'), 'bytes 4-7/20');
  assert.equal(await partial.text(), 'ftyp');
  const head = await handleCityMedia(request(url, 'HEAD'), env);
  assert.equal(head.headers.get('Content-Length'), '20'); assert.equal(await head.text(), '');
  assert.equal((await handleCityMedia(request(url, 'GET', undefined, undefined, { Range: 'bytes=100-' }), env)).status, 416);
});
