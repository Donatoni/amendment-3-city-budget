import { parseHTML } from 'linkedom';
import { DEFAULT_CITY, getVolusiaCity } from '../src/volusia-cities.js';

const ORIGIN = 'https://vcpa.vcgov.org';
const SEARCH_LIMIT = 12;
const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const recordURL = key => `${ORIGIN}/parcel/summary/?altkey=${key}`;

class ConfidentialAssessmentError extends Error {}

function assessmentText(value) {
  const text = clean(value);
  if (/^CONFIDENTIAL DATA\b/i.test(text)) throw new ConfidentialAssessmentError('Confidential assessment');
  return text;
}

// VCPA's public website supplies search JSON and a rendered assessment table.
// Fail closed when that table changes; never substitute market or taxable value.
export function parseAssessment(html, key, city = DEFAULT_CITY) {
  const municipality = getVolusiaCity(city);
  if (!municipality) throw new Error('Unsupported municipality');
  const { document } = parseHTML(html);
  if (document.querySelector('#altkey')?.getAttribute('value') !== key) throw new Error('Missing parcel');
  const field = label => {
    const heading = [...document.querySelectorAll('strong')].find(node => clean(node.textContent) === `${label}:`);
    return assessmentText(heading?.parentElement?.nextElementSibling?.textContent);
  };
  const table = document.querySelector('#taxAuthority');
  const section = table?.parentElement;
  const headings = [...(table?.previousElementSibling?.querySelectorAll('strong') ?? [])].map(node => clean(node.textContent));
  if (headings[0] !== 'Tax Authority' || headings[1] !== 'Just/Market Value' || headings[2] !== 'Assessed Value') {
    throw new Error('Unrecognized assessment columns');
  }
  const roll = clean(section?.textContent).match(/Values shown below are the (20\d{2}) (WORKING|FINAL|CERTIFIED) TAX ROLL VALUES/i);
  const address = field('Physical Address');
  const parcel = field('Parcel ID');
  const district = field('Tax District');
  const homesteadText = field('Homestead Property');
  if (!roll || !address || !parcel || !district || !/^(Yes|No)\b/i.test(homesteadText)) throw new Error('Incomplete assessment');
  const rows = [...table.children].filter(node => node.classList.contains('row'));
  const cityRows = rows.filter(node => node.children[0]?.getAttribute('title') === 'Municipality Fund'
    && clean(node.children[0]?.textContent) === municipality.authorityCode
    && [municipality.authority, `${municipality.authority} OPERATING`].includes(clean(node.children[1]?.textContent)));
  const cityRow = cityRows[0];
  // District names only detect incomplete data; they never establish eligibility.
  // Exact matching avoids confusing Daytona Beach with Daytona Beach Shores.
  const districtName = clean(district.replace(/^\d+\s*-\s*/, '')).toUpperCase();
  const hasCityCode = rows.some(node => clean(node.children[0]?.textContent) === municipality.authorityCode);
  if (cityRows.length > 1 || !rows.some(node => node.children[0]?.getAttribute('title') === 'County Fund')
    || (!cityRow && (hasCityCode || districtName === municipality.authority))) {
    throw new Error('Incomplete taxing authorities');
  }
  let assessedValue = null;
  let cityTax = null;
  if (cityRow) {
    // Authority occupies two cells (code + name); assessed value is cell four.
    const amount = assessmentText(cityRow.children[3]?.textContent);
    if (!/^\$(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{2})?$/.test(amount)) throw new Error('Invalid assessment');
    assessedValue = Number(amount.replace(/[$,]/g, ''));
    if (!Number.isSafeInteger(assessedValue) || assessedValue < 0) throw new Error('Invalid assessment');
    // Keep a usable assessment if optional tax columns disappear. Never turn a
    // missing amount into $0 or substitute the all-authority tax total.
    const currency = text => /^\$(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{2})?$/.test(text)
      ? Number(text.replace(/[$,]/g, '')) : null;
    if (headings[3] === 'Ex/10CAP' && headings[4] === 'Taxable Value'
      && headings[5] === 'Millage Rate' && headings[6] === 'Estimated Taxes') {
      const taxableValue = currency(clean(cityRow.children[5]?.textContent));
      const rateText = clean(cityRow.children[6]?.textContent);
      const millage = /^\d{1,2}(?:\.\d{1,6})?$/.test(rateText) ? Number(rateText) : null;
      const amount = currency(clean(cityRow.children[7]?.textContent));
      const rateRoll = clean(section?.textContent).match(/are the (20\d{2}) (PROPOSED|FINAL|ADOPTED|CERTIFIED) MILLAGE RATES/i);
      if (taxableValue !== null && taxableValue <= assessedValue && millage !== null && amount !== null
        && rateRoll && rateRoll[1] === roll[1]
        && Math.abs(amount - taxableValue * millage / 1000) <= 0.02) {
        cityTax = { amount, taxableValue, millage, rateStatus: rateRoll[2].toLowerCase(), kind: 'estimate' };
      }
    }
  }
  return {
    key, parcel, address, district, assessedValue, cityTax,
    inCity: Boolean(cityRow), city: municipality.name, authority: municipality.authority,
    homestead: /^Yes\b/i.test(homesteadText),
    year: Number(roll[1]), rollStatus: roll[2].toLowerCase(), sourceURL: recordURL(key),
  };
}

function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}

export async function handlePropertyRequest(request, fetcher = fetch, city = DEFAULT_CITY) {
  if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  if (!request.headers.get('content-type')?.includes('application/json')) return json({ error: 'Send JSON.' }, 415);
  let input;
  try {
    const body = await request.text();
    if (body.length > 1024) return json({ error: 'Search is too long.' }, 400);
    input = JSON.parse(body);
  } catch { return json({ error: 'Invalid search.' }, 400); }
  if (!input || typeof input !== 'object') return json({ error: 'Invalid search.' }, 400);
  const key = typeof input.key === 'string' ? input.key : '';
  const query = typeof input.query === 'string' ? clean(input.query) : '';
  if (input.key !== undefined ? !/^\d{7}$/.test(key) : query.length < 3 || query.length > 120 || !/[\p{L}\d]/u.test(query)) {
    return json({ error: 'Enter at least 3 characters of an address or parcel ID (up to 120 characters).' }, 400);
  }
  try {
    if (key) {
      const response = await fetcher(recordURL(key), {
        headers: { Cookie: 'acceptedNewDisclaimer=true', Accept: 'text/html' },
        signal: AbortSignal.timeout(12000), redirect: 'manual',
      });
      if (!response.ok) throw new Error('County unavailable');
      return json({ property: parseAssessment(await response.text(), key, city) });
    }
    const response = await fetcher(`${ORIGIN}/api/search/real-property`, {
      method: 'POST',
      body: new URLSearchParams({ 'search[value]': query, draw: '1', start: '0', length: String(SEARCH_LIMIT) }),
      headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12000), redirect: 'manual',
    });
    if (!response.ok) throw new Error('County unavailable');
    const data = await response.json();
    if (Number(data.status) !== 200 || !Array.isArray(data.data) || !Number.isFinite(Number(data.recordsFiltered))) throw new Error('Invalid county response');
    const properties = [];
    const seen = new Set();
    for (const row of data.data.slice(0, SEARCH_LIMIT)) {
      if (!/^\d{7}$/.test(row.altkey) || typeof row.street !== 'string' || typeof row.parcel !== 'string') throw new Error('Invalid parcel');
      if (seen.has(row.altkey)) continue;
      seen.add(row.altkey);
      // Owner names and mailing addresses are not needed for this calculator.
      properties.push({ key: row.altkey, parcel: row.parcel, address: clean(row.street) || 'Address not listed' });
    }
    return json({ properties, hasMore: Number(data.recordsFiltered) > SEARCH_LIMIT });
  } catch (error) {
    if (error instanceof ConfidentialAssessmentError) {
      return json({
        error: 'The Property Appraiser marks information needed for this property as confidential, so we can’t fill in the calculator automatically. Enter your assessed value before exemptions manually to continue with an estimate.',
        code: 'CONFIDENTIAL_PROPERTY',
      }, 422);
    }
    return json({ error: 'We couldn’t retrieve the county record. Try again, or open the Property Appraiser search below and enter your assessed value manually.' }, 502);
  }
}
