import { contentBindings } from './site-bindings.js';
import { defaultSiteConfig } from './site-defaults.js';
import { expandCopy, escapeText } from './site-runtime.js';
import { budgetModel } from './budget-model.js';
import { renderHeroImages } from './hero-images.js';
import { formatMoney } from './key-facts.js';
import { injectAnalytics, normalizeAnalyticsId } from './analytics.js';
import { absorbedCopy, absorbedLinks, prepareStructuredContent, blockHTML } from './content-model.js';
import { structuredData } from './structured-data.js';

export function applyConfiguredDocument(document, config, { preview = false, url = '', analyticsId = '' } = {}) {
  const page = document.querySelector('#login-form') ? 'login' : document.querySelector('.privacy-main') ? 'privacy'
    : document.querySelector('#hero') ? 'home' : document.querySelector('.launch-intro') ? 'launch' : null;
  const analytics = normalizeAnalyticsId(analyticsId) || '';
  const { copy, links = {} } = config;
  const applyStructured = page ? prepareStructuredContent(document, config, page, { analytics: Boolean(analytics) }) : () => {};
  const blank = [];
  for (const [key, binding] of Object.entries(contentBindings)) {
    if (binding.page !== page || absorbedCopy.has(key) || absorbedLinks.has(key)) continue;
    const node = document.querySelector(binding.selector);
    if (!node) continue;
    if (binding.image) {
      const image = config.media[key];
      if (!image) continue;
      if (!image.url) { blank.push(node); continue; }
      node.setAttribute(node.hasAttribute('data-src') ? 'data-src' : 'src', image.url);
      node.removeAttribute('srcset'); node.removeAttribute('data-srcset');
      node.setAttribute('alt', expandCopy(image.alt, config));
    } else if (binding.link) {
      if (links[key]) node.setAttribute('href', expandCopy(links[key], config));
      else if (Object.hasOwn(links, key)) blank.push(node);
    } else if (Object.hasOwn(copy, key)) {
      const value = expandCopy(copy[key], config);
      if (binding.attribute) node.setAttribute(binding.attribute, value);
      else if (node.childNodes[binding.index]?.nodeType === 3) {
        const text = node.childNodes[binding.index];
        text.textContent = (text.textContent.match(/^\s*/)?.[0] || '') + value + (text.textContent.match(/\s*$/)?.[0] || '');
      }
    }
  }
  // Whole paragraphs, headings and repeating areas.
  applyStructured();
  // Dates shown as text (from key facts) also need a machine-readable form.
  const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  for (const time of document.querySelectorAll('time')) {
    const match = time.textContent.trim().match(/^([A-Za-z]+)\.? (\d{1,2}), (\d{4})$/);
    const month = match && months.findIndex(name => name.startsWith(match[1].toLowerCase()) && match[1].length >= 3);
    if (match && month >= 0) time.setAttribute('datetime', `${match[3]}-${String(month + 1).padStart(2, '0')}-${match[2].padStart(2, '0')}`);
    else time.removeAttribute('datetime');
  }
  // A hint left as just "e.g." when its example is blank says nothing.
  for (const node of document.querySelectorAll('[placeholder]')) if (/^e\.g\.\s*$/.test(node.getAttribute('placeholder'))) node.removeAttribute('placeholder');
  // Staff clear a link or image to remove it. Done after all text is applied so
  // the remaining selectors still match. Icon-only links disappear; text links
  // keep their words without the link.
  for (const node of blank) {
    if (node.tagName === 'A' && node.textContent.trim()) { while (node.firstChild) node.before(node.firstChild); }
    node.remove();
  }
  for (const image of document.querySelectorAll('img')) {
    if ((image.getAttribute('src') || '').includes('city-of-deland-seal')) image.setAttribute('src', config.city.logo);
  }
  if (!page) {
    // Simple pages such as the 404 page carry the starter names in their markup.
    const rename = value => value.replaceAll('Build Your DeLand', config.city.siteName).replaceAll('BUILD YOUR DELAND', config.city.siteName.toUpperCase())
      .replaceAll('DeLand', config.city.name).replaceAll('DELAND', config.city.name.toUpperCase());
    for (const node of document.querySelectorAll('title, body *')) {
      if (node.closest('script,style,svg')) continue;
      for (const text of node.childNodes) if (text.nodeType === 3) text.textContent = rename(text.textContent);
      for (const attribute of ['aria-label', 'title', 'alt']) if (node.hasAttribute(attribute)) node.setAttribute(attribute, rename(node.getAttribute(attribute)));
    }
  }
  // Drop any analytics tag baked into an HTML template; only the ID saved in
  // Site settings is ever used.
  for (const script of document.querySelectorAll('script')) {
    if (script.src?.includes('googletagmanager.com') || script.textContent.includes("gtag('config'")) script.remove();
  }
  // Staff opt in from Site settings. Draft previews, sign-in and the staff
  // dashboard are never measured.
  if (!preview && ['home', 'privacy', 'launch'].includes(page)) injectAnalytics(document, analytics);
  renderHeroImages(document, config);
  const firstHero = document.querySelector('[data-hero-slide] img');
  for (const link of document.querySelectorAll('link[rel="preload"][as="image"]')) {
    if (firstHero) { link.setAttribute('href', firstHero.getAttribute('src')); link.removeAttribute('imagesrcset'); link.removeAttribute('type'); }
    else link.remove();
  }
  const faqs = document.querySelector('.faq-list');
  if (faqs) faqs.innerHTML = config.faqs.map(item => `<details><summary>${escapeText(expandCopy(item.question, config))}</summary><div class="faq-answer">${blockHTML(item.answer, config)}</div></details>`).join('');
  if (page === 'home') {
    // Year 1 and Year 2 bars are drawn to scale from the actual figures.
    const years = [Number(config.budget.target) || 0, Number(config.city.yearTwoImpact) || 0], largest = Math.max(...years, 1);
    document.querySelectorAll('.impact-comparison > div > i').forEach((bar, index) => bar.setAttribute('style', `--bar-size:${Math.round((years[index] ?? 0) / largest * 10000) / 100}%`));
    const services = budgetModel(config).services;
    const grid = document.querySelector('.service-grid');
    const overview = grid?.querySelector('.service-overview');
    for (const card of grid?.querySelectorAll('[id^="tour-"]') || []) {
      if (!services.some(service => card.id === `tour-${service.id}`)) card.remove();
    }
    services.forEach((service, index) => {
      if (!grid) return;
      let card = grid.querySelector(`#tour-${service.id}`);
      if (!card) {
        card = document.createElement('article');
        card.className = 'service-card reveal'; card.id = `tour-${service.id}`;
        card.innerHTML = '<span class="service-index"></span><h3></h3><p></p><div class="service-total"><strong></strong><span></span></div>';
        card.querySelector('.service-total span').textContent = `Proposed ${config.city.fiscalYear}`;
      }
      card.querySelector('.service-index').textContent = String(index + 1).padStart(2, '0');
      card.querySelector('h3').textContent = service.name;
      card.querySelector('p').textContent = expandCopy(service.desc, config);
      card.querySelector('.service-total strong').textContent = formatMoney(service.proposed * 1e6);
      grid.insertBefore(card, overview || null);
    });
  }
  const searchTitle = expandCopy(config.city.searchTitle, config).trim() || config.city.siteName;
  if (['home', 'launch'].includes(page) || document.querySelector('#content-nav')) {
    const title = document.querySelector('title');
    if (title) title.textContent = page === 'home' ? searchTitle : `${page === 'launch' ? 'Coming soon | ' : document.querySelector('#login-form') ? 'Sign in | ' : ''}${config.city.siteName}`;
  }
  const description = expandCopy(config.city.description, config);
  const image = new URL(config.city.socialImage, config.city.url).href;
  const metadata = { description, 'og:title': searchTitle, 'og:description': description,
    'og:url': config.city.url, 'og:image': image, 'og:site_name': config.city.siteName, 'twitter:title': searchTitle,
    'twitter:description': description, 'twitter:image': image };
  // The starter description only describes the starter image.
  const starterAlt = config.city.socialImage !== defaultSiteConfig.city.socialImage && config.city.socialImageAlt === defaultSiteConfig.city.socialImageAlt;
  const imageAlt = (!starterAlt && expandCopy(config.city.socialImageAlt, config).trim()) || `${config.city.siteName} city budget exercise`;
  for (const node of document.querySelectorAll('meta')) {
    const key = node.getAttribute('property') || node.getAttribute('name');
    if (['home', 'launch'].includes(page) && Object.hasOwn(metadata, key)) node.setAttribute('content', metadata[key]);
    if (key === 'robots' && preview) node.setAttribute('content', 'noindex, nofollow');
    if (['og:image:alt', 'twitter:image:alt'].includes(key)) node.setAttribute('content', imageAlt);
    if (['og:image:type', 'og:image:width', 'og:image:height'].includes(key)) node.remove();
  }
  document.querySelector('link[rel="canonical"]')?.setAttribute('href', config.city.url);
  // Every declared icon shows the city logo; browsers pick any one of them.
  for (const icon of document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]')) {
    icon.setAttribute('href', config.city.logo); icon.removeAttribute('type'); icon.removeAttribute('sizes');
  }
  for (const node of document.querySelectorAll('script[type="application/ld+json"]')) node.remove();
  if (page === 'home') {
    const schema = document.createElement('script'); schema.type = 'application/ld+json';
    schema.textContent = JSON.stringify(structuredData(config, { title: searchTitle, description, image })).replaceAll('<', '\\u003c');
    document.head.append(schema);
  }
  const existing = document.querySelector('#city-site-config'); existing?.remove();
  if (page === 'home' || document.querySelector('#content-nav')) {
    const embedded = document.createElement('script'); embedded.id = 'city-site-config'; embedded.type = 'application/json';
    embedded.textContent = JSON.stringify(config).replaceAll('<', '\\u003c');
    document.head.append(embedded);
  }
  if (preview && document.body) {
    const banner = document.createElement('div'); banner.setAttribute('role', 'status');
    banner.setAttribute('style', 'position:relative;z-index:10000;padding:12px;background:#fff2bd;color:#352b10;text-align:center');
    banner.textContent = 'Draft preview - not published. Submission and feedback actions are disabled.';
    document.body.prepend(banner);
    for (const button of document.querySelectorAll('#submit-btn, #feedback-submit')) button.setAttribute('disabled', '');
  }
  return document;
}
