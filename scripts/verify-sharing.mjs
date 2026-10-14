// Run against Pages Functions (not Vite): node scripts/verify-sharing.mjs [origin]
// The target must have coming-soon mode disabled; use an isolated local database for pre-launch checks.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { configureSite } from '../src/site-runtime.js';

const origin = new URL(process.argv[2] || 'http://localhost:5190').origin;
const output = new URL('../.cache/share-verification/', import.meta.url);
const headers = { 'User-Agent': 'Twitterbot/1.0' };
const get = (url, options = {}) => fetch(url, { headers, signal: AbortSignal.timeout(15000), ...options });
const decode = value => value.replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'");
function meta(html, key) {
  const tags = html.match(/<meta\b[^>]*>/g) || [];
  const tag = tags.find(tag => tag.includes(`name="${key}"`) || tag.includes(`property="${key}"`));
  assert.ok(tag, `Missing metadata: ${key}`);
  return decode(tag.match(/content="([^"]*)"/)[1]);
}
const home = await get(origin, { redirect: 'manual' });
assert.equal(home.status, 200);
const homeHTML = await home.text();
assert.ok(homeHTML.includes('name="twitter:image"'), 'Sharing verification requires the public app, not the coming-soon or login page. Use a local Pages runtime with coming-soon mode disabled.');
// Metadata always points at the published address, even when testing locally.
const siteURL = decode(homeHTML.match(/<link rel="canonical" href="([^"]+)"/)[1]);
assert.ok(meta(homeHTML, 'twitter:image').startsWith(siteURL));
// Plans are built from the site's own published budget, so this works for any city.
const embedded = homeHTML.match(/<script[^>]*id="city-site-config"[^>]*>([\s\S]*?)<\/script>/);
assert.ok(embedded, 'The home page did not include its published content.');
const config = JSON.parse(embedded[1]);
configureSite(config);
const { resultURL, resultDescription } = await import('../src/share-plan.js');
const { SERVICES } = await import('../src/budget.js');
const { COST_CENTER_VERSION, costCenterPlan } = await import('../src/cost-centers.js');
const cutIds = config.budget.services.flatMap(service => service.cuts.map(cut => cut.id));
const millage = config.budget.revenues.some(item => item.id === 'millage-rate' && item.enabled !== false);
const selections = { cuts: [cutIds[0]], revenues: millage ? ['millage-rate'] : [], millageRate: 0.1 };
const values = costCenterPlan(selections.cuts, selections.revenues, selections.millageRate).values;
await mkdir(output, { recursive: true });
const results = [];
const imageHashes = new Set();
for (const theme of ['daylight', 'bluehour', 'citrus']) {
  for (const headline of [0, 1, 2]) {
    for (const side of ['front', 'back']) {
      const plan = { values, ...selections, theme, headline, side };
      const pageURL = resultURL(origin, values, plan);
      const response = await get(pageURL);
      assert.equal(response.status, 200, pageURL);
      const html = await response.text();
      const canonical = decode(html.match(/<link rel="canonical" href="([^"]+)"/)[1]);
      assert.equal(canonical, resultURL(siteURL, values, plan).split('#')[0]);
      assert.equal(meta(html, 'og:url'), canonical);
      assert.equal(meta(html, 'twitter:title'), resultDescription(plan).title);
      assert.equal(meta(html, 'twitter:description'), resultDescription(plan).description);
      assert.equal(meta(html, 'twitter:card'), 'summary_large_image');
      assert.equal(meta(html, 'robots'), 'noindex, follow');
      const imageURL = meta(html, 'twitter:image');
      assert.equal(imageURL, resultURL(siteURL, values, plan, true));
      assert.equal(meta(html, 'og:image'), imageURL);
      // Local HTML deliberately retains the production metadata origin. Exercise
      // the corresponding image route on the runtime under test.
      const imageRoute = new URL(imageURL);
      const imageResponse = await get(new URL(imageRoute.pathname + imageRoute.search, origin));
      assert.equal(imageResponse.status, 200, imageURL);
      assert.equal(imageResponse.headers.get('content-type'), 'image/png');
      const png = Buffer.from(await imageResponse.arrayBuffer());
      assert.equal(png.subarray(1, 4).toString(), 'PNG');
      assert.equal(png.readUInt32BE(16), 1200);
      assert.equal(png.readUInt32BE(20), 630);
      assert.ok(png.length < 5 * 1024 * 1024);
      const sha256 = createHash('sha256').update(png).digest('hex');
      imageHashes.add(sha256);
      const name = `${theme}-${headline}-${side}`;
      await writeFile(new URL(`${name}.png`, output), png);
      results.push({ name, bytes: png.length, sha256 });
    }
  }
}
assert.equal(imageHashes.size, 18, 'Every postcard style and side must produce its own image');

const legacyValues = SERVICES.map(service => Math.floor(service.proposed * 10) / 10);
const legacy = await get(`${origin}/?b=${legacyValues.join('_')}&theme=citrus&h=2&side=back`, { redirect: 'manual' });
assert.equal(legacy.status, 302);
assert.equal(legacy.headers.get('location'), resultURL(origin, legacyValues, { theme: 'citrus', headline: 2, side: 'back' }));
const currentURL = new URL(resultURL(origin, values, selections));
const currentRedirect = await get(`${origin}/${currentURL.search}`, { redirect: 'manual' });
assert.equal(currentRedirect.status, 302);
assert.equal(currentRedirect.headers.get('location'), currentURL.href);
for (const query of ['b=invalid', 'b=10_14_4_4_1_6', `catalog=${COST_CENTER_VERSION}-obsolete&cuts=${cutIds[0]}`]) {
  for (const path of ['/share/', '/share/image.png']) {
    const response = await get(`${origin}${path}?${query}`);
    assert.equal(response.status, 400);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
  }
}
const imageURL = resultURL(origin, values, selections, true);
const head = await get(imageURL, { method: 'HEAD' });
assert.equal(head.status, 200);
assert.equal(head.headers.get('content-type'), 'image/png');
assert.equal((await head.arrayBuffer()).byteLength, 0);
assert.equal((await get(imageURL, { method: 'POST' })).status, 405);
const changed = await get(resultURL(origin, values, { ...selections, cuts: [...selections.cuts, cutIds.at(-1)] }, true));
assert.equal(changed.status, 200);
assert.notEqual(createHash('sha256').update(Buffer.from(await changed.arrayBuffer())).digest('hex'), results[0].sha256);
const report = { verifiedAt: new Date().toISOString(), origin, catalogVersion: COST_CENTER_VERSION, userAgent: headers['User-Agent'], variants: results, legacyRedirect: 'passed', currentRedirect: 'passed', personalizedCanonical: 'passed', homepageImage: 'passed', changedBudgetImage: 'passed', httpErrorsAndHead: 'passed' };
await writeFile(new URL('report.json', output), JSON.stringify(report, null, 2) + '\n');
console.log(`Passed: 18 personalized PNGs, stats metadata, canonical URLs, current and legacy redirects, homepage image, changed budgets, and HTTP handling. Artifacts: ${fileURLToPath(output)}`);
