import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import { defaultSiteConfig } from '../src/site-defaults.js';
import { getHeroImages } from '../src/hero-images.js';
import { validateSiteConfig } from '../src/site-config-schema.js';
import { renderConfiguredHTML } from '../server/site-html.js';
import { localDatabase } from '../server/dashboard-local.js';
import { handleContentAdmin, publishedSiteConfig } from '../server/city-content.js';
import { reviewerGate } from '../server/reviewer-access.js';

const template = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const photo = (id = 'community') => ({ id, url: `/api/media/${id}.jpg`, alt: 'A {{city}} community park', label: 'Community & parks' });
const configWith = images => ({ ...structuredClone(defaultSiteConfig), heroImages: images });
const render = images => parseHTML(renderConfiguredHTML(template, configWith(images))).document;

test('legacy hero photos retain their order and customized URLs and captions', () => {
  const config = structuredClone(defaultSiteConfig);
  config.media.home_hero_image_2.url = '/assets/replaced.jpg';
  config.copy['home_hero_data-hero-label_65'] = 'A new caption';
  const photos = getHeroImages(config);
  assert.equal(photos.length, 3);
  assert.equal(photos[1].url, '/assets/replaced.jpg');
  assert.equal(photos[1].label, 'A new caption');
  assert.equal(photos[2].id, 'home_hero_image_3');
  assert.deepEqual(getHeroImages(configWith([])), []);
});

test('hero schema accepts zero and many images but rejects unsafe, malformed and duplicate entries', () => {
  for (const images of [[], [photo()], Array.from({ length: 100 }, (_, i) => photo(`photo-${i}`))]) {
    assert.deepEqual(validateSiteConfig(configWith(images)).heroImages, images);
  }
  for (const images of [null, {}, [photo(), photo()], [photo('BAD ID')], [{ ...photo(), url: '' }],
    [{ ...photo(), url: 'javascript:alert(1)' }], [{ ...photo(), label: 'x'.repeat(201) }],
    Array.from({ length: 101 }, (_, i) => photo(`photo-${i}`))]) {
    assert.throws(() => validateSiteConfig(configWith(images)));
  }
});

test('legacy blank photo slots migrate without blocking unrelated draft edits', () => {
  const config = structuredClone(defaultSiteConfig);
  config.media.home_hero_image_1.url = '';
  assert.doesNotThrow(() => validateSiteConfig(config));
  config.heroImages = getHeroImages(config);
  assert.equal(config.heroImages.length, 2);
  assert.equal(config.heroImages[0].id, 'home_hero_image_2');
  assert.doesNotThrow(() => validateSiteConfig(config));
  config.heroImages.push({ ...photo('new-photo'), url: '' });
  assert.throws(() => validateSiteConfig(config), /Home hero image URL must be nonempty/);
});

test('zero or one hero photo removes unused selectors and source city photos', () => {
  const empty = render([]);
  assert.equal(empty.querySelectorAll('[data-hero-slide]').length, 0);
  assert.equal(empty.querySelectorAll('[data-hero-slide-to]').length, 0);
  assert.equal(empty.querySelector('link[rel="preload"][as="image"]'), null);
  assert.equal(empty.querySelector('.hero-slideshow-controls').hidden, true);
  assert.equal(empty.querySelector('.hero-slideshow-controls').style.display, 'none');
  const single = render([photo()]);
  assert.equal(single.querySelectorAll('[data-hero-slide]').length, 1);
  assert.equal(single.querySelector('.hero-slideshow-controls').hidden, true);
  assert.equal(single.querySelector('[data-hero-slide] img').getAttribute('alt'), 'A DeLand community park');
  assert.equal(single.querySelector('link[rel="preload"][as="image"]').getAttribute('href'), photo().url);
  assert.equal(single.querySelector('link[rel="preload"][as="image"]').hasAttribute('type'), false);
});

test('configured photo order, lazy loading, captions and controls render together without injection', () => {
  const images = [photo('last'), { ...photo('first'), label: '<img onerror="alert(1)">' }, photo('third')];
  const document = render(images);
  const slides = [...document.querySelectorAll('[data-hero-slide]')];
  assert.deepEqual(slides.map(slide => slide.dataset.heroImageId), ['last', 'first', 'third']);
  assert.equal(slides[0].querySelector('img').getAttribute('src'), images[0].url);
  assert.equal(slides[1].querySelector('img').getAttribute('data-src'), images[1].url);
  assert.equal(slides[1].querySelector('img').hasAttribute('src'), false);
  assert.equal(document.querySelectorAll('[data-hero-slide-to]').length, 3);
  assert.equal(document.querySelectorAll('img[onerror]').length, 0);
  assert.equal(document.querySelector('#hero-slide-count').textContent, '01 / 03');
  assert.equal(document.querySelector('#hero-slide-label').textContent, 'Community & parks');
  assert.equal(document.querySelector('.hero-slideshow-controls').hidden, false);
});

test('removing all hero photos survives save, publish and reload without restoring legacy media', async t => {
  const env = { DASHBOARD_DB: localDatabase(':memory:') };
  t.after(() => env.DASHBOARD_DB.close());
  const call = (path, data) => handleContentAdmin(new Request(`https://city.example.gov${path}`, {
    method: path.endsWith('publish') ? 'POST' : 'PATCH',
    headers: { Origin: 'https://city.example.gov', 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }), env, { role: 'admin' });
  await call('/api/admin/content', { revision: 0, config: configWith([]) });
  await call('/api/admin/content/publish', { revision: 1 });
  const config = await publishedSiteConfig(env);
  assert.deepEqual(getHeroImages(config), []);
  assert.equal(parseHTML(renderConfiguredHTML(template, config)).document.querySelectorAll('[data-hero-slide]').length, 0);
});

test('published hero uploads are available while draft-only and removed hero uploads remain gated', async t => {
  const env = { DASHBOARD_DB: localDatabase(':memory:') };
  t.after(() => env.DASHBOARD_DB.close());
  const published = configWith([photo('published')]);
  published.media.home_hero_image_1.url = '/api/media/removed.jpg';
  const draft = configWith([photo('draft')]);
  await env.DASHBOARD_DB.prepare('INSERT INTO site_settings(key, value) VALUES (?, ?)')
    .bind('city_content_v1', JSON.stringify({ draft, published, revision: 1 })).run();
  const gate = path => reviewerGate(new Request(`https://city.example.gov${path}`), env, async () => new Response('Holding page'));
  assert.equal(await gate(photo('published').url), null);
  assert.equal((await gate(photo('draft').url)).status, 401);
  assert.equal((await gate('/api/media/removed.jpg')).status, 401);
});
