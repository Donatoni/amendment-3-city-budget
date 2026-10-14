import './content-editor.css';
import { siteUICopy } from './site-ui-copy.js';
import { postcardCopy } from './site-postcard-copy.js';
const editorCopyDefaults = { ...siteUICopy, ...postcardCopy };
import { VOLUSIA_CITIES } from './volusia-cities.js';
import { getHeroImages } from './hero-images.js';
import { sectionFor, isAdvancedCopy, isHiddenCopy, isLegacyHeroCopy, isRuntimeOwnedCopy, isBudgetOwnedCopy, isRevenueCopy, revenueCopyLabels, revenueWordingKeys, millageWordingKeys, cityFieldInfo, cityImageInfo, contentWarnings, copyLabel, linkLabel, previewURL, editorPages, editorSection, isEditableText, isEditableFragment, isEditableLink, isCoreText, isKeyFactOnly, budgetTabText, textLabel } from './content-editor-context.js';
import { KEY_FACTS, KEY_FACT_GROUPS, SOCIAL_LINKS, TOKEN_LABELS, formatMoney } from './key-facts.js';
import { contentBindings } from './site-bindings.js';
import { textFields, regionSources, REGIONS, VISIBILITY, normalizeContent, isRichTextField, textOrder, absorbedCopy, absorbedLinks } from './content-model.js';
import { isAllowedMarkdownURL, markdownToText, escapeMarkdown } from './markdown.js';
import { htmlToMarkdown, markdownToEditorHTML } from './rich-text.js';
import { expandCopy, escapeText as esc } from './site-runtime.js';
import { actualPreviewMarkup, createSitePreview } from './content-editor-preview.js';

const title = key => key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[._-]/g, ' ').replace(/^./, char => char.toUpperCase());
const tabs = [['start', 'Start here'], ['city', 'City & branding'], ['facts', 'Key facts'], ['budget', 'Budget'], ...editorPages.map(([id, label]) => [id, label]), ['videos', 'Videos']];
// Shorter names on the tab bar so it fits on one row on a laptop.
const tabNames = { privacy: 'Privacy', launch: 'Coming soon', login: 'Sign-in' };
const editor = { root: null, config: null, revision: null, dirty: false, busy: false, tab: 'start', homeSection: 'hero', find: '', openDetails: new Set(), message: '', error: false, conflict: false, selection: null, preview: null };
const at = path => path.reduce((value, key) => value[key], editor.config);
function set(path, value) { const parent = at(path.slice(0, -1)); parent[path.at(-1)] = value; }
const pathAttr = path => esc(JSON.stringify(path));
function field(path, label, options = {}) {
  const value = options.value ?? at(path), id = `ce-${path.map(String).join('-')}`;
  const attrs = `id="${esc(id)}" data-field="${pathAttr(path)}" ${options.required ? 'required' : ''}`;
  const control = options.textarea ? `<textarea ${attrs} rows="${options.rows || 3}" maxlength="${options.maxlength || 12000}">${esc(value)}</textarea>` : `<input ${attrs} type="${options.number ? 'number' : 'text'}" ${options.number ? `min="${options.min ?? 0}" step="${options.step || 'any'}" data-number="true"` : `maxlength="${options.maxlength || 2000}"`} value="${esc(value)}" />`;
  return `<label class="ce-field" for="${esc(id)}"><span>${esc(label)}</span>${control}${options.help ? `<small>${esc(options.help)}</small>` : ''}</label>`;
}
function upload(path, label, accept = 'image/*') {
  return `<label class="ce-upload"><span>${esc(label)}</span><input type="file" accept="${accept}" data-upload="${pathAttr(path)}" /></label>`;
}
function select(path, label, choices) {
  return `<label class="ce-field"><span>${esc(label)}</span><select data-field="${pathAttr(path)}">${choices.map(value => `<option value="${esc(value)}" ${at(path) === value ? 'selected' : ''}>${esc(title(value))}</option>`).join('')}</select></label>`;
}
const moneyHint = value => (value === null || value === '' || value === undefined ? '(blank: enter an amount)' : formatMoney(value, 'words'));
function keyFactUsage(key) {
  const pattern = new RegExp(`\\{\\{${key}(?::\\w+)?\\}\\}`, 'g'), config = editor.config;
  // Only wording the site actually shows: whole fields, sections, FAQs, and the
  // fragments and links that weren't merged into a whole field.
  const shown = object => Object.entries(object || {}).filter(([name]) => !absorbedCopy.has(name) && !absorbedLinks.has(name)).map(([, value]) => value);
  const haystack = [Object.values(config.text || {}), shown(config.copy), shown(config.links), JSON.stringify(config.sections || {}), config.faqs.map(item => `${item.question} ${item.answer}`), config.city.description].flat().join('\n');
  return (haystack.match(pattern) || []).length;
}
function factField(fact) {
  const [key, label, help, type, , required, choices] = fact, path = ['city', key], uses = keyFactUsage(key);
  const usage = `${help} ${uses ? `Used in ${uses} ${uses === 1 ? 'place' : 'places'} on the site.` : 'Not used in your current wording.'}`;
  if (type === 'choice') return `<label class="ce-field"><span>${esc(label)}</span><select data-field="${pathAttr(path)}">${choices.map(choice => `<option ${at(path) === choice ? 'selected' : ''}>${esc(choice)}</option>`).join('')}</select><small>${esc(usage)}</small></label>`;
  if (type === 'money') return `<div class="ce-row" data-fact="${key}">${field(path, label, { number: true, required, step: '1', help: `${usage} Shows as ${moneyHint(at(path))}.` })}</div>`;
  return field(path, label, { required, maxlength: type === 'url' ? 2048 : 300, help: usage });
}
function factsFields() {
  const target = editor.config.budget.target;
  const group = ([id, title, help]) => `<section class="ce-region"><h3>${esc(title)}</h3><p class="ce-help">${esc(help)}</p>${id === 'budget' ? `<div class="ce-fact-readonly"><span>Year 1 budget gap</span><strong>${esc(formatMoney(target))}</strong><small>Comes from the gap target in the Budget tab. <button type="button" class="ce-link-button" data-tab="budget">Edit in Budget</button></small></div>${field(['city', 'fiscalYear'], 'Current fiscal year', { required: true, maxlength: 40, help: `Shown on department cards and wherever {{fiscalYear}} appears. Example: FY 2026/27. Used in ${keyFactUsage('fiscalYear')} places on the site.` })}` : ''}<div class="ce-grid">${id === 'social' ? SOCIAL_LINKS.map(([key, label]) => field(['links', key], label, { help: 'Leave blank to hide this icon.', maxlength: 2048 })).join('') : KEY_FACTS.filter(fact => fact[4] === id).map(factField).join('')}</div></section>`;
  return `<p class="ce-help">Enter these once. Wherever the site shows them, it uses what you put here, so a phone number or budget figure only needs to change in one place. In page text, they appear as {{double braces}}.</p>${KEY_FACT_GROUPS.filter(([id]) => id !== 'identity').map(group).join('')}`;
}
// Day-one guide: the order to work through, with what still needs attention.
const setupSteps = [
  ['city', 'Set your city, tax rate, and branding', 'Pick your city, enter the millage Finance confirmed, and upload your logo and sharing images.'],
  ['facts', 'Fill in key facts', 'Budget figures, contacts, city web pages, social media, and dates used across the site.'],
  ['budget', 'Enter your budget', 'Departments, budget items, potential revenue, and the gap residents need to close. Have Finance review it.'],
  ['home', 'Review the home page', 'Rewrite the introductions in your own words and swap in your photos. Each part of the page has its most important fields first.'],
  ['privacy', 'Review the privacy page', 'Check that it matches how your city handles records and privacy.'],
  ['launch', 'Check the coming-soon and sign-in pages', 'What visitors and reviewers see before the site opens.'],
  ['videos', 'Add department videos (optional)', 'Short videos shown on each department’s card.'],
];
function startFields() {
  return `<p class="ce-help">Work through these steps in order. Numbers show items the review list found in that step. Nothing goes live until you publish, and the site stays behind the coming-soon page until you open it in Site settings.</p><ol class="ce-steps">${setupSteps.map(([tab, title, text], index) => `<li class="ce-step" data-step="${tab}"><span class="ce-step-number">${index + 1}</span><div><strong>${esc(title)}</strong><p>${esc(text)}</p><span class="ce-step-status" data-step-status="${tab === 'launch' ? 'launch login' : tab}"></span></div><button type="button" class="button secondary small" data-tab="${tab}">Open</button></li>`).join('')}<li class="ce-step"><span class="ce-step-number">${setupSteps.length + 1}</span><div><strong>Save, preview, and publish</strong><p>Save your draft, check it with “Preview saved draft”, then publish. When you are ready for the public, open the site in Site settings.</p></div><a class="button secondary small" href="#settings">Site settings</a></li></ol>`;
}
function cityFields() {
  return `<p class="ce-help">Who you are and how the site looks. Figures, contacts, and dates used across the site are in Key facts.</p><h3>City and tax rate</h3>${calculatorFields()}<h3>Name and address</h3><div class="ce-grid">${cityFieldInfo.map(([key, label, help, options]) => field(['city', key], label, { help: [help, tokenHelp(editor.config.city[key])].filter(Boolean).join(' '), ...options })).join('')}${KEY_FACTS.filter(fact => fact[4] === 'identity').map(factField).join('')}</div><h3>Logo and sharing images</h3><p class="ce-help">Upload PNG, JPEG, WebP, or GIF files up to 8 MiB. SVG files are not supported; export a PNG instead. Replace any artwork that shows another city’s landmarks or name.</p><div class="ce-image-list">${cityImageInfo.map(([key, label, help, altKey]) => `<fieldset class="ce-card ce-image-card"><legend>${esc(label)}</legend><div class="ce-image-row">${imagePreview(['city', key], label, altKey && ['city', altKey])}<div class="ce-image-body"><p class="ce-help">${esc(help)}</p>${upload(['city', key], `Upload ${label.toLowerCase()}`)}${altKey ? field(['city', altKey], 'Image description', { textarea: true, rows: 2, maxlength: 500, help: 'Read aloud by screen readers when the link is shared. Describe what the image shows, including any words in it.' }) : ''}<details class="ce-photo-details"><summary>Use an image address instead</summary>${field(['city', key], `${label} address`, { required: true, help: 'An uploaded file fills this in. You can also paste an https:// address or a site path such as /assets/logo.png.' })}</details></div></div></fieldset>`).join('')}</div>`;
}
function calculatorFields() {
  return `<p class="ce-help">Choose your city. The property search on the home page will only accept addresses inside it. Then enter your city’s operating millage; it is not filled in for you.</p><div class="ce-grid"><label class="ce-field"><span>City</span><select id="ce-city">${VOLUSIA_CITIES.map(city => `<option value="${esc(city.name)}" ${city.name === editor.config.city.name ? 'selected' : ''}>${esc(city.name)}</option>`).join('')}</select><small>Volusia County cities only.</small></label>${field(['city', 'millage'], 'Municipal operating millage (mills)', { number: true, required: true, step: '0.0001', help: 'Your city’s adopted operating rate, for example 6.1841. Not the total tax rate on a bill. Confirm it with Finance.' })}</div><p class="ce-help">The Amendment 3 exemption rules are built into the calculator and are the same for every Florida city.</p>`;
}
function imagePreview(path, label, altPath) {
  const url = previewURL(at(path));
  return `<figure class="ce-media-preview" data-image-preview="${pathAttr(path)}" ${altPath ? `data-image-alt="${pathAttr(altPath)}"` : ''}>${url ? `<img src="${esc(url)}" alt="${esc(altPath ? expandCopy(at(altPath), editor.config) : label)}" loading="lazy" />` : '<div class="ce-empty-preview">Add an image URL or upload an image</div>'}<figcaption>${esc(expandCopy(label, editor.config))}</figcaption></figure>`;
}
const remembered = key => editor.openDetails.has(key);
const money = value => formatMoney(value);
// Department totals keep cents so they match the budget items exactly.
const departmentTotal = service => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(service.cuts.reduce((sum, cut) => sum + Number(cut.savings || 0), 0));
const departmentMeta = service => `${money(service.cuts.reduce((sum, cut) => sum + Number(cut.savings || 0), 0))} · ${service.cuts.length} ${service.cuts.length === 1 ? 'budget item' : 'budget items'}`;
// Text in {{double braces}} fills in from Key facts and other settings.
const tokenHelp = value => {
  const tokens = [...new Set([...String(value || '').matchAll(/\{\{(\w+)(?::\w+)?\}\}/g)].map(match => match[1]))];
  return tokens.length ? `Fills in automatically: ${tokens.map(token => `{{${token}}} = ${TOKEN_LABELS[token] || token}`).join('; ')}.` : '';
};
// Key facts appear in rich text as locked chips showing their current value.
function tokenChip(token) {
  const name = token.slice(2, -2).split(':')[0];
  const shown = expandCopy(token, editor.config);
  return `<span class="ce-token${shown ? '' : ' is-blank'}" contenteditable="false" data-token="${esc(token)}" title="${esc(TOKEN_LABELS[name] || name)}: fills in automatically. Change it in Key facts or City & branding.">${esc(shown === token || !shown ? `${TOKEN_LABELS[name] || name}${shown ? '' : ' (blank)'}` : shown)}</span>`;
}
// Insert a key fact where the cursor is.
const insertableTokens = ['city', 'municipality', 'siteName', 'fiscalYear', 'target:words', 'yearTwoImpact:words', 'clerkPhone', 'clerkAddress', 'departmentCount'];
const searchText = (...parts) => esc(parts.join(' ').toLowerCase());
function richField(path, label, { inline = false, help = '', required = false } = {}) {
  const id = `ce-${path.map(String).join('-')}`, value = at(path) ?? '';
  const tools = [['bold', '<b>B</b>', 'Bold'], ['italic', '<i>I</i>', 'Italic (shown in the accent color in headings)'], ['link', 'Link', 'Add, change, or remove a link'], ...(inline ? [] : [['bullets', '• List', 'Bulleted list'], ['numbers', '1. List', 'Numbered list']])];
  const insert = `<select class="ce-insert" data-insert-token aria-label="Insert a key fact"><option value="">Insert a fact…</option>${insertableTokens.map(token => `<option value="{{${token}}}">${esc(TOKEN_LABELS[token.split(':')[0]] || token)}</option>`).join('')}</select>`;
  return `<div class="ce-field ce-rich-field"><span id="${esc(id)}-label">${esc(label)}</span><div class="ce-rich"><div class="ce-rich-toolbar" role="toolbar" aria-label="Formatting">${tools.map(([format, text, name]) => `<button type="button" data-format="${format}" title="${esc(name)}" aria-label="${esc(name)}">${text}</button>`).join('')}${insert}</div><div class="ce-rich-area${inline ? ' ce-rich-inline' : ''}" id="${esc(id)}" contenteditable="true" role="textbox" aria-multiline="${!inline}" aria-labelledby="${esc(id)}-label" data-field="${pathAttr(path)}" data-rich="${inline ? 'inline' : 'block'}" ${required ? 'data-required="true" aria-required="true"' : ''}>${markdownToEditorHTML(value, { inline, tokenChip })}</div></div>${help || /\{\{\w+/.test(value) ? `<small>${esc([help, /\{\{\w+/.test(value) ? 'Shaded values fill in automatically from Key facts and City & branding. Hover one to see which.' : ''].filter(Boolean).join(' '))}</small>` : ''}</div>`;
}
// A whole paragraph or heading.
function textRow(key, label = textLabel(key)) {
  const value = editor.config.text[key] ?? '', recipe = textFields[key];
  const control = isRichTextField(key, value)
    ? richField(['text', key], label, { inline: true, help: recipe.tag === 'h1' || recipe.tag === 'h2' ? 'Shift+Enter starts a new line.' : '' })
    : field(['text', key], label, { help: tokenHelp(value), maxlength: 2000, value: value.replace(/\\([\\*[\]\-.])/g, '$1') });
  const target = recipe.link ? editor.config.links[recipe.link] : '';
  const fact = isKeyFactOnly(target) ? target.replace(/^tel:/, '').slice(2, -2) : '';
  // A link that goes to a key fact is changed in Key facts, not here.
  const link = !recipe.link ? '' : fact
    ? `<p class="ce-help ce-link-note">Links to: <strong>${esc(expandCopy(target, editor.config))}</strong> (${esc(TOKEN_LABELS[fact] || fact)}, set in <button type="button" class="ce-link-button" data-tab="facts">Key facts</button>).</p>`
    : field(['links', recipe.link], 'Where this link goes', { help: 'An https:// address, a page on this site such as /privacy, mailto:, or tel:. Leave blank to show it as plain text.' });
  return `<div class="ce-row" data-search="${searchText(label, markdownToText(value))}">${control}${link}</div>`;
}
function copyRow(key, label = key.startsWith('ui_') || contentBindings[key]?.attribute ? copyLabel(key) : copyLabel(key).replace(/ · .*$/, '')) {
  const value = editor.config.copy[key] || '';
  const help = `${key.startsWith('ui_') ? 'Shown when the visitor interacts with this part of the page. ' : ''}${tokenHelp(value)}`;
  // Postcard text is drawn onto a fixed-size image, so keep it close to the starter length.
  const postcard = key.startsWith('ui_postcard_');
  const limit = postcard ? Math.max(40, (editorCopyDefaults[key] || value).length + 12) : undefined;
  return `<div class="ce-row" data-copy-key="${esc(key)}" data-search="${searchText(label, value)}">${field(['copy', key], label, { textarea: value.length > 80, rows: 2, maxlength: limit, help: postcard ? `${help} Drawn on the postcard image, so keep it short (up to ${limit} characters).`.trim() : help })}</div>`;
}
// Revenue wording in the Budget tab mixes whole fields and interface labels.
const contentRow = key => (Object.hasOwn(textFields, key) ? textRow(key, revenueCopyLabels[key]) : copyRow(key));
function regionField(path, [name, label, kind, max, required]) {
  if (kind === 'rich' || kind === 'inline') return richField(path, label, { inline: kind === 'inline', required });
  if (kind === 'visibility') {
    const value = at(path), known = typeof editor.analyticsOn === 'boolean';
    const shown = value === 'always' || (known && (value === 'analytics-on') === editor.analyticsOn);
    const state = value === 'always' || !known ? '' : `<span class="ce-visibility ${shown ? 'is-shown' : 'is-hidden'}">${shown ? 'Shown now' : 'Hidden now'}: Google Analytics is ${editor.analyticsOn ? 'on' : 'off'} in Site settings</span>`;
    return `<label class="ce-field"><span>${esc(label)}</span><select data-field="${pathAttr(path)}">${VISIBILITY.map(([option, text]) => `<option value="${option}" ${value === option ? 'selected' : ''}>${esc(text)}</option>`).join('')}</select>${state}<small>Use this for wording that only applies when Google Analytics is turned on or off in Site settings.</small></label>`;
  }
  if (kind === 'url') return field(path, label, { required, help: 'An https:// address, a page on this site such as /privacy, mailto:, or tel:.' });
  return field(path, label, { required, maxlength: max, help: tokenHelp(at(path)) });
}
const regionOrder = id => Math.min(...regionSources[id].items.flatMap(item => Object.values(item).flat()).filter(key => Object.hasOwn(textFields, key)).map(textOrder));
function regionEditor(id) {
  const region = REGIONS[id], value = editor.config.sections[id];
  const search = searchText(region.label, JSON.stringify(value));
  if (region.single) return `<div class="ce-region ce-row" data-search="${search}"><h3>${esc(region.label)}</h3><p class="ce-help">${esc(region.help)}</p>${region.fields.map(item => regionField(['sections', id, item[0]], item)).join('')}</div>`;
  return `<div class="ce-region ce-row" data-search="${search}"><h3>${esc(region.label)} <span class="ce-count">${value.length}</span></h3><p class="ce-help">${esc(region.help)}</p>${value.map((item, index) => `<fieldset class="ce-card ce-region-item"><legend>${esc(region.item)} ${index + 1}${item.title ? `: ${esc(markdownToText(item.title).slice(0, 70))}` : ''}</legend>${region.fields.map(entry => regionField(['sections', id, index, entry[0]], entry)).join('')}<div class="ce-actions"><button type="button" class="button secondary small" data-move="${pathAttr(['sections', id, index])}" data-direction="-1" ${index === 0 ? 'disabled' : ''}>Move up</button><button type="button" class="button secondary small" data-move="${pathAttr(['sections', id, index])}" data-direction="1" ${index === value.length - 1 ? 'disabled' : ''}>Move down</button><button type="button" class="button secondary small danger-text" data-remove="${pathAttr(['sections', id, index])}" ${value.length <= (region.min || 0) ? 'disabled' : ''}>Remove ${esc(region.item.toLowerCase())}</button></div></fieldset>`).join('')}<button type="button" class="button secondary" data-add="section" data-region="${id}" ${value.length >= region.max ? 'disabled' : ''}>Add ${esc(region.item.toLowerCase())}</button></div>`;
}
function heroPhotos() {
  return `<div class="ce-region"><h3>Slideshow photos <span class="ce-count">${editor.config.heroImages.length}</span></h3><p class="ce-help">Add, remove, or reorder the photos behind the opening banner (up to 100). Upload PNG, JPEG, WebP, or GIF images up to 8 MiB. With no photos, the banner shows its text alone.</p><div class="ce-hero-grid">${editor.config.heroImages.map((image, index) => `<fieldset class="ce-card"><legend>Photo ${index + 1}</legend>${imagePreview(['heroImages', index, 'url'], image.label || `Home photo ${index + 1}`, ['heroImages', index, 'alt'])}<details class="ce-photo-details" ${image.url ? '' : 'open'}><summary>Edit photo details</summary>${upload(['heroImages', index, 'url'], 'Upload photo')}${field(['heroImages', index, 'url'], 'Image address', { required: true })}${field(['heroImages', index, 'label'], 'Caption shown with the photo', { maxlength: 200, help: tokenHelp(image.label) })}${field(['heroImages', index, 'alt'], 'Description for screen readers', { maxlength: 500, help: tokenHelp(image.alt) })}</details><div class="ce-actions"><button type="button" class="button secondary small" data-move-hero="${index}" data-direction="-1" ${index === 0 ? 'disabled' : ''} aria-label="Move photo ${index + 1} earlier">Move earlier</button><button type="button" class="button secondary small" data-move-hero="${index}" data-direction="1" ${index === editor.config.heroImages.length - 1 ? 'disabled' : ''} aria-label="Move photo ${index + 1} later">Move later</button><button type="button" class="button secondary small danger-text" data-remove="${pathAttr(['heroImages', index])}">Remove photo</button></div></fieldset>`).join('')}</div><button type="button" class="button secondary" data-add="hero" ${editor.config.heroImages.length >= 100 ? 'disabled' : ''}>Add photo</button></div>`;
}
const imageNames = { home_services_image_22: 'Services illustration', launch_main_image_1: 'Coming-soon illustration', login_main_image_1: 'Sign-in illustration' };
function imageCard(key) {
  return `<fieldset class="ce-card ce-image-card"><legend>${esc(imageNames[key] || title(key))}</legend><div class="ce-image-row">${imagePreview(['media', key, 'url'], imageNames[key] || 'Image', ['media', key, 'alt'])}<div class="ce-image-body">${upload(['media', key, 'url'], 'Upload image')}${field(['media', key, 'alt'], 'Description for screen readers')}<details class="ce-photo-details"><summary>Use an image address instead</summary>${field(['media', key, 'url'], 'Image address', { help: 'Leave blank to remove the image.' })}</details></div></div></fieldset>`;
}
function faqFields() {
  return `<div class="ce-region"><h3>Questions <span class="ce-count">${editor.config.faqs.length}</span></h3><p class="ce-help">Shown in this order. Answers can include bold text, links, and lists.</p>${editor.config.faqs.map((faq, index) => `<fieldset class="ce-card ce-region-item"><legend>Question ${index + 1}</legend><div class="ce-row" data-search="${searchText(faq.question, faq.answer)}">${field(['faqs', index, 'question'], 'Question', { required: true, maxlength: 500 })}${richField(['faqs', index, 'answer'], 'Answer', { required: true })}</div><div class="ce-actions"><button type="button" class="button secondary small" data-move="${pathAttr(['faqs', index])}" data-direction="-1" ${index === 0 ? 'disabled' : ''}>Move up</button><button type="button" class="button secondary small" data-move="${pathAttr(['faqs', index])}" data-direction="1" ${index === editor.config.faqs.length - 1 ? 'disabled' : ''}>Move down</button><button type="button" class="button secondary small danger-text" data-remove="${pathAttr(['faqs', index])}">Remove question</button></div></fieldset>`).join('')}<button type="button" class="button secondary" data-add="faq">Add question</button></div>`;
}
const pageOf = key => contentBindings[key]?.page || 'home';
// Everything editable in one part of one page, in the order it appears.
function sectionContent(page, section) {
  const core = [], more = [];
  const text = editor.config.text;
  for (const key of Object.keys(textFields)) if (textFields[key].page === page && editorSection(key) === section && isEditableText(key, text[key])) (isCoreText(key) ? core : more).push([textOrder(key), textRow(key)]);
  for (const key of Object.keys(editor.config.copy)) if (pageOf(key) === page && editorSection(key) === section && isEditableFragment(key) && !isKeyFactOnly(editor.config.copy[key])) more.push([textOrder(key), copyRow(key)]);
  for (const [id, region] of Object.entries(REGIONS)) if (region.page === page && region.section === section && !region.tab) core.push([regionOrder(id), regionEditor(id)]);
  core.sort((a, b) => a[0] - b[0]); more.sort((a, b) => a[0] - b[0]);
  const attached = new Set(Object.values(textFields).map(item => item.link).filter(Boolean));
  const social = new Set(SOCIAL_LINKS.map(([key]) => key));
  const links = Object.keys(editor.config.links).filter(key => pageOf(key) === page && editorSection(key) === section && isEditableLink(key, editor.config.links[key]) && !attached.has(key) && !social.has(key));
  const images = Object.keys(editor.config.media).filter(key => !/^home_hero_image_/.test(key) && pageOf(key) === page && editorSection(key) === section);
  const advanced = Object.keys(editor.config.copy).filter(key => (key.startsWith('ui_') ? page === 'home' : pageOf(key) === page && contentBindings[key]?.attribute) && editorSection(key) === section && isAdvancedCopy(key) && !isHiddenCopy(key) && !isRevenueCopy(key) && !isLegacyHeroCopy(key) && !isRuntimeOwnedCopy(key) && !isBudgetOwnedCopy(key) && !isKeyFactOnly(editor.config.copy[key]));
  const notes = {
    services: 'Department names, descriptions, and amounts come from the Budget tab.',
    budget: 'Departments, budget items, revenue options, and the budget introduction are edited in the Budget tab.',
    overview: 'The figures in these cards fill in from your budget and key facts, or are set by Amendment 3 itself.',
    amendment: 'This part explains Amendment 3, which is the same for every Florida city. Most cities leave it as is.',
    footer: 'Social media links are in Key facts.',
    navigation: 'Menu labels rarely need changing.',
  };
  const moreCount = more.length + links.length;
  const moreGroup = moreCount ? `<details class="ce-advanced ce-more" data-remember="more-${page}-${section}" ${remembered(`more-${page}-${section}`) || !core.length ? 'open' : ''}><summary>${core.length ? 'More wording' : 'Wording'} on this part of the page (${moreCount})</summary><p class="ce-help">Headings, buttons, and labels. Most cities keep these as they are.</p>${more.map(row => row[1]).join('')}${links.length ? `<h4>Links</h4>${links.map(key => `<div class="ce-row" data-search="${searchText(linkLabel(key), editor.config.links[key])}">${field(['links', key], linkLabel(key), { help: 'An https:// address, a page on this site such as /privacy, mailto:, or tel:. Leave blank to remove the link.' })}</div>`).join('')}` : ''}</details>` : '';
  return `${notes[section] ? `<p class="ce-help">${notes[section]}</p>` : ''}${core.map(row => row[1]).join('')}${section === 'hero' ? heroPhotos() : ''}${section === 'faqs' ? faqFields() : ''}${images.length ? `<h3>Images</h3>${images.map(imageCard).join('')}` : ''}${moreGroup}${advanced.length ? `<details class="ce-advanced" data-remember="advanced-${page}-${section}" ${remembered(`advanced-${page}-${section}`) ? 'open' : ''}><summary>Screen-reader text and messages shown while visitors interact (${advanced.length})</summary><p class="ce-help">Some of these are read aloud by screen readers instead of being displayed. Others appear only after a visitor clicks something; use “Try the site” in the preview to see them.</p>${advanced.map(key => copyRow(key)).join('')}</details>` : ''}`;
}
function pageFields(page) {
  const sections = editorPages.find(([id]) => id === page)[2];
  if (sections.length === 1) return `<div data-page-section="${sections[0][0]}">${sectionContent(page, sections[0][0])}</div>`;
  return `<label class="ce-field ce-find"><span>Find text on this page</span><input type="search" id="ce-find" value="${esc(editor.find)}" placeholder="Type a word or phrase…" autocomplete="off" /></label><nav class="ce-subnav" aria-label="Parts of the home page">${sections.map(([id, label]) => `<button type="button" data-page-section-button="${id}" ${editor.homeSection === id ? 'aria-current="true"' : ''}>${esc(label)}</button>`).join('')}</nav><p class="ce-help" id="ce-find-count" hidden></p>${sections.map(([id, label]) => `<div data-page-section="${id}" ${editor.homeSection === id ? '' : 'hidden'}><h3 class="ce-part-title">${esc(label)}</h3>${sectionContent(page, id)}</div>`).join('')}`;
}
// Keep "Find text on this page" matching what is typed, not what was loaded.
function refreshSearch(control) {
  const row = control.closest?.('.ce-row');
  if (!row) return;
  const words = [...row.querySelectorAll('[data-field]')].map(item => item.dataset.rich ? item.textContent : item.value);
  row.dataset.search = [...row.querySelectorAll('.ce-field > span')].map(item => item.textContent).concat(words).join(' ').toLowerCase();
}
function applyFind() {
  const home = editor.root.querySelector('[data-section="home"]'), term = editor.find.trim().toLowerCase();
  if (!home) return;
  let count = 0;
  home.querySelectorAll('[data-page-section]').forEach(part => {
    let matches = 0;
    part.querySelectorAll('.ce-row').forEach(row => {
      row.hidden = Boolean(term) && !row.dataset.search.includes(term);
      if (!row.hidden) matches++;
      // Open a collapsed group so a match inside it can be seen.
      if (term && !row.hidden) { const group = row.closest('details'); if (group) group.open = true; }
    });
    part.hidden = term ? !matches : part.dataset.pageSection !== editor.homeSection;
    count += term ? matches : 0;
  });
  const note = editor.root.querySelector('#ce-find-count');
  note.hidden = !term; note.textContent = term ? `${count} ${count === 1 ? 'match' : 'matches'} for “${editor.find.trim()}”` : '';
}
function showSection(id) {
  editor.homeSection = id; editor.selection = null;
  editor.root.querySelectorAll('[data-page-section-button]').forEach(button => { if (button.dataset.pageSectionButton === id) button.setAttribute('aria-current', 'true'); else button.removeAttribute('aria-current'); });
  applyFind();
  editor.preview?.contextChanged();
}
function updatePreviews(changedPath) {
  if (changedPath) editor.preview?.contentChanged(); else editor.preview?.contextChanged();
  editor.root.querySelectorAll('[data-image-preview]').forEach(figure => {
    const path = JSON.parse(figure.dataset.imagePreview), altPath = figure.dataset.imageAlt && JSON.parse(figure.dataset.imageAlt);
    if (changedPath && JSON.stringify(changedPath.slice(0, -1)) !== JSON.stringify(path.slice(0, -1))) return;
    const label = path[0] === 'heroImages' ? editor.config.heroImages[path[1]].label || `Home photo ${Number(path[1]) + 1}` : figure.querySelector('figcaption').textContent;
    figure.outerHTML = imagePreview(path, label, altPath);
  });
  editor.root.querySelectorAll('[data-video-preview]').forEach(container => {
    const path = JSON.parse(container.dataset.videoPreview);
    if (!changedPath || JSON.stringify(changedPath.slice(0, -1)) === JSON.stringify(path)) container.outerHTML = videoPreview(path);
  });
  editor.root.querySelectorAll('[data-department-name]').forEach(node => { const service = editor.config.budget.services[Number(node.dataset.departmentName)]; if (service) node.textContent = service.name || 'New department'; });
  editor.root.querySelectorAll('[data-department-meta]').forEach(node => { const service = editor.config.budget.services[Number(node.dataset.departmentMeta)]; if (service) node.textContent = departmentMeta(service); });
  editor.root.querySelectorAll('[data-department-preview]').forEach(container => {
    const service = editor.config.budget.services[Number(container.dataset.departmentPreview)];
    container.querySelector('strong').textContent = service.name;
    container.querySelector('p').textContent = service.desc;
  });
}
function videoPreview(path) {
  const video = at(path), url = previewURL(video.url), poster = previewURL(video.poster);
  return `<div class="ce-video-preview" data-video-preview="${pathAttr(path)}">${url ? `<video controls preload="none" src="${esc(url)}" ${poster ? `poster="${esc(poster)}"` : ''} aria-label="${esc(video.title || 'Video preview')}"></video>` : '<p class="ce-empty-preview">Add a video URL or upload a video to preview it.</p>'}<p>${esc(video.title || 'Untitled video')}</p></div>`;
}
// The length shows on the department card ("1 video · 2:13") and in the
// player's list before anything downloads, so it is stored with the video.
// The editor reads it from the file; typing it is only a fallback.
const clock = seconds => `${Math.floor(seconds / 60)}:${String(Math.round(seconds) % 60).padStart(2, '0')}`;
function durationNote(path) {
  const video = at(path);
  return `<div class="ce-video-length" data-video-length="${pathAttr(path)}"><p class="ce-help">Length: <strong>${video.duration ? clock(video.duration) : 'not detected yet'}</strong> · read automatically from the video file.</p><details class="ce-photo-details"><summary>Set the length yourself</summary>${field([...path, 'duration'], 'Length in seconds', { number: true, help: 'Only needed if the length can’t be read from the file. Example: 135 for 2:15.' })}</details></div>`;
}
function detectDuration(path) {
  const url = previewURL(at(path)?.url);
  if (!url || typeof document.createElement('video').load !== 'function') return;
  const probe = document.createElement('video');
  probe.preload = 'metadata'; probe.muted = true;
  probe.onloadedmetadata = () => {
    const seconds = Math.round(probe.duration);
    probe.removeAttribute('src'); probe.load();
    // Ignore a slow answer for a video address that has since changed.
    if (!editor.config || !Number.isFinite(seconds) || seconds <= 0 || previewURL(at(path)?.url) !== url) return;
    if (at(path).duration === seconds) return;
    set([...path, 'duration'], seconds); dirty();
    const note = [...editor.root.querySelectorAll('[data-video-length]')].find(node => node.dataset.videoLength === JSON.stringify(path));
    if (note) { note.querySelector('strong').textContent = clock(seconds); const input = note.querySelector('input'); if (input) input.value = String(seconds); }
  };
  probe.src = url;
}
function videoFields() {
  return `<p class="ce-help">Videos appear on each department’s card on the home page. Upload MP4 or WebM files up to 25 MiB, or paste a link to a video file. Include captions in the video itself. Departments come from the Budget tab.</p>${editor.config.budget.services.map(service => { const count = (editor.config.videos[service.id] || []).length; return `<details class="ce-card ce-dept" data-remember="videos-${esc(service.id)}" ${remembered(`videos-${service.id}`) ? 'open' : ''}><summary><span class="ce-dept-name">${esc(service.name)}</span><span class="ce-dept-meta">${count ? `${count} ${count === 1 ? 'video' : 'videos'}` : 'No videos'}</span></summary>${(editor.config.videos[service.id] || []).map((video, index) => `<div class="ce-item">${videoPreview(['videos', service.id, index])}<div class="ce-grid">${field(['videos', service.id, index, 'title'], 'Title', { required: true })}${upload(['videos', service.id, index, 'url'], 'Upload video', 'video/mp4,video/webm')}${field(['videos', service.id, index, 'url'], 'Video address', { required: true, help: 'Filled in when you upload. You can also paste an https:// link to an MP4 or WebM file.' })}${durationNote(['videos', service.id, index])}${field(['videos', service.id, index, 'poster'], 'Poster image URL')}${upload(['videos', service.id, index, 'poster'], 'Upload poster')}</div><button type="button" class="button secondary small danger-text" data-remove="${pathAttr(['videos', service.id, index])}">Remove video</button></div>`).join('')}<button type="button" class="button secondary small" data-add="video" data-service="${esc(service.id)}">Add video</button></details>`; }).join('')}`;
}
function budgetFields() {
  const jump = `<nav class="ce-jump" aria-label="Budget sections"><span>Jump to:</span><button type="button" class="button secondary small" data-jump="ce-budget-start">Gap target</button><button type="button" class="button secondary small" data-jump="ce-budget-departments">Departments (${editor.config.budget.services.length})</button><button type="button" class="button secondary small" data-jump="ce-budget-revenue">Potential revenue (${editor.config.budget.revenues.filter(item => item.id !== 'millage-rate').length})</button>${editor.config.budget.revenues.some(item => item.id === 'millage-rate') ? `<button type="button" class="button secondary small" data-jump="ce-budget-millage">Property tax slider (${editor.config.budget.revenues.find(item => item.id === 'millage-rate').enabled === false ? 'off' : 'on'})</button>` : ''}</nav>`;
  const intro = `<details class="ce-card ce-dept" data-remember="budget-intro" ${remembered('budget-intro') ? 'open' : ''}><summary><span class="ce-dept-name">How the budget is explained to residents</span><span class="ce-dept-meta">Introduction and notes</span></summary>${regionEditor('builderIntro')}${[...budgetTabText].map(key => textRow(key, 'About these figures (shown when residents open “About these figures”)')).join('')}</details>`;
  return `${jump}${intro}<p class="ce-help" id="ce-budget-start" tabindex="-1">All amounts are annual dollars. Department budgets are the sum of their cuts. Replace the source city's figures with reviewed local figures. Add or remove departments to match your city (1–30). Department and item IDs preserve historical reports; new items receive new IDs.</p><div class="ce-grid">${field(['budget', 'target'], 'Budget gap target ($)', { number: true, required: true, min: '0.01', step: '0.01' })}<p class="ce-help">The gap residents must close with cuts and revenue. When you publish changed budget figures, earlier resident submissions keep the figures they saw.</p></div><h3 id="ce-budget-departments" tabindex="-1">Departments</h3>${editor.config.budget.services.map((service, index) => `<details class="ce-card ce-dept" data-remember="department-${esc(service.id)}" ${remembered(`department-${service.id}`) ? 'open' : ''}><summary><span class="ce-dept-name" data-department-name="${index}">${esc(service.name || 'New department')}</span><span class="ce-dept-meta" data-department-meta="${index}">${departmentMeta(service)}</span></summary><div class="ce-department-preview" data-department-preview="${index}"><strong>${esc(service.name)}</strong><p>${esc(service.desc)}</p><span>${service.cuts.length} cost centers</span></div><div class="ce-grid">${field(['budget', 'services', index, 'name'], 'Department name', { required: true })}${field(['budget', 'services', index, 'desc'], 'Description', { textarea: true })}${select(['budget', 'services', index, 'icon'], 'Icon', ['flame', 'shield', 'road', 'tree', 'chart'])}${select(['budget', 'services', index, 'tone'], 'Color', ['coral', 'blue', 'orange', 'green', 'purple'])}</div>${(service.cutExamples || []).length ? `<details class="ce-advanced"><summary>Messages residents see as they cut this department</summary>${service.cutExamples.map((example, exampleIndex) => field(['budget', 'services', index, 'cutExamples', exampleIndex], ['When cuts are under 17%', 'When cuts are 17% to 33%', 'When cuts are 33% to 50%', 'When cuts are over 50%'][exampleIndex] || `Impact message ${exampleIndex + 1}`, { textarea: true, rows: 2 })).join('')}</details>` : ''}<p class="ce-total" data-department-total="${index}">Department total: ${departmentTotal(service)}</p>${service.cuts.map((cut, cutIndex) => `<div class="ce-item"><div class="ce-grid">${field(['budget', 'services', index, 'cuts', cutIndex, 'name'], 'Cut / cost center', { required: true })}${field(['budget', 'services', index, 'cuts', cutIndex, 'savings'], 'Annual savings / net cost ($)', { number: true, required: true, min: -10000000000, step: '0.01', help: 'A negative net cost earns more than it costs. Removing that item increases the budget gap.' })}</div>${field(['budget', 'services', index, 'cuts', cutIndex, 'impact'], 'Community impact', { textarea: true })}<button type="button" class="button secondary small danger-text" data-remove="${pathAttr(['budget', 'services', index, 'cuts', cutIndex])}">Remove cut</button></div>`).join('')}<button type="button" class="button secondary small" data-add="cut" data-index="${index}">Add cut</button> <button type="button" class="button secondary small danger-text" data-remove="${pathAttr(['budget', 'services', index])}" ${editor.config.budget.services.length <= 1 ? 'disabled' : ''}>Remove department</button></details>`).join('')}<button type="button" class="button secondary" data-add="department" ${editor.config.budget.services.length >= 30 ? 'disabled' : ''}>Add department</button><p class="ce-help">Keep at least one department. Removing a department also removes its draft cost centers and video selections.</p><h3 id="ce-budget-revenue" tabindex="-1">Potential revenue</h3><p class="ce-help">Options residents can select to close the gap without cutting services. Each option shows its name, description, and assumptions, and adds its annual estimate to the resident’s plan.</p><details class="ce-advanced" data-remember="revenue-wording" ${remembered('revenue-wording') ? 'open' : ''}><summary>Wording around the revenue options (${revenueWordingKeys.length})</summary><p class="ce-help">The heading, introduction, and labels residents see in the Potential Revenue part of the budget builder.</p>${revenueWordingKeys.map(contentRow).join('')}</details>${editor.config.budget.revenues.map((revenue, index) => revenue.id === 'millage-rate' ? '' : `<fieldset class="ce-card"><legend>${esc(revenue.name || 'New revenue')}</legend><div class="ce-grid">${field(['budget', 'revenues', index, 'name'], 'Revenue name', { required: true })}${field(['budget', 'revenues', index, 'amount'], 'Annual estimate ($)', { number: true, required: true, step: '0.01' })}</div>${field(['budget', 'revenues', index, 'description'], 'Description', { textarea: true, help: 'What this option is, in a sentence or two.' })}${field(['budget', 'revenues', index, 'assumption'], 'Estimate assumptions', { textarea: true, help: 'How the annual estimate was calculated. Shown after the description in smaller text.' })}<button type="button" class="button secondary small danger-text" data-remove="${pathAttr(['budget', 'revenues', index])}">Remove revenue</button></fieldset>`).join('')}<button type="button" class="button secondary" data-add="revenue">Add revenue</button>${millageFields()}`;
}
function millageFields() {
  const index = editor.config.budget.revenues.findIndex(item => item.id === 'millage-rate');
  if (index === -1) return '';
  const millage = editor.config.budget.revenues[index], on = millage.enabled !== false, at = ['budget', 'revenues', index];
  return `<h3 id="ce-budget-millage" tabindex="-1">Property tax rate slider</h3><fieldset class="ce-card ce-millage-card"><legend class="sr-only">Property tax rate slider</legend><label class="ce-switch"><input type="checkbox" data-field="${pathAttr([...at, 'enabled'])}" data-checkbox="true" ${on ? 'checked' : ''} /><span><strong>Offer residents a property tax increase</strong><small>A slider from 0 to 1 additional mill. Each 0.1 mill adds a tenth of the amount below to the resident’s plan.</small></span></label>${on ? '' : '<p class="ce-help ce-off-note">Residents don’t see the slider. Its settings are kept, so you can turn it back on later. Publishing this change starts a new budget version.</p>'}<fieldset class="ce-millage-settings" ${on ? '' : 'disabled hidden'}><div class="ce-grid">${field([...at, 'name'], 'Name shown to residents', { required: true })}${field([...at, 'amount'], 'Revenue from one additional mill ($ per year)', { number: true, required: true, step: '0.01', help: 'Your taxable value ÷ 1,000. Confirm with Finance.' })}</div>${field([...at, 'description'], 'Description for staff reports', { textarea: true, help: 'Shown with submissions in the dashboard. Residents see the slider explanation below.' })}${field([...at, 'assumption'], 'Estimate assumptions for staff reports', { textarea: true })}<h4>Slider wording</h4>${millageWordingKeys.map(contentRow).join('')}</fieldset></fieldset>`;
}
function status(message, error = false) {
  editor.message = message; editor.error = error;
  const notice = editor.root?.querySelector('#ce-status');
  if (notice) { notice.textContent = message; notice.classList.toggle('form-error', error); notice.hidden = !message; }
}
function updateActions() {
  const root = editor.root;
  if (!root?.isConnected) return;
  root.querySelector('#ce-save').disabled = editor.busy || !editor.dirty || editor.conflict;
  root.querySelector('#ce-publish').disabled = editor.busy || editor.dirty || editor.conflict;
  root.querySelector('#ce-reload').disabled = editor.busy;
  root.querySelector('#ce-fields').disabled = editor.busy;
  // contenteditable ignores a disabled fieldset, so lock rich fields too.
  root.querySelectorAll('[data-rich]').forEach(area => area.setAttribute('contenteditable', editor.busy ? 'false' : 'true'));
  root.querySelector('#ce-state').textContent = editor.busy ? 'Working…' : editor.conflict ? 'Someone else changed this draft' : editor.dirty ? 'Unsaved changes' : 'All changes saved to the draft';
  root.querySelector('#ce-publish').title = editor.dirty ? 'Save the draft first, then publish.' : editor.conflict ? 'Reload the saved draft first.' : '';
  root.querySelector('#ce-step-hint').textContent = editor.conflict ? 'Another administrator saved changes. Copy anything you need, then reload the saved draft.' : editor.dirty ? 'Step 1: save your changes as a draft. Publishing unlocks after saving.' : 'Step 2: check the saved draft, then publish it to visitors.';
  renderReview();
}
function dirty() { editor.dirty = true; if (!editor.error) status(''); updateActions(); }
function renderReview() {
  const panel = editor.root.querySelector('#ce-review');
  if (!panel) return;
  const warnings = contentWarnings(editor.config);
  markWarningCounts(warnings);
  panel.hidden = !warnings.length;
  if (!warnings.length) return;
  const open = panel.querySelector('details')?.open;
  panel.innerHTML = `<details ${open ? 'open' : ''}><summary><strong>${warnings.length} ${warnings.length === 1 ? 'item' : 'items'} to review before publishing</strong> <span>Sample content from DeLand, placeholders, or missing details</span></summary><ul>${warnings.map((warning, index) => `<li><span>${esc(warning.message)}</span><button type="button" class="button secondary small" data-review="${index}">Show me</button></li>`).join('')}</ul></details>`;
  editor.warnings = warnings;
}
// Small counters on tabs and home page parts show where review items remain.
function markWarningCounts(warnings) {
  const tabs = {}, parts = {}, controls = new Map([...editor.root.querySelectorAll('[data-field]')].map(control => [control.dataset.field, control]));
  for (const warning of warnings) {
    const control = warning.path && controls.get(JSON.stringify(warning.path));
    const tab = control?.closest('[data-section]')?.dataset.section || warning.tab;
    const part = control?.closest('[data-page-section]')?.dataset.pageSection || (warning.tab === 'home' ? warning.section : null);
    if (tab) tabs[tab] = (tabs[tab] || 0) + 1;
    if (tab === 'home' && part) parts[part] = (parts[part] || 0) + 1;
  }
  const badge = (button, count) => {
    button.querySelector('.ce-badge')?.remove();
    if (count) button.insertAdjacentHTML('beforeend', `<span class="ce-badge" aria-label="${count} to review">${count}</span>`);
  };
  editor.root.querySelectorAll('.ce-tabs [data-tab]').forEach(button => badge(button, tabs[button.dataset.tab]));
  editor.root.querySelectorAll('[data-step-status]').forEach(node => {
    const count = node.dataset.stepStatus.split(' ').reduce((sum, tab) => sum + (tabs[tab] || 0), 0);
    node.textContent = count ? `${count} ${count === 1 ? 'item' : 'items'} to review` : 'Nothing flagged';
    node.classList.toggle('is-clear', !count);
  });
  editor.root.querySelectorAll('[data-page-section-button]').forEach(button => badge(button, parts[button.dataset.pageSectionButton]));
}
function render() {
  // Keep expanded cards and groups open across re-renders.
  editor.root.querySelectorAll('details[data-remember]').forEach(item => { if (item.open) editor.openDetails.add(item.dataset.remember); else editor.openDetails.delete(item.dataset.remember); });
  const sections = { start: startFields, city: cityFields, facts: factsFields, home: () => pageFields('home'), privacy: () => pageFields('privacy'), launch: () => pageFields('launch'), login: () => pageFields('login'), budget: budgetFields, videos: videoFields };
  const fields = `<fieldset id="ce-fields"><legend class="sr-only">Site content</legend>${tabs.map(([id, name]) => `<section class="ce-section" data-section="${id}" ${editor.tab === id ? '' : 'hidden'} aria-label="${name}"><h2>${name}</h2>${sections[id]()}</section>`).join('')}</fieldset>`;
  const form = editor.root.querySelector('#ce-form');
  if (form && editor.preview && editor.root.querySelector('.ce-actual-preview')) {
    // Rebuild only the fields; the toolbar and live preview stay as they are,
    // so adding or removing an item doesn't reload the preview from the top.
    form.innerHTML = fields;
    editor.root.querySelectorAll('.ce-tabs [data-tab]').forEach(button => { if (button.dataset.tab === editor.tab) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current'); });
    editor.preview.contentChanged();
  } else {
    editor.preview?.destroy();
    editor.root.innerHTML = `<div class="content-editor"><div class="ce-toolbar"><div><strong id="ce-state"></strong><p id="ce-step-hint"></p></div><div class="ce-actions"><button type="button" class="button secondary" id="ce-reload">Reload saved draft</button><a class="button secondary" href="/?contentPreview=1" target="_blank" rel="noopener noreferrer">Preview saved draft ↗</a><button type="button" class="button secondary" id="ce-save">Save draft</button><button type="button" class="button" id="ce-publish">Publish changes</button></div></div><p id="ce-status" role="status" ${editor.message ? '' : 'hidden'} class="ce-status ${editor.error ? 'form-error' : ''}">${esc(editor.message)}</p><section id="ce-review" class="ce-review" aria-label="Review before publishing" hidden></section><nav class="ce-tabs" aria-label="Content sections">${tabs.map(([id, name]) => `<button type="button" data-tab="${id}" ${editor.tab === id ? 'aria-current="page"' : ''} ${tabNames[id] ? `title="${name}"` : ''}>${tabNames[id] || name}</button>`).join('')}</nav><div class="ce-edit-workspace">${actualPreviewMarkup()}<form id="ce-form" novalidate>${fields}</form></div></div>`;
    editor.preview = createSitePreview(editor.root, { getConfig: () => editor.config, getContext: previewContext, onSelect: selectPreviewField });
  }
  applyFind();
  updateActions();
}
async function request(path, options = {}) {
  let response;
  try { response = await fetch(path, { credentials: 'same-origin', signal: AbortSignal.timeout(120000), ...options, headers: { ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...options.headers } }); }
  catch (error) { throw new Error(error.name === 'TimeoutError' ? 'The server took too long to respond. Check your connection and try again.' : 'Could not reach the server. Check your connection and try again.'); }
  const data = response.headers.get('Content-Type')?.includes('application/json') ? await response.json().catch(() => ({})) : {};
  if (response.status === 401) throw new Error('Your sign-in has expired. Copy any unsaved text, sign in again in a new tab, then save.');
  if (!response.ok) {
    if (response.status === 409) editor.conflict = true;
    const error = new Error(response.status === 409 ? `${data.error || 'Another administrator changed this content.'} Your edits remain on screen. Copy any changes you need, then reload the saved draft before editing again.` : response.status === 413 ? 'That file or change is too large.' : data.error || `The request could not be completed (error ${response.status}).`);
    error.field = data.field;
    throw error;
  }
  return data;
}
function showFieldError(error) {
  status(error.message, true);
  if (!Array.isArray(error.field)) return;
  focusField(error.field);
}
const controlFor = path => [...editor.root.querySelectorAll('[data-field]')].find(control => control.dataset.field === JSON.stringify(path));
function focusField(path) {
  const control = path && controlFor(path);
  if (control) { revealField(control); control.focus(); control.scrollIntoView?.({ block: 'center', behavior: 'smooth' }); }
  return Boolean(control);
}
function useSnapshot(data) {
  editor.config = structuredClone(data.draft); editor.config.copy = { ...editorCopyDefaults, ...editor.config.copy }; editor.config.heroImages = structuredClone(getHeroImages(editor.config));
  editor.config = normalizeContent(editor.config);
  // Videos for departments that no longer exist can't be seen or edited; drop them.
  const departments = new Set(editor.config.budget.services.map(service => service.id));
  for (const id of Object.keys(editor.config.videos)) if (!departments.has(id)) delete editor.config.videos[id];
  editor.revision = data.revision; editor.dirty = false; editor.conflict = false;
}
async function reload() {
  if (editor.dirty && !window.confirm('Discard your unsaved changes and reload the saved draft?')) return;
  editor.busy = true; updateActions();
  try { useSnapshot(await request('/api/admin/content')); status('Saved draft loaded.'); render(); }
  catch (error) { status(error.message, true); }
  finally { editor.busy = false; updateActions(); }
}
function valid() {
  const form = editor.root.querySelector('#ce-form');
  const emptyRich = [...form.querySelectorAll('[data-rich][data-required]')].find(area => !htmlToMarkdown(area, { inline: area.dataset.rich === 'inline' }).trim());
  if (emptyRich) { revealField(emptyRich); emptyRich.focus(); status(`${editor.root.querySelector(`#${emptyRich.id}-label`)?.textContent || 'This field'} is required.`, true); return false; }
  const invalid = [...form.querySelectorAll('input, textarea, select')].find(control => !control.checkValidity());
  if (!invalid) return true;
  revealField(invalid);
  invalid.reportValidity();
  return false;
}
async function save() {
  if (!editor.dirty || editor.busy || editor.conflict || !valid()) return;
  let failure;
  editor.busy = true; updateActions(); status('Saving draft…');
  const sent = editor.config;
  try {
    useSnapshot(await request('/api/admin/content', { method: 'PATCH', body: JSON.stringify({ config: sent, revision: editor.revision }) }));
    status('Draft saved. Check it with “Preview saved draft”, then publish.'); render();
  } catch (error) {
    failure = error;
    // If an earlier save went through but its reply was lost, the "conflict"
    // is our own edit. Accept it instead of locking the editor.
    if (editor.conflict) {
      try {
        const latest = await request('/api/admin/content');
        const comparable = config => JSON.stringify({ ...config, budget: { ...config.budget, version: '' } });
        if (comparable(latest.draft) === comparable(sent)) { useSnapshot(latest); failure = null; status('Draft saved. Check it with “Preview saved draft”, then publish.'); render(); }
        else editor.conflict = true;
      } catch {}
    }
  }
  finally { editor.busy = false; updateActions(); }
  // The form is disabled while busy, so focus the failing field afterward.
  if (failure) showFieldError(failure);
}
async function publish() {
  if (editor.busy || editor.dirty || editor.conflict) return;
  const warnings = contentWarnings(editor.config).length;
  if (!window.confirm(`${warnings ? `There ${warnings === 1 ? 'is 1 item' : `are ${warnings} items`} still listed under “to review before publishing”.\n\n` : ''}Publish the saved draft? Visitors will see these changes right away. Confirm that city text, tax rates, and budget figures have been reviewed.`)) return;
  let failure;
  editor.busy = true; updateActions(); status('Publishing…');
  try {
    useSnapshot(await request('/api/admin/content/publish', { method: 'POST', body: JSON.stringify({ revision: editor.revision }) }));
    status('Published. Visitors now see this content.'); render();
  } catch (error) { failure = error; }
  finally { editor.busy = false; updateActions(); }
  // Let the dashboard refresh its name and logo; its errors aren't publish errors.
  if (!failure) try { window.dispatchEvent(new CustomEvent('city-content:published', { detail: structuredClone(editor.config) })); } catch {}
  if (failure) showFieldError(failure);
}
function revealField(control) {
  const tab = control.closest('[data-section]')?.dataset.section;
  if (tab && tab !== editor.tab) showTab(tab);
  const part = control.closest('[data-page-section]');
  if (part && control.closest('.ce-row')?.hidden) { editor.find = ''; const find = editor.root.querySelector('#ce-find'); if (find) find.value = ''; }
  if (part && tab === 'home') showSection(part.dataset.pageSection);
  const details = control.closest('details'); if (details) details.open = true;
}
function showTab(tab) {
  if (!tabs.some(([id]) => id === tab)) return;
  editor.tab = tab; editor.selection = null;
  editor.root.querySelectorAll('[data-section]').forEach(section => { section.hidden = section.dataset.section !== tab; });
  editor.root.querySelectorAll('.ce-tabs [data-tab]').forEach(button => { if (button.dataset.tab === tab) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current'); });
  editor.preview?.contextChanged();
}
function previewContext() {
  let section = ({ start: 'hero', city: 'hero', facts: 'sources', home: editor.homeSection, privacy: 'privacy', launch: 'launch', login: 'login', videos: 'services', budget: 'budget' })[editor.tab] || 'hero';
  if (editor.selection?.[0] === 'media') section = sectionFor(editor.selection[1]);
  if (editor.selection?.[0] === 'city' && editor.selection[1] === 'shareImage') section = 'sharing';
  return { section, selection: editor.selection };
}
function selectPreviewField(path) {
  const controls = [...editor.root.querySelectorAll('[data-field]')];
  const control = controls.find(item => item.dataset.field === JSON.stringify(path)) || controls.find(item => {
    const candidate = JSON.parse(item.dataset.field);
    return path.every((part, index) => candidate[index] === part);
  });
  if (!control) { status('This part of the page is generated from other settings. Choose a related section below.'); return; }
  revealField(control); editor.selection = JSON.parse(control.dataset.field); editor.preview?.contextChanged(); control.focus(); control.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
}
function highlightPreview(control) {
  if (!control.dataset?.field) return;
  editor.selection = JSON.parse(control.dataset.field);
  editor.preview?.contextChanged();
}
function input(event) {
  const control = event.target.closest?.('[data-rich]') || event.target;
  if (editor.busy && control.dataset?.field) return;
  if (control.id === 'ce-find') { editor.find = control.value; applyFind(); return; }
  if (control.dataset.insertToken !== undefined) {
    const area = control.closest('.ce-rich')?.querySelector('[data-rich]'), token = control.value;
    control.value = '';
    if (area && token) {
      area.focus();
      // Put the cursor back where it was before the menu took focus.
      if (editor.caret?.area === area && window.getSelection) { const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(editor.caret.range); }
      if (typeof document.execCommand === 'function') document.execCommand('insertHTML', false, `${tokenChip(token)}&nbsp;`); else { area.insertAdjacentHTML('beforeend', tokenChip(token)); input({ target: area }); }
    }
    return;
  }
  if (control.dataset.rich) {
    const path = JSON.parse(control.dataset.field);
    set(path, htmlToMarkdown(control, { inline: control.dataset.rich === 'inline' })); dirty(); editor.selection = path; updatePreviews(path);
    refreshSearch(control);
    return;
  }
  if (control.dataset.field) {
    const path = JSON.parse(control.dataset.field);
    if (control.dataset.checkbox) { set(path, control.checked); dirty(); editor.selection = path; render(); controlFor(path)?.focus(); return; }
    const plainText = path[0] === 'text' && !control.dataset.rich;
    const value = control.dataset.number ? (control.value.trim() === '' ? (path.at(-1) === 'duration' ? 0 : null) : Number(control.value)) : plainText ? escapeMarkdown(control.value) : control.value;
    set(path, value); dirty(); editor.selection = path; updatePreviews(path);
    refreshSearch(control);
    // Chips show the current value of their fact.
    if (path[0] === 'city' || (path[0] === 'budget' && path[1] !== 'services')) editor.root.querySelectorAll('.ce-token[data-token]').forEach(chip => { const fresh = document.createElement('span'); fresh.innerHTML = tokenChip(chip.dataset.token); chip.replaceWith(fresh.firstChild); });
    const fact = path[0] === 'city' && KEY_FACTS.find(item => item[0] === path[1] && item[3] === 'money');
    if (fact) { const hint = control.closest('.ce-field')?.querySelector('small'); if (hint) hint.textContent = hint.textContent.replace(/Shows as .*\.$/, `Shows as ${moneyHint(at(path))}.`); }
    if (path[0] === 'videos' && path.at(-1) === 'url') { clearTimeout(editor.lengthTimer); editor.lengthTimer = setTimeout(() => detectDuration(path.slice(0, -1)), 600); }
    if (path[0] === 'budget' && path[1] === 'services' && path.at(-1) === 'savings') {
      const service = editor.config.budget.services[path[2]];
      editor.root.querySelector(`[data-department-total="${path[2]}"]`).textContent = `Department total: ${departmentTotal(service)}`;
    }
  }
  if (control.id === 'ce-city') {
    const city = VOLUSIA_CITIES.find(item => item.name === control.value);
    if (editor.config.city.siteName === `Build Your ${editor.config.city.name}`) editor.config.city.siteName = `Build Your ${city.name}`;
    editor.config.city.millage = null;
    editor.config.city.name = city.name; editor.config.city.authority = city.authority;
    dirty(); status('City changed. Enter its verified municipal operating millage and review branding, URLs, and local content.'); render();
  }
}
function removalName(path) {
  const item = at(path);
  if (path[0] === 'heroImages') return `home photo ${path[1] + 1}`;
  if (path[0] === 'faqs') return item.question ? `the question “${item.question}”` : `question ${path[1] + 1}`;
  if (path[0] === 'sections') { const region = REGIONS[path[1]]; return item.title ? `the ${region.item.toLowerCase()} “${markdownToText(item.title)}”` : `${region.item.toLowerCase()} ${path[2] + 1}`; }
  if (path[0] === 'videos') return item.title ? `the video “${item.title}”` : 'this video';
  if (path[3] === 'cuts') return item.name ? `the budget item “${item.name}”` : 'this budget item';
  if (path[1] === 'revenues') return item.name ? `the revenue option “${item.name}”` : 'this revenue option';
  return 'this item';
}
async function click(event) {
  const button = event.target.closest('button');
  if (!button || button.disabled || editor.busy) return;
  if (button.dataset.moveHero !== undefined) {
    const index = Number(button.dataset.moveHero), next = index + Number(button.dataset.direction);
    if (next >= 0 && next < editor.config.heroImages.length) { [editor.config.heroImages[index], editor.config.heroImages[next]] = [editor.config.heroImages[next], editor.config.heroImages[index]]; dirty(); render(); }
    return;
  }
  if (button.dataset.tab) showTab(button.dataset.tab);
  if (button.dataset.pageSectionButton) { editor.find = ''; const find = editor.root.querySelector('#ce-find'); if (find) find.value = ''; showSection(button.dataset.pageSectionButton); return; }
  if (button.dataset.format) { format(button); return; }
  if (button.dataset.move) {
    const path = JSON.parse(button.dataset.move), list = at(path.slice(0, -1)), index = path.at(-1), next = index + Number(button.dataset.direction);
    if (next >= 0 && next < list.length) { [list[index], list[next]] = [list[next], list[index]]; dirty(); render(); controlFor([...path.slice(0, -1), next, ...(path[0] === 'faqs' ? ['question'] : [REGIONS[path[1]]?.fields[0][0]])])?.focus(); }
    return;
  }
  if (button.dataset.jump) { const target = editor.root.querySelector(`#${button.dataset.jump}`); target?.scrollIntoView?.({ block: 'start', behavior: 'smooth' }); target?.focus?.({ preventScroll: true }); return; }
  if (button.dataset.review !== undefined) {
    const warning = editor.warnings?.[Number(button.dataset.review)];
    if (warning && !focusField(warning.path)) {
      showTab(warning.tab || 'start');
      if (warning.tab === 'home' && warning.section) showSection(warning.section);
      editor.root.querySelector(`[data-section="${warning.tab || 'start'}"]`)?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
    }
    return;
  }
  if (button.id === 'ce-save') await save();
  if (button.id === 'ce-publish') await publish();
  if (button.id === 'ce-reload') await reload();
  if (button.dataset.remove) {
    const path = JSON.parse(button.dataset.remove);
    if (path[0] === 'budget' && path[1] === 'services' && path.length === 3) {
      if (editor.config.budget.services.length <= 1) return;
      const service = editor.config.budget.services[path[2]];
      if (!window.confirm(`Remove ${service.name}, its cost centers, and its video selections from this draft? Historical submissions stay unchanged.`)) return;
      delete editor.config.videos[service.id];
    } else if (!window.confirm(`Remove ${removalName(path)} from this draft?`)) return;
    const list = at(path.slice(0, -1));
    list.splice(path.at(-1), 1); dirty(); render();
    // Keep the keyboard near where the removed item was.
    const nearby = [...editor.root.querySelectorAll('[data-field]')].find(control => { const candidate = JSON.parse(control.dataset.field); return JSON.stringify(candidate.slice(0, path.length - 1)) === JSON.stringify(path.slice(0, -1)) && candidate[path.length - 1] === Math.min(path.at(-1), list.length - 1); });
    (nearby || editor.root.querySelector(`[data-tab="${editor.tab}"]`))?.focus();
  }
  if (button.dataset.add) {
    const id = crypto.randomUUID();
    editor.find = '';
    switch (button.dataset.add) {
      case 'hero': if (editor.config.heroImages.length < 100) editor.config.heroImages.push({ id: `hero-${id}`, url: '', alt: '', label: '' }); break;
      case 'department': if (editor.config.budget.services.length < 30) { editor.config.budget.services.push({ id: `department-${id}`, name: 'New department', desc: '', icon: 'chart', tone: 'blue', cutExamples: ['', '', '', ''], cuts: [] }); editor.openDetails.add(`department-department-${id}`); } break;
      case 'faq': editor.config.faqs.push({ question: '', answer: '' }); break;
      case 'section': { const region = REGIONS[button.dataset.region]; editor.config.sections[button.dataset.region].push({ id: `${button.dataset.region.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}-${id.slice(0, 8)}`, ...region.blank() }); break; }
      case 'video': (editor.config.videos[button.dataset.service] ||= []).push({ id: `video-${id}`, title: '', duration: 0, url: '', poster: '' }); editor.openDetails.add(`videos-${button.dataset.service}`); break;
      case 'cut': editor.config.budget.services[Number(button.dataset.index)].cuts.push({ id: `cut-${id}`, name: '', savings: 0, impact: '' }); break;
      case 'revenue': editor.config.budget.revenues.push({ id: `revenue-${id}`, name: '', description: '', assumption: '', amount: 0 }); break;
    }
    dirty(); render();
    const services = editor.config.budget.services, department = Number(button.dataset.index);
    const added = {
      hero: ['heroImages', editor.config.heroImages.length - 1, 'url'], faq: ['faqs', editor.config.faqs.length - 1, 'question'],
      section: button.dataset.region && ['sections', button.dataset.region, editor.config.sections[button.dataset.region].length - 1, REGIONS[button.dataset.region].fields[0][0]],
      department: ['budget', 'services', services.length - 1, 'name'], cut: Number.isInteger(department) && ['budget', 'services', department, 'cuts', services[department].cuts.length - 1, 'name'],
      revenue: ['budget', 'revenues', editor.config.budget.revenues.length - 1, 'name'], video: button.dataset.service && ['videos', button.dataset.service, (editor.config.videos[button.dataset.service] || []).length - 1, 'title'],
    }[button.dataset.add];
    if (added) { const control = controlFor(added); control?.focus(); control?.scrollIntoView?.({ block: 'center', behavior: 'smooth' }); }
  }
}
// Formatting toolbar for rich text. Browsers' editing commands produce simple
// markup that htmlToMarkdown turns back into the saved format.
function format(button) {
  const area = button.closest('.ce-rich')?.querySelector('[data-rich]');
  if (!area || typeof document.execCommand !== 'function') return;
  area.focus();
  const kind = button.dataset.format;
  if (kind !== 'link') { document.execCommand({ bold: 'bold', italic: 'italic', bullets: 'insertUnorderedList', numbers: 'insertOrderedList' }[kind]); return; }
  const selection = window.getSelection?.();
  const current = selection?.anchorNode?.parentElement?.closest?.('a')?.getAttribute('href') || '';
  const answer = window.prompt('Link address: https://…, mailto:…, tel:…, or a page on this site such as /privacy.\nLeave empty to remove the link.', current);
  if (answer === null) return;
  const url = answer.trim();
  if (!url) { document.execCommand('unlink'); return; }
  if (!isAllowedMarkdownURL(url)) { status('Links must start with https://, mailto:, tel:, / or #.', true); return; }
  if (selection?.isCollapsed) document.execCommand('insertHTML', false, `<a href="${esc(url)}">${esc(url)}</a>`);
  else document.execCommand('createLink', false, url);
}
function keydown(event) {
  const area = event.target.closest?.('[data-rich]');
  if (!area || event.key !== 'Enter' || area.dataset.rich !== 'inline') return;
  // A heading or sentence stays one paragraph; Shift+Enter adds a line break.
  event.preventDefault();
  if (event.shiftKey && typeof document.execCommand === 'function') document.execCommand('insertLineBreak');
}
function paste(event) {
  const area = event.target.closest?.('[data-rich]');
  if (!area || !event.clipboardData) return;
  // Paste as plain text so formatting from Word or web pages doesn't come along.
  event.preventDefault();
  document.execCommand?.('insertText', false, event.clipboardData.getData('text/plain'));
}
async function uploadFile(event) {
  const control = event.target;
  if (!control.dataset.upload || !control.files?.length) return;
  if (editor.busy) { control.value = ''; status('Wait for the current save or upload to finish, then choose the file again.', true); return; }
  const file = control.files[0];
  const maximum = file.type.startsWith('video/') ? 25 * 1024 * 1024 : 8 * 1024 * 1024;
  if (file.size > maximum) { status('Choose an image up to 8 MiB or a video up to 25 MiB.', true); control.value = ''; return; }
  editor.busy = true; updateActions(); status(`Uploading ${file.name}…`);
  try {
    const data = await request('/api/admin/media', { method: 'POST', body: file, headers: { 'Content-Type': file.type } });
    const path = JSON.parse(control.dataset.upload);
    set(path, data.url); dirty(); status('Upload complete. Save the draft to keep this media selection.'); render();
    if (path[0] === 'videos' && path.at(-1) === 'url') detectDuration(path.slice(0, -1));
  } catch (error) { status(error.message, true); control.value = ''; }
  finally { editor.busy = false; updateActions(); }
}
export function canLeaveContentEditor() {
  if (editor.busy) { window.alert('Wait for the content request to finish before leaving.'); return false; }
  if (editor.dirty && !window.confirm('Leave without saving your content changes?')) return false;
  editor.preview?.destroy(); editor.preview = null; editor.config = null; editor.dirty = false; return true;
}
export async function mountContentEditor(root) {
  editor.root = root;
  root.onclick = click; root.onfocusin = event => highlightPreview(event.target); root.oninput = input; root.onchange = uploadFile; root.onsubmit = event => event.preventDefault();
  root.onkeydown = keydown; root.onpaste = paste;
  // Remember the cursor in a rich field so "Insert a fact" can put it there.
  root.onfocusout = event => {
    const area = event.target.closest?.('[data-rich]'), selection = window.getSelection?.();
    if (area && selection?.rangeCount && area.contains(selection.getRangeAt(0).startContainer)) editor.caret = { area, range: selection.getRangeAt(0).cloneRange() };
  };
  // Keep the text selection when a formatting button is pressed.
  root.onmousedown = event => { if (event.target.closest?.('[data-format]')) event.preventDefault(); };
  if (typeof document.execCommand === 'function') { try { document.execCommand('defaultParagraphSeparator', false, 'p'); document.execCommand('styleWithCSS', false, false); } catch {} }
  if (editor.config) { render(); return; }
  root.innerHTML = '<p role="status">Loading site content…</p>';
  // Lets the privacy page show which analytics section visitors currently see.
  request('/api/admin/settings').then(settings => { editor.analyticsOn = Boolean(settings.googleAnalyticsId); if (editor.config && editor.root?.isConnected && !editor.busy && !editor.dirty && !editor.root.contains(document.activeElement)) render(); }).catch(() => {});
  editor.busy = true;
  try { useSnapshot(await request('/api/admin/content')); editor.message = ''; editor.error = false; render(); }
  catch (error) { root.innerHTML = `<p class="form-error" role="alert">${esc(error.message)}</p><button type="button" class="button secondary" id="ce-retry">Try again</button>`; root.querySelector('#ce-retry').onclick = () => mountContentEditor(root); }
  finally { editor.busy = false; if (editor.config) updateActions(); }
}
window.addEventListener('beforeunload', event => { if (editor.dirty || editor.busy) { event.preventDefault(); event.returnValue = ''; } });
