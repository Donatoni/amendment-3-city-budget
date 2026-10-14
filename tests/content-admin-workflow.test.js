import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';
import { localDatabase } from '../server/dashboard-local.js';
import { authenticateStaff, staffCookie } from '../server/staff-auth.js';
import { handleDashboardRequest } from '../server/dashboard-api.js';
import { handleSiteConfig } from '../server/city-content.js';
import { renderConfiguredHTML } from '../server/site-html.js';
import { defaultSiteConfig } from '../src/site-defaults.js';
import { renderPage } from '../src/seo.js';

test('hero, departments, source copy and citations save privately and publish together without restoring removed items', async t => {
  const origin = 'https://city.example.gov';
  const env = { DASHBOARD_DB: localDatabase(':memory:'), ADMIN_EMAIL: 'fixture@example.invalid', ADMIN_PASSWORD: crypto.randomUUID(), REVIEWER_SESSION_SECRET: crypto.randomUUID() };
  t.after(() => env.DASHBOARD_DB.close());
  const admin = await authenticateStaff(env.ADMIN_EMAIL, env.ADMIN_PASSWORD, env);
  const cookie = (await staffCookie(new Request(origin), admin, env)).split(';')[0];
  const request = (path, method = 'GET', data, authenticated = true) => new Request(origin + path, {
    method, headers: { Origin: origin, 'Content-Type': 'application/json', ...(authenticated ? { Cookie: cookie } : {}) },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  const call = async (path, method, data) => {
    const response = await handleDashboardRequest(request(path, method, data), env);
    const body = await response.json();
    assert.equal(response.status, 200, body.error);
    return body;
  };
  const publicConfig = async () => (await handleSiteConfig(request('/api/site-config', 'GET', undefined, false), env)).json();
  let state = await call('/api/admin/content');
  const original = await publicConfig();
  const removedDepartment = state.draft.budget.services.pop();
  delete state.draft.videos[removedDepartment.id];
  state.draft.budget.services.push({ id: 'library', name: 'Library', desc: 'Synthetic library department.', icon: 'tree', tone: 'green', cutExamples: ['Reduced opening hours.'], cuts: [{ id: 'library-hours', name: 'Opening hours', savings: 200000, impact: 'Fewer opening hours.' }] });
  state.draft.videos.library = [];
  state.draft.heroImages = [{ id: 'local-park', url: '/assets/hero-planning-room.webp', alt: 'Local park fixture', label: 'Our community' }];
  // Whole headings and repeating sections are edited as structured content.
  state.draft.text.home_sources_341 = 'How our city estimates savings';
  state.draft.sections.sourceExplanations[0].body = 'See our [reviewed millage](https://example.gov/reviewed-millage) and **adopted budget**.';
  state.draft.sections.sourceExplanations.push({ id: 'source-explanations-local', title: 'Local assumptions', body: '- First\n- Second' });
  state = await call('/api/admin/content', 'PATCH', { config: state.draft, revision: state.revision });
  assert.deepEqual(await publicConfig(), original, 'Saving all edits leaves published content unchanged');
  const preview = await (await handleSiteConfig(request('/api/site-config?preview=1'), env)).json();
  assert.equal(preview.heroImages.length, 1);
  assert.equal(preview.budget.services.at(-1).id, 'library');
  assert.equal(preview.budget.services.some(service => service.id === removedDepartment.id), false);
  const html = renderPage(await readFile(new URL('../index.html', import.meta.url), 'utf8'), origin, false);
  const document = parseHTML(renderConfiguredHTML(html, preview, { preview: true })).document;
  assert.equal(document.querySelectorAll('[data-hero-slide]').length, 1);
  assert.equal(document.querySelector('#methodology h3').textContent.trim(), 'How our city estimates savings');
  assert.equal(document.querySelector('#methodology a[href="https://example.gov/reviewed-millage"]').textContent, 'reviewed millage');
  assert.equal(document.querySelector('#methodology .source-detail-content strong').textContent, 'adopted budget');
  assert.equal(document.querySelectorAll('#methodology details.source-detail').length, 3);
  assert.equal(document.querySelectorAll('#methodology details.source-detail:last-of-type li').length, 2);
  assert.match(document.body.firstElementChild.textContent, /Draft preview/);
  state = await call('/api/admin/content/publish', 'POST', { revision: state.revision });
  assert.notEqual(state.published.budget.version, defaultSiteConfig.budget.version);
  assert.deepEqual(await publicConfig(), state.published);

  state.draft.heroImages = [];
  state = await call('/api/admin/content', 'PATCH', { config: state.draft, revision: state.revision });
  state = await call('/api/admin/content/publish', 'POST', { revision: state.revision });
  const reloaded = await call('/api/admin/content');
  assert.deepEqual(reloaded.draft.heroImages, []);
  const empty = parseHTML(renderConfiguredHTML(html, await publicConfig())).document;
  assert.equal(empty.querySelectorAll('[data-hero-slide]').length, 0, 'Defaults must not resurrect deleted hero images');
  assert.equal(state.published.budget.services.some(service => service.id === removedDepartment.id), false);
});
