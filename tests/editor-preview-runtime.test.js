import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import { defaultSiteConfig } from '../src/site-defaults.js';
import { renderPage } from '../src/seo.js';
import { applyConfiguredDocument } from '../src/site-document.js';
import { annotateEditorDocument, editorSelectionPath, installPreviewGuards, startEditorPreview } from '../src/editor-preview-runtime.js';
import { editorEntrySource, editorPreviewHTML } from '../server/site-html.js';

const home = renderPage(readFileSync(new URL('../index.html', import.meta.url), 'utf8'), 'https://city.example.gov', false);
const privacy = readFileSync(new URL('../public/privacy.html', import.meta.url), 'utf8');

test('editor frames boot the application entry instead of Vite development tooling', () => {
  const viteHTML = home.replace('<head>', '<head><script type="module" src="/@vite/client"></script>');
  assert.equal(editorEntrySource(viteHTML), '/src/site-entry.js');
  assert.equal(parseHTML(editorPreviewHTML(viteHTML)).document.querySelector('script').getAttribute('src'), '/src/site-entry.js');
  const built = '<html><head><script type="module" src="/assets/main-abc123.js"></script></head><body></body></html>';
  assert.equal(editorEntrySource(built), '/assets/main-abc123.js');
});
function fixture(html = privacy) {
  const { document } = parseHTML(html);
  const scrolls = [];
  // The preview scrolls only its own window, never the admin page around it.
  for (const node of document.querySelectorAll('*')) node.scrollIntoView = () => { throw new Error('scrollIntoView would also scroll the parent page'); };
  const messages = [], fetches = [], listeners = {}, origin = 'https://city.example.gov';
  class XHR { open(...args) { this.openArgs = args; } }
  const window = { document, parent: { postMessage: (message, targetOrigin) => messages.push({ message, targetOrigin }) },
    location: { origin, reload: () => { window.reloaded = true; } },
    addEventListener: (type, callback) => { listeners[type] = callback; },
    fetch: async (...args) => { fetches.push(args); return new Response('ok'); },
    XMLHttpRequest: XHR, navigator: { sendBeacon: () => true },
    scrollY: 0, innerHeight: 800, scrollTo: options => { scrolls.push(options); } };
  return { document, window, messages, fetches, listeners, origin, scrolls };
}

test('actual site selection resolves copy fragments, source links, images, FAQs and department fields', () => {
  const { document } = fixture(home);
  const config = structuredClone(defaultSiteConfig);
  config.heroImages = [{ id: 'photo', url: '/assets/photo.jpg', alt: 'Photo', label: 'Photo' }];
  applyConfiguredDocument(document, config);
  annotateEditorDocument(document, config);
  // Whole headings and paragraphs open as one field, including their bold text and links.
  assert.deepEqual(editorSelectionPath(document.querySelector('#hero h1 em')), ['text', 'home_hero_53']);
  assert.deepEqual(editorSelectionPath(document.querySelector('.hero-lede strong')), ['text', 'home_hero_55']);
  assert.equal(editorSelectionPath(document.querySelector('#amendment .source-note a'))[0], 'text');
  assert.equal(document.querySelector('span.editor-preview-text'), null, 'Preview markers must not match public badge/dot span rules');
  assert.deepEqual(editorSelectionPath(document.querySelector('#amendment .fact-grid li:nth-of-type(2) strong')), ['sections', 'amendmentPoints', 1, 'title']);
  assert.deepEqual(editorSelectionPath(document.querySelector('#methodology details summary')), ['sections', 'sourceExplanations', 0, 'title']);
  assert.deepEqual(editorSelectionPath(document.querySelector('.source-links li:nth-of-type(3) small')), ['sections', 'sourceLinks', 2, 'publisher']);
  assert.deepEqual(editorSelectionPath(document.querySelector('.builder-intro p')), ['sections', 'builderIntro', 'body']);
  assert.deepEqual(editorSelectionPath(document.querySelector('[data-hero-slide] img')), ['heroImages', 0, 'url']);
  assert.deepEqual(editorSelectionPath(document.querySelector('#tour-fire h3')), ['budget', 'services', 0, 'name']);
  assert.deepEqual(editorSelectionPath(document.querySelector('#tour-planning img')), ['media', 'home_services_image_22', 'url']);
  assert.deepEqual(editorSelectionPath(document.querySelector('.faq-list summary')), ['faqs', 0, 'question']);
  assert.deepEqual(editorSelectionPath(document.querySelector('#share-canvas')), ['city', 'shareImage']);
  assert.deepEqual(editorSelectionPath(document.querySelector('#share-flip')), ['copy', 'ui_share_flip_back']);
});

test('preview guards block writes, beacon, forms and external links while allowing reads', async () => {
  const f = fixture(); installPreviewGuards(f.window);
  await assert.rejects(f.window.fetch('/api/submissions', { method: 'POST' }), /do not send/);
  await assert.rejects(f.window.fetch(new Request(f.origin + '/api/admin/settings', { method: 'PATCH' })), /do not send/);
  await f.window.fetch('/api/site-config'); assert.equal(f.fetches.length, 1);
  assert.throws(() => new f.window.XMLHttpRequest().open('POST', '/auth/logout'), /do not send/);
  assert.equal(f.window.navigator.sendBeacon('/api/feedback', 'data'), false);
  const Event = f.document.defaultView.Event;
  const form = f.document.createElement('form'); f.document.body.append(form);
  const submit = new Event('submit', { bubbles: true, cancelable: true }); form.dispatchEvent(submit);
  assert.equal(submit.defaultPrevented, true);
  const link = f.document.createElement('a'); link.href = 'https://external.example/'; f.document.body.append(link);
  const click = new Event('click', { bubbles: true, cancelable: true }); link.dispatchEvent(click);
  assert.equal(click.defaultPrevented, true);
});

test('bridge accepts only same-origin parent, selects external links before guards, and reloads on changed drafts', async () => {
  const f = fixture(); await startEditorPreview(f.window);
  assert.equal(f.messages[0].message.type, 'city-editor:ready');
  const config = structuredClone(defaultSiteConfig);
  config.copy.privacy_main_10 = 'Private unsaved headline';
  const event = { origin: f.origin, source: f.window.parent, data: { type: 'city-editor:render', config, section: 'privacy' } };
  await f.listeners.message({ ...event, origin: 'https://other.example/' });
  await f.listeners.message({ ...event, source: {} });
  assert.equal(f.document.querySelector('#city-site-config'), null);
  assert.doesNotMatch(f.document.body.textContent, /Private unsaved headline/);
  await f.listeners.message(event);
  assert.match(f.document.body.textContent, /Private unsaved headline/);
  assert.equal(f.messages.at(-1).message.type, 'city-editor:rendered');
  assert.ok(f.messages.every(item => item.targetOrigin === f.origin));
  const link = f.document.querySelector('a[data-editor-link-path]');
  const click = new f.document.defaultView.Event('click', { bubbles: true, cancelable: true }); link.dispatchEvent(click);
  assert.equal(f.messages.at(-1).message.type, 'city-editor:select');
  assert.equal(f.messages.at(-1).message.path[0], 'links');
  assert.equal(click.defaultPrevented, true);
  const scrollCount = f.scrolls.length;
  await f.listeners.message({ ...event, data: { ...event.data, mode: 'interact' } });
  assert.equal(f.window.reloaded, undefined);
  assert.equal(f.scrolls.length, scrollCount, 'Changing interaction mode preserves the current preview position and scene');
  await f.listeners.message({ ...event, data: { ...event.data, config: { ...config, copy: { ...config.copy, privacy_main_10: 'Next unsaved edit' } } } });
  assert.equal(f.window.reloaded, true);
});

test('potential revenue options and the millage slider are click-to-edit in the preview', async () => {
  const { document } = fixture(home);
  const { initRevenueBuilder } = await import('../src/cost-center-builder.js');
  const config = structuredClone(defaultSiteConfig);
  applyConfiguredDocument(document, config);
  initRevenueBuilder(document.getElementById('potential-revenues'), new Set(), () => {});
  annotateEditorDocument(document, config);
  const index = config.budget.revenues.findIndex(item => item.id !== 'millage-rate');
  const revenue = config.budget.revenues[index];
  const millage = config.budget.revenues.findIndex(item => item.id === 'millage-rate');
  assert.deepEqual(editorSelectionPath(document.getElementById(`revenue-name-${revenue.id}`)), ['budget', 'revenues', index, 'name']);
  assert.deepEqual(editorSelectionPath(document.getElementById(`revenue-effect-${revenue.id}`)), ['budget', 'revenues', index, 'description']);
  assert.deepEqual(editorSelectionPath(document.querySelector(`#revenue-effect-${revenue.id} .revenue-assumption`)), ['budget', 'revenues', index, 'assumption']);
  assert.deepEqual(editorSelectionPath(document.querySelector(`#revenue-price-${revenue.id} strong`)), ['budget', 'revenues', index, 'amount']);
  assert.deepEqual(editorSelectionPath(document.querySelector('.millage-choice .cost-choice-title')), ['budget', 'revenues', millage, 'name']);
  assert.deepEqual(editorSelectionPath(document.getElementById('revenue-effect-millage-rate')), ['copy', 'ui_revenue_millage_explanation']);
  assert.deepEqual(editorSelectionPath(document.querySelector('#potential-revenues legend')), ['copy', 'ui_revenue_legend']);
  assert.deepEqual(editorSelectionPath(document.querySelector('#revenue-title')), ['text', 'home_revenue-title_318']);
});

test('privacy sections, the highlighted notice and headings open their own fields', () => {
  const { document } = fixture(privacy);
  const config = structuredClone(defaultSiteConfig);
  applyConfiguredDocument(document, config);
  annotateEditorDocument(document, config);
  const records = [...document.querySelectorAll('.privacy-content section')].find(node => /Public records/.test(node.textContent));
  const index = Number(editorSelectionPath(records.querySelector('h2'))[2]);
  assert.deepEqual(editorSelectionPath(records.querySelector('h2')), ['sections', 'privacySections', index, 'title']);
  assert.deepEqual(editorSelectionPath(records.querySelector('p a')), ['sections', 'privacySections', index, 'body']);
  assert.deepEqual(editorSelectionPath(document.querySelector('.privacy-callout h2')), ['sections', 'privacyNotice', 'title']);
  assert.deepEqual(editorSelectionPath(document.querySelector('.privacy-heading h1')), ['text', 'privacy_main_10']);
});
