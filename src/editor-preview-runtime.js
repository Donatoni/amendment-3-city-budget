import { applyConfiguredDocument } from './site-document.js';
import { configureSite } from './site-runtime.js';
import { contentBindings } from './site-bindings.js';
import { isBudgetOwnedCopy, isLegacyHeroCopy, isLockedKey } from './content-editor-context.js';
import { textFields, regionSources, REGIONS, absorbedCopy, absorbedLinks, isRegionText, normalizeContent } from './content-model.js';

const sections = {
  hero: '#hero', overview: '#overview', services: '#services', amendment: '#amendment',
  calculator: '#savings', budget: '#builder', faqs: '#faq', sharing: '#share-modal',
  feedback: '#feedback-modal', navigation: '#nav', footer: '.site-footer',
  sources: '#sources', assumptions: '.calc-assumptions', video: '#services',
  launch: 'main', privacy: 'main', login: 'main', other: 'main',
};
const externalActions = '#submit-btn,#feedback-submit,#share-native,#share-download,#share-copy,#share-caption,.reviewer-session button,.login-submit';
const mark = (node, path) => { if (node) node.dataset.editorPath = JSON.stringify(path); };

export function annotateEditorDocument(document, config) {
  const page = document.querySelector('#login-form') ? 'login' : document.querySelector('.privacy-main') ? 'privacy'
    : document.querySelector('#hero') ? 'home' : document.querySelector('.launch-intro') ? 'launch' : null;
  // Resolve all template selectors before adding inline selection markers.
  const bindings = Object.entries(contentBindings).filter(([key, binding]) => binding.page === page && !absorbedCopy.has(key) && !absorbedLinks.has(key))
    .map(([key, binding]) => ({ key, binding, node: document.querySelector(binding.selector) }));
  // Whole paragraphs and headings: the element itself opens its field.
  for (const [key, field] of Object.entries(textFields)) {
    if (field.page !== page || isRegionText(key) || isLockedKey(key) || field.keys.some(isBudgetOwnedCopy)) continue;
    const node = document.querySelector(field.selector);
    if (node && !node.dataset.editorPath) mark(node, ['text', key]);
  }
  // Text the page rewrites while it runs opens the message it is built from.
  for (const [selector, key] of [['#gap-eyebrow', 'ui_budget_challenge'], ['#gap-title', 'ui_budget_goal_title'], ['#gap-instruction', 'ui_budget_instruction'], ['#gap-reduced-label', 'ui_budget_closed'], ['#selected-cut-count', 'ui_budget_selected_many'], ['#share-side-label', 'ui_share_front_label']]) mark(document.querySelector(selector), ['copy', key]);
  // Repeating sections: each item and its parts.
  const content = normalizeContent(config);
  for (const [id, region] of Object.entries(REGIONS)) {
    if (region.page !== page) continue;
    const container = document.querySelector(regionSources[id].container);
    if (!container) continue;
    if (region.single) {
      mark(container, ['sections', id, 'body']);
      if (id === 'privacyNotice') mark(container.querySelector('h2'), ['sections', id, 'title']);
      continue;
    }
    container.querySelectorAll('[data-section-id]').forEach(item => {
      const index = content.sections[id].findIndex(entry => entry.id === item.dataset.sectionId);
      if (index === -1) return;
      const at = ['sections', id, index];
      mark(item, [...at, region.fields.some(field => field[0] === 'body') ? 'body' : 'title']);
      mark(item.querySelector('h2, summary, strong'), [...at, 'title']);
      mark(item.querySelector('small'), [...at, 'publisher']);
      if (id === 'launchPoints') mark(item.querySelector('p > span'), [...at, 'body']);
      if (id === 'sourceLinks') mark(item, [...at, 'url']);
    });
  }
  for (const { key, binding, node } of bindings) {
    if (!node || /^home_hero_image_/.test(key) || isLegacyHeroCopy(key) || isBudgetOwnedCopy(key)) continue;
    if (binding.image) mark(node, ['media', key, 'url']);
    else if (binding.link) node.dataset.editorLinkPath = JSON.stringify(['links', key]);
    else if (Object.hasOwn(config.copy, key)) {
      if (binding.attribute) { if (!node.dataset.editorPath) mark(node, ['copy', key]); }
      else {
        const text = node.childNodes[binding.index];
        if (text?.nodeType !== 3) continue;
        // A neutral element avoids public CSS that styles all descendant spans
        // as badges, dots, or fixed-width button decorations.
        const marker = document.createElement('city-editor-text');
        marker.className = 'editor-preview-text'; mark(marker, ['copy', key]);
        text.replaceWith(marker); marker.append(text);
      }
    }
  }
  document.querySelectorAll('[data-hero-slide]').forEach((slide, index) => mark(slide, ['heroImages', index, 'url']));
  document.querySelectorAll('.faq-list details').forEach((item, index) => {
    mark(item.querySelector('summary'), ['faqs', index, 'question']);
    mark(item.querySelector('.faq-answer'), ['faqs', index, 'answer']);
  });
  config.budget.services.forEach((service, index) => {
    const card = document.getElementById(`tour-${service.id}`);
    mark(card, ['budget', 'services', index]);
    mark(card?.querySelector('h3'), ['budget', 'services', index, 'name']);
    mark(card?.querySelector('p'), ['budget', 'services', index, 'desc']);
    mark(document.getElementById(`service-title-${service.id}`), ['budget', 'services', index, 'name']);
    service.cuts.forEach((cut, cutIndex) => {
      mark(document.getElementById(`name-${cut.id}`), ['budget', 'services', index, 'cuts', cutIndex, 'name']);
      mark(document.getElementById(`effect-${cut.id}`), ['budget', 'services', index, 'cuts', cutIndex, 'impact']);
      mark(document.getElementById(`price-${cut.id}`), ['budget', 'services', index, 'cuts', cutIndex, 'savings']);
    });
  });
  const revenues = document.getElementById('potential-revenues');
  mark(revenues?.querySelector('legend'), ['copy', 'ui_revenue_legend']);
  config.budget.revenues.forEach((revenue, index) => {
    const at = ['budget', 'revenues', index];
    if (revenue.id === 'millage-rate') {
      const millage = revenues?.querySelector('.millage-choice');
      mark(millage?.querySelector('.cost-choice-title'), [...at, 'name']);
      mark(document.getElementById('revenue-effect-millage-rate'), ['copy', 'ui_revenue_millage_explanation']);
      mark(document.getElementById('millage-revenue-amount'), [...at, 'amount']);
      mark(millage?.querySelector('.cost-choice-state'), ['copy', 'ui_revenue_annual']);
      mark(millage?.querySelector('.millage-control-label span'), ['copy', 'ui_revenue_rate_increase']);
      mark(document.getElementById('millage-rate-value'), ['copy', 'ui_revenue_rate_many']);
      const ends = millage?.querySelectorAll('.millage-scale span') || [];
      mark(ends[0], ['copy', 'ui_revenue_no_increase']); mark(ends[1], ['copy', 'ui_revenue_max_increase']);
      return;
    }
    mark(document.getElementById(`revenue-name-${revenue.id}`), [...at, 'name']);
    mark(document.getElementById(`revenue-effect-${revenue.id}`), [...at, 'description']);
    mark(document.getElementById(`revenue-effect-${revenue.id}`)?.querySelector('.revenue-assumption'), [...at, 'assumption']);
    mark(document.getElementById(`revenue-price-${revenue.id}`), [...at, 'amount']);
    mark(document.getElementById(`revenue-price-${revenue.id}`)?.querySelector('.cost-choice-state'), ['copy', 'ui_revenue_select']);
  });
  for (const image of document.querySelectorAll('img')) if (image.getAttribute('src') === config.city.logo) mark(image, ['city', 'logo']);
  mark(document.querySelector('#share-canvas'), ['city', 'shareImage']);
}

export function editorSelectionPath(target) {
  const flip = target.closest?.('#share-flip');
  if (flip) return ['copy', flip.getAttribute('aria-pressed') === 'true' ? 'ui_share_flip_front' : 'ui_share_flip_back'];
  const node = target.closest?.('[data-editor-path], [data-editor-link-path]');
  if (!node) return null;
  const link = node.closest('a[data-editor-link-path]');
  return JSON.parse(link?.dataset.editorLinkPath || node.dataset.editorPath || node.dataset.editorLinkPath);
}

export function installPreviewGuards(window) {
  const { document } = window;
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, options = {}) => {
    const method = (options.method || (typeof input === 'object' && input.method) || 'GET').toUpperCase();
    if (!['GET', 'HEAD'].includes(method)) return Promise.reject(new Error('Editor previews do not send changes or submissions.'));
    return originalFetch(input, options);
  };
  const originalOpen = window.XMLHttpRequest.prototype.open;
  window.XMLHttpRequest.prototype.open = function(method, ...args) {
    if (!['GET', 'HEAD'].includes(String(method).toUpperCase())) throw new Error('Editor previews do not send changes or submissions.');
    return originalOpen.call(this, method, ...args);
  };
  if (window.navigator.sendBeacon) window.navigator.sendBeacon = () => false;
  document.addEventListener('submit', event => { event.preventDefault(); event.stopImmediatePropagation(); }, true);
  document.addEventListener('click', event => {
    const target = event.target.closest?.('a,button,input');
    if (!target) return;
    const anchor = target.closest('a');
    if (target.matches(externalActions) || (anchor && !anchor.getAttribute('href')?.startsWith('#'))) {
      event.preventDefault(); event.stopImmediatePropagation();
    }
  }, true);
}

export async function startEditorPreview(window = globalThis.window) {
  if (window.parent === window) throw new Error('Open this preview from Site content settings.');
  const { document } = window;
  const origin = window.location.origin;
  const post = message => window.parent.postMessage(message, origin);
  let configSignature, contextSignature, mode = 'select', application, rendering = false, pendingRender;
  const style = document.createElement('style');
  style.textContent = `html{scroll-behavior:auto!important} [data-editor-mode="select"] [data-editor-path]:hover,[data-editor-mode="select"] [data-editor-link-path]:hover{outline:2px solid #078a7d;outline-offset:3px;cursor:pointer}.editor-preview-selected{outline:3px solid #078a7d!important;outline-offset:4px}.reveal,.gsap-reveal{opacity:1!important;visibility:visible!important} .reviewer-session{display:none!important}`;
  document.head.append(style);
  // Selection mode captures the real rendered text before application controls
  // can navigate, submit, or change a visitor's plan.
  document.addEventListener('click', event => {
    if (mode !== 'select') return;
    event.preventDefault(); event.stopImmediatePropagation();
    const path = editorSelectionPath(event.target);
    if (path) post({ type: 'city-editor:select', path });
  }, true);
  document.addEventListener('keydown', event => {
    if (mode === 'select' && ['Enter', ' '].includes(event.key)) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  installPreviewGuards(window);
  const renderMessage = async event => {
    if (event.origin !== origin || event.source !== window.parent || event.data?.type !== 'city-editor:render') return;
    if (rendering) { pendingRender = event; return; }
    const { config, section = 'hero', selection, mode: nextMode = 'select' } = event.data;
    if (!config || typeof config !== 'object') return;
    try {
      rendering = true;
      const signature = JSON.stringify(config);
      if (configSignature && signature !== configSignature) { window.location.reload(); return; }
      if (!configSignature) {
        applyConfiguredDocument(document, config);
        configureSite(config); configSignature = signature;
        if (document.querySelector('#hero')) application = await import('./main.js');
        annotateEditorDocument(document, config);
      }
      mode = nextMode === 'interact' ? 'interact' : 'select';
      document.documentElement.dataset.editorMode = mode;
      const nextContext = JSON.stringify({ section, selection });
      const contextChanged = nextContext !== contextSignature;
      if (contextChanged) {
        await application?.showEditorPreviewSection?.(section, { key: selection?.[1], path: selection });
        contextSignature = nextContext;
      }
      const flip = document.querySelector('#share-flip');
      mark(flip, ['copy', flip?.getAttribute('aria-pressed') === 'true' ? 'ui_share_flip_front' : 'ui_share_flip_back']);
      document.querySelectorAll('.editor-preview-selected').forEach(node => node.classList.remove('editor-preview-selected'));
      const selected = Array.isArray(selection) ? [...document.querySelectorAll('[data-editor-path],[data-editor-link-path]')]
        .find(node => node.dataset.editorPath === JSON.stringify(selection) || node.dataset.editorLinkPath === JSON.stringify(selection)) : null;
      selected?.classList.add('editor-preview-selected');
      const target = selected || document.querySelector(sections[section] || 'main');
      const details = target?.closest('details'); if (details) details.open = true;
      // Scroll only this frame. scrollIntoView would also scroll the admin page
      // around the preview, making the editor jump.
      if (contextChanged && target && !target.closest('[hidden]')) {
        const box = target.getBoundingClientRect?.() || { top: 0, height: 0 };
        window.scrollTo?.({ top: Math.max(0, (window.scrollY || 0) + box.top - ((window.innerHeight || 0) - Math.min(box.height, window.innerHeight || 0)) / 2), behavior: 'instant' });
      }
      document.documentElement.style.visibility = 'visible';
      post({ type: 'city-editor:rendered', section });
    } catch (error) {
      document.documentElement.style.visibility = 'visible';
      post({ type: 'city-editor:error', message: error.message });
    } finally {
      rendering = false;
      if (pendingRender) { const next = pendingRender; pendingRender = undefined; await renderMessage(next); }
    }
  };
  window.addEventListener('message', renderMessage);
  post({ type: 'city-editor:ready' });
}
