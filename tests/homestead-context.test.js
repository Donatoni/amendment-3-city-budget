import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import { renderHomesteadContext } from '../src/homestead-context.js';
import { renderTaxComparison } from '../src/tax-comparison.js';
import { initPropertyLookup } from '../src/property-lookup.js';

const template = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('applying, replacing, editing and clearing a county record updates estimate context', async t => {
  const { document, Event } = parseHTML(template);
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    const payload = JSON.parse(options.body);
    return Response.json(payload.query ? { properties: [{ key: '2255315', address: 'Example property', parcel: '123' }] } : { property });
  });
  const priorDocument = globalThis.document;
  globalThis.document = document;
  t.after(() => { globalThis.document = priorDocument; });
  let property = {
    key: '2255315', address: 'Example property', parcel: '123', year: 2026,
    rollStatus: 'working', homestead: true, inCity: true, assessedValue: 300000,
    cityTax: { amount: 1475.46, taxableValue: 238589, millage: 6.1841, rateStatus: 'proposed', kind: 'estimate' },
    sourceURL: 'https://vcpa.vcgov.org/parcel/summary/?altkey=2255315',
  };
  const $ = selector => document.querySelector(selector);
  const homeInput = $('#home-value');
  const homeSlider = $('#home-slider');
  const form = $('#property-search');
  form.reportValidity = () => true;
  initPropertyLookup({ homeInput, homeSlider,
    onSelect: (value, record) => { renderHomesteadContext(record); renderTaxComparison(value, record); },
    onClear: () => { renderHomesteadContext(); renderTaxComparison(300000); },
  });
  const settle = () => new Promise(resolve => setImmediate(resolve));
  async function apply() {
    $('#property-query').value = 'Example';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    $('#property-results button').click();
    await settle();
    $('#property-detail button').click();
  }
  await apply();
  assert.equal($('#calc-eligibility').dataset.status, 'recorded');
  assert.equal($('#calc-eligibility').hidden, false);
  assert.match($('#calc-eligibility-description').textContent, /2026 working/);
  assert.match($('#calc-eligibility-description').textContent, /eligibility still needs/);
  assert.equal($('#calc-record-link').getAttribute('href'), property.sourceURL);
  assert.equal($('#tax-2026').textContent, '$1,475');
  assert.equal($('#remaining-2027').textContent, '$866');
  assert.match($('#calc-baseline-note').textContent, /published estimate/);
  property = { ...property, homestead: false };
  await apply();
  assert.equal($('#calc-eligibility').dataset.status, 'unrecorded');
  assert.equal($('#calc-eligibility').hidden, false);
  assert.match($('#calc-savings-condition').textContent, /No homestead savings/);
  assert.equal($('#save-2027').textContent, '$0');
  assert.equal($('#remaining-2027').textContent, '$1,475');
  assert.match($('#calc-eligibility-description').textContent, /does not list a homestead/);
  for (const control of [homeInput, homeSlider]) {
    control.dispatchEvent(new Event('input'));
    assert.equal($('#calc-eligibility').dataset.status, 'unknown');
    assert.equal($('#calc-eligibility').hidden, true);
    assert.equal($('#property-source').hidden, true);
    assert.equal($('#tax-2026').textContent, '$1,537');
    assert.match($('#calc-baseline-label').textContent, /modeled/i);
    assert.equal($('#calc-savings-title').textContent, 'Savings & city tax remaining');
    await apply();
  }
  $('.property-clear').click();
  assert.equal($('#calc-eligibility').dataset.status, 'unknown');
  assert.equal($('#calc-eligibility').hidden, true);
  assert.equal($('#property-source').hidden, true);
  assert.equal($('#calc-record-link').getAttribute('href'), 'https://vcpa.vcgov.org/search/real-property');
});
