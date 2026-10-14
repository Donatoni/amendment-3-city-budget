import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import { handlePropertyRequest, parseAssessment } from '../server/property-appraiser.js';
import { initPropertyLookup } from '../src/property-lookup.js';
import { VOLUSIA_CITIES, getVolusiaCity } from '../src/volusia-cities.js';

// Sanitized VCPA desktop table structure, with deliberately different market,
// school-assessed, city-assessed, and taxable values to detect wrong-column use.
const fixture = `
<input id="altkey" value="2255315">
<div><strong>Physical Address:</strong></div><div>120 S FLORIDA AVE, DELAND 32720</div>
<div><strong>Parcel ID:</strong></div><div>701652000020</div>
<div><strong>Tax District:</strong></div><div>012-DELAND</div>
<div><strong>Homestead Property:</strong></div><div>Yes</div>
<section>
<p>Values shown below are the 2026 WORKING TAX ROLL VALUES that are subject to change until certified.</p>
<div><div class="row"><strong>Tax Authority</strong><strong>Just/Market Value</strong><strong>Assessed Value</strong><strong>Ex/10CAP</strong><strong>Taxable Value</strong></div></div>
<div id="taxAuthority">
  <div class="row"><div title="School Fund">0017</div><div>CAPITAL IMPROVEMENT</div><div>$400,000</div><div>$310,000</div><div>$25,000</div><div>$285,000</div></div>
  <div class="row"><div title="County Fund">0050</div><div>GENERAL FUND</div><div>$400,000</div><div>$300,000</div><div>$51,411</div><div>$248,589</div></div>
  <div class="row"><div title="Municipality Fund">0150</div><div>DELAND</div><div>$400,000</div><div>$300,000</div><div>$51,411</div><div>$248,589</div></div>
</div></section>`;
const request = payload => new Request('https://example.com/api/property', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
const confidentialFixture = fixture.replace('<div>Yes</div>', '<div>CONFIDENTIAL DATA F.S.119.071</div>');

test('confidential required fields return a specific manual-entry response without property values', async () => {
  for (const html of [confidentialFixture,
    fixture.replace('120 S FLORIDA AVE, DELAND 32720', 'CONFIDENTIAL DATA F.S.119.071'),
    fixture.replaceAll('$300,000', 'CONFIDENTIAL DATA F.S.119.071')]) {
    const response = await handlePropertyRequest(request({ key: '2255315' }), async () => new Response(html));
    assert.equal(response.status, 422);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    const data = await response.json();
    assert.equal(data.code, 'CONFIDENTIAL_PROPERTY');
    assert.match(data.error, /confidential/);
    assert.match(data.error, /assessed value before exemptions manually/);
    assert.equal(data.property, undefined);
  }
});

test('unrelated confidentiality text and unknown homestead values do not imply a confidential assessment', async () => {
  const publicRecord = `${fixture}<div><strong>Owner:</strong></div><div>CONFIDENTIAL DATA F.S.119.071</div>`;
  assert.equal(parseAssessment(publicRecord, '2255315').homestead, true);
  const response = await handlePropertyRequest(request({ key: '2255315' }), async () => new Response(fixture.replace('<div>Yes</div>', '<div>Unknown</div>')));
  assert.equal(response.status, 502);
  assert.equal((await response.json()).code, undefined);
});

test('selecting a confidential result shows guidance, preserves manual entry, and allows another lookup', async t => {
  const { document, Event } = parseHTML(readFileSync(new URL('../index.html', import.meta.url), 'utf8'));
  const priorDocument = globalThis.document;
  globalThis.document = document;
  t.after(() => { globalThis.document = priorDocument; });
  let html = confidentialFixture;
  t.mock.method(globalThis, 'fetch', async (_url, options) => handlePropertyRequest(request(JSON.parse(options.body)), async (_countyURL, countyOptions) => {
    return countyOptions.method === 'POST'
      ? Response.json({ status: 200, recordsFiltered: 1, data: [{ altkey: '2255315', parcel: '123', street: 'Example property' }] })
      : new Response(html);
  }));
  const $ = selector => document.querySelector(selector);
  const form = $('#property-search');
  const homeInput = $('#home-value');
  const homeSlider = $('#home-slider');
  const onSelect = t.mock.fn();
  const onClear = t.mock.fn();
  const originalValue = homeInput.value;
  form.reportValidity = () => true;
  initPropertyLookup({ homeInput, homeSlider, onSelect, onClear });
  const settle = () => new Promise(resolve => setImmediate(resolve));
  $('#property-query').value = 'Example';
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  await settle();
  $('#property-results button').click();
  await settle();
  assert.match($('#property-status').textContent, /confidential/);
  assert.match($('#property-status').textContent, /assessed value before exemptions manually/);
  assert.equal($('#property-detail').hidden, true);
  assert.equal($('#property-detail button'), null);
  assert.equal(homeInput.value, originalValue);
  assert.equal(onSelect.mock.callCount(), 0);
  assert.equal(form.hasAttribute('aria-busy'), false);
  homeInput.value = '250000';
  homeInput.dispatchEvent(new Event('input'));
  assert.equal(onClear.mock.callCount(), 1);
  assert.equal(homeInput.disabled, false);
  html = fixture;
  $('#property-results button').click();
  await settle();
  assert.match($('#property-status').textContent, /Property record loaded/);
  $('#property-detail button').click();
  assert.equal(onSelect.mock.callCount(), 1);
  assert.equal(onSelect.mock.calls[0].arguments[0], 300000);
});

test('uses the city assessed column before exemptions and retains roll provenance', () => {
  const property = parseAssessment(fixture, '2255315');
  assert.equal(property.assessedValue, 300000);
  assert.equal(property.year, 2026);
  assert.equal(property.rollStatus, 'working');
  assert.equal(property.homestead, true);
  assert.equal(property.inCity, true);
  assert.equal(property.sourceURL, 'https://vcpa.vcgov.org/parcel/summary/?altkey=2255315');
  assert.equal(parseAssessment(fixture.replace('<div>$300,000</div><div>$51,411</div><div>$248,589</div></div>\n</div>', '<div>$0</div><div>$0</div><div>$0</div></div>\n</div>'), '2255315').assessedValue, 0);
});

test('a DeLand mailing address does not establish DeLand city taxation', () => {
  const outside = fixture.replace('012-DELAND', '100-UNINCORPORATED - WESTSIDE').replace('<div>DELAND</div>', '<div>DEBARY</div>').replace('>0150</div>', '>0190</div>');
  const property = parseAssessment(outside, '2255315');
  assert.equal(property.inCity, false);
  assert.equal(property.assessedValue, null);
  assert.equal(parseAssessment(fixture.replace('<div>Yes</div>', '<div>No - Apply online</div>'), '2255315').homestead, false);
});

const taxFixture = fixture
  .replace('</p>', ' Millage Rates below that are used in the calculation of the Estimated Taxes are the 2026 PROPOSED MILLAGE RATES.</p>')
  .replace('<strong>Taxable Value</strong>', '<strong>Taxable Value</strong><strong>Millage Rate</strong><strong>Estimated Taxes</strong>')
  .replace('<div>DELAND</div><div>$400,000</div><div>$300,000</div><div>$51,411</div><div>$248,589</div>', '<div>DELAND</div><div>$400,000</div><div>$300,000</div><div>$61,411</div><div>$238,589</div><div>6.1841</div><div>$1,475.46</div>');

test('imports only the city tax, taxable value, rate, and rate provenance', () => {
  assert.deepEqual(parseAssessment(taxFixture, '2255315').cityTax, {
    amount: 1475.46, taxableValue: 238589, millage: 6.1841, rateStatus: 'proposed', kind: 'estimate',
  });
  const zero = taxFixture.replace('$238,589', '$0').replace('$1,475.46', '$0.00');
  assert.equal(parseAssessment(zero, '2255315').cityTax.amount, 0);
});

test('missing, inconsistent, or changed city-tax fields preserve value with an explicit null tax', () => {
  for (const html of [fixture, taxFixture.replace('Estimated Taxes</strong>', 'Unknown</strong>'),
    taxFixture.replace('$1,475.46', 'Unavailable'), taxFixture.replace('$1,475.46', '$10,000.00'),
    taxFixture.replace('$238,589', '$400,000'), taxFixture.replace('2026 PROPOSED', '2025 PROPOSED'),
    taxFixture.replace('<div>6.1841</div>', '<div></div>')]) {
    const property = parseAssessment(html, '2255315');
    assert.equal(property.assessedValue, 300000);
    assert.equal(property.cityTax, null);
  }
});

test('missing fields, disclaimer pages, wrong parcels, and changed columns fail closed', () => {
  for (const html of ['<p>Agree to the data disclaimer</p>', fixture.replace('value="2255315"', 'value="9999999"'), fixture.replace('Assessed Value', 'Unknown Value'), fixture.replace('WORKING TAX ROLL VALUES', 'Unknown'), fixture.replace('<div>DELAND</div>', '<div>RENAMED</div>'), fixture.replaceAll('$300,000', 'Unavailable')]) {
    assert.throws(() => parseAssessment(html, '2255315'));
  }
});

test('search deduplicates owner rows, limits results, and omits owner information', async () => {
  const row = { altkey: '2255315', parcel: '701652000020', street: '120 S FLORIDA AVE DELAND', owner: 'OWNER NAME' };
  const response = await handlePropertyRequest(request({ query: '120 S FLORIDA' }), async (url, options) => {
    assert.equal(url, 'https://vcpa.vcgov.org/api/search/real-property');
    assert.equal(options.body.get('search[value]'), '120 S FLORIDA');
    assert.equal(options.body.get('length'), '12');
    return Response.json({ status: 200, recordsFiltered: '20', data: [row, row] });
  });
  const data = await response.json();
  assert.equal(data.properties.length, 1);
  assert.equal(data.hasMore, true);
  assert.equal(JSON.stringify(data).includes('OWNER'), false);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});

test('detail lookup, empty searches, invalid input, and provider failures have safe responses', async () => {
  const detail = await handlePropertyRequest(request({ key: '2255315' }), async () => new Response(fixture));
  assert.equal((await detail.json()).property.assessedValue, 300000);
  const empty = await handlePropertyRequest(request({ query: 'unknown' }), async () => Response.json({ status: 200, recordsFiltered: 0, data: [] }));
  assert.deepEqual(await empty.json(), { properties: [], hasMore: false });
  for (const input of [null, {}, { query: 'ab' }, { query: ' '.repeat(20) }, { query: 'x'.repeat(121) }, { key: '../../evil' }, { key: 2255315 }]) {
    assert.equal((await handlePropertyRequest(request(input), () => { throw new Error('must not fetch'); })).status, 400);
  }
  for (const fetcher of [async () => { throw new Error('timeout'); }, async () => new Response('down', { status: 429 }), async () => new Response('not json'), async () => Response.json({ data: [] })]) {
    assert.equal((await handlePropertyRequest(request({ query: '120 FLORIDA' }), fetcher)).status, 502);
  }
  assert.equal((await handlePropertyRequest(new Request('https://example.com/api/property'))).status, 405);
  const routes = JSON.parse(readFileSync(new URL('../public/_routes.json', import.meta.url)));
  assert.ok(routes.include.includes('/api/property') || routes.include.includes('/*'));
});


test('each supported Volusia municipality uses its own operating authority and exact assessed column', () => {
  assert.equal(VOLUSIA_CITIES.length, 17);
  assert.equal(new Set(VOLUSIA_CITIES.map(city => city.authorityCode)).size, 17);
  for (const city of VOLUSIA_CITIES) {
    const html = taxFixture.replaceAll('DELAND', city.authority).replace('>0150</div>', `>${city.authorityCode}</div>`);
    const property = parseAssessment(html, '2255315', city);
    assert.equal(property.inCity, true, city.name);
    assert.equal(property.city, city.name);
    assert.equal(property.authority, city.authority);
    assert.equal(property.assessedValue, 300000);
    assert.equal(property.cityTax.amount, 1475.46);
    assert.equal(property.inCity, true);
    assert.equal(getVolusiaCity(city.authority), city);
  }
});

test('city configuration rejects mismatched identities and unrecognized municipalities', () => {
  for (const city of [null, {}, { name: 'DeLand', authority: 'DEBARY' }, 'Orlando']) {
    assert.throws(() => parseAssessment(fixture, '2255315', city), /Unsupported municipality/);
  }
});

test('municipality matching never uses postal names, nearby cities, debt, or port authority', () => {
  const ponce = getVolusiaCity('Ponce Inlet');
  const portOnly = fixture.replace('012-DELAND', '600-UNINCORPORATED - SOUTHEAST')
    .replace('120 S FLORIDA AVE, DELAND', '1 OCEAN AVE, PONCE INLET')
    .replace('title="Municipality Fund">0150', 'title="Other Fund">0530')
    .replace('<div>DELAND</div>', '<div>PONCE INLET PORT AUTHORITY</div>');
  const outside = parseAssessment(portOnly, '2255315', ponce);
  assert.equal(outside.inCity, false);
  assert.equal(outside.assessedValue, null);
  assert.equal(outside.cityTax, null);
  const shores = fixture.replaceAll('DELAND', 'DAYTONA BEACH SHORES').replace('>0150</div>', '>0240</div>');
  assert.equal(parseAssessment(shores, '2255315', getVolusiaCity('Daytona Beach')).inCity, false);
  const debtOnly = fixture.replaceAll('DELAND', 'ORMOND BEACH').replace('>0150</div>', '>0184</div>')
    .replace('<div>ORMOND BEACH</div>', '<div>ORMOND BEACH I&S 2010</div>');
  assert.throws(() => parseAssessment(debtOnly, '2255315', getVolusiaCity('Ormond Beach')), /Incomplete taxing authorities/);
});

test('changed authority code, wrong fund type, duplicate operating row, and missing city row fail safely', () => {
  const municipalityRow = fixture.match(/  <div class="row"><div title="Municipality Fund">.*<\/div>/)[0];
  for (const html of [fixture.replace('>0150</div>', '>0999</div>'),
    fixture.replace('title="Municipality Fund"', 'title="Other Fund"'),
    fixture.replace(municipalityRow, municipalityRow + municipalityRow),
    fixture.replace(municipalityRow, '')]) {
    assert.throws(() => parseAssessment(html, '2255315'), /Incomplete taxing authorities/);
  }
});

test('property API uses server-selected municipality rather than request overrides', async () => {
  const city = getVolusiaCity('Port Orange');
  const html = fixture.replaceAll('DELAND', 'PORT ORANGE').replace('>0150</div>', '>0230</div>');
  const response = await handlePropertyRequest(request({ key: '2255315', city: 'DeLand' }), async () => new Response(html), city);
  assert.equal(response.status, 200);
  const { property } = await response.json();
  assert.equal(property.inCity, true);
  assert.equal(property.city, 'Port Orange');
  assert.equal(property.assessedValue, 300000);
});

test('a city configuration changed after page load cannot apply another municipality record', async t => {
  const { document, Event } = parseHTML(readFileSync(new URL('../index.html', import.meta.url), 'utf8'));
  const priorDocument = globalThis.document;
  globalThis.document = document;
  t.after(() => { globalThis.document = priorDocument; });
  const city = getVolusiaCity('Port Orange');
  const html = fixture.replaceAll('DELAND', 'PORT ORANGE').replace('>0150</div>', '>0230</div>');
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    const input = JSON.parse(options.body);
    return input.key
      ? Response.json({ property: parseAssessment(html, '2255315', city) })
      : Response.json({ properties: [{ key: '2255315', parcel: '123', address: 'Example property' }], hasMore: false });
  });
  const form = document.querySelector('#property-search');
  form.reportValidity = () => true;
  const onSelect = t.mock.fn();
  initPropertyLookup({ homeInput: document.querySelector('#home-value'), homeSlider: document.querySelector('#home-slider'), onSelect });
  document.querySelector('#property-query').value = 'Example';
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  await new Promise(resolve => setImmediate(resolve));
  document.querySelector('#property-results button').click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(document.querySelector('#property-detail button'), null);
  assert.match(document.querySelector('#property-detail').textContent, /does not list DeLand municipal operating taxes/);
  assert.equal(onSelect.mock.callCount(), 0);
});
