import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';
import { defaultSiteConfig } from '../src/site-defaults.js';
import { validateSiteConfig } from '../src/site-config-schema.js';
import { budgetModel, budgetDisplayRows, configuredPlan } from '../src/budget-model.js';
import { resultURL, readSharedPlan, resultDescription } from '../src/share-plan.js';
import { paintPostcard } from '../src/postcard.js';
import { submissionsCSV, summarizeSubmissions } from '../src/dashboard-data.js';
import { renderConfiguredHTML } from '../server/site-html.js';
import { resultImageSVG } from '../server/result-image.js';
import { validateSubmission } from '../server/dashboard-api.js';
import { publishedSiteConfig } from '../server/city-content.js';
import { localDatabase } from '../server/dashboard-local.js';

function configuration(count = 7) {
  const config = structuredClone(defaultSiteConfig);
  config.budget.version = `departments-${count}`;
  config.budget.target = 500;
  config.budget.services = Array.from({ length: count }, (_, index) => ({
    id: `department-${index}`, name: `Local department ${index}`, desc: `Reviewed department ${index} description`,
    icon: 'chart', tone: 'blue', cuts: [{ id: `cost-${index}`, name: `Reviewed cost ${index}`, savings: (index + 1) * 1000, impact: 'Reviewed impact' }],
    cutExamples: ['', 'Moderate', 'Substantial'],
  }));
  config.videos = {};
  return config;
}

test('department schema accepts replacement and variable counts while preserving budget integrity', () => {
  for (const count of [1, 7, 30]) assert.equal(validateSiteConfig(configuration(count)).budget.services.length, count);
  for (const [mutate, message] of [
    [config => { config.budget.services = []; }, /at least one/],
    [config => { config.budget.services = configuration(31).budget.services; }, /up to 30/],
    [config => { config.budget.services[1].id = config.budget.services[0].id; }, /IDs must be unique/],
    [config => { config.budget.services[0].id = 'bad id'; }, /Department ID/],
    [config => { config.budget.services[0].id = 'constructor'; }, /different department ID/],
    [config => { config.budget.services[0].cuts[0].savings = -1; }, /nonnegative/],
    [config => { config.budget.target = 1e10; }, /target exceeds/],
  ]) {
    const config = configuration(); mutate(config);
    assert.throws(() => validateSiteConfig(config), message);
  }
  const model = budgetModel(configuration());
  assert.equal(model.services[0].cutExamples.length, 4);
  assert.match(model.services[0].cutExamples[3], /city review/);
});

test('public cards, shared plan totals, and fixed-size share previews support added and removed departments', async () => {
  const config = configuration(7);
  config.budget.services[6].name = 'Library <script>bad()</script>';
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const document = parseHTML(renderConfiguredHTML(html, config)).document;
  assert.equal(document.querySelectorAll('.service-card[id^="tour-"]').length, 7);
  assert.equal(document.querySelector('#tour-fire'), null);
  assert.equal(document.querySelector('#tour-department-6 h3').textContent, config.budget.services[6].name);
  assert.equal(document.querySelector('#tour-department-6 p').textContent, config.budget.services[6].desc);
  assert.equal(document.querySelector('#tour-department-6 .service-total strong').textContent, '$7,000');
  assert.equal(document.querySelector('#tour-department-6 script'), null);
  assert.match(document.querySelector('#service-overview-caption').textContent, /7 departments/);
  const plan = configuredPlan(['cost-6'], [], undefined, config);
  const url = resultURL(config.city.url, plan.values, { cuts: ['cost-6'] }, false, config);
  const shared = readSharedPlan(url, config);
  assert.deepEqual(shared.values, plan.values);
  assert.match(resultDescription(shared, config).description, /7 departments/);
  assert.equal(readSharedPlan(url, configuration(1)), null);
  const rows = budgetDisplayRows(plan.values, config);
  assert.equal(rows.length, 5);
  assert.equal(rows.at(-1).name, '3 more departments');
  assert.equal(rows.reduce((sum, row) => sum + Math.round(row.proposed * 1e8), 0), Math.round(budgetModel(config).total * 1e8));
  assert.equal(rows.reduce((sum, row) => sum + Math.round(row.value * 1e8), 0), 2100000);
  const labels = [];
  const context = new Proxy({ fillText: (value, x, y) => labels.push({ value: String(value), y }), measureText: value => ({ width: String(value).length * 10 }) }, { get: (target, key) => target[key] || (() => {}) });
  paintPostcard(context, plan.values, { side: 'back' }, { config });
  assert.ok(labels.some(label => label.value === '3 more departments' && label.y < 1100));
  assert.equal(labels.filter(label => label.value.startsWith('Local department')).length, 4);
  const image = resultImageSVG({ ...shared, side: 'back' }, {}, config);
  assert.match(image, /3 more departments/);
  assert.doesNotMatch(image, /undefined|NaN/);
});

test('browser builder and chart handle more departments than the palette and a zero baseline', () => {
  const config = configuration(7);
  const script = `
    import { readFileSync } from 'node:fs';
    import { parseHTML } from 'linkedom';
    import { configureSite } from './src/site-runtime.js';
    configureSite(JSON.parse(readFileSync(0, 'utf8')));
    const { document } = parseHTML('<html><body><div id="cuts"></div></body></html>');
    globalThis.document = document;
    const { initCostCenterBuilder } = await import('./src/cost-center-builder.js');
    const { budgetComposition, SERVICE_COLORS } = await import('./src/budget-composition.js');
    const { costCenterPlan } = await import('./src/cost-centers.js');
    const selected = new Set(['cost-6']);
    const render = initCostCenterBuilder(document.querySelector('#cuts'), selected, () => {}); render();
    console.log(JSON.stringify({ cards: document.querySelectorAll('.cost-center-card').length, kept: document.querySelector('#amt-department-6').textContent, colors: SERVICE_COLORS, chart: budgetComposition(costCenterPlan(selected).values) }));
  `;
  const run = input => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], { cwd: new URL('..', import.meta.url), input: JSON.stringify(input), encoding: 'utf8' }));
  let result = run(config);
  assert.equal(result.cards, 7);
  assert.equal(result.kept, '$0');
  assert.equal(result.colors.length, 7);
  assert.ok(result.colors.every(value => /^#[a-f0-9]{6}$/.test(value)));
  assert.equal(result.chart.percentages.length, 7);
  assert.ok(result.chart.percentages.every(Number.isFinite));
  for (const service of config.budget.services) service.cuts[0].savings = 0;
  result = run(config);
  assert.deepEqual(result.chart.percentages, Array(7).fill(0));
});

test('shared links round trip a larger valid catalog instead of rejecting the former fixed cut limit', () => {
  const config = configuration(8);
  for (const service of config.budget.services) service.cuts = Array.from({ length: 10 }, (_, index) => ({
    id: `${service.id}-reviewed-local-cost-center-${index}`, name: `Cost center ${index}`, savings: 1000, impact: 'Reviewed impact',
  }));
  const ids = budgetModel(config).items.map(item => item.id);
  const plan = configuredPlan(ids, [], undefined, config);
  const url = resultURL(config.city.url, plan.values, { cuts: ids }, false, config);
  assert.ok(new URL(url).searchParams.get('cuts').length > 3000);
  assert.deepEqual(readSharedPlan(url, config).cuts, ids);
});

test('historical reports and CSV include the union of saved departments without inventing retained funding', () => {
  const snapshot = config => {
    const saved = validateSubmission({ id: crypto.randomUUID(), costCenterVersion: config.budget.version, cuts: [config.budget.services.at(-1).cuts[0].id] }, config);
    return { ...JSON.parse(saved.snapshot), id: saved.id, submittedAt: saved.submitted_at, catalogVersion: saved.catalog_version, reduction: saved.reduction, status: 'new' };
  };
  const before = snapshot(configuration(7));
  const after = snapshot(configuration(1));
  const summary = summarizeSubmissions([before, after]);
  assert.equal(summary.departments.length, 7);
  assert.equal(summary.baselineMixed, true);
  assert.equal(summary.departments.find(item => item.id === 'department-6').proposed, 3500);
  const csv = submissionsCSV([before, after]);
  assert.match(csv, /department-6 retained/);
  assert.doesNotMatch(csv, /fire retained|NaN|undefined/);
  const lines = csv.split('\r\n');
  assert.ok(lines[2].includes('"0","","","","","",""'), 'Removed departments have blank retained amounts, not zero funding');
});

test('saved starter counts upgrade and custom tour descriptions move into Budget without replacing deliberate edits', async t => {
  const config = structuredClone(defaultSiteConfig);
  config.copy.home_services_193 = 'Net costs across these five departments';
  config.copy.home_builder_286 = 'Custom introductory wording';
  config.copy.home_services_166 = 'Custom fire public description';
  config.copy.home_services_171 = 'Earlier police public description';
  config.budget.services[1].desc = 'Reviewed budget description';
  config.faqs[4].answer = 'Custom FAQ response';
  const env = { DASHBOARD_DB: localDatabase(':memory:') };
  t.after(() => env.DASHBOARD_DB.close());
  await env.DASHBOARD_DB.prepare('INSERT INTO site_settings(key, value) VALUES (?, ?)').bind('city_content_v1', JSON.stringify({ draft: config, published: config, revision: 0 })).run();
  const loaded = await publishedSiteConfig(env);
  assert.equal(loaded.copy.home_services_193, defaultSiteConfig.copy.home_services_193);
  assert.equal(loaded.copy.home_builder_286, config.copy.home_builder_286);
  assert.equal(loaded.budget.services[0].desc, 'Custom fire public description');
  assert.equal(loaded.budget.services[1].desc, 'Reviewed budget description');
  assert.equal(loaded.copy.home_services_166, defaultSiteConfig.copy.home_services_166);
  assert.equal(loaded.faqs[4].answer, 'Custom FAQ response');
});
