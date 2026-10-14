import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { siteURL, renderPage, renderHead, renderRobots, renderSitemap, starterStructuredData, faqs, seo } from '../src/seo.js';

const origin = 'https://budget.example.gov/';
const template = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('production URL is explicit and normalized; unsafe or unsupported URLs fail', () => {
  assert.equal(siteURL(''), null);
  assert.equal(siteURL(' https://budget.example.gov '), origin);
  for (const url of ['http://budget.example.gov', 'https://localhost', 'https://budget.example.gov/subpath', `${origin}?b=1`, `${origin}#builder`, 'https://user:pass@budget.example.gov']) {
    assert.throws(() => siteURL(url));
  }
});

test('production HTML has canonical, complete social metadata, and crawlable content', () => {
  const html = renderPage(template, origin, true);
  assert.equal((html.match(/<title>/g) || []).length, 1);
  assert.equal((html.match(/<h1>/g) || []).length, 1);
  assert.equal((html.match(/rel="canonical"/g) || []).length, 1);
  assert.ok(html.includes(`rel="canonical" href="${origin}"`));
  assert.ok(html.includes('index, follow, max-image-preview:large'));
  assert.ok(html.includes(`content="${origin}assets/deland-landmark-puzzle-social.png"`));
  assert.ok(html.includes('name="twitter:card" content="summary_large_image"'));
  assert.ok(!html.includes('<!-- seo:'));
  assert.ok(!/<button[^>]*data-goto=/.test(html));
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'all IDs must be unique');
  for (const match of html.matchAll(/<a[^>]*href="#([^"]+)"/g)) {
    assert.ok(ids.includes(match[1]), `anchor #${match[1]} must resolve`);
  }
  for (const match of html.matchAll(/<img\b([^>]+)>/g)) {
    assert.match(match[1], /\balt="/);
    assert.match(match[1], /\bwidth="\d+"/);
    assert.match(match[1], /\bheight="\d+"/);
    assert.ok(!/\/\s+\w/.test(match[1]), 'image attributes must precede the self-closing slash');
  }
  assert.ok(existsSync(new URL(`../public${seo.image}`, import.meta.url)));
});

test('visible FAQs match JSON-LD and have connected page, site, and publisher identities', () => {
  const html = renderPage(template, origin, true);
  const data = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.deepEqual(data, starterStructuredData(origin));
  const page = data['@graph'][2];
  assert.equal(page.url, origin);
  assert.equal(page.mainEntity.length, faqs.length);
  assert.equal((html.match(/<details>/g) || []).length, faqs.length);
  for (const item of page.mainEntity) {
    assert.ok(html.includes(item.name.replaceAll('&', '&amp;')));
    assert.ok(html.includes(item.acceptedAnswer.text.replaceAll('&', '&amp;')));
  }
});

test('preview stays noindex; production sitemap consolidates all shared plans to one URL', () => {
  const preview = renderHead(null, false);
  assert.ok(preview.includes('noindex, follow'));
  assert.ok(!preview.includes('rel="canonical"'));
  assert.ok(!renderRobots(origin, false).includes('Sitemap:'));
  assert.ok(!renderRobots(null, false).includes('Disallow: /'));
  assert.ok(renderRobots(origin, true).includes(`${origin}sitemap.xml`));
  const sitemap = renderSitemap(origin);
  assert.equal((sitemap.match(/<loc>/g) || []).length, 1);
  assert.ok(!sitemap.includes('?b=') && !sitemap.includes('#'));
  assert.ok(sitemap.includes(`<loc>${origin}</loc>`));
});


test('starter metadata, schema, and sitemap agree on the address and share image', () => {
  const html = renderHead(origin, true);
  const imageURL = new URL(seo.image, origin).href;
  for (const key of ['og:image', 'twitter:image']) {
    assert.ok(html.includes(`="${key}" content="${imageURL}"`));
  }
  assert.equal(starterStructuredData(origin)['@graph'][2].primaryImageOfPage.url, imageURL);
  assert.ok(renderSitemap(origin).includes(`<loc>${origin}</loc>`));
  const png = readFileSync(new URL(`../public${seo.image}`, import.meta.url));
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 630);
  assert.ok(png.length < 500000, 'share image should remain under 500 KB while preserving architectural detail');
});
