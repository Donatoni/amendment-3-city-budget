import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';
import { defaultSiteConfig } from '../src/site-defaults.js';
import { runtimeConfig } from '../src/site-runtime.js';
import { budgetModel, configuredPlan } from '../src/budget-model.js';
import { resultURL, readSharedPlan, resultDescription } from '../src/share-plan.js';
import { paintPostcard } from '../src/postcard.js';
import { renderPage } from '../src/seo.js';
import { renderConfiguredHTML } from '../server/site-html.js';

function cityConfig(name, amount, target, revenue, version) {
  const config = structuredClone(defaultSiteConfig);
  Object.assign(config.city, { name, authority: name.toUpperCase(), siteName: `Build Your ${name}`, url: 'https://city.example.gov/' });
  config.budget.target = target; config.budget.version = version;
  config.budget.services.forEach(service => { service.name = `${name} ${service.id}`; service.cuts = [{ id: `${service.id}-local`, name: `${name} reviewed cut`, savings: amount, impact: 'Reviewed service consequence.' }]; });
  config.budget.revenues = [{ id: 'local-fee', name: `${name} revenue`, description: 'Reviewed local source.', assumption: 'Annual estimate.', amount: revenue }];
  return config;
}
const first = () => cityConfig('Port Orange', 100000, 100000, 50000, 'port-orange-1');
const second = () => cityConfig('Ormond Beach', 250000, 500000, 150000, 'ormond-beach-2');

test('two explicit city configs independently determine totals, target eligibility, shared URLs, and postcard text', () => {
  const runtimeBefore = runtimeConfig();
  for (const [config, total, gap, eligible] of [[first(), 0.5, 150000, true], [second(), 1.25, 400000, false], [first(), 0.5, 150000, true]]) {
    const model = budgetModel(config);
    const plan = configuredPlan(['fire-local'], ['local-fee'], undefined, config);
    assert.equal(model.total, total);
    assert.equal(plan.gapClosed, gap);
    assert.equal(plan.targetMet, eligible);
    assert.equal(plan.values[0], 0);
    assert.equal(plan.items[0].serviceName, `${config.city.name} fire`);
    const link = resultURL(config.city.url, plan.values, { cuts: ['fire-local'], revenues: ['local-fee'] }, false, config);
    assert.equal(new URL(link).searchParams.get('catalog'), config.budget.version);
    const shared = readSharedPlan(link, config);
    assert.deepEqual(shared.values, plan.values);
    const description = resultDescription(shared, config);
    assert.match(description.title, new RegExp(config.city.name));
    assert.ok(Math.abs(description.delta * 1e6 - gap) < 0.001);
    const labels = [];
    const context = new Proxy({ fillText: value => labels.push(String(value)), measureText: value => ({ width: String(value).length * 10 }) }, { get: (target, key) => target[key] || (() => {}) });
    paintPostcard(context, plan.values, { side: 'back', revenues: ['local-fee'] }, { config });
    assert.ok(labels.includes(`${config.city.name.toUpperCase()} / FLORIDA`));
    assert.ok(labels.includes(`${config.city.name} fire`));
    assert.ok(labels.some(label => label.includes(config.city.name) && label.startsWith('What would')));
  }
  assert.equal(runtimeConfig(), runtimeBefore, 'Request-specific rendering does not change the global browser configuration');
});

test('shared plans reject stale catalogs and unknown cuts or revenues', () => {
  const a = first(), b = second();
  const plan = configuredPlan(['fire-local'], ['local-fee'], undefined, a);
  const link = resultURL(a.city.url, plan.values, { cuts: ['fire-local'], revenues: ['local-fee'] }, false, a);
  assert.equal(readSharedPlan(link, b), null);
  const changed = new URL(link); changed.searchParams.set('cuts', 'missing-cut');
  assert.equal(readSharedPlan(changed, a), null);
  changed.searchParams.set('cuts', 'fire-local'); changed.searchParams.set('revenues', 'missing-revenue');
  assert.equal(readSharedPlan(changed, a), null);
});

test('configured HTML escapes city text and FAQ content while embedding the matching config per request', async () => {
  const html = renderPage(await readFile(new URL('../index.html', import.meta.url), 'utf8'), 'https://city.example.gov/', true);
  const a = first(), b = second();
  a.copy.home_hero_53 = '<img src=x onerror=alert(1)>';
  a.faqs = [{ question: '<script>bad()</script>', answer: '</p><img src=x onerror=bad()>' }];
  const renderedA = parseHTML(renderConfiguredHTML(html, a)).document;
  assert.equal(renderedA.querySelectorAll('img[onerror],.faq-list script').length, 0);
  const executableScripts = [...renderedA.querySelectorAll('script:not([type="application/json"]):not([type="application/ld+json"])')];
  assert.ok(executableScripts.every(script => !script.textContent.includes('bad()') && !script.textContent.includes('alert(1)')));
  assert.equal(renderedA.querySelector('.faq-list summary').textContent, a.faqs[0].question);
  assert.equal(renderedA.querySelector('.faq-answer p').textContent, a.faqs[0].answer);
  const renderedB = parseHTML(renderConfiguredHTML(html, b)).document;
  assert.equal(JSON.parse(renderedA.querySelector('#city-site-config').textContent).city.name, a.city.name);
  assert.equal(JSON.parse(renderedB.querySelector('#city-site-config').textContent).city.name, b.city.name);
  assert.equal(renderedB.querySelector('title').textContent, `${b.city.name} Budget & Property Tax Calculator | Amendment 3 (2026)`);
  b.city.searchTitle = '';
  assert.equal(parseHTML(renderConfiguredHTML(html, b)).document.querySelector('title').textContent, b.city.siteName);
});

test('browser bootstrap configuration precedes budget module evaluation and builder markup escapes edited content', () => {
  const config = first();
  config.budget.services[0].name = 'Fire <img src=x onerror=bad()>';
  config.budget.services[0].cuts[0].impact = '<svg onload=bad()> & reviewed';
  config.budget.revenues[0].name = '<script>bad()</script>';
  config.copy.ui_service_kept = 'Funding preserved locally';
  config.copy.ui_service_legend = '<b>{{department}}</b> choices';
  config.copy.ui_revenue_selected = 'Local revenue included';
  const script = `
    import { readFileSync } from 'node:fs';
    import { parseHTML } from 'linkedom';
    import { configureSite } from './src/site-runtime.js';
    const config = JSON.parse(readFileSync(0, 'utf8'));
    configureSite(config);
    const { document } = parseHTML('<html><body><div id="cuts"></div><div id="revenues"></div></body></html>');
    globalThis.document = document;
    const budget = await import('./src/budget.js');
    const catalog = await import('./src/cost-centers.js');
    const { initCostCenterBuilder, initRevenueBuilder } = await import('./src/cost-center-builder.js');
    const renderCuts = initCostCenterBuilder(document.querySelector('#cuts'), new Set(['fire-local']), () => {});
    renderCuts();
    const renderRevenues = initRevenueBuilder(document.querySelector('#revenues'), new Set(['local-fee']), () => {});
    renderRevenues();
    console.log(JSON.stringify({ target: budget.REDUCTION_TARGET_M, total: budget.PROPOSED_TOTAL, version: catalog.COST_CENTER_VERSION, department: document.querySelector('#service-title-fire').textContent, kept: document.querySelector('#amt-fire').textContent, revenue: document.querySelector('#revenue-name-local-fee').textContent, keptLabel: document.querySelector('.cost-center-totals span').textContent, legend: document.querySelector('.cost-center-options legend').textContent, selectedRevenue: document.querySelector('#revenues .cost-choice-state').textContent, unsafe: document.querySelectorAll('img,script,svg[onload],b').length }));
  `;
  const output = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], { cwd: new URL('..', import.meta.url), input: JSON.stringify(config), encoding: 'utf8' }));
  assert.equal(output.target, 0.1);
  assert.equal(output.total, 0.5);
  assert.equal(output.version, config.budget.version);
  assert.equal(output.department, config.budget.services[0].name);
  assert.equal(output.kept, '$0');
  assert.equal(output.revenue, config.budget.revenues[0].name);
  assert.equal(output.keptLabel, 'Funding preserved locally');
  assert.equal(output.legend, `<b>${config.budget.services[0].name}</b> choices`);
  assert.equal(output.selectedRevenue, 'Local revenue included');
  assert.equal(output.unsafe, 0);
});
