import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { actualPreviewMarkup, createSitePreview } from '../src/content-editor-preview.js';

function setup(t) {
  const { window, document } = parseHTML(`<html><body>${actualPreviewMarkup()}</body></html>`);
  window.location = { origin: 'https://city.test' };
  const frame = document.querySelector('iframe');
  const messages = [], selected = [];
  let config = { copy: { title: 'Original title' } }, context = { section: 'hero', selection: null };
  const source = { postMessage: (data, origin) => messages.push({ data: structuredClone(data), origin }) };
  Object.defineProperty(frame, 'contentWindow', { value: source });
  const controller = createSitePreview(document.body, { getConfig: () => config, getContext: () => context, onSelect: path => selected.push(path), windowRef: window });
  const emit = (data, overrides = {}) => {
    const event = new window.Event('message');
    Object.assign(event, { data, origin: 'https://city.test', source, ...overrides }); window.dispatchEvent(event);
  };
  const click = selector => document.querySelector(selector).dispatchEvent(new window.Event('click', { bubbles: true }));
  t.after(() => controller.destroy());
  return { controller, frame, document, messages, selected, emit, click, setConfig: value => { config = value; }, setContext: value => { context = value; } };
}

test('actual preview debounces edits and sends the newest unsaved config only to its own origin', async t => {
  const h = setup(t), originalURL = h.frame.src;
  assert.equal(h.messages.length, 0);
  h.emit({ type: 'city-editor:ready' }, { origin: 'https://other.test' });
  h.emit({ type: 'city-editor:ready' }, { source: {} });
  assert.equal(h.messages.length, 0);
  h.emit({ type: 'city-editor:ready' });
  assert.equal(h.messages[0].origin, 'https://city.test');
  h.setConfig({ copy: { title: 'First edit' } }); h.controller.contentChanged();
  h.setConfig({ copy: { title: 'Latest edit' } }); h.controller.contentChanged();
  assert.equal(h.frame.src, originalURL);
  await new Promise(resolve => setTimeout(resolve, 550));
  assert.notEqual(h.frame.src, originalURL);
  h.emit({ type: 'city-editor:ready' });
  assert.equal(h.messages.at(-1).data.config.copy.title, 'Latest edit');
  h.emit({ type: 'city-editor:rendered' });
  assert.equal(h.document.querySelector('#ce-preview-status').textContent, 'Showing your current edits');
});

test('section, screen size, and interaction controls use the real page without remounting the frame', t => {
  const h = setup(t);
  h.emit({ type: 'city-editor:ready' });
  const homeURL = h.frame.src;
  h.setContext({ section: 'sources', selection: ['copy', 'home_sources_340'] }); h.controller.contextChanged();
  assert.equal(h.frame.src, homeURL);
  assert.equal(h.messages.at(-1).data.section, 'sources');
  assert.deepEqual(h.messages.at(-1).data.selection, ['copy', 'home_sources_340']);
  h.click('[data-preview-width="mobile"]');
  assert.equal(h.frame.style.width, '390px');
  assert.equal(h.document.querySelector('[data-preview-width="mobile"]').getAttribute('aria-pressed'), 'true');
  h.click('[data-preview-mode="interact"]');
  assert.equal(h.messages.at(-1).data.mode, 'interact');
  h.click('#ce-preview-expand');
  assert.ok(h.document.querySelector('.ce-actual-preview').classList.contains('ce-preview-expanded'));
  h.click('#ce-preview-expand');
  assert.equal(h.document.querySelector('.ce-actual-preview').classList.contains('ce-preview-expanded'), false);
  h.setContext({ section: 'privacy' }); h.controller.contextChanged();
  assert.match(h.frame.src, /^\/privacy\?contentPreview=1&editorPreview=1/);
  assert.equal(h.document.querySelector('iframe'), h.frame);
});

test('actual preview routes validated selections and reports load errors without interpreting HTML', t => {
  const h = setup(t);
  h.emit({ type: 'city-editor:select', path: ['heroImages', 2, 'url'] });
  h.emit({ type: 'city-editor:select', path: ['copy', { key: 'bad' }] });
  assert.deepEqual(h.selected, [['heroImages', 2, 'url']]);
  h.emit({ type: 'city-editor:error', message: '<img src=x onerror=alert(1)>' });
  assert.match(h.document.querySelector('#ce-preview-status').textContent, /<img src=x/);
  assert.equal(h.document.querySelector('#ce-preview-status img'), null);
  const previous = h.frame.src;
  h.click('#ce-preview-refresh');
  assert.notEqual(h.frame.src, previous);
});
