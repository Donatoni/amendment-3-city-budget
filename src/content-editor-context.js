import { defaultSiteConfig } from './site-defaults.js';
import { contentBindings } from './site-bindings.js';
import { textFields, REGIONS, normalizeContent, absorbedCopy, absorbedLinks, isRegionText, textFieldLabel } from './content-model.js';
import { markdownToText, markdownLinks } from './markdown.js';
import { KEY_FACTS } from './key-facts.js';

// Section names used to describe links in the review list.
const contentSections = [
  ['hero', 'Home · opening banner'], ['overview', 'Home · overview'],
  ['services', 'Home · services introduction'], ['amendment', 'Home · amendment explanation'],
  ['calculator', 'Savings calculator'], ['budget', 'Budget builder'],
  ['faqs', 'FAQ introduction'], ['sharing', 'Postcard & sharing studio'],
  ['feedback', 'Feedback form'], ['navigation', 'Navigation & menus'],
  ['footer', 'Footer & social links'], ['launch', 'Coming-soon page'],
  ['privacy', 'Privacy & public records page'], ['login', 'Reviewer sign-in page'],
  ['video', 'Video player'], ['other', 'Other page messages'],
];
const sourceSections = [['sources', 'Sources & methodology'], ['assumptions', 'Calculator · calculation & assumptions']];
const sectionName = id => [...contentSections, ...sourceSections].find(([key]) => key === id)?.[1] || id;
export function sectionFor(key) {
  if (key.startsWith('home_sources_')) return 'sources';
  if (/^home_savings_(\d+)$/.test(key) && Number(key.split('_').at(-1)) >= 264 && Number(key.split('_').at(-1)) <= 280) return 'assumptions';
  if (key === 'home_savings_link_3') return 'assumptions';
  if (/^(launch|privacy|login)_/.test(key)) return key.split('_')[0];
  if (/^(home_hero|ui_slideshow)_/.test(key)) return 'hero';
  if (/^home_overview_/.test(key)) return 'overview';
  if (/^home_services_/.test(key)) return 'services';
  if (/^home_amendment_/.test(key)) return 'amendment';
  if (/^home_(savings|property-)/.test(key)) return 'calculator';
  if (/^(home_(builder|revenue)|ui_(budget|service|revenue)_)/.test(key)) return 'budget';
  if (/^home_faq_/.test(key)) return 'faqs';
  if (/^(home_(share|shared)|ui_(share|postcard)_)/.test(key)) return 'sharing';
  if (/^(home_feedback|ui_feedback)_?/.test(key)) return 'feedback';
  if (/^(home_(nav|mobile-menu)|ui_navigation)/.test(key)) return 'navigation';
  if (/^home_site-footer_/.test(key)) return 'footer';
  if (/^(home_service-video|ui_video)_?/.test(key)) return 'video';
  return 'other';
}
export const isLegacyHeroCopy = key => /^home_hero_data-hero-label_/.test(key) || /^home_hero_aria-label_(9\d|10\d|110)$/.test(key) || ['home_hero_87', 'home_hero_88'].includes(key);
export const isRuntimeOwnedCopy = key => ['home_share-flip_405', 'home_share-flip_406'].includes(key);
export const isBudgetOwnedCopy = key => /^#tour-[a-z]+ > (?:span:nth-of-type\(1\)$|h3:|p:|div:nth-of-type\(1\) > strong:)/.test(contentBindings[key]?.selector || '');
export const isAdvancedCopy = key => Boolean(contentBindings[key]?.attribute) || key.startsWith('ui_') || /_(aria-label|placeholder|datetime|title)_/.test(key);
// Wording around the Potential revenue options. Edited in the Budget tab next to
// the options themselves rather than with the rest of the page wording.
export const revenueCopyLabels = {
  'home_revenue-title_318': 'Section heading',
  home_builder_319: 'Introduction under the heading',
  home_builder_320: 'Note below the options',
  ui_revenue_legend: 'Instruction for screen readers above the options',
  ui_revenue_select: 'Option status · not selected',
  ui_revenue_selected: 'Option status · selected',
  ui_revenue_millage_explanation: 'Millage slider · explanation',
  ui_revenue_annual: 'Millage slider · label under the amount',
  ui_revenue_rate_increase: 'Millage slider · label above the slider',
  ui_revenue_no_increase: 'Millage slider · left end of the scale',
  ui_revenue_max_increase: 'Millage slider · right end of the scale',
  ui_revenue_rate_one: 'Millage slider · rate shown at exactly 1 mill',
  ui_revenue_rate_many: 'Millage slider · rate shown at other values',
  ui_revenue_millage_one: 'Millage slider · read aloud at exactly 1 mill',
  ui_revenue_millage_many: 'Millage slider · read aloud at other values',
};
export const isRevenueCopy = key => Object.hasOwn(revenueCopyLabels, key);
export const millageWordingKeys = Object.keys(revenueCopyLabels).filter(key => key.startsWith('ui_revenue_') && /millage|rate|annual|increase/.test(key));
export const revenueWordingKeys = Object.keys(revenueCopyLabels).filter(key => !millageWordingKeys.includes(key));
const explicitLabels = {
  ...revenueCopyLabels,
  ui_share_flip_front: 'Postcard flip button · show city postcard',
  ui_share_flip_back: 'Postcard flip button · show budget breakdown',
  'privacy_browser-storage_33': 'Analytics paragraph · used while Google Analytics is OFF',
  'privacy_browser-storage_35': 'Analytics paragraph link text · used while Google Analytics is OFF',
  privacy_analytics_on_33: 'Analytics paragraph · used while Google Analytics is ON (Site settings)',
  privacy_analytics_on_35: 'Analytics paragraph link text · used while Google Analytics is ON',
};
const linkLabels = {
  home_amendment_link_1: 'Amendment explanation · learn more',
  'home_property-help_link_2': 'Property search · county appraiser credit',
  home_savings_link_3: 'Calculator assumptions · check county records',
  home_sources_link_4: 'Rate & baseline paragraph · millage resolutions',
  home_sources_link_5: 'Official source card · amendment & eligibility',
  home_sources_link_6: 'Official source card · property records',
  home_sources_link_7: 'Official source card · annual budgets',
  home_sources_link_8: 'Official source card · millage resolutions',
  home_sources_link_9: 'Official source card · homestead exemptions',
  'home_site-footer_link_10': 'Footer · Facebook', 'home_site-footer_link_11': 'Footer · Instagram',
  'home_site-footer_link_12': 'Footer · YouTube', 'home_site-footer_link_13': 'Footer · X',
  launch_main_link_1: 'Coming-soon page · city website',
  privacy_page_link_1: 'Privacy page · skip to content', privacy_header_link_2: 'Privacy page · city logo',
  privacy_header_link_3: 'Privacy page · back to website', privacy_use_link_4: 'Privacy policy reference',
  'privacy_browser-storage_link_5': 'Analytics paragraph link · used while Google Analytics is OFF',
  privacy_analytics_on_link_5: 'Analytics paragraph link · used while Google Analytics is ON',
  privacy_records_link_6: 'Public records · city records page', privacy_records_link_7: 'Public records · contact telephone',
  privacy_footer_link_8: 'Privacy footer · records contact', privacy_footer_link_9: 'Privacy footer · back to website',
  login_page_link_1: 'Sign-in page · skip to content', login_header_link_2: 'Sign-in page · city logo',
  login_header_link_3: 'Sign-in page · back to website', login_footer_link_4: 'Sign-in footer · privacy notice',
};
export function copyRole(key) {
  const binding = contentBindings[key];
  if (binding?.attribute === 'aria-label') return 'Accessibility label';
  if (binding?.attribute) return `${binding.attribute === 'placeholder' ? 'Input hint' : 'Metadata'}`;
  if (key.startsWith('ui_')) return 'Live state';
  const selector = binding?.selector || '';
  if (/h[1-6](?:[#:>. ]|$)/.test(selector) || /-(title|heading)$/.test(selector)) return 'Heading';
  if (/button|#share-(flip|native|download|copy|caption|edit)|#feedback-(submit|done)/.test(selector)) return 'Button';
  if (/(?:^| > )a:/.test(selector)) return 'Link text';
  return 'Text';
}
export function copyLabel(key) {
  if (explicitLabels[key]) return explicitLabels[key];
  if (key.startsWith('ui_')) return key.replace(/^ui_[^_]+_/, '').replaceAll('_', ' ').replace(/^./, value => value.toUpperCase());
  const original = (defaultSiteConfig.copy[key] || key).replace(/\s+/g, ' ').trim();
  return `${copyRole(key)} · ${original.length > 82 ? `${original.slice(0, 79)}…` : original}`;
}
export const linkLabel = key => linkLabels[key] || `${sectionName(sectionFor(key))} · link`;
export function previewURL(value) {
  const url = String(value || '').trim();
  if (/^https:\/\/[^\s]+$/i.test(url) || /^\/(?!\/)[^\s\\]*$/.test(url)) return url;
  return '';
}

// Fields that staff should not edit: accessibility plumbing, decorative symbols,
// ordinal numbers, and placeholders the page overwrites while it runs. They stay
// in the saved content, just out of the editor.
const hiddenCopyKeys = new Set(['home_home_1', 'privacy_page_1', 'login_page_1', 'launch_launch_1', 'home_nav-budget-reduced_18', 'home_builder-live-status_20', 'home_nav-budget-progress_21', 'home_nav-budget-progress_22', 'home_hero_88', 'home_share-modal_402']);
export function isHiddenCopy(key, value = defaultSiteConfig.copy[key]) {
  if (hiddenCopyKeys.has(key)) return true;
  const text = String(value ?? '').trim();
  return /^[\s&×↗↑↓←→↻▸·.,:;—–\-$✓]*$/.test(text) || /^\d{2}( \/ \d{2})?$/.test(text) || /^\$0(\.0M)?$/.test(text);
}
const hiddenLinkKeys = new Set(['privacy_analytics_on_link_5', 'privacy_browser-storage_link_5', 'privacy_page_link_1', 'login_page_link_1', 'privacy_header_link_2', 'privacy_header_link_3', 'privacy_footer_link_9', 'login_header_link_2', 'login_header_link_3']);
export const isHiddenLink = key => hiddenLinkKeys.has(key);

// Labels and help for the City & branding tab, in the order shown.
export const cityFieldInfo = [
  ['siteName', 'Site name', 'Shown in the browser tab, menus, and link previews. Example: Build Your Springfield.', { required: true, maxlength: 120 }],
  ['searchTitle', 'Search result title', 'The headline Google shows for the home page, also used in link previews. Aim for under 65 characters. Leave blank to use the site name.', { maxlength: 120 }],
  ['url', 'Public site address', 'The address residents use, with nothing after the final slash. Example: https://budget.springfield.gov/. Used for search engines and shared links.', { required: true }],
  ['description', 'Search and link description', 'One or two sentences shown by search engines and when the site is shared. Aim for under 160 characters.', { required: true, textarea: true, maxlength: 300 }],
];
const cityFieldLabels = { siteName: 'The site name', searchTitle: 'The search result title', description: 'The search description', socialImageAlt: 'The link preview image description' };
export const cityImageInfo = [
  ['logo', 'City logo', 'Square PNG or WebP works best. Appears in the header, the browser tab, and the postcard.'],
  ['socialImage', 'Link preview image', 'Shown when someone shares the site on Facebook, X, Teams, or in a text message. Use 1200 × 630 pixels.', 'socialImageAlt'],
  ['shareImage', 'Postcard artwork', 'Background art on the downloadable resident postcard. Avoid text in the image.'],
];

// The editor is organized like the site: one tab per page, and the home page
// split into the sections a visitor scrolls through.
export const editorPages = [
  ['home', 'Home page', [['hero', 'Opening banner'], ['overview', 'By the numbers'], ['services', 'City services'], ['amendment', 'Amendment explained'], ['calculator', 'Savings calculator'], ['budget', 'Budget builder'], ['faqs', 'FAQs'], ['sources', 'Sources'], ['feedback', 'Feedback'], ['sharing', 'Sharing & postcard'], ['navigation', 'Menus'], ['footer', 'Footer'], ['video', 'Video player']]],
  ['privacy', 'Privacy page', [['privacy', 'Privacy & public records']]],
  ['launch', 'Coming-soon page', [['launch', 'Coming soon']]],
  ['login', 'Sign-in page', [['login', 'Staff & reviewer sign-in']]],
];
const pageOfSection = Object.fromEntries(editorPages.flatMap(([page, , sections]) => sections.map(([id]) => [id, page])));
export const editorSection = key => ({ assumptions: 'calculator', other: 'navigation' })[sectionFor(key)] || sectionFor(key);
export const editorPageOf = section => pageOfSection[section] || 'home';

let starter;
const defaultText = () => (starter ||= normalizeContent(defaultSiteConfig).text);
// Whole paragraphs and headings staff can edit. Department cards (owned by
// Budget), slideshow labels and decorative symbols are left out.
// Fields staff should not edit: statewide Amendment 3 figures, numbers the
// page calculates or fills from key facts, labels the page replaces while it
// runs, staff-only controls, and fragile layout labels.
const lockedKeys = new Set([
  'home_overview_130', 'home_overview_133', 'home_overview_135', 'home_overview_139', 'home_overview_141', 'home_overview_142', 'home_overview_143', 'home_overview_145', 'home_overview_148', 'home_overview_149', 'home_overview_150', 'home_overview_151', 'home_overview_153', 'home_overview_155', 'home_overview_156', 'home_overview_157', 'home_overview_158', 'home_overview_159', 'home_overview_160',
  'home_services_168', 'home_services_173', 'home_services_178', 'home_services_183', 'home_services_189', 'home_services_192',
  'home_builder_287', 'home_builder_290', 'home_builder_293', 'home_builder_296', 'home_share-side-label_421', 'home_builder_303', 'home_builder_307', 'home_builder_309', 'home_builder_315', 'home_builder_327', 'home_nav-budget-progress_17',
  'home_savings_243', 'home_savings_244', 'home_savings_247', 'home_savings_257', 'home_savings_260', 'home_savings_268', 'home_savings_270', 'home_savings_272',
  'home_feedback-privacy-notice_452', 'home_share-modal_422', 'home_site-footer_463', 'home_site-footer_464', 'home_site-footer_465',
  'home_service-video-department_390', 'home_service-video-title_391', 'home_content_51', 'login_page_29', 'privacy_main_datetime_16',
]);
export const isLockedKey = key => lockedKeys.has(key);
// A field whose whole value is one key fact fills in by itself.
export const isKeyFactOnly = value => /^\s*\{\{\w+(?::\w+)?\}\}\s*$/.test(String(value ?? '')) || /^tel:\{\{\w+\}\}$/.test(String(value ?? ''));
// The fields most cities rewrite; everything else starts collapsed.
const coreKeys = new Set(['home_hero_53', 'home_hero_55', 'home_overview_128', 'home_overview_131', 'home_services_163', 'home_builder_322', 'launch_main_9', 'launch_main_13']);
export const isCoreText = key => coreKeys.has(key);
// Explained to residents next to the budget figures, so edited in the Budget tab.
export const budgetTabText = new Set(['home_builder_316']);
export function isEditableText(key, value) {
  if (!Object.hasOwn(textFields, key) || isRegionText(key) || isRevenueCopy(key) || lockedKeys.has(key) || budgetTabText.has(key)) return false;
  const { keys } = textFields[key];
  if (keys.some(item => isBudgetOwnedCopy(item) || isLegacyHeroCopy(item) || isRuntimeOwnedCopy(item))) return false;
  // Invisible copies the page uses only to reserve space for changing text.
  if (/reserve/.test(textFields[key].cls || '')) return false;
  if (value !== undefined && isKeyFactOnly(value)) return false;
  return !isHiddenCopy(key, markdownToText(defaultText()[key] ?? ''));
}
// Remaining single-fragment text that could not be merged (for example a
// button label beside an icon).
export const isEditableFragment = key => Boolean(contentBindings[key]) && !contentBindings[key].attribute && !contentBindings[key].image && !contentBindings[key].link
  && !absorbedCopy.has(key) && !lockedKeys.has(key) && !isHiddenCopy(key) && !isLegacyHeroCopy(key) && !isRuntimeOwnedCopy(key) && !isBudgetOwnedCopy(key) && !isRevenueCopy(key);
export const isEditableLink = (key, value) => !absorbedLinks.has(key) && !isHiddenLink(key) && !(value !== undefined && isKeyFactOnly(value));
export const textLabel = textFieldLabel;
const excerpt = value => { const text = markdownToText(value).replace(/\s+/g, ' ').trim(); return text.length > 70 ? `${text.slice(0, 67)}…` : text; };

// Things to check before publishing. A receiving city starts from the DeLand
// sample, so anything still pointing at DeLand is almost certainly unreviewed.
const SOURCE_CITY = defaultSiteConfig.city.name;
const sourcePattern = /\bDeLand\b|deland\.org|delandfl\.gov|CityofDeLand|cityofdelandfl/i;
const sourceLink = /deland\.org|delandfl\.gov|CityofDeLand|cityofdelandfl/i;
const placeholderPattern = /\(add [^)]*\)|add the city|before publication/i;
const sectionLabel = section => editorPages.flatMap(([, , sections]) => sections).find(([id]) => id === section)?.[1] || 'Page';
export function contentWarnings(config) {
  const warnings = [], add = (message, path, tab, section) => warnings.push({ message, path, tab, section });
  const otherCity = config.city.name !== SOURCE_CITY;
  const content = normalizeContent(config);
  // Every piece of visible writing, with where it lives and how to describe it.
  const writing = [];
  for (const [key, value] of Object.entries(content.text)) if (isEditableText(key) || isRevenueCopy(key)) writing.push({ value, path: ['text', key], where: isRevenueCopy(key) ? `Budget · ${revenueCopyLabels[key].toLowerCase()}` : `${sectionLabel(editorSection(key))} · ${textLabel(key).toLowerCase()}` });
  for (const [key, value] of Object.entries(config.copy)) if (isEditableFragment(key)) writing.push({ value, path: ['copy', key], where: sectionLabel(editorSection(key)) });
  for (const [id, region] of Object.entries(REGIONS)) {
    const items = region.single ? [content.sections[id]] : content.sections[id] || [];
    items.forEach((item, index) => {
      for (const [field, label, kind] of region.fields) {
        if (kind === 'visibility' || typeof item?.[field] !== 'string') continue;
        writing.push({ value: item[field], path: region.single ? ['sections', id, field] : ['sections', id, index, field], where: `${sectionLabel(region.section)} · ${region.single ? region.label.toLowerCase() : item.title ? `“${excerpt(item.title)}”` : `${region.item.toLowerCase()} ${index + 1}`}${kind === 'url' ? ' link' : ''}` });
      }
    });
  }
  config.faqs.forEach((faq, index) => writing.push({ value: `${faq.question}\n\n${faq.answer}`, path: ['faqs', index, 'answer'], where: `FAQ ${index + 1}` }));
  for (const item of writing) {
    if (placeholderPattern.test(item.value)) add(`Placeholder still needs your city’s details (${item.where}): “${excerpt(item.value.match(/[^.]*\((?:add [^)]*)\)[^.]*|[^.]*(?:add the city|before publication)[^.]*/i)?.[0] || item.value)}”`, item.path);
    if (markdownLinks(item.value).some(url => url === '#records') || item.value === '#records') add(`A link is still a placeholder (${item.where}). Point it to your city’s page.`, item.path);
  }
  for (const [key, value] of Object.entries(config.links)) if (isEditableLink(key) && value === '#records') add(`Link is still a placeholder: ${linkLabel(key)}`, ['links', key]);
  for (const [key, label, , type, , required] of KEY_FACTS) {
    const value = config.city[key];
    if (required && (value === undefined || value === null || String(value).trim() === '')) add(`Key fact needed: ${label.replace(/ \(\$\)$/, '')}.`, ['city', key]);
  }
  // Text that uses a key fact which is blank shows a gap on the site.
  const blankFacts = new Set();
  for (const item of writing) for (const [, key] of String(item.value).matchAll(/\{\{(\w+?)(?:Link)?(?::\w+)?\}\}/g)) {
    if (KEY_FACTS.some(fact => fact[0] === key && !fact[5]) && (config.city[key] === '' || config.city[key] === null || config.city[key] === undefined) && !blankFacts.has(key)) {
      blankFacts.add(key);
      add(`Key fact needed: ${KEY_FACTS.find(fact => fact[0] === key)[1].replace(/ \(\$\)$/, '')} is blank but used in ${item.where}.`, ['city', key]);
    }
  }
  const millage = config.budget.revenues.findIndex(item => item.id === 'millage-rate');
  if (millage !== -1 && config.budget.revenues[millage].enabled === false) {
    for (const item of writing) if (/millage slider/i.test(item.value)) add(`The property tax slider is off, but this text still mentions it (${item.where}).`, item.path);
  }
  if (config.city.millage === null || config.city.millage === '' || config.city.millage === undefined) add('Enter your city’s municipal operating millage (confirm it with Finance).', ['city', 'millage']);
  if (!otherCity) return warnings;
  if (/delandfl\.gov|deland\.org/i.test(config.city.url)) add('The public site address is still DeLand’s. Set it to your city’s address.', ['city', 'url']);
  for (const [key, label] of Object.entries(cityFieldLabels)) if (/\bDeLand\b/.test(config.city[key] || '')) add(`${label} still mentions DeLand.`, ['city', key]);
  for (const [key, label, , type] of KEY_FACTS) {
    const value = config.city[key], sample = defaultSiteConfig.city[key];
    if (['municipalityType', 'tagline', 'nextFiscalYear'].includes(key) || value === undefined || value === '' || value !== sample) continue;
    add(type === 'date' ? `Check the date: ${label} is still DeLand’s sample (${value}).` : `Key fact is still DeLand’s: ${label.replace(/ \(\$\)$/, '')}.`, ['city', key]);
  }
  if (config.city.millage === defaultSiteConfig.city.millage) add(`Municipal millage is still DeLand’s rate (${defaultSiteConfig.city.millage}). Confirm your city’s adopted operating millage with Finance.`, ['city', 'millage']);
  for (const [key] of cityImageInfo) if (/deland/i.test(config.city[key])) add(`${cityImageInfo.find(item => item[0] === key)[1]} is still a DeLand image.`, ['city', key]);
  for (const item of writing) {
    if (/\bDeLand\b/.test(markdownToText(item.value))) add(`Text mentions DeLand (${item.where}): “${excerpt(item.value)}”`, item.path);
    if (markdownLinks(item.value).some(url => sourceLink.test(url)) || (item.path.at(-1) === 'url' && sourceLink.test(item.value))) add(`A link still goes to a DeLand page (${item.where}).`, item.path);
  }
  for (const item of writing) if (/\$8\.8 ?(million|M)\b/.test(item.value)) add(`DeLand’s Year 2 figure ($8.8 million) is typed into this text (${item.where}). Use {{yearTwoImpact:words}} instead so it follows Key facts.`, item.path);
  for (const [key, value] of Object.entries(config.links)) if (isEditableLink(key) && sourceLink.test(value)) add(`Link still goes to a DeLand page: ${linkLabel(key)}`, ['links', key]);
  config.budget.revenues.forEach((revenue, index) => {
    if (sourcePattern.test(`${revenue.name} ${revenue.description} ${revenue.assumption}`)) add(`Revenue option “${revenue.name}” mentions DeLand.`, ['budget', 'revenues', index, 'description']);
  });
  config.budget.services.forEach((service, index) => {
    if (sourcePattern.test(`${service.name} ${service.desc}`)) add(`${service.name} department description mentions DeLand.`, ['budget', 'services', index, 'desc']);
    service.cuts.forEach((cut, cutIndex) => { if (sourcePattern.test(`${cut.name} ${cut.impact}`)) add(`Budget item “${cut.name}” mentions DeLand.`, ['budget', 'services', index, 'cuts', cutIndex, 'name']); });
  });
  const sampleBudget = JSON.stringify(defaultSiteConfig.budget.services.map(service => service.cuts.map(cut => cut.savings)));
  if (JSON.stringify(config.budget.services.map(service => service.cuts.map(cut => cut.savings))) === sampleBudget) add('Budget amounts are still DeLand’s sample figures. Enter your city’s reviewed figures.', ['budget', 'target']);
  const samplePhoto = (config.heroImages || []).findIndex(image => image.url.startsWith('/assets/hero-photos/'));
  if (samplePhoto !== -1) add(`The home banner still uses ${config.heroImages.filter(image => image.url.startsWith('/assets/hero-photos/')).length} DeLand sample photos. Replace or remove them.`, ['heroImages', samplePhoto, 'url'], 'home', 'hero');
  for (const [key, image] of Object.entries(config.media)) if (!/^home_hero_image_/.test(key) && /deland/i.test(`${image.url} ${image.alt}`)) add('A page image or its description is still DeLand’s.', ['media', key, 'url'], editorPageOf(editorSection(key)), editorSection(key));
  const sampleVideo = Object.entries(config.videos).flatMap(([service, videos]) => videos.map((video, index) => ({ service, index, video }))).filter(item => item.video.url.startsWith('/assets/videos/'));
  if (sampleVideo.length) add(`${sampleVideo.length} department videos are DeLand samples. Replace or remove them.`, ['videos', sampleVideo[0].service, sampleVideo[0].index, 'url'], 'videos');
  return warnings;
}
