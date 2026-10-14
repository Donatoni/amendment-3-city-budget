// Structured page content: whole paragraphs and headings ("text" fields) and
// repeating areas ("sections") such as the privacy notice's sections.
//
// Older saved content stored each text fragment separately. normalizeContent()
// rebuilds whole fields from those fragments the first time content is loaded,
// so earlier edits carry over without anyone retyping them.
import { textFields, regionSources } from './content-recipes.js';
import { escapeMarkdown, renderMarkdown, markdownToText } from './markdown.js';
import { expandCopy, escapeText } from './site-runtime.js';

export { textFields, regionSources };
const collapse = text => text.replace(/[ \t\r\f\v]+/g, ' ').replace(/ ?\n ?/g, '\n').trim();

// Rebuild one field from its original fragments using saved (or default) values.
export function composeText(key, config, overrides = {}) {
  const recipe = textFields[key];
  if (!recipe) return '';
  const copy = { ...config.copy, ...overrides.copy }, links = { ...config.links, ...overrides.links };
  let out = '';
  for (const part of recipe.parts) {
    if (typeof part === 'string') out += part;
    // Line breaks inside old fragments only ever displayed as spaces.
    else if (part.k) out += `${part.pre}${escapeMarkdown(String(copy[part.k] ?? '').replace(/\s*\n\s*/g, ' '))}${part.post}`;
    else if (part.t !== undefined) out += escapeMarkdown(part.t.replace(/\s*\n\s*/g, ' '));
    else if (part.br) out += '\n';
    else if (part.l) out += links[part.l] ?? '';
    else if (part.u !== undefined) out += part.u;
  }
  // A cleared fragment can leave empty markers or links behind; drop them.
  return collapse(out.replace(/\[\s*\]\([^)]*\)/g, '').replace(/(?<![*\w])\*\*\s*\*\*(?![*\w])/g, ''));
}
const textOf = (config, key) => config.text?.[key] ?? composeText(key, config);
const joinBlocks = (config, keys) => keys.map(key => textOf(config, key)).filter(Boolean).join('\n\n');

// Analytics wording on the privacy page moved from a swapped paragraph to two
// sections, each shown only in the matching Google Analytics state.
const ANALYTICS_PARAGRAPH = 'privacy_browser-storage_33';
function legacyPrivacySections(config) {
  const source = regionSources.privacySections.items;
  const ids = ['information', 'use', 'browser-storage', 'sharing', 'records', 'updates'];
  const sections = [];
  source.forEach((item, index) => {
    const body = item.body.filter(key => key !== ANALYTICS_PARAGRAPH);
    if (item.body.includes(ANALYTICS_PARAGRAPH)) {
      const title = 'Website analytics';
      const on = composeText(ANALYTICS_PARAGRAPH, config, {
        copy: { 'privacy_browser-storage_33': config.copy.privacy_analytics_on_33, 'privacy_browser-storage_35': config.copy.privacy_analytics_on_35 },
        links: { 'privacy_browser-storage_link_5': config.links?.privacy_analytics_on_link_5 },
      });
      sections.push({ id: 'analytics', title, body: on, visibility: 'analytics-on' });
      sections.push({ id: 'analytics-off', title, body: composeText(ANALYTICS_PARAGRAPH, config), visibility: 'analytics-off' });
    }
    sections.push({ id: ids[index] || `section-${index + 1}`, title: textOf(config, item.title), body: joinBlocks(config, body), visibility: 'always' });
  });
  return sections;
}
const listFrom = (id, config, map) => regionSources[id].items.map((item, index) => ({ id: `${id.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}-${index + 1}`, ...map(item) }));

// Each area: where it appears, how its items are edited, and how it renders.
export const REGIONS = {
  privacyNotice: {
    page: 'privacy', section: 'privacy', single: true, label: 'Highlighted notice', help: 'The shaded box at the top of the privacy page.',
    fields: [['title', 'Title', 'text', 200], ['body', 'Text', 'rich', 4000]],
    legacy: config => ({ title: textOf(config, regionSources.privacyNotice.items[0].title), body: joinBlocks(config, regionSources.privacyNotice.items[0].body) }),
  },
  privacySections: {
    page: 'privacy', section: 'privacy', label: 'Sections', item: 'Section', min: 1, max: 30,
    help: 'Each section has a heading and its text. Add, remove, or reorder sections to match your city’s practices.',
    fields: [['title', 'Heading', 'text', 200, true], ['body', 'Text', 'rich', 8000, true], ['visibility', 'Show this section', 'visibility']],
    blank: () => ({ title: '', body: '', visibility: 'always' }),
    legacy: legacyPrivacySections,
  },
  amendmentPoints: {
    page: 'home', section: 'amendment', label: 'Key points', item: 'Point', min: 1, max: 12,
    help: 'Numbered automatically. With an odd number of points, the last one spans the full width.',
    fields: [['title', 'Point', 'text', 200, true], ['body', 'Explanation', 'inline', 1000]],
    blank: () => ({ title: '', body: '' }),
    legacy: config => listFrom('amendmentPoints', config, item => ({ title: textOf(config, item.title), body: joinBlocks(config, item.body) })),
  },
  sourceExplanations: {
    page: 'home', section: 'sources', label: 'Expandable explanations', item: 'Explanation', min: 0, max: 12,
    help: 'Shown under “How we estimate city tax savings”. Residents click a title to open its text.',
    fields: [['title', 'Title', 'text', 200, true], ['body', 'Text', 'rich', 8000, true]],
    blank: () => ({ title: '', body: '' }),
    legacy: config => listFrom('sourceExplanations', config, item => ({ title: textOf(config, item.title), body: joinBlocks(config, item.body) })),
  },
  sourceLinks: {
    page: 'home', section: 'sources', label: 'Official sources', item: 'Source', min: 0, max: 20,
    help: 'Links to the agencies and documents behind the numbers.',
    fields: [['title', 'Name', 'text', 200, true], ['publisher', 'Published by', 'text', 200], ['url', 'Link address', 'url', 2048, true]],
    blank: () => ({ title: '', publisher: '', url: '' }),
    legacy: config => listFrom('sourceLinks', config, item => ({ title: textOf(config, item.title), publisher: textOf(config, item.publisher), url: config.links?.[item.url] || '' })),
  },
  calculatorIntro: {
    page: 'home', section: 'calculator', single: true, label: 'Introduction', help: 'The paragraphs beside the savings calculator.',
    fields: [['body', 'Text', 'rich', 8000]],
    legacy: config => ({ body: joinBlocks(config, regionSources.calculatorIntro.items[0].body) }),
  },
  builderIntro: {
    page: 'home', section: 'budget', tab: 'budget', single: true, label: 'Introduction', help: 'The paragraphs at the top of the budget builder.',
    fields: [['body', 'Text', 'rich', 8000]],
    legacy: config => ({ body: joinBlocks(config, regionSources.builderIntro.items[0].body) }),
  },
  launchPoints: {
    page: 'launch', section: 'launch', label: 'What’s coming', item: 'Highlight', min: 0, max: 6,
    help: 'The numbered highlights along the bottom of the coming-soon page.',
    fields: [['title', 'Title', 'text', 120, true], ['body', 'Description', 'text', 300]],
    blank: () => ({ title: '', body: '' }),
    legacy: config => listFrom('launchPoints', config, item => ({ title: textOf(config, item.title), body: joinBlocks(config, item.body) })),
  },
};
export const VISIBILITY = [['always', 'Always'], ['analytics-on', 'Only while Google Analytics is on'], ['analytics-off', 'Only while Google Analytics is off']];

// Fragments and links now covered by a whole field or an area. The old
// per-fragment editing skips these.
export const absorbedCopy = new Set(Object.values(textFields).flatMap(field => field.keys));
const regionKeys = new Set(Object.values(regionSources).flatMap(region => region.items.flatMap(item => Object.values(item).flat())));
export const absorbedLinks = new Set([
  ...Object.values(textFields).flatMap(field => field.parts.filter(part => part?.l).map(part => part.l)),
  ...Object.values(regionSources).flatMap(region => region.items.map(item => item.url).filter(Boolean)),
]);
export const isRegionText = key => regionKeys.has(key);

// Fill in whole fields and areas for content saved before they existed.
export function normalizeContent(config) {
  const text = { ...config.text };
  for (const key of Object.keys(textFields)) if (typeof text[key] !== 'string' && !isRegionText(key)) text[key] = composeText(key, config);
  const sections = { ...config.sections };
  for (const [id, region] of Object.entries(REGIONS)) if (sections[id] === undefined) sections[id] = region.legacy(config);
  return { ...config, text, sections };
}

const inline = (value, config) => renderMarkdown(expandCopy(value, config), { inline: true });
const block = (value, config) => renderMarkdown(expandCopy(value, config));
function make(document, html) {
  const box = document.createElement('div'), fragment = document.createDocumentFragment();
  box.innerHTML = html;
  while (box.firstChild) fragment.append(box.firstChild);
  return fragment;
}
const childrenOf = (container, tag) => [...container.children].filter(node => node.tagName === tag.toUpperCase());
const pad = index => String(index + 1).padStart(2, '0');
const slug = value => String(value).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'section';
const renderers = {
  privacyNotice(container, value, config, document) {
    const heading = container.querySelector('h2');
    if (heading) heading.textContent = expandCopy(value.title, config);
    childrenOf(container, 'p').forEach(node => node.remove());
    container.append(make(document, block(value.body, config)));
  },
  privacySections(container, items, config, document, { analytics }) {
    childrenOf(container, 'section').forEach(node => node.remove());
    const visible = items.filter(item => item.visibility === 'analytics-on' ? analytics : item.visibility === 'analytics-off' ? !analytics : true);
    container.append(make(document, visible.map(item => `<section aria-labelledby="${escapeText(slug(item.id))}" data-section-id="${escapeText(item.id)}"><h2 id="${escapeText(slug(item.id))}">${escapeText(expandCopy(item.title, config))}</h2>${block(item.body, config)}</section>`).join('')));
  },
  amendmentPoints(container, items, config, document) {
    container.innerHTML = '';
    container.append(make(document, items.map((item, index) => `<li class="${items.length % 2 && index === items.length - 1 && items.length > 1 ? 'wide ' : ''}reveal" data-section-id="${escapeText(item.id)}"><span>${pad(index)}</span><div><strong>${escapeText(expandCopy(item.title, config))}</strong>${item.body ? `<p>${inline(item.body, config)}</p>` : ''}</div></li>`).join('')));
  },
  sourceExplanations(container, items, config, document) {
    childrenOf(container, 'details').forEach(node => node.remove());
    container.append(make(document, items.map(item => `<details class="source-detail" data-section-id="${escapeText(item.id)}"><summary>${escapeText(expandCopy(item.title, config))}</summary><div class="source-detail-content">${block(item.body, config)}</div></details>`).join('')));
  },
  sourceLinks(container, items, config, document) {
    container.innerHTML = '';
    container.append(make(document, items.filter(item => expandCopy(item.url, config)).map(item => `<li data-section-id="${escapeText(item.id)}"><a target="_blank" rel="noopener noreferrer" href="${escapeText(expandCopy(item.url, config))}"><span class="source-link-copy"><strong>${escapeText(expandCopy(item.title, config))}</strong>${item.publisher ? `<small>${escapeText(expandCopy(item.publisher, config))}</small>` : ''}</span><span class="source-link-arrow" aria-hidden="true">↗</span></a></li>`).join('')));
  },
  calculatorIntro(container, value, config, document) {
    const paragraphs = childrenOf(container, 'p');
    const anchor = paragraphs[0] || container.firstChild;
    const fragment = make(document, block(value.body, config));
    if (anchor) container.insertBefore(fragment, anchor); else container.append(fragment);
    paragraphs.forEach(node => node.remove());
  },
  builderIntro(container, value, config, document) {
    container.innerHTML = '';
    container.append(make(document, block(value.body, config)));
  },
  launchPoints(container, items, config, document) {
    childrenOf(container, 'div').forEach(node => node.remove());
    container.append(make(document, items.map((item, index) => `<div data-section-id="${escapeText(item.id)}"><span class="preview-number">${pad(index)}</span><p><strong>${escapeText(expandCopy(item.title, config))}</strong>${item.body ? `<span>${escapeText(expandCopy(item.body, config))}</span>` : ''}</p></div>`).join('')));
  },
};

// Apply whole fields and areas to a page. Resolve every element before
// changing any, so selectors computed from the template stay valid.
// Returns a function that applies them, so callers can resolve every target
// before other changes (such as removing cleared links) shift the page.
export function prepareStructuredContent(document, config, page, { analytics = false } = {}) {
  const content = normalizeContent(config);
  const targets = Object.entries(textFields).filter(([key, field]) => field.page === page && !isRegionText(key))
    .map(([key, field]) => [key, field, document.querySelector(field.selector)]);
  const areas = Object.entries(REGIONS).filter(([, region]) => region.page === page)
    .map(([id]) => [id, document.querySelector(regionSources[id].container)]);
  return () => {
    for (const [key, field, node] of targets) {
      if (!node) continue;
      const value = content.text[key] ?? '';
      if (field.tag === 'title' || field.tag === 'option') node.textContent = markdownToText(expandCopy(value, config));
      else node.innerHTML = inline(value, config);
    }
    for (const [id, container] of areas) if (container) renderers[id](container, content.sections[id], config, document, { analytics });
    return content;
  };
}
export const blockHTML = block;

// Short labels for whole fields, from the element they fill.
export function textFieldRole(key) {
  const field = textFields[key];
  if (!field) return 'Text';
  const cls = field.cls || '';
  if (/eyebrow|kicker|resource-label/.test(cls)) return 'Small heading above';
  if (/preview-label/.test(cls)) return 'Heading';
  if (field.tag === 'title') return 'Browser tab title';
  if (field.tag === 'h1') return 'Main heading';
  if (field.tag === 'h2') return 'Section heading';
  if (/^h[3-6]$/.test(field.tag)) return 'Heading';
  if (field.tag === 'summary') return 'Expandable heading';
  if (field.tag === 'figcaption') return 'Caption';
  if (field.tag === 'button') return 'Button';
  if (field.tag === 'a') return /btn|button|cta/.test(cls) ? 'Button' : 'Link text';
  if (field.tag === 'label' || field.tag === 'legend') return 'Form label';
  if (field.tag === 'li' || field.tag === 'dd') return 'List item';
  if (field.tag === 'p') return 'Paragraph';
  if (field.tag === 'time') return 'Date';
  if (field.tag === 'strong' || field.tag === 'b') return 'Highlighted text';
  if (field.tag === 'small') return 'Small text';
  if (field.tag === 'th' || field.tag === 'td' || field.tag === 'dt') return 'Table text';
  return 'Text';
}
// Plain-language names for fields where position alone isn't clear.
const fieldNames = {
  privacy_header_3: 'Header · city name', privacy_header_4: 'Header · tagline', privacy_main_9: 'Small heading above the title', privacy_main_10: 'Page title', privacy_main_13: 'Introduction', privacy_main_15: 'Last updated date (as shown)', privacy_footer_50: 'Footer · city line', privacy_footer_51: 'Footer · privacy policy link', privacy_footer_52: 'Footer · back link',
  launch_launch_3: 'Header · city name', launch_launch_4: 'Header · tagline', launch_main_9: 'Main heading', launch_main_12: 'Introduction', launch_main_13: 'Description', launch_main_14: 'Highlighted quote', launch_launch_23: 'Heading above the highlights', launch_launch_34: 'Footer · city line', launch_launch_35: 'Footer · privacy link', launch_launch_38: 'Footer · closing line',
  login_header_3: 'Header · city name', login_header_4: 'Header · tagline', login_main_9: 'Illustration panel · small heading', login_main_10: 'Illustration panel · heading', login_main_12: 'Illustration panel · text', 'login_login-title_13': 'Small heading above the title', 'login_login-title_16': 'Page title', 'login_login-title_17': 'Instructions', 'login_login-title_18': 'Email field label', 'login_login-title_19': 'Password field label', 'login_login-title_20': 'Show password button', 'login_login-title_22': 'Sign-in button', login_footer_24: 'Footer · city line', login_footer_25: 'Footer · privacy link', login_footer_28: 'Footer · closing line',
  home_nav_3: 'Top menu · city name', home_nav_4: 'Top menu · tagline', home_hero_53: 'Main heading', home_hero_55: 'Introduction',
};
export function textFieldLabel(key) {
  if (fieldNames[key]) return fieldNames[key];
  const group = textFields[key]?.group;
  return group ? `${group} · ${textFieldRole(key).toLowerCase()}` : textFieldRole(key);
}
// Rich editing (bold, italic, links) where longer prose appears.
// Real formatting (bold, italic, a link or a line break), not just an asterisk.
export const isRichTextField = (key, value = '') => ['p', 'li', 'dd', 'figcaption', 'h1', 'h2'].includes(textFields[key]?.tag) || /\{\{\w+/.test(value) || /<(strong|em|a|br)\b/.test(renderMarkdown(value, { inline: true }));
export const textOrder = key => Number(String(key).match(/(\d+)$/)?.[1] ?? 0);
