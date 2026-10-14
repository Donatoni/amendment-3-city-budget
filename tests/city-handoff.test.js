import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseHTML } from 'linkedom';
import { localDatabase } from '../server/dashboard-local.js';
import { handleDashboardRequest } from '../server/dashboard-api.js';
import { handleSiteConfig } from '../server/city-content.js';
import { authenticateStaff, staffCookie } from '../server/staff-auth.js';
import { renderConfiguredHTML } from '../server/site-html.js';
import { defaultSiteConfig } from '../src/site-defaults.js';
import { validateSiteConfig } from '../src/site-config-schema.js';
import { contentWarnings, isHiddenCopy, isHiddenLink } from '../src/content-editor-context.js';
import { parseJSONC, readInstallation, installationConfig, writeInstallation, validSiteURL } from '../scripts/lib/installation.mjs';

const origin = 'https://springfield-budget.pages.dev';
const portOrange = () => { const config = structuredClone(defaultSiteConfig); Object.assign(config.city, { name: 'Port Orange', authority: 'PORT ORANGE' }); return config; };

test('a new installation starts with its own public address, not the source city', async t => {
  const env = { DASHBOARD_DB: localDatabase(':memory:'), SITE_URL: `${origin}/` };
  t.after(() => env.DASHBOARD_DB.close());
  const config = await (await handleSiteConfig(new Request(`${origin}/api/site-config`), env)).json();
  assert.equal(config.city.url, `${origin}/`);
  // Without a SITE_URL the sample address is kept (this repository's own install).
  const plain = { DASHBOARD_DB: localDatabase(':memory:') };
  t.after(() => plain.DASHBOARD_DB.close());
  assert.equal((await (await handleSiteConfig(new Request(`${origin}/api/site-config`), plain)).json()).city.url, defaultSiteConfig.city.url);
});

test('content errors name the field in plain language and return its path to the editor', async t => {
  const check = (mutate, field, message) => {
    const config = structuredClone(defaultSiteConfig); mutate(config);
    try { validateSiteConfig(config); assert.fail('expected a validation error'); }
    catch (error) { assert.deepEqual(error.field, field); assert.match(error.message, message); }
  };
  check(config => { config.city.url = 'https://budget.example.gov/about'; }, ['city', 'url'], /nothing after the final slash/);
  check(config => { config.city.fiscalYear = ' '; }, ['city', 'fiscalYear'], /Fiscal year label is required/);
  check(config => { config.city.millage = null; }, ['city', 'millage'], /millage is required/);
  check(config => { config.links['home_site-footer_link_10'] = 'http://facebook.com/city'; }, ['links', 'home_site-footer_link_10'], /https:\/\//);
  check(config => { config.faqs[1].answer = ''; }, ['faqs', 1, 'answer'], /FAQ 2 answer is required/);
  check(config => { config.budget.services[2].cuts[1].savings = null; }, ['budget', 'services', 2, 'cuts', 1, 'savings'], /annual amount is required/);
  const env = { DASHBOARD_DB: localDatabase(':memory:'), ADMIN_EMAIL: 'admin@example.gov', ADMIN_PASSWORD: 'test-administrator-password', REVIEWER_SESSION_SECRET: 'test-dashboard-signing-secret-at-least-32' };
  t.after(() => env.DASHBOARD_DB.close());
  const cookie = (await staffCookie(new Request(origin), await authenticateStaff(env.ADMIN_EMAIL, env.ADMIN_PASSWORD, env), env)).split(';')[0];
  const call = (method, body) => handleDashboardRequest(new Request(`${origin}/api/admin/content`, { method, headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }), env);
  const state = await (await call('GET')).json();
  state.draft.city.description = '';
  const response = await call('PATCH', { config: state.draft, revision: state.revision });
  assert.equal(response.status, 400);
  assert.deepEqual((await response.json()).field, ['city', 'description']);
});

test('review list flags leftover source-city content, key facts and sample figures', () => {
  const sample = portOrange();
  const messages = contentWarnings(sample).map(item => item.message).join('\n');
  for (const pattern of [/site address is still DeLand/, /millage is still DeLand/, /City logo is still a DeLand image/, /Key fact is still DeLand’s: Year 2 budget impact/, /Key fact is still DeLand’s: City Clerk phone/, /Check the date/, /Footer · Facebook/, /sample figures/, /site name still mentions DeLand/, /link preview image description still mentions DeLand/]) assert.match(messages, pattern);
  // Every item can be opened: either a field path or a page and section.
  for (const warning of contentWarnings(sample)) assert.ok(warning.path || warning.tab, warning.message);
  // DeLand's own sample is complete, so it has nothing to review.
  assert.deepEqual(contentWarnings(structuredClone(defaultSiteConfig)), []);
  // A missing required key fact is flagged for any city.
  const missing = structuredClone(defaultSiteConfig); missing.city.clerkPhone = '';
  assert.match(contentWarnings(missing).map(item => item.message).join('\n'), /Key fact needed: City Clerk phone/);
  const reviewed = portOrange();
  Object.assign(reviewed.city, { url: 'https://budget.port-orange.example/', millage: 4.975, logo: '/api/media/logo.png', socialImage: '/api/media/social.png', shareImage: '/api/media/share.jpg', clerkPhone: '386-555-0100', yearTwoImpact: 3100000 });
  reviewed.links['home_site-footer_link_10'] = '';
  const after = contentWarnings(reviewed).map(item => item.message).join('\n');
  assert.doesNotMatch(after, /site address|millage is still|logo is still|Footer · Facebook|City Clerk phone|Year 2 budget impact/);
});

test('editor hides plumbing and symbols but keeps real wording and figures editable', () => {
  for (const key of ['home_home_1', 'home_nav_5', 'home_mobile-menu_33', 'home_shared-dismiss_49', 'home_hero_62', 'home_builder_297', 'home_nav-budget-progress_21']) assert.equal(isHiddenCopy(key), true, key);
  for (const key of ['home_hero_59', 'home_overview_136', 'home_amendment_203', 'home_overview_149', 'privacy_main_datetime_16', 'privacy_records_46']) assert.equal(isHiddenCopy(key), false, key);
  assert.equal(isHiddenLink('privacy_page_link_1'), true);
  assert.equal(isHiddenLink('home_site-footer_link_10'), false);
});

test('a cleared link is removed from the page instead of keeping the source city address', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const config = portOrange();
  config.links['home_site-footer_link_10'] = '';
  config.links.home_sources_link_7 = '';
  const document = parseHTML(renderConfiguredHTML(html, config)).document;
  assert.equal(document.querySelector('a[href*="facebook.com/CityofDeLand"]'), null);
  assert.equal([...document.querySelectorAll('a')].some(node => node.getAttribute('href') === ''), false);
  // Other footer links are untouched.
  assert.ok(document.querySelector(`a[href="${config.links['home_site-footer_link_11']}"]`));
});

test('wrangler.jsonc is the single record of where an installation lives', t => {
  assert.deepEqual(parseJSONC('// note\n{ "a": "https://x.example/", /* b */ "c": [1, 2,], }'), { a: 'https://x.example/', c: [1, 2] });
  const dir = mkdtempSync(join(tmpdir(), 'install-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  // A fresh copy has no wrangler.jsonc until `npm run setup` writes one.
  assert.equal(readInstallation(join(dir, 'missing.jsonc')), null);
  const path = join(dir, 'wrangler.jsonc');
  writeInstallation(installationConfig({ project: 'springfield-budget', accountId: 'acct', siteURL: `${origin}/`, productionBranch: 'production', database: { name: 'springfield-budget-db', id: 'db-id' }, bucket: 'springfield-budget-media', preview: { database: { name: 'p-db', id: 'p-id' }, bucket: 'p-media' } }), path);
  const installation = readInstallation(path);
  assert.deepEqual([installation.project, installation.database.id, installation.bucket, installation.siteURL, installation.productionBranch, installation.accountId], ['springfield-budget', 'db-id', 'springfield-budget-media', `${origin}/`, 'production', 'acct']);
  assert.equal(installation.config.env.preview.d1_databases[0].database_id, 'p-id');
  assert.equal(installation.config.env.preview.vars.SITE_URL, `${origin}/`);
  assert.equal(validSiteURL('https://budget.example.gov'), 'https://budget.example.gov/');
  for (const bad of ['http://budget.example.gov/', 'https://budget.example.gov/path', 'not a url', 'https://localhost/']) assert.equal(validSiteURL(bad), '', bad);
  writeFileSync(path, '{}');
  assert.equal(readInstallation(path).database, null);
});

test('turning off the property tax slider removes it from plans, submissions and the target check', async () => {
  const { budgetModel, configuredPlan } = await import('../src/budget-model.js');
  const { validateSubmission } = await import('../server/dashboard-api.js');
  const config = structuredClone(defaultSiteConfig);
  const millage = config.budget.revenues.find(item => item.id === 'millage-rate');
  millage.enabled = false;
  assert.equal(validateSiteConfig(config).budget.revenues.find(item => item.id === 'millage-rate').enabled, false);
  assert.equal(budgetModel(config).revenues.some(item => item.id === 'millage-rate'), false);
  assert.throws(() => configuredPlan([], ['millage-rate'], 1, config));
  const everyCut = budgetModel(config).items.map(item => item.id);
  assert.throws(() => validateSubmission({ id: crypto.randomUUID(), costCenterVersion: config.budget.version, cuts: everyCut, revenues: ['millage-rate'], millageRate: 1 }, config), /revenues are invalid/);
  assert.doesNotThrow(() => validateSubmission({ id: crypto.randomUUID(), costCenterVersion: config.budget.version, cuts: everyCut, revenues: [], millageRate: 0 }, config));
  // A target only reachable with the slider is rejected once it is off.
  const cuts = budgetModel(config).items.reduce((sum, item) => sum + Math.max(0, item.savings), 0);
  const others = config.budget.revenues.filter(item => item.id !== 'millage-rate').reduce((sum, item) => sum + item.amount, 0);
  config.budget.target = Math.ceil(cuts + others + millage.amount / 2);
  assert.throws(() => validateSiteConfig(config), /target exceeds/);
  millage.enabled = true;
  assert.doesNotThrow(() => validateSiteConfig(config));
  millage.enabled = 'no';
  assert.throws(() => validateSiteConfig(config), /Choose whether residents see/);
});

test('generated content recipes match the page templates', async () => {
  const { spawnSync } = await import('node:child_process');
  const result = spawnSync(process.execPath, ['scripts/generate-content-model.mjs', '--check'], { cwd: new URL('..', import.meta.url), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('older fragment edits carry into whole fields, and a full draft stays within size limits', async () => {
  const { normalizeContent } = await import('../src/content-model.js');
  const config = structuredClone(defaultSiteConfig);
  config.copy.home_hero_58 = '$9 million';
  config.copy.privacy_records_46 = '555-0100';
  config.links.privacy_records_link_7 = 'tel:+15550100';
  const content = normalizeContent(config);
  assert.match(content.text.home_hero_55, /\*\*\$9 million\*\*/);
  assert.match(content.sections.privacySections.find(item => item.id === 'records').body, /\[555-0100\]\(tel:\+15550100\)/);
  assert.equal(content.sections.privacySections.filter(item => item.visibility !== 'always').length, 2);
  // Once saved, whole fields win over the old fragments.
  config.text = { ...content.text, home_hero_55: 'Rewritten.' };
  assert.equal(normalizeContent(config).text.home_hero_55, 'Rewritten.');
  assert.doesNotThrow(() => validateSiteConfig(content));
  assert.ok(JSON.stringify(content).length < 400000, `Draft is ${JSON.stringify(content).length} characters`);
});

test('key facts fill text in three money styles, make any phone tappable, and are validated', async () => {
  const { expandCopy } = await import('../src/site-runtime.js');
  const config = structuredClone(defaultSiteConfig);
  Object.assign(config.city, { yearTwoImpact: 3150000, clerkPhone: '(386) 555-0199', municipalityType: 'Town', name: 'Pierson', authority: 'PIERSON' });
  assert.equal(expandCopy('{{yearTwoImpact}} | {{yearTwoImpact:short}} | {{yearTwoImpact:words}}', config), '$3,150,000 | $3.2M | $3.2 million');
  assert.equal(expandCopy('{{municipality}} · {{clerkPhoneLink}} · {{unknownFact}}', config), 'Town of Pierson · tel:+13865550199 · {{unknownFact}}');
  const check = (mutate, pattern) => { const c = structuredClone(defaultSiteConfig); mutate(c); assert.throws(() => validateSiteConfig(c), pattern); };
  check(c => { c.city.clerkPhone = 'call us'; }, /should look like/);
  check(c => { c.city.publicRecordsUrl = 'http://records.example.gov'; }, /https/);
  check(c => { c.city.municipalityType = 'Village'; }, /City or Town/);
  check(c => { c.city.tagline = ''; }, /Tagline is required/);
  check(c => { c.links.privacy_records_link_6 = '{{notAFact}}'; }, /link/i);
  assert.doesNotThrow(() => validateSiteConfig(structuredClone(defaultSiteConfig)), 'Links written as key facts validate after they fill in');
});

test('starter wording nobody edited moves to key facts on load; edited wording is left alone', async t => {
  const { previousStarter } = await import('../src/previous-starter.js');
  const env = { DASHBOARD_DB: localDatabase(':memory:') };
  t.after(() => env.DASHBOARD_DB.close());
  const saved = structuredClone(defaultSiteConfig);
  for (const [key, versions] of Object.entries(previousStarter.copy)) saved.copy[key] = versions.at(-1);
  for (const [key, versions] of Object.entries(previousStarter.links)) saved.links[key] = versions.at(-1);
  saved.copy.privacy_main_15 = 'October 30, 2026';
  delete saved.text; delete saved.sections;
  await env.DASHBOARD_DB.prepare('INSERT INTO site_settings(key, value) VALUES (?, ?)').bind('city_content_v1', JSON.stringify({ draft: saved, published: saved, revision: 3 })).run();
  const config = await (await handleSiteConfig(new Request(`${origin}/api/site-config`), env)).json();
  const records = config.sections.privacySections.find(item => item.id === 'records').body;
  assert.match(records, /\[\{\{clerkPhone\}\}\]\(\{\{clerkPhoneLink\}\}\)/, 'Old "(add number)" placeholder now uses the key fact');
  assert.equal(config.text.privacy_main_15, 'October 30, 2026', 'An edited date is kept');
  assert.equal(config.text.home_hero_55.includes('{{yearTwoImpact:words}}'), true);
});

test('the upgrade keeps partly edited lines whole and never shows another city DeLand contacts', async t => {
  const { previousStarter } = await import('../src/previous-starter.js');
  const load = async saved => {
    const env = { DASHBOARD_DB: localDatabase(':memory:') };
    t.after(() => env.DASHBOARD_DB.close());
    delete saved.text; delete saved.sections;
    await env.DASHBOARD_DB.prepare('INSERT INTO site_settings(key, value) VALUES (?, ?)').bind('city_content_v1', JSON.stringify({ draft: saved, published: saved, revision: 1 })).run();
    return (await handleSiteConfig(new Request(`${origin}/api/site-config`), env)).json();
  };
  const seeded = () => { const saved = structuredClone(defaultSiteConfig); for (const [key, versions] of Object.entries(previousStarter.copy)) saved.copy[key] = versions[0]; for (const [key, versions] of Object.entries(previousStarter.links)) saved.links[key] = versions[0]; return saved; };
  const partial = seeded(); partial.copy.home_nav_6 = 'community choices';
  assert.equal((await load(partial)).text.home_nav_4, 'Budget & community choices');
  const other = seeded(); Object.assign(other.city, { name: 'Port Orange', authority: 'PORT ORANGE' });
  for (const key of ['clerkPhone', 'clerkAddress', 'publicRecordsUrl', 'privacyPolicyUrl']) delete other.city[key];
  const config = await load(other);
  const records = config.sections.privacySections.find(item => item.id === 'records').body;
  assert.equal(config.city.clerkPhone, '');
  assert.doesNotMatch(records, /386-626-7130|120 S Florida|\{\{clerk/);
  assert.match(records, /\(add number\)/, 'The old flagged placeholder stays until the city enters its contacts');
});

test('blank key facts never show codes, get flagged, and point save errors at the key fact', async () => {
  const { expandCopy } = await import('../src/site-runtime.js');
  const { renderConfiguredHTML } = await import('../server/site-html.js');
  const { renderPage } = await import('../src/seo.js');
  const { parseHTML } = await import('linkedom');
  const config = portOrange();
  Object.assign(config.city, { generalFundTotal: null, sampleAddress: '', clerkPhone: '386-555-0100 ext. 12', amendmentReviewedDate: 'Fall 2026' });
  assert.equal(expandCopy('[{{generalFundTotal:words}}]', config), '[]');
  assert.equal(expandCopy('{{clerkPhoneLink}}', config), 'tel:+13865550100,12');
  const home = parseHTML(renderConfiguredHTML(renderPage(readFileSync(new URL('../index.html', import.meta.url), 'utf8'), 'https://city.example.gov/', false), config)).document;
  assert.equal(/\{\{/.test(home.body.textContent), false);
  assert.equal(home.querySelector('#property-query').hasAttribute('placeholder'), false, 'No bare "e.g." hint');
  assert.equal(home.querySelector('.source-reviewed time').hasAttribute('datetime'), false, 'Only real dates get a machine-readable form');
  assert.match(contentWarnings(config).map(item => item.message).join('\n'), /Key fact needed: General Fund total/);
  const blankLink = structuredClone(defaultSiteConfig); blankLink.city.millagePageUrl = '';
  try { validateSiteConfig(blankLink); assert.fail('expected an error'); } catch (error) { assert.deepEqual(error.field, ['city', 'millagePageUrl']); }
});
