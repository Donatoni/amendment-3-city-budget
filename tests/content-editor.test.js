import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';
import { defaultSiteConfig } from '../src/site-defaults.js';
import { validateSiteConfig } from '../src/site-config-schema.js';

async function setup(t, overrides = {}) {
  const { window, document } = parseHTML('<html><body><div id="root"></div></body></html>');
  // linkedom omits the browser select.value setter; provide normal selection behavior.
  const selectValue = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value');
  if (!selectValue.set) Object.defineProperty(window.HTMLSelectElement.prototype, 'value', { ...selectValue, set(value) { for (const option of this.options) option.removeAttribute('selected'); [...this.options].find(option => option.value === value)?.setAttribute('selected', ''); } });
  window.location = { origin: 'https://city.test' };
  window.confirm = () => true;
  window.alert = () => {};
  let state = { draft: structuredClone(defaultSiteConfig), published: structuredClone(defaultSiteConfig), revision: 0 };
  const requests = [];
  const original = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch };
  Object.assign(globalThis, { window, document, fetch: async (path, options = {}) => {
    requests.push({ path, options });
    if (overrides.fetch) return overrides.fetch(path, options);
    if (options.method === 'PATCH') { state.draft = validateSiteConfig(JSON.parse(options.body).config); state.revision++; }
    if (path.endsWith('/publish')) { state.published = structuredClone(state.draft); state.revision++; }
    return Response.json(state);
  } });
  const source = (await readFile(new URL('../src/content-editor.js', import.meta.url), 'utf8')).replace("import './content-editor.css';", '').replace(/'\.\/([^']+\.js)'/g, (_, file) => JSON.stringify(new URL(`../src/${file}`, import.meta.url).href));
  const module = await import(`data:text/javascript;base64,${Buffer.from(`${source}\n// ${crypto.randomUUID()}`).toString('base64')}`);
  const root = document.querySelector('#root');
  await module.mountContentEditor(root);
  t.after(() => { window.confirm = () => true; module.canLeaveContentEditor(); Object.assign(globalThis, original); });
  function preview() {
    const frame = root.querySelector('#ce-site-preview'), messages = [];
    const source = { postMessage: (data, origin) => messages.push({ data: structuredClone(data), origin }) };
    Object.defineProperty(frame, 'contentWindow', { value: source, configurable: true });
    const emit = (data, options = {}) => { const event = new window.Event('message'); Object.assign(event, { data, origin: options.origin || 'https://city.test', source: options.source || source }); window.dispatchEvent(event); };
    emit({ type: 'city-editor:ready' });
    return { frame, source, messages, emit };
  }
  function input(path, value) {
    const control = [...root.querySelectorAll('[data-field]')].find(el => el.dataset.field === JSON.stringify(path));
    assert.ok(control, `Field ${path.join('.')} exists`);
    // Rich text fields are typed into like a person would; others take a value.
    if (control.dataset.rich) control.textContent = value; else control.value = value;
    root.oninput({ target: control });
  }
  async function click(selector) {
    const button = root.querySelector(selector); assert.ok(button, selector);
    // linkedom has no constraint validation API; these tests exercise draft transitions.
    root.querySelectorAll('input,textarea,select').forEach(control => { control.checkValidity = () => true; });
    await root.onclick({ target: button });
  }
  return { root, module, input, click, requests, state: () => state, window, preview };
}

test('content editor exposes structured fields, escapes text, and searches source copy', async t => {
  const h = await setup(t);
  assert.deepEqual([...h.root.querySelectorAll('.ce-tabs [data-tab]')].map(tab => tab.dataset.tab), ['start', 'city', 'facts', 'budget', 'home', 'privacy', 'launch', 'login', 'videos']);
  assert.ok(h.root.querySelectorAll('[data-section="home"] [data-field]').length > 150);
  h.input(['text', 'home_hero_53'], '<img src=x onerror=alert(1)>');
  await h.click('[data-add="faq"]');
  assert.equal(h.root.querySelectorAll('img[onerror]').length, 0);
  const frame = h.preview();
  assert.equal(frame.messages.at(-1).data.config.text.home_hero_53, '<img src=x onerror=alert(1)>');
  const search = h.root.querySelector('#ce-find'); search.value = '<img src=x'; h.root.oninput({ target: search });
  const visible = [...h.root.querySelectorAll('[data-section="home"] .ce-row')].filter(row => !row.hidden && !row.closest('[data-page-section]').hidden);
  assert.equal(visible.length, 1);
  assert.match(h.root.querySelector('#ce-find-count').textContent, /1 match/);
});

test('draft changes save separately from publishing and preserve structured new items', async t => {
  const h = await setup(t);
  h.input(['city', 'siteName'], 'Build Your Port Orange');
  await h.click('[data-add="faq"]');
  const index = defaultSiteConfig.faqs.length;
  h.input(['faqs', index, 'question'], 'What changes here?');
  h.input(['faqs', index, 'answer'], 'Reviewed local information.');
  assert.equal(h.root.querySelector('#ce-publish').disabled, true);
  await h.click('#ce-save');
  assert.equal(h.state().draft.city.siteName, 'Build Your Port Orange');
  assert.equal(h.state().published.city.siteName, defaultSiteConfig.city.siteName);
  assert.equal(h.state().draft.faqs.at(-1).answer, 'Reviewed local information.');
  assert.equal(h.root.querySelector('#ce-save').disabled, true);
  await h.click('#ce-publish');
  assert.equal(h.state().published.city.siteName, 'Build Your Port Orange');
  assert.equal(h.requests.at(-1).path, '/api/admin/content/publish');
  assert.equal(JSON.parse(h.requests.at(-1).options.body).revision, 1);
});

test('conflicting writes retain edits and block publication until explicit reload', async t => {
  const snapshot = { draft: defaultSiteConfig, published: defaultSiteConfig, revision: 4 };
  const h = await setup(t, { fetch: async (path, options) => options.method ? Response.json({ error: 'Another administrator changed this draft.' }, { status: 409 }) : Response.json(snapshot) });
  h.input(['city', 'siteName'], 'My unsaved local change');
  await h.click('#ce-save');
  assert.match(h.root.querySelector('#ce-status').textContent, /Your edits remain on screen/);
  assert.equal([...h.root.querySelectorAll('[data-field]')].find(el => el.dataset.field === '["city","siteName"]').value, 'My unsaved local change');
  assert.equal(h.root.querySelector('#ce-save').disabled, true);
  assert.equal(h.root.querySelector('#ce-publish').disabled, true);
  h.window.confirm = () => false;
  assert.equal(h.module.canLeaveContentEditor(), false);
  h.window.confirm = () => true;
  await h.click('#ce-reload');
  assert.equal(h.root.querySelector('#ce-publish').disabled, false);
  assert.equal(h.module.canLeaveContentEditor(), true);
});


test('municipality changes require reviewed millage and budget edits publish together', async t => {
  const h = await setup(t);
  h.root.oninput({ target: { id: 'ce-city', value: 'Port Orange', dataset: {} } });
  const millage = [...h.root.querySelectorAll('[data-field]')].find(el => el.dataset.field === '["city","millage"]');
  assert.equal(millage.value, '');
  h.input(['city', 'millage'], '5.5');
  h.input(['budget', 'target'], '1000000');
  h.input(['budget', 'services', 0, 'cuts', 0, 'savings'], '12345.67');
  h.input(['budget', 'services', 0, 'cutExamples', 0], 'Reviewed fire consequence.');
  await h.click('[data-add="revenue"]');
  const index = defaultSiteConfig.budget.revenues.length;
  h.input(['budget', 'revenues', index, 'name'], 'Reviewed city revenue');
  h.input(['budget', 'revenues', index, 'amount'], '120000');
  await h.click('#ce-save');
  await h.click('#ce-publish');
  assert.equal(h.state().published.city.name, 'Port Orange');
  assert.equal(h.state().published.city.authority, 'PORT ORANGE');
  assert.equal(h.state().published.city.siteName, 'Build Your Port Orange');
  assert.equal(h.state().published.city.millage, 5.5);
  assert.equal(h.state().published.budget.target, 1000000);
  assert.equal(h.state().published.budget.services[0].cuts[0].savings, 12345.67);
  assert.equal(h.state().published.budget.services[0].cutExamples[0], 'Reviewed fire consequence.');
  assert.equal(h.state().published.budget.revenues.at(-1).amount, 120000);
});

test('video add, raw upload, save, and removal preserve media selection in the draft', async t => {
  const snapshot = { draft: structuredClone(defaultSiteConfig), published: defaultSiteConfig, revision: 0 };
  let uploaded;
  const h = await setup(t, { fetch: async (path, options) => {
    if (path === '/api/admin/media') { uploaded = options; return Response.json({ url: '/api/media/test-video.mp4' }); }
    if (options.method === 'PATCH') { snapshot.draft = JSON.parse(options.body).config; snapshot.revision++; }
    return Response.json(snapshot);
  } });
  const index = defaultSiteConfig.videos.fire.length;
  await h.click('[data-add="video"][data-service="fire"]');
  h.input(['videos', 'fire', index, 'title'], 'Local fire service overview');
  h.input(['videos', 'fire', index, 'duration'], '60');
  const upload = [...h.root.querySelectorAll('[data-upload]')].find(control => control.dataset.upload === JSON.stringify(['videos', 'fire', index, 'url']));
  const file = new File(['synthetic fixture bytes'], 'city-video.mp4', { type: 'video/mp4' });
  Object.defineProperty(upload, 'files', { value: [file] });
  await h.root.onchange({ target: upload });
  assert.equal(uploaded.body, file);
  assert.equal(uploaded.headers['Content-Type'], 'video/mp4');
  await h.click('#ce-save');
  assert.equal(snapshot.draft.videos.fire[index].url, '/api/media/test-video.mp4');
  assert.equal(snapshot.draft.videos.fire[index].duration, 60);
  const remove = [...h.root.querySelectorAll('[data-remove]')].find(control => control.dataset.remove === JSON.stringify(['videos', 'fire', index]));
  await h.root.onclick({ target: remove });
  await h.click('#ce-save');
  assert.equal(snapshot.draft.videos.fire.length, index);
});

async function openSection(h, page, section) {
  await h.click(`[data-tab="${page}"]`);
  if (section) await h.click(`[data-page-section-button="${section}"]`);
}

test('home page shows one section at a time with a persistent actual-site frame carrying unsaved edits', async t => {
  const h = await setup(t), p = h.preview();
  await openSection(h, 'home');
  assert.equal([...h.root.querySelectorAll('[data-section="home"] [data-page-section]')].filter(part => !part.hidden).length, 1);
  assert.equal(h.root.querySelector('[data-page-section-button][aria-current]').dataset.pageSectionButton, 'hero');
  assert.match(p.frame.src, /^\/\?contentPreview=1&editorPreview=1/);
  h.input(['text', 'home_hero_53'], 'Our future starts here');
  assert.equal(h.root.querySelector('#ce-site-preview'), p.frame);
  p.emit({ type: 'city-editor:ready' });
  assert.equal(p.messages.at(-1).data.config.text.home_hero_53, 'Our future starts here');
  assert.equal(p.messages.at(-1).origin, 'https://city.test');
  await openSection(h, 'home', 'sharing');
  assert.equal(p.messages.at(-1).data.section, 'sharing');
  assert.equal(p.messages.at(-1).data.selection, null);
  assert.equal(h.root.querySelector(`[data-field='${JSON.stringify(['copy', 'home_share-flip_405'])}']`), null);
  p.emit({ type: 'city-editor:select', path: ['copy', 'ui_share_flip_back'] });
  assert.equal(h.root.querySelector('[data-page-section="sharing"] .ce-advanced:not(.ce-more)').open, true);
});

test('formatted paragraphs keep bold text and links as one field and save as formatted text', async t => {
  const h = await setup(t);
  await openSection(h, 'home', 'hero');
  const lede = h.root.querySelector(`[data-field='${JSON.stringify(['text', 'home_hero_55'])}']`);
  assert.equal(lede.dataset.rich, 'inline');
  assert.equal(lede.querySelectorAll('strong').length, 2, 'Both bold amounts stay in the same field');
  lede.innerHTML = 'Cuts could reach <b>{{target}}</b>. Read <a href="https://example.gov/plan">the plan</a>.';
  h.root.oninput({ target: lede });
  await h.click('#ce-save');
  assert.equal(h.state().draft.text.home_hero_55, 'Cuts could reach **{{target}}**. Read [the plan](https://example.gov/plan).');
});

test('privacy sections can be added, reordered, removed, and limited to an analytics state', async t => {
  const h = await setup(t);
  await openSection(h, 'privacy');
  const sections = () => h.state().draft.sections.privacySections;
  const count = h.root.querySelectorAll('[data-section="privacy"] .ce-region-item').length;
  assert.ok(count >= 7);
  assert.ok(h.root.querySelector('[data-section="privacy"]').textContent.includes('Public records and retention'));
  await h.click('[data-add="section"][data-region="privacySections"]');
  h.input(['sections', 'privacySections', count, 'title'], 'Accessibility');
  h.input(['sections', 'privacySections', count, 'body'], 'Contact the City for help using this site.');
  await h.click(`[data-move='${JSON.stringify(['sections', 'privacySections', count])}'][data-direction="-1"]`);
  const visibility = h.root.querySelector(`[data-field='${JSON.stringify(['sections', 'privacySections', count - 1, 'visibility'])}']`);
  visibility.value = 'analytics-on'; h.root.oninput({ target: visibility });
  await h.click('#ce-save');
  assert.equal(sections()[count - 1].title, 'Accessibility');
  assert.equal(sections()[count - 1].visibility, 'analytics-on');
  assert.match(sections()[count - 1].id, /^privacy-sections-[a-f0-9]{8}$/);
  h.window.confirm = () => true;
  await h.click(`[data-remove='${JSON.stringify(['sections', 'privacySections', count - 1])}']`);
  await h.click('#ce-save');
  assert.equal(sections().length, count);
  // A required heading cannot be left empty.
  h.input(['sections', 'privacySections', 0, 'body'], '');
  await h.click('#ce-save');
  assert.match(h.root.querySelector('#ce-status').textContent, /required/);
});

test('sources section edits explanations and official links, and calculator text lives with the calculator', async t => {
  const h = await setup(t), p = h.preview();
  await openSection(h, 'home', 'sources');
  assert.equal(p.messages.at(-1).data.section, 'sources');
  const part = h.root.querySelector('[data-page-section="sources"]');
  assert.ok(part.querySelector('[data-add="section"][data-region="sourceLinks"]'));
  assert.ok(part.querySelector('[data-add="section"][data-region="sourceExplanations"]'));
  h.input(['sections', 'sourceLinks', 2, 'url'], 'https://example.org/city-budget');
  await openSection(h, 'home', 'calculator');
  assert.ok(h.root.querySelector(`[data-page-section="calculator"] [data-field='${JSON.stringify(['sections', 'calculatorIntro', 'body'])}']`));
  p.emit({ type: 'city-editor:ready' });
  assert.equal(p.messages.at(-1).data.section, 'calculator');
  await h.click('#ce-save');
  assert.equal(h.state().draft.sections.sourceLinks[2].url, 'https://example.org/city-budget');
});

test('frame selection opens the matching field and ignores messages from other origins or windows', async t => {
  const h = await setup(t), p = h.preview();
  p.emit({ type: 'city-editor:select', path: ['links', 'home_site-footer_link_10'] }, { origin: 'https://untrusted.test' });
  assert.equal(h.root.querySelector('[data-tab="start"]').getAttribute('aria-current'), 'page');
  p.emit({ type: 'city-editor:select', path: ['links', 'home_site-footer_link_10'] }, { source: {} });
  assert.equal(h.root.querySelector('[data-tab="start"]').getAttribute('aria-current'), 'page');
  p.emit({ type: 'city-editor:select', path: ['links', 'home_site-footer_link_10'] });
  // Social links are entered once, in Key facts.
  assert.equal(h.root.querySelector('[data-section="facts"]').hidden, false);
  p.emit({ type: 'city-editor:select', path: ['heroImages', 0, 'url'] });
  assert.equal(h.root.querySelector('[data-page-section="hero"]').hidden, false);
  assert.equal(h.root.querySelector('#ce-heroImages-0-url').closest('details').open, true);
  p.emit({ type: 'city-editor:select', path: ['sections', 'privacySections', 1, 'title'] });
  assert.equal(h.root.querySelector('[data-section="privacy"]').hidden, false);
  p.emit({ type: 'city-editor:select', path: ['media', 'launch_main_image_1', 'url'] });
  assert.match(p.frame.src, /^\/coming-soon\?contentPreview=1&editorPreview=1/);
  h.input(['links', 'home_site-footer_link_10'], 'javascript:alert(1)');
  assert.equal(h.root.querySelector('[href^="javascript:"]'), null);
});

test('hero photos can be added, reordered, removed to zero, and saved with stable IDs', async t => {
  const h = await setup(t);
  const starting = h.root.querySelectorAll('[data-move-hero][data-direction="1"]').length;
  assert.equal(h.root.querySelectorAll('.ce-photo-details[open]').length, 0);
  await h.click('[data-add="hero"]');
  assert.equal(h.root.querySelectorAll('.ce-photo-details[open]').length, 1);
  h.input(['heroImages', starting, 'url'], '/assets/local-photo.webp');
  h.input(['heroImages', starting, 'alt'], 'Our city park');
  h.input(['heroImages', starting, 'label'], 'Park in {{city}}');
  assert.match(h.root.querySelectorAll('.ce-hero-grid figcaption')[starting].textContent, /Park in DeLand/);
  await h.click(`[data-move-hero="${starting}"][data-direction="-1"]`);
  await h.click('#ce-save');
  assert.equal(h.state().draft.heroImages[starting - 1].url, '/assets/local-photo.webp');
  const id = h.state().draft.heroImages[starting - 1].id;
  await h.click(`[data-move-hero="${starting - 1}"][data-direction="-1"]`);
  await h.click('#ce-save');
  assert.equal(h.state().draft.heroImages[starting - 2].id, id);
  for (let index = starting; index >= 0; index--) {
    const button = [...h.root.querySelectorAll('[data-remove]')].find(el => el.dataset.remove === JSON.stringify(['heroImages', index]));
    await h.root.onclick({ target: button });
  }
  await h.click('#ce-save');
  assert.deepEqual(h.state().draft.heroImages, []);
  assert.match(h.root.querySelector('[data-page-section="hero"]').textContent, /Slideshow photos 0/);
});

test('new departments and cost centers pass real schema, and removing departments cleans their videos only', async t => {
  const h = await setup(t), index = defaultSiteConfig.budget.services.length;
  await h.click('[data-add="department"]');
  h.input(['budget', 'services', index, 'name'], 'Community services');
  h.input(['budget', 'services', index, 'desc'], 'Local community programs.');
  assert.match(h.root.querySelector(`[data-department-preview="${index}"]`).textContent, /Local community programs/);
  await h.click(`[data-add="cut"][data-index="${index}"]`);
  h.input(['budget', 'services', index, 'cuts', 0, 'name'], 'Community center');
  h.input(['budget', 'services', index, 'cuts', 0, 'savings'], '1234');
  await h.click('#ce-save');
  const added = h.state().draft.budget.services[index];
  assert.equal(added.name, 'Community services');
  assert.ok(added.cuts[0].id.length <= 80);
  assert.equal(added.cutExamples.length, 4);
  const originalVideoCount = h.state().draft.videos.fire.length;
  const remove = [...h.root.querySelectorAll('[data-remove]')].find(el => el.dataset.remove === '["budget","services",0]');
  h.window.confirm = () => false;
  await h.root.onclick({ target: remove });
  assert.ok(h.root.querySelector('[data-add="video"][data-service="fire"]'));
  h.window.confirm = () => true;
  await h.root.onclick({ target: remove });
  await h.click('#ce-save');
  assert.equal(h.state().draft.budget.services.some(service => service.id === 'fire'), false);
  assert.equal(h.state().draft.videos.fire, undefined);
  assert.equal(h.state().published.videos.fire.length, originalVideoCount);
});

test('validation reveals a hidden section and opens collapsed photo fields', async t => {
  const h = await setup(t);
  h.input(['heroImages', 0, 'url'], '');
  await h.click('[data-tab="privacy"]');
  const invalid = h.root.querySelector('#ce-heroImages-0-url');
  let reported = false;
  h.root.querySelectorAll('input,textarea,select').forEach(control => { control.checkValidity = () => control !== invalid; });
  invalid.reportValidity = () => { reported = true; };
  await h.root.onclick({ target: h.root.querySelector('#ce-save') });
  assert.equal(reported, true);
  assert.equal(h.root.querySelector('[data-section="home"]').hidden, false);
  assert.equal(h.root.querySelector('[data-page-section="hero"]').hidden, false);
  assert.equal(invalid.closest('details').open, true);
  assert.equal(h.requests.some(request => request.options.method === 'PATCH'), false);
});

test('interactive state labels stay distinct and typing leaves the real preview frame mounted', async t => {
  const h = await setup(t), p = h.preview();
  await openSection(h, 'home', 'budget');
  const label = key => h.root.querySelector(`[data-copy-key="${key}"] .ce-field > span`).textContent;
  assert.equal(label('ui_budget_old_plan'), 'Old plan');
  assert.equal(label('ui_budget_unavailable_plan'), 'Unavailable plan');
  assert.equal(label('ui_budget_reached_title'), 'Reached title');
  assert.equal(label('ui_budget_goal_title'), 'Goal title');
  h.root.querySelector('[data-page-section="budget"] .ce-advanced').open = true;
  h.input(['copy', 'ui_budget_old_plan'], 'This older plan needs new selections.');
  h.input(['copy', 'ui_budget_unavailable_plan'], 'Choose from the current services.');
  assert.equal(h.root.querySelector('[data-page-section="budget"] .ce-advanced').open, true);
  assert.equal(h.root.querySelector('#ce-site-preview'), p.frame);
  p.emit({ type: 'city-editor:ready' });
  assert.equal(p.messages.at(-1).data.config.copy.ui_budget_unavailable_plan, 'Choose from the current services.');
});


test('postcard flip edits expose effective runtime labels and retain hidden legacy configuration', async t => {
  const h = await setup(t);
  assert.equal(h.root.querySelector('#ce-copy-home_share-flip_405'), null);
  assert.equal(h.root.querySelector('#ce-copy-home_share-flip_406'), null);
  h.input(['copy', 'ui_share_flip_back'], 'See my budget choices');
  await h.click('#ce-save');
  assert.equal(h.state().draft.copy.ui_share_flip_back, 'See my budget choices');
  assert.equal(h.state().draft.copy['home_share-flip_405'], defaultSiteConfig.copy['home_share-flip_405']);
  assert.equal(h.state().draft.copy['home_share-flip_406'], defaultSiteConfig.copy['home_share-flip_406']);
});

test('review list jumps to fields, removals ask first, and server errors focus the field at fault', async t => {
  const h = await setup(t);
  h.root.querySelector('#ce-city').value = 'Port Orange'; h.root.oninput({ target: h.root.querySelector('#ce-city') });
  const items = [...h.root.querySelectorAll('#ce-review li')].map(item => item.textContent);
  assert.ok(items.some(text => /Footer · Facebook/.test(text)));
  assert.ok(items.some(text => /site address is still DeLand/.test(text)));
  const index = [...h.root.querySelectorAll('[data-review]')].findIndex(button => /site address/.test(button.closest('li').textContent));
  await h.click(`[data-review="${index}"]`);
  assert.equal(h.root.querySelector('.ce-tabs [data-tab][aria-current]').dataset.tab, 'city');
  // Hidden plumbing never reaches the editor.
  assert.equal(h.root.querySelector('[data-field=\'["copy","home_home_1"]\']'), null);
  assert.equal(h.root.querySelector('[data-field=\'["links","privacy_page_link_1"]\']'), null);
  const faqs = h.state().draft.faqs.length;
  h.window.confirm = () => false;
  await h.click('[data-remove=\'["faqs",0]\']');
  assert.equal(h.root.querySelectorAll('[data-page-section="faqs"] .ce-card').length, faqs);
  h.window.confirm = () => true;
  await h.click('[data-remove=\'["faqs",0]\']');
  assert.equal(h.root.querySelectorAll('[data-page-section="faqs"] .ce-card').length, faqs - 1);
});

test('a rejected save reports the server message and returns the field path', async t => {
  const h = await setup(t, { fetch: async (path, options = {}) => options.method === 'PATCH'
    ? Response.json({ error: 'Public site address must be just the domain.', field: ['city', 'url'] }, { status: 400 })
    : Response.json({ draft: structuredClone(defaultSiteConfig), published: structuredClone(defaultSiteConfig), revision: 0 }) });
  await h.click('[data-tab="privacy"]');
  h.input(['city', 'url'], 'https://budget.example.gov/about');
  await h.click('#ce-save');
  assert.match(h.root.querySelector('#ce-status').textContent, /just the domain/);
  assert.equal(h.root.querySelector('.ce-tabs [data-tab][aria-current]').dataset.tab, 'city');
  assert.equal(h.root.querySelector('#ce-save').disabled, false);
});

test('budget tab holds every revenue option and the wording around them, reachable from the top', async t => {
  const h = await setup(t);
  await h.click('[data-tab="budget"]');
  const budget = h.root.querySelector('[data-section="budget"]');
  assert.ok(budget.querySelector('[data-jump="ce-budget-revenue"]'));
  assert.ok(budget.querySelector('#ce-budget-revenue'));
  for (const path of [['text', 'home_revenue-title_318'], ['text', 'home_builder_319'], ['copy', 'ui_revenue_millage_explanation'], ['copy', 'ui_revenue_select']]) {
    assert.ok(budget.querySelector(`[data-field='${JSON.stringify(path)}']`), path[1]);
    assert.equal(h.root.querySelector(`[data-section="home"] [data-field='${JSON.stringify(path)}']`), null, `${path[1]} is not duplicated on the Home page tab`);
  }
  const index = defaultSiteConfig.budget.revenues.findIndex(item => item.id !== 'millage-rate');
  h.input(['budget', 'revenues', index, 'description'], 'A locally reviewed fee.');
  h.input(['text', 'home_revenue-title_318'], 'Ways to raise revenue');
  await h.click('#ce-save');
  assert.equal(h.state().draft.budget.revenues[index].description, 'A locally reviewed fee.');
  assert.equal(h.state().draft.text['home_revenue-title_318'], 'Ways to raise revenue');
});

test('the property tax slider has its own section and can be switched off and back on', async t => {
  const h = await setup(t);
  await h.click('[data-tab="budget"]');
  const index = defaultSiteConfig.budget.revenues.findIndex(item => item.id === 'millage-rate');
  const toggle = () => h.root.querySelector(`[data-field='${JSON.stringify(['budget', 'revenues', index, 'enabled'])}']`);
  assert.ok(h.root.querySelector('#ce-budget-millage'));
  assert.ok(h.root.querySelector('[data-jump="ce-budget-millage"]'));
  assert.ok(h.root.querySelector(`.ce-millage-settings [data-field='${JSON.stringify(['copy', 'ui_revenue_millage_explanation'])}']`));
  // The slider is not repeated in the general revenue list.
  assert.equal(h.root.querySelectorAll(`[data-field='${JSON.stringify(['budget', 'revenues', index, 'name'])}']`).length, 1);
  toggle().checked = false; h.root.oninput({ target: toggle() });
  assert.equal(h.root.querySelector('.ce-millage-settings').hasAttribute('disabled'), true);
  assert.match(h.root.querySelector('#ce-review').textContent, /slider is off, but this text still mentions it/);
  await h.click('#ce-save');
  assert.equal(h.state().draft.budget.revenues[index].enabled, false);
  assert.equal(h.state().draft.budget.revenues[index].amount, defaultSiteConfig.budget.revenues[index].amount);
  toggle().checked = true; h.root.oninput({ target: toggle() });
  await h.click('#ce-save');
  assert.equal(h.state().draft.budget.revenues[index].enabled, true);
});

test('key facts, start here and the review list work together for a new city', async t => {
  const h = await setup(t);
  assert.equal(h.root.querySelector('.ce-tabs [aria-current]').dataset.tab, 'start');
  assert.equal(h.root.querySelectorAll('[data-section="start"] .ce-step').length, 8);
  h.root.querySelector('#ce-city').value = 'Port Orange'; h.root.oninput({ target: h.root.querySelector('#ce-city') });
  // Every review item opens a real field.
  const controls = new Set([...h.root.querySelectorAll('[data-field]')].map(control => control.dataset.field));
  const items = [...h.root.querySelectorAll('[data-review]')];
  assert.ok(items.length > 15);
  const { contentWarnings } = await import('../src/content-editor-context.js');
  for (const warning of contentWarnings(h.module.__testConfig?.() || JSON.parse(JSON.stringify(h.state().draft)))) if (warning.path) assert.ok(controls.has(JSON.stringify(warning.path)) || warning.path[0] === 'budget', warning.message);
  assert.match(h.root.querySelector('[data-step-status="facts"]').textContent, /to review/);
  // Key facts show where they are used and how money will read.
  const facts = h.root.querySelector('[data-section="facts"]');
  assert.match(facts.textContent, /Used in \d+ places/);
  h.input(['city', 'yearTwoImpact'], '3100000');
  assert.match(h.root.querySelector('[data-fact="yearTwoImpact"] small').textContent, /Shows as \$3\.1 million/);
  // Facts appear as chips in rich text and save as tokens.
  const lede = h.root.querySelector(`[data-field='${JSON.stringify(['text', 'home_hero_55'])}']`);
  assert.ok(lede.querySelector('.ce-token[data-token="{{yearTwoImpact:words}}"]'));
  assert.equal(lede.querySelector('.ce-token[data-token="{{yearTwoImpact:words}}"]').textContent, '$3.1 million');
  lede.querySelector('.ce-token').insertAdjacentText('afterend', ' edited');
  h.root.oninput({ target: lede });
  h.input(['city', 'millage'], '4.975');
  await h.click('#ce-save');
  assert.match(h.state().draft.text.home_hero_55, /\{\{city\}\} edited’s annual budget by an estimated \*\*\{\{target:words\}\}\*\*/);
  // Fields the page fills in itself are not offered.
  for (const key of ['home_overview_139', 'home_services_168', 'home_builder_290', 'home_site-footer_463', 'privacy_main_15']) assert.equal(h.root.querySelector(`[data-field='${JSON.stringify(['text', key])}']`), null, key);
});

test('plain one-line text saves escaped, and items added during a search stay visible', async t => {
  const h = await setup(t);
  await h.click('[data-tab="home"]');
  const search = h.root.querySelector('#ce-find'); search.value = 'homestead'; h.root.oninput({ target: search });
  await h.click('[data-page-section-button="faqs"]');
  search.value = 'homestead'; h.root.oninput({ target: search });
  await h.click('[data-add="faq"]');
  const added = h.root.querySelector(`[data-field='${JSON.stringify(['faqs', defaultSiteConfig.faqs.length, 'question'])}']`);
  assert.equal(added.closest('.ce-row').hidden, false);
  assert.equal(h.root.querySelector('#ce-find').value, '');
  h.input(['faqs', defaultSiteConfig.faqs.length, 'question'], 'A new question?');
  h.input(['faqs', defaultSiteConfig.faqs.length, 'answer'], 'An answer.');
  const plain = [...h.root.querySelectorAll('[data-field]')].find(control => JSON.parse(control.dataset.field)[0] === 'text' && control.tagName === 'INPUT');
  plain.value = 'Save 5 * 3 [now]'; h.root.oninput({ target: plain });
  const key = JSON.parse(plain.dataset.field)[1];
  await h.click('#ce-save');
  assert.equal(h.state().draft.text[key], 'Save 5 \\* 3 \\[now\\]');
});
