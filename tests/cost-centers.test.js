import test from 'node:test';
import { readFileSync } from 'node:fs';
import { SERVICE_VIDEOS } from '../src/service-videos-data.js';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { SERVICES, PROPOSED_TOTAL, fmtUSD, fmtM } from '../src/budget.js';
import { ALL_COST_CENTERS, COST_CENTERS, POTENTIAL_REVENUES, costCenterPlan } from '../src/cost-centers.js';
import { initCostCenterBuilder, initRevenueBuilder } from '../src/cost-center-builder.js';
import { readSharedPlan, resultURL } from '../src/share-plan.js';
import { onRequest as homepage } from '../functions/index.js';
import { resultImageSVG } from '../server/result-image.js';

const origin = 'https://amendment-3.delandfl.gov';
const targetCuts = ['fire-ems', 'streets-signs'];
const streets = SERVICES.find(s => s.id === 'streets').proposed;
const signs = 517755.17, sidewalks = 675136.83;

test('exercise excludes Trailer Park and reconciles its updated baseline', () => {
  assert.equal(ALL_COST_CENTERS.length, 34);
  assert.equal(SERVICES.length, 5);
  assert.equal(PROPOSED_TOTAL, 41.98788216);
  assert.equal(SERVICES.find(service => service.id === 'parks').proposed, 5.05427165);
  assert.equal(ALL_COST_CENTERS.filter(item => item.descriptionStatus === 'draft').length, 0);
  assert.equal(ALL_COST_CENTERS.some(item => item.id === 'parks-trailer-park'), false);
  const all = costCenterPlan(ALL_COST_CENTERS.map(item => item.id));
  assert.ok(all.values.every(value => value === 0));
});

test('October 2 police costs reconcile and shared plans require the revised catalog', () => {
  // Independently rounded from Main!I18:Q18, combining Field Ops and Com Engage.
  assert.deepEqual(COST_CENTERS.police.map(item => item.savings), [
    10893431.64, 680602.11, 2775176.44, 693011.10, 690212.56,
    1014020.55, 180757.45, 85269.13,
  ]);
  assert.equal(COST_CENTERS.police[0].sourceCell, 'Main!I18, Main!O18');
  assert.equal(ALL_COST_CENTERS.some(item => item.id === 'police-community-engagement'), false);
  assert.equal(SERVICES.find(service => service.id === 'police').proposed, 17.01248098);
  const cuts = ['police-field-operations', 'police-personnel-selection'];
  const plan = costCenterPlan(cuts);
  assert.equal(plan.reduction, 11583644.20);
  assert.equal(plan.values[1], 5.42883678);
  const url = new URL(resultURL(origin, plan.values, { cuts }));
  assert.equal(url.searchParams.get('catalog'), 'fy26-27-6');
  assert.deepEqual(readSharedPlan(url).values, plan.values);
  url.searchParams.set('cuts', 'police-community-engagement');
  assert.equal(readSharedPlan(url), null);
  url.searchParams.set('cuts', cuts.join(','));
  url.searchParams.set('catalog', 'fy26-27-5');
  assert.equal(readSharedPlan(url), null);
});

test('potential revenues close the gap without cutting department funding', () => {
  const plan = costCenterPlan([], ['fire-fee', 'millage-rate', 'fire-fee']);
  assert.equal(plan.revenue, 5900000);
  assert.equal(plan.reduction, 0);
  assert.equal(plan.gapClosed, 5900000);
  assert.ok(plan.targetMet);
  assert.deepEqual(plan.values, SERVICES.map(s => s.proposed));
  assert.equal(plan.revenues.length, 2);
  assert.equal(costCenterPlan([], ['fire-fee']).targetMet, false);
  assert.equal(costCenterPlan(['fire-ems'], ['recreation-fees']).targetMet, true);
  assert.equal(costCenterPlan([], POTENTIAL_REVENUES.map(item => item.id)).revenue, 6690000);
  const url = new URL(resultURL(origin, plan.values, { cuts: [], revenues: ['fire-fee', 'millage-rate'] }));
  assert.deepEqual(readSharedPlan(url).revenues, ['fire-fee', 'millage-rate']);
  assert.match(resultImageSVG({ ...readSharedPlan(url), side: 'back' }, {}), /Potential revenue: \$5.9M/);
  for (const invalid of ['unknown', 'fire-fee,fire-fee', 'fire-fee,']) {
    url.searchParams.set('revenues', invalid);
    assert.equal(readSharedPlan(url), null);
  }
  assert.equal(readSharedPlan(`${origin}/?catalog=demo-1&cuts=fire-equipment`), null);
});

test('sports facilities combine three workbook costs into one cut and shareable choice', () => {
  const sports = COST_CENTERS.parks.find(item => item.id === 'parks-sports-facilities');
  assert.equal(COST_CENTERS.parks.length, 9);
  assert.equal(sports.savings, 862368.60);
  assert.equal(sports.sourceCell, 'Main!AH18, Main!AK18, Main!AL18');
  const retired = ['parks-stadium', 'parks-sperling-sports-complex', 'parks-conrad-melching'];
  assert.ok(retired.every(id => !ALL_COST_CENTERS.some(item => item.id === id)));
  const plan = costCenterPlan([sports.id]);
  assert.equal(plan.reduction, 862368.60);
  assert.equal(plan.values[3], 4.19190305);
  assert.equal(plan.items.length, 1);
  const url = new URL(resultURL(origin, plan.values, { cuts: [sports.id] }));
  assert.deepEqual(readSharedPlan(url).cuts, [sports.id]);
  for (const id of retired) {
    url.searchParams.set('cuts', id);
    assert.equal(readSharedPlan(url), null);
  }
  url.searchParams.set('cuts', 'parks-recreation');
  url.searchParams.set('catalog', 'fy26-27-2');
  assert.equal(readSharedPlan(url), null);
});

test('revenue checkboxes add, remove, and reset choices', () => {
  const { document, window } = parseHTML('<div id="revenues"></div>');
  const previousDocument = globalThis.document;
  globalThis.document = document;
  try {
    const container = document.querySelector('#revenues');
    const selected = new Set();
    const render = initRevenueBuilder(container, selected, () => render());
    render();
    assert.equal(container.querySelectorAll('input').length, 6);
    const input = container.querySelector('#revenue-fire-fee');
    input.checked = true;
    input.dispatchEvent(new window.Event('change', { bubbles: true }));
    assert.equal(costCenterPlan([], selected).revenue, 3000000);
    assert.equal(input.closest('label').querySelector('.cost-choice-state').textContent, 'Revenue added');
    input.checked = false;
    input.dispatchEvent(new window.Event('change', { bubbles: true }));
    assert.equal(costCenterPlan([], selected).revenue, 0);
    selected.add('millage-rate'); render(); selected.clear(); render();
    assert.ok([...container.querySelectorAll('input')].every(input => !input.checked));
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test('millage slider updates precise revenue, restores shared rates, and resets to zero', () => {
  const { document, window } = parseHTML('<div id="revenues"></div>');
  const previousDocument = globalThis.document;
  globalThis.document = document;
  try {
    const container = document.querySelector('#revenues');
    const selected = new Set(['millage-rate']);
    const adjustment = { millageRate: 0.4 };
    const render = initRevenueBuilder(container, selected, () => render(), adjustment);
    render();
    const slider = container.querySelector('#revenue-millage-rate');
    assert.equal(slider.type, 'range');
    assert.equal(slider.value, '0.4');
    assert.equal(container.querySelectorAll('input[type="checkbox"]').length, 5);
    assert.match(container.querySelector('#revenue-effect-millage-rate').textContent, /Each 0.1 mill adds an estimated \$290,000 annually/);
    assert.equal(container.querySelector('#millage-revenue-amount').textContent, '+$1,160,000');
    slider.value = '0.5';
    slider.dispatchEvent(new window.Event('input', { bubbles: true }));
    assert.equal(costCenterPlan([], selected, adjustment.millageRate).revenue, 1450000);
    assert.match(slider.getAttribute('aria-valuetext'), /0.5 mills increase, \$1,450,000/);
    slider.value = '0.1';
    slider.dispatchEvent(new window.Event('input', { bubbles: true }));
    assert.equal(container.querySelector('#millage-revenue-amount').textContent, '+$290,000');
    assert.equal(costCenterPlan([], selected, adjustment.millageRate).revenue, 290000);
    slider.value = '1';
    slider.dispatchEvent(new window.Event('input', { bubbles: true }));
    assert.equal(container.querySelector('#millage-revenue-amount').textContent, '+$2,900,000');
    assert.equal(costCenterPlan([], selected, adjustment.millageRate).revenue, 2900000);
    slider.value = '0';
    slider.dispatchEvent(new window.Event('input', { bubbles: true }));
    assert.equal(selected.has('millage-rate'), false);
    assert.equal(costCenterPlan([], selected, adjustment.millageRate).revenue, 0);
    selected.clear(); adjustment.millageRate = 0; render();
    assert.equal(slider.value, '0');
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test('partial millage survives shared links and social images with validated bounds', () => {
  const options = { cuts: [], revenues: ['millage-rate'], millageRate: 0.5, side: 'back' };
  const plan = costCenterPlan([], options.revenues, options.millageRate);
  const url = new URL(resultURL(origin, plan.values, options));
  const parsed = readSharedPlan(url);
  assert.equal(parsed.millageRate, 0.5);
  assert.match(resultImageSVG(parsed, {}), /Potential revenue: \$1.45M/);
  assert.notEqual(resultURL(origin, plan.values, options, true), resultURL(origin, plan.values, { ...options, millageRate: 1 }, true));
  for (const invalid of ['-0.1', '1.1', '0.15', 'NaN', '', '0']) {
    url.searchParams.set('millage', invalid);
    assert.equal(readSharedPlan(url), null, invalid);
  }
  url.searchParams.set('millage', '0.5');
  url.searchParams.set('revenues', '');
  assert.equal(readSharedPlan(url), null);
  assert.throws(() => resultURL(origin, plan.values, { ...options, millageRate: 0.15 }));
});

test('catalog uses unique stable IDs, signed net costs, and reconciled department totals', () => {
  assert.equal(new Set(ALL_COST_CENTERS.map(item => item.id)).size, ALL_COST_CENTERS.length);
  for (const service of SERVICES) {
    assert.ok(COST_CENTERS[service.id].length > 0);
    for (const item of COST_CENTERS[service.id]) {
      assert.match(item.id, /^[a-z]+(?:-[a-z]+)+$/);
      assert.ok(Number.isFinite(item.savings));
      assert.ok(item.name && item.impact);
    }
    assert.equal(COST_CENTERS[service.id].reduce((sum, item) => sum + Math.round(item.savings * 100), 0), Math.round(service.proposed * 1e8));
  }
});

test('cuts subtract only the chosen costs, deduplicate, and restore to the baseline', () => {
  assert.deepEqual(costCenterPlan([]).values, SERVICES.map(service => service.proposed));
  const plan = costCenterPlan(['streets-sidewalks', 'streets-signs', 'streets-signs', 'unknown']);
  assert.equal(plan.reduction, 1192892);
  assert.equal(plan.values[2], 4.35818166);
  assert.equal(plan.values[0], SERVICES[0].proposed);
  assert.equal(plan.items.length, 2);
  assert.equal(costCenterPlan(['streets-signs']).values[2], 5.03331849);
  assert.equal(costCenterPlan([]).reduction, 0);
  assert.equal(fmtM(plan.reduction / 1e6), '$1.19M');
});

test('submission target uses exact dollars at, below, and above $5.2M', () => {
  assert.equal(costCenterPlan(targetCuts).reduction, 5585049.19);
  assert.equal(costCenterPlan(targetCuts).targetMet, true);
  assert.equal(costCenterPlan(targetCuts.slice(0, -1)).targetMet, false);
  const all = costCenterPlan(ALL_COST_CENTERS.map(item => item.id));
  assert.ok(all.targetMet && all.values.every(value => value >= 0));
  assert.ok(Math.abs(PROPOSED_TOTAL - all.values.reduce((a, b) => a + b, 0) - all.reduction / 1e6) < 1e-9);
});

test('share links preserve exact item choices, including different cuts with equal costs', () => {
  for (const cuts of [[], targetCuts, ALL_COST_CENTERS.map(item => item.id)]) {
    const plan = costCenterPlan(cuts);
    for (const image of [false, true]) {
      const url = resultURL(origin, plan.values, { cuts, theme: 'citrus', headline: 2, side: 'back' }, image);
      const parsed = readSharedPlan(url);
      assert.deepEqual(parsed.cuts, plan.items.map(item => item.id));
      assert.deepEqual(parsed.values, plan.values);
      assert.equal(parsed.theme, 'citrus');
      assert.equal(parsed.side, 'back');
    }
  }
  const values = costCenterPlan(['streets-signs']).values;
  const url = new URL(resultURL(origin, values, { cuts: ['streets-signs'] }));
  url.searchParams.set('b', '0_0_0_0_0_0');
  assert.equal(readSharedPlan(url).values[2], 5.03331849);
  for (const cuts of ['unknown', 'streets-signs,streets-signs', 'streets-signs,']) {
    url.searchParams.set('cuts', cuts);
    assert.equal(readSharedPlan(url), null);
  }
  url.searchParams.set('cuts', 'streets-signs');
  url.searchParams.set('catalog', 'obsolete');
  assert.equal(readSharedPlan(url), null);
});

test('homepage redirects and server previews preserve the cost-center plan and precise savings', async () => {
  const plan = costCenterPlan(['streets-signs']);
  const url = new URL(resultURL(origin, plan.values, { cuts: ['streets-signs'], side: 'back' }));
  url.pathname = '/';
  const response = await homepage({ request: new Request(url) });
  assert.equal(response.status, 302);
  assert.deepEqual(readSharedPlan(response.headers.get('Location')).cuts, ['streets-signs']);
  const svg = resultImageSVG(readSharedPlan(url), {});
  assert.match(svg, /\$0.52M deducted/);
  assert.match(svg, /\$5.03M/);
});

test('checkbox interactions and restore keep rendered totals and service choices in sync', () => {
  const { document, window } = parseHTML('<div id="centers"></div>');
  const previousDocument = globalThis.document;
  globalThis.document = document;
  try {
    const container = document.querySelector('#centers');
    const selected = new Set(['streets-signs']);
    const render = initCostCenterBuilder(container, selected, () => render());
    render();
    assert.equal(container.querySelectorAll('input[type="range"]').length, 0);
    assert.equal(container.querySelectorAll('input[type="checkbox"]').length, ALL_COST_CENTERS.length);
    assert.equal(container.querySelector('#cut-parks-trailer-park'), null);
    assert.equal(container.querySelectorAll('.svc-parks input').length, 9);
    assert.equal(container.querySelectorAll('.description-draft').length, 0);
    assert.equal(container.querySelector('#cut-police-community-engagement'), null);
    assert.equal(container.querySelectorAll('.svc-police input').length, 8);
    assert.match(container.querySelector('#effect-police-field-operations').textContent, /includes community engagement/);
    assert.equal(container.querySelector('#price-police-field-operations strong').textContent, '$10,893,432');
    const fieldOperations = container.querySelector('#cut-police-field-operations');
    fieldOperations.checked = true;
    fieldOperations.dispatchEvent(new window.Event('change', { bubbles: true }));
    assert.equal(container.querySelector('#amt-police').textContent, '$6,119,049');
    assert.equal(container.querySelector('#delta-police').textContent, '$10,893,432');
    fieldOperations.checked = false;
    fieldOperations.dispatchEvent(new window.Event('change', { bubbles: true }));
    assert.equal(container.querySelector('#amt-police').textContent, '$17,012,481');
    const sports = container.querySelector('#cut-parks-sports-facilities');
    sports.checked = true;
    sports.dispatchEvent(new window.Event('change', { bubbles: true }));
    assert.equal(container.querySelector('#amt-parks').textContent, '$4,191,903');
    assert.equal(container.querySelector('#delta-parks').textContent, '$862,369');
    sports.checked = false;
    sports.dispatchEvent(new window.Event('change', { bubbles: true }));
    assert.equal(container.querySelector('#amt-parks').textContent, '$5,054,272');
    assert.equal(container.querySelector('#amt-streets').textContent, fmtUSD(streets * 1e6 - signs));
    const checkbox = container.querySelector('#cut-streets-sidewalks');
    checkbox.checked = true;
    checkbox.dispatchEvent(new window.Event('change', { bubbles: true }));
    assert.equal(container.querySelector('#amt-streets').textContent, fmtUSD(streets * 1e6 - signs - sidewalks));
    assert.equal(container.querySelector('#delta-streets').textContent, '$1,192,892');
    assert.equal(checkbox.closest('label').querySelector('.cost-choice-state').textContent, 'Cut selected');
    checkbox.checked = false;
    checkbox.dispatchEvent(new window.Event('change', { bubbles: true }));
    assert.equal(container.querySelector('#amt-streets').textContent, fmtUSD(streets * 1e6 - signs));
    selected.clear();
    render();
    assert.equal(container.querySelector('#amt-streets').textContent, fmtUSD(streets * 1e6));
    assert.ok([...container.querySelectorAll('input')].every(input => !input.checked));
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test('department videos only initialize for departments present in the page', () => {
  const { document } = parseHTML(readFileSync(new URL('../index.html', import.meta.url), 'utf8'));
  for (const id of Object.keys(SERVICE_VIDEOS)) assert.ok(document.querySelector(`#tour-${id}`));
  assert.equal(document.querySelector('#tour-admin'), null);
});
