import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import { renderConfiguredHTML, configuredHTMLResponse } from '../server/site-html.js';
import { defaultSiteConfig } from '../src/site-defaults.js';
import { contentBindings } from '../src/site-bindings.js';
import { renderPage } from '../src/seo.js';

const template = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const launch = readFileSync(new URL('../public/coming-soon.html', import.meta.url), 'utf8');
const sourceOrigin = 'https://amendment-3.delandfl.gov/';
const cityConfig = () => {
  const config = structuredClone(defaultSiteConfig);
  Object.assign(config.city, {
    name: 'Port Orange', authority: 'PORT ORANGE', millage: 4.975,
    siteName: 'Port Orange community budget', url: 'https://budget.example.gov/',
    logo: '/api/media/city-logo.png', socialImage: '/api/media/city-social.png',
    description: 'Port Orange choices, services, and budget.', cityWebsiteUrl: 'https://www.port-orange.org/', socialImageAlt: '', clerkPhone: '386-506-5500', clerkAddress: '1000 City Center Circle, Port Orange, FL 32129',
  });
  config.copy.home_hero_53 = 'Shape {{city}} together.';
  config.copy['home_nav_aria-label_2'] = '{{city}} community budget home';
  config.media.home_hero_image_1 = { url: '/api/media/city-hero.webp', alt: 'A {{city}} public park' };
  config.links['home_site-footer_link_10'] = 'https://example.gov/city-social';
  config.faqs = [{ question: 'How does {{city}} plan?', answer: 'Residents review the {{target}} gap using {{millage}} mills.' }];
  return config;
};
const documentFor = (html, config, options) => parseHTML(renderConfiguredHTML(html, config, options)).document;

test('configured source and built HTML update visible city text, accessible labels, media, and links', () => {
  const config = cityConfig();
  for (const html of [template, renderPage(template, sourceOrigin, true)]) {
    const document = documentFor(html, config);
    assert.match(document.querySelector('#hero h1').textContent, /Shape Port Orange together\./);
    assert.equal(document.querySelector('#nav > a').getAttribute('aria-label'), 'Port Orange community budget home');
    const image = document.querySelector(contentBindings.home_hero_image_1.selector);
    assert.equal(image.getAttribute('src'), '/api/media/city-hero.webp');
    assert.equal(image.getAttribute('alt'), 'A Port Orange public park');
    assert.equal(image.hasAttribute('srcset'), false);
    assert.equal(image.hasAttribute('data-srcset'), false);
    assert.equal(document.querySelector(contentBindings['home_site-footer_link_10'].selector).getAttribute('href'), 'https://example.gov/city-social');
    assert.equal(document.querySelector('img[src*="city-of-deland-seal"]'), null);
    assert.ok(document.querySelector('img[src="/api/media/city-logo.png"]'));
  }
});

test('published metadata and visible FAQs share the configured city and contain no old publisher schema', () => {
  const config = cityConfig();
  const document = documentFor(renderPage(template, sourceOrigin, true), config);
  assert.equal(document.title, 'Port Orange Budget & Property Tax Calculator | Amendment 3 (2026)');
  assert.equal(document.querySelector('meta[property="og:title"]').content, document.title);
  assert.equal(document.querySelector('meta[property="og:image:alt"]').content, 'Port Orange community budget city budget exercise');
  assert.equal(document.querySelector('link[rel="canonical"]').getAttribute('href'), config.city.url);
  assert.equal(document.querySelector('meta[name="description"]').content, config.city.description);
  assert.equal(document.querySelector('meta[property="og:url"]').content, config.city.url);
  assert.equal(document.querySelector('meta[property="og:image"]').content, 'https://budget.example.gov/api/media/city-social.png');
  assert.equal(document.querySelector('meta[name="twitter:image"]').content, 'https://budget.example.gov/api/media/city-social.png');
  assert.equal(document.querySelectorAll('script[type="application/ld+json"]').length, 1);
  const graph = JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent)['@graph'];
  const structured = graph.find(item => item.mainEntity);
  assert.equal(structured.url, config.city.url);
  assert.deepEqual(graph.find(item => item['@type'] === 'GovernmentOrganization'), { '@type': 'GovernmentOrganization', '@id': 'https://budget.example.gov/#publisher', name: 'City of Port Orange', url: 'https://www.port-orange.org/', telephone: '386-506-5500', address: { '@type': 'PostalAddress', streetAddress: '1000 City Center Circle', addressLocality: 'Port Orange', addressRegion: 'FL', postalCode: '32129', addressCountry: 'US' } });
  assert.equal(JSON.stringify(graph).includes('DeLand'), false);
  assert.equal(document.querySelectorAll('.faq-list details').length, 1);
  const question = document.querySelector('.faq-list summary').textContent;
  const answer = document.querySelector('.faq-answer').textContent;
  assert.equal(question, 'How does Port Orange plan?');
  assert.equal(answer, 'Residents review the $5,200,000 gap using 4.975 mills.');
  assert.equal(structured.mainEntity[0].name, question);
  assert.equal(structured.mainEntity[0].acceptedAnswer.text, answer);
});

test('plain-text content and embedded configuration cannot create executable HTML', () => {
  const config = cityConfig();
  const payload = '</script><script id="injected">alert(1)</script><img src=x onerror=alert(1)>';
  config.copy.home_hero_53 = payload;
  config.city.siteName = payload;
  config.city.searchTitle = payload;
  config.city.socialImageAlt = payload;
  config.media.home_hero_image_1.alt = payload;
  config.faqs = [{ question: payload, answer: payload }];
  const document = documentFor(renderPage(template, sourceOrigin, true), config);
  assert.equal(document.querySelector('#injected'), null);
  assert.equal(document.querySelector('img[onerror]'), null);
  assert.equal(document.querySelector('#hero h1 script, #hero h1 img'), null);
  assert.match(document.querySelector('#hero h1').textContent, /<script id="injected">/);
  assert.equal(document.title, payload);
  assert.equal(document.querySelector('meta[property="og:image:alt"]').content, payload);
  assert.equal(document.querySelector('.faq-list summary').textContent, payload);
  assert.equal(document.querySelector('.faq-answer p').textContent, payload);
  assert.deepEqual(JSON.parse(document.querySelector('#city-site-config').textContent), config);
  assert.equal(JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent)['@graph'][2].mainEntity[0].acceptedAnswer.text, payload);
});

test('draft preview is labeled, noindexed, and disables response actions', () => {
  const document = documentFor(renderPage(template, sourceOrigin, true), cityConfig(), { preview: true });
  assert.match(document.body.firstElementChild.textContent, /Draft preview - not published/);
  assert.equal(document.body.firstElementChild.getAttribute('role'), 'status');
  assert.equal(document.querySelector('meta[name="robots"]').content, 'noindex, nofollow');
  assert.equal(document.querySelector('#submit-btn').hasAttribute('disabled'), true);
  assert.equal(document.querySelector('#feedback-submit').hasAttribute('disabled'), true);
});

test('home and coming-soon pages do not send the receiving city traffic to source analytics', () => {
  const config = cityConfig();
  for (const html of [template, renderPage(template, sourceOrigin, true), launch]) {
    const document = documentFor(html, config);
    const scripts = [...document.querySelectorAll('script')].filter(node => !['application/json', 'application/ld+json'].includes(node.type));
    assert.equal(scripts.some(node => /googletagmanager|G-X7YHVM1KQX|gtag\('config'/.test(`${node.src} ${node.textContent}`)), false);
  }
  const document = documentFor(launch, config);
  assert.equal(document.title, `Coming soon | ${config.city.siteName}`);
  assert.match(document.querySelector('.launch-shell').textContent, /Port Orange/);
  assert.ok(document.querySelector('img[src="/api/media/city-logo.png"]'));
});

test('HTML response transformation drops stale validators and compression headers; media passes through', async () => {
  const source = new Response(renderPage(template, sourceOrigin, true), { status: 200, headers: {
    'Content-Type': 'text/html; charset=utf-8', 'Content-Length': '123', 'Content-Encoding': 'gzip', ETag: '"old"',
  } });
  const response = await configuredHTMLResponse(source, cityConfig(), { preview: true });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, nofollow');
  for (const key of ['Content-Length', 'Content-Encoding', 'ETag']) assert.equal(response.headers.has(key), false);
  assert.match(await response.text(), /Port Orange community budget/);
  const media = new Response('image', { headers: { 'Content-Type': 'image/png' } });
  assert.equal(await configuredHTMLResponse(media, cityConfig()), media);
});

test('starter FAQs adapt city, millage, and budget explanations without stale DeLand examples', () => {
  const config = cityConfig();
  config.faqs = structuredClone(defaultSiteConfig.faqs);
  const document = documentFor(renderPage(template, sourceOrigin, true), config);
  const text = document.querySelector('.faq-list').textContent;
  assert.match(text, /Port Orange/);
  assert.match(text, /4\.975 mills/);
  assert.match(text, /separate municipal debt levies/);
  assert.equal(/DeLand|6\.1841|\$610|\$1,228|\$41\.99M/.test(text), false);
});


test('replaced hero artwork cannot retain a preload of the source city photograph', () => {
  const config = cityConfig();
  const document = documentFor(renderPage(template, sourceOrigin, true), config);
  const preload = document.querySelector('link[rel="preload"][as="image"]');
  if (preload) {
    assert.equal(preload.getAttribute('href'), config.media.home_hero_image_1.url);
    assert.equal(preload.hasAttribute('imagesrcset'), false);
  }
});

test('privacy contacts, links and the update date come from key facts without source-city disclosures', () => {
  const config = cityConfig();
  Object.assign(config.city, { clerkPhone: '(386) 555-0100', clerkAddress: '100 Example Avenue, Port Orange, FL 32127', publicRecordsUrl: 'https://example.gov/records', privacyPolicyUrl: 'https://example.gov/privacy', privacyUpdatedDate: 'October 9, 2026' });
  const html = readFileSync(new URL('../public/privacy.html', import.meta.url), 'utf8');
  const document = documentFor(html, config);
  const content = document.querySelector('.privacy-content').textContent;
  assert.match(content, /100 Example Avenue, Port Orange, FL 32127/);
  assert.equal(document.querySelector('a[href="tel:+13865550100"]').textContent, '(386) 555-0100', 'Any phone format becomes a working tap-to-call link');
  assert.ok(document.querySelector('a[href="https://example.gov/records"]'));
  assert.ok(document.querySelector('a[href="https://example.gov/privacy"]'));
  assert.match(document.querySelector('.privacy-date').textContent, /October 9, 2026/);
  assert.equal(document.querySelector('time').getAttribute('datetime'), '2026-10-09', 'The machine-readable date follows the shown date');
  assert.equal(document.title, `Privacy & Public Records | ${config.city.siteName}`);
  assert.equal(document.querySelector('meta[name="description"]').content, `How ${config.city.siteName} handles budget submissions, feedback, property searches, and public records.`);
  assert.equal(document.querySelector('meta[name="robots"]').content, 'noindex, nofollow');
  assert.match(content, /does not use Google Analytics/);
  assert.match(document.querySelector('.privacy-header, header').textContent, /City of Port Orange/);
  assert.equal(/120 S Florida Avenue|386-626-7130|We use Google Analytics|DeLand/.test(document.body.textContent), false);
  assert.equal([...document.querySelectorAll('a')].some(node => /deland\.org/.test(node.href)), false);
});

test('login text and artwork are editable while form controls and authentication targets remain intact', () => {
  const config = cityConfig();
  config.copy['login_login-title_16'] = 'Welcome, city team.';
  config.media.login_main_image_1 = { url: '/api/media/city-login.webp', alt: '{{city}} civic buildings' };
  const html = readFileSync(new URL('../public/login.html', import.meta.url), 'utf8');
  const document = documentFor(html, config);
  assert.equal(document.querySelector('#login-title').textContent, 'Welcome, city team.');
  assert.match(document.querySelector('.login-description').textContent, /Port Orange community budget/);
  assert.equal(document.querySelector('.login-art img').getAttribute('src'), '/api/media/city-login.webp');
  assert.equal(document.querySelector('.login-art img').getAttribute('alt'), 'Port Orange civic buildings');
  assert.equal(document.title, `Staff & Reviewer Sign In | ${config.city.siteName}`);
  const form = document.querySelector('#login-form');
  assert.equal(form.getAttribute('action'), '/auth/login');
  assert.equal(form.getAttribute('method'), 'post');
  assert.equal(form.querySelector('input[name="username"]').getAttribute('autocomplete'), 'username');
  assert.equal(form.querySelector('input[name="password"]').getAttribute('type'), 'password');
  assert.equal(form.querySelector('input[name="next"]').getAttribute('type'), 'hidden');
});

test('Google Analytics is injected only on public pages, only when configured, and switches the privacy notice', () => {
  const config = cityConfig();
  const privacy = readFileSync(new URL('../public/privacy.html', import.meta.url), 'utf8');
  const login = readFileSync(new URL('../public/login.html', import.meta.url), 'utf8');
  const admin = readFileSync(new URL('../admin/index.html', import.meta.url), 'utf8');
  const tags = document => [...document.querySelectorAll('script')].filter(node => /googletagmanager|gtag\('config'/.test(`${node.getAttribute('src') || ''} ${node.textContent}`));
  for (const html of [template, launch, privacy]) {
    const document = documentFor(html, config, { analyticsId: 'g-ab12cd34ef' });
    assert.equal(tags(document).length, 2);
    assert.equal(document.querySelector('script[src*="googletagmanager"]').getAttribute('src'), 'https://www.googletagmanager.com/gtag/js?id=G-AB12CD34EF');
    assert.equal(tags(documentFor(html, config)).length, 0);
    assert.equal(tags(documentFor(html, config, { analyticsId: 'G-AB12CD34EF', preview: true })).length, 0);
    assert.equal(tags(documentFor(html, config, { analyticsId: "G-1');alert(1)//" })).length, 0);
  }
  for (const html of [login, admin]) assert.equal(tags(documentFor(html, config, { analyticsId: 'G-AB12CD34EF' })).length, 0);
  const on = documentFor(privacy, config, { analyticsId: 'G-AB12CD34EF' }).querySelector('.privacy-content');
  assert.match(on.textContent, /uses Google Analytics/);
  assert.doesNotMatch(on.textContent, /does not enable Google Analytics/);
  assert.ok(on.querySelector('a[href="https://policies.google.com/technologies/partner-sites"]'));
  config.copy.privacy_analytics_on_33 = 'Port Orange measures visits with Google Analytics. Read';
  assert.match(documentFor(privacy, config, { analyticsId: 'G-AB12CD34EF' }).querySelector('.privacy-content').textContent, /Port Orange measures visits/);
});

test('every icon, the 404 page and the link preview description follow the receiving city', () => {
  const config = cityConfig();
  const home = documentFor(renderPage(template, sourceOrigin, true), config);
  const icons = [...home.querySelectorAll('link[rel~="icon"]')];
  assert.ok(icons.length >= 2);
  assert.ok(icons.every(icon => icon.getAttribute('href') === config.city.logo && !icon.hasAttribute('sizes')));
  // A replaced preview image never keeps the starter image's description.
  config.city.socialImageAlt = defaultSiteConfig.city.socialImageAlt;
  assert.equal(documentFor(renderPage(template, sourceOrigin, true), config).querySelector('meta[property="og:image:alt"]').content, 'Port Orange community budget city budget exercise');
  const notFound = documentFor(readFileSync(new URL('../public/404.html', import.meta.url), 'utf8'), config);
  assert.equal(notFound.title, 'Page Not Found | Port Orange community budget');
  assert.doesNotMatch(notFound.documentElement.outerHTML, /deland/i);
});
