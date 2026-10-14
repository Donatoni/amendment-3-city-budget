// Regenerates src/content-recipes.js from the page templates.
//
//   node scripts/generate-content-model.mjs           write the file
//   node scripts/generate-content-model.mjs --check   fail if it is out of date
//
// The original editor bound every text node separately, so a paragraph with a
// bold phrase or a link became several fields. A "recipe" records how those
// fragments form one paragraph, so saved fragment edits can be merged into a
// single formatted field. Repeating areas (privacy sections, key points,
// sources) are mapped to lists the same way.
import { readFileSync, writeFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import { contentBindings } from '../src/site-bindings.js';
import { renderPage } from '../src/seo.js';

const root = new URL('..', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const pages = {
  home: renderPage(read('index.html'), 'https://city.example.gov/', false),
  privacy: read('public/privacy.html'),
  launch: read('public/coming-soon.html'),
  login: read('public/login.html'),
};
const INLINE = { STRONG: '**', B: '**', EM: '*', I: '*' };
const ANCHOR_ATTRIBUTES = new Set(['href', 'target', 'rel']);

// An element is "prose" when everything inside it is text, bold, italic, line
// breaks, or plain links. Its children can then be re-rendered from one field.
function prose(element) {
  for (const child of element.childNodes) {
    if (child.nodeType === 3) continue;
    if (child.nodeType !== 1) return false;
    const tag = child.tagName;
    if (tag === 'BR') continue;
    if (!INLINE[tag] && tag !== 'A') return false;
    // An empty <i> or <b> is a decorative shape (a dot or icon), not formatting.
    if (!child.textContent.trim()) return false;
    if ([...child.attributes].some(attribute => tag !== 'A' || !ANCHOR_ATTRIBUTES.has(attribute.name))) return false;
    if (!prose(child)) return false;
  }
  return true;
}
function selectorFor(element) {
  const path = [];
  for (let node = element; node && node.tagName !== 'HTML'; node = node.parentElement) {
    if (node.id) { path.unshift(`#${node.id}`); break; }
    if (node.tagName === 'BODY' || node.tagName === 'HEAD') { path.unshift(node.tagName.toLowerCase()); break; }
    const index = [...node.parentElement.children].filter(sibling => sibling.tagName === node.tagName).indexOf(node) + 1;
    path.unshift(`${node.tagName.toLowerCase()}:nth-of-type(${index})`);
  }
  return path.join(' > ');
}
const edge = (text, pattern) => (pattern.test(text) ? ' ' : '');

// Where a field sits, so the editor can say "Card 2 · Number" rather than
// "Label". The first matching container wins; repeated ones are numbered.
const GROUPS = [
  ['#nav-budget-actions', 'Top menu · budget buttons'], ['.mobile-menu-panel', 'Mobile menu'], ['#nav', 'Top menu'],
  ['.hero-bottom > a', 'Shortcut', true], ['.impact-card', 'Card', true], ['.service-overview', 'Summary card'],
  ['.policy-summary .neutral-note', 'Summary box · note'], ['.policy-summary', 'Summary box'],
  ['.calc-entry', 'Find-your-home card'], ['.calc-assumptions', 'Calculation details'], ['.calc-estimate', 'Results card'], ['.calculator-footer', 'Below the calculator'],
  ['#gap-meter .gap-milestones', 'Progress bar · milestones'], ['#gap-meter', 'Progress bar'], ['.builder-submit-card', 'Submit box'], ['.selected-cuts-summary', 'Your choices list'], ['.builder-controls-head', 'Department choices'],
  ['.source-formula', 'Method card · formula'], ['.source-method', 'Method card'], ['.source-directory', 'Official sources'],
  ['#feedback-modal', 'Feedback form'], ['.share-image-save', 'Sharing window · save image'], ['#share-modal', 'Sharing window'], ['#service-video-dialog', 'Video player'],
  ['.footer-legal', 'Footer · fine print'], ['.footer-social', 'Footer · social media'], ['#site-footer', 'Footer'],
  ['.launch-invitation', 'Quote'], ['.art-note', 'Illustration · note'], ['.launch-art figcaption', 'Illustration · caption'], ['.login-art', 'Illustration panel'], ['#login-form', 'Sign-in form'],
  ['.launch-preview', 'What’s coming'], ['header', 'Header'], ['footer', 'Footer'],
];
function groupOf(element, document) {
  for (const [selector, name, numbered] of GROUPS) {
    const container = element.closest(selector);
    if (!container) continue;
    if (!numbered) return name;
    return `${name} ${[...document.querySelectorAll(selector)].indexOf(container) + 1}`;
  }
  return '';
}
const fields = {}, regions = {};
for (const [page, html] of Object.entries(pages)) {
  const { document } = parseHTML(html);
  const textKey = new Map(), linkKey = new Map();
  for (const [key, binding] of Object.entries(contentBindings)) {
    if (binding.page !== page || binding.attribute || binding.image) continue;
    const node = document.querySelector(binding.selector);
    if (!node) continue;
    if (binding.link) linkKey.set(node, key);
    else if (node.childNodes[binding.index]?.nodeType === 3) textKey.set(node.childNodes[binding.index], key);
  }
  const owner = new Map();
  for (const text of textKey.keys()) {
    let element = text.parentElement;
    if (!prose(element)) continue;
    while (element.parentElement && prose(element.parentElement) && element.parentElement.tagName !== 'BODY') element = element.parentElement;
    owner.set(text, element);
  }
  const elements = [...new Set(owner.values())];
  const serialize = element => [...element.childNodes].flatMap(child => {
    if (child.nodeType === 3) {
      const raw = child.textContent;
      if (!raw.trim()) return raw ? [' '] : [];
      const key = textKey.get(child);
      return key ? [{ k: key, pre: edge(raw, /^\s/), post: edge(raw, /\s$/) }] : [{ t: raw }];
    }
    if (child.tagName === 'BR') return [{ br: 1 }];
    if (INLINE[child.tagName]) return [INLINE[child.tagName], ...serialize(child), INLINE[child.tagName]];
    if (child.tagName === 'A') {
      const href = linkKey.get(child);
      return ['[', ...serialize(child), '](', href ? { l: href } : { u: child.getAttribute('href') || '' }, ')'];
    }
    return serialize(child);
  });
  for (const element of elements) {
    const keys = [...textKey.entries()].filter(([text]) => owner.get(text) === element).map(([, key]) => key);
    const parts = serialize(element);
    // Merge adjacent literal strings to keep the generated file small.
    const merged = parts.reduce((list, part) => {
      if (typeof part === 'string' && typeof list.at(-1) === 'string') list[list.length - 1] += part; else list.push(part);
      return list;
    }, []);
    fields[keys[0]] = { page, selector: selectorFor(element), tag: element.tagName.toLowerCase(), ...(element.getAttribute('class') ? { cls: element.getAttribute('class') } : {}), ...(groupOf(element, document) ? { group: groupOf(element, document) } : {}), parts: merged, keys, ...(element.tagName === 'A' && linkKey.get(element) ? { link: linkKey.get(element) } : {}) };
  }
  const fieldOf = element => element && Object.keys(fields).find(key => fields[key].page === page && document.querySelector(fields[key].selector) === element);
  const fieldsIn = (element, selector) => [...(element?.querySelectorAll(selector) || [])].map(fieldOf).filter(Boolean);
  if (page === 'privacy') {
    const callout = document.querySelector('.privacy-callout');
    regions.privacyNotice = { page, container: '.privacy-callout', items: [{ title: fieldOf(callout.querySelector('h2')), body: fieldsIn(callout, 'p') }] };
    regions.privacySections = { page, container: '.privacy-content', items: [...document.querySelectorAll('.privacy-content > section')].map(section => ({ title: fieldOf(section.querySelector('h2')), body: fieldsIn(section, 'p') })) };
  }
  if (page === 'home') {
    regions.amendmentPoints = { page, container: '#amendment .fact-grid', items: [...document.querySelectorAll('#amendment .fact-grid > li')].map(item => ({ title: fieldOf(item.querySelector('strong')), body: fieldsIn(item, 'p') })) };
    regions.sourceExplanations = { page, container: '#methodology', items: [...document.querySelectorAll('#methodology > details.source-detail')].map(item => ({ title: fieldOf(item.querySelector('summary')), body: fieldsIn(item, '.source-detail-content > p') })) };
    regions.sourceLinks = { page, container: '#sources .source-links', items: [...document.querySelectorAll('#sources .source-links > li')].map(item => ({ title: fieldOf(item.querySelector('strong')), publisher: fieldOf(item.querySelector('small')), url: linkKey.get(item.querySelector('a')) })) };
    regions.builderIntro = { page, container: '#builder .builder-intro', items: [{ body: fieldsIn(document.querySelector('#builder .builder-intro'), ':scope > p') }] };
    regions.calculatorIntro = { page, container: '#savings .calculator-intro', items: [{ body: fieldsIn(document.querySelector('#savings .calculator-intro'), ':scope > p') }] };
  }
  if (page === 'launch') {
    regions.launchPoints = { page, container: '.launch-preview', items: [...document.querySelectorAll('.launch-preview > div')].map(item => ({ title: fieldOf(item.querySelector('strong')), body: [fieldOf(item.querySelector('p > span'))].filter(Boolean) })) };
  }
}
for (const [id, region] of Object.entries(regions)) {
  for (const item of region.items) for (const [name, value] of Object.entries(item)) {
    if ((Array.isArray(value) ? !value.length : !value) && !(id === 'privacyNotice' && name === 'title')) throw new Error(`Region ${id} has an empty ${name}. Check its selectors against the template.`);
  }
}

const lines = object => `{\n${Object.entries(object).map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)},`).join('\n')}\n}`;
const output = `// Generated by scripts/generate-content-model.mjs from the page templates. Do not edit.
// Each field lists how the original text fragments combine into one formatted
// field; each region lists which fields form its starting items.
export const textFields = ${lines(fields)};
export const regionSources = ${lines(regions)};
`;
const target = new URL('src/content-recipes.js', root);
if (process.argv.includes('--check')) {
  let current = '';
  try { current = readFileSync(target, 'utf8'); } catch {}
  if (current !== output) { console.error('src/content-recipes.js is out of date. Run: node scripts/generate-content-model.mjs'); process.exit(1); }
  console.log('src/content-recipes.js is up to date.');
} else {
  writeFileSync(target, output);
  console.log(`Wrote ${Object.keys(fields).length} text fields and ${Object.keys(regions).length} regions.`);
}
