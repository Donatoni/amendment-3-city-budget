import { getVolusiaCity } from './volusia-cities.js';
import { textFields, REGIONS } from './content-model.js';
import { markdownLinks, isAllowedMarkdownURL } from './markdown.js';
import { KEY_FACTS } from './key-facts.js';
import { expandCopy } from './site-runtime.js';

// Every failure carries the path of the field at fault so the editor can open
// the right tab and focus it, rather than showing a key name.
const fail = (message, field) => { throw Object.assign(new Error(message), { status: 400, ...(field ? { field } : {}) }); };
const object = (value, label, field) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object.`, field);
  for (const key of Object.keys(value)) if (['__proto__', 'constructor', 'prototype'].includes(key)) fail(`Invalid ${label} field.`, field);
  return value;
};
const text = (value, label, max = 2000, required = false, field) => {
  if (typeof value !== 'string' || (required && !value.trim())) fail(`${label} ${required ? 'is required' : 'must be text'}.`, field);
  if (value.length > max) fail(`${label} is too long: use up to ${max.toLocaleString('en-US')} characters (currently ${value.length.toLocaleString('en-US')}).`, field);
  return value;
};
const number = (value, label, min, max, field) => {
  if (value === null || value === '' || value === undefined) fail(`${label} is required.`, field);
  if (!Number.isFinite(value) || value < min || value > max) fail(`${label} must be a number from ${min.toLocaleString('en-US')} to ${max.toLocaleString('en-US')}.`, field);
};
const list = (value, label, max, field) => { if (!Array.isArray(value) || value.length > max) fail(`${label} must be a list of up to ${max} items.`, field); return value; };
const identifier = (value, label, field) => { if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,79}$/.test(value)) fail(`${label} must use lowercase letters, numbers, hyphens, or underscores.`, field); };
export function validateContentURL(value, label, optional = true, field) {
  text(value, label, 2048, !optional, field);
  if (!value && optional) return;
  if (/[\s\\\u0000-\u001f]/.test(value)) fail(`${label} must be a web address starting with https:// or a site path starting with /. Remove any spaces.`, field);
  if (value.startsWith('/') && !value.startsWith('//')) return;
  let url;
  try { url = new URL(value); } catch { fail(`${label} must be a web address starting with https:// or a site path starting with /.`, field); }
  if (url.protocol !== 'https:' || url.username || url.password) fail(`${label} must start with https:// (or be a site path starting with /).`, field);
}
const cityLabels = { siteName: 'Site name', url: 'Public site address', logo: 'City logo', socialImage: 'Link preview image', shareImage: 'Postcard artwork', state: 'State', fiscalYear: 'Fiscal year label', description: 'Search and link description', searchTitle: 'Search result title', socialImageAlt: 'Link preview image description' };
export function validateSiteConfig(input) {
  object(input, 'Configuration');
  if (JSON.stringify(input).length > 500000) fail('Site content is too large.');
  const config = structuredClone(input);
  const city = object(config.city, 'City', ['city']);
  const municipality = getVolusiaCity(city.name);
  if (!municipality || municipality.name !== city.name || municipality.authority !== city.authority) fail('Choose a supported Volusia County city in the Calculator tab.', ['city', 'name']);
  text(city.siteName, cityLabels.siteName, 120, true, ['city', 'siteName']);
  for (const [key, max] of [['searchTitle', 120], ['socialImageAlt', 500]]) if (city[key] !== undefined) text(city[key], cityLabels[key], max, false, ['city', key]);
  number(city.millage, 'Municipal operating millage', 0, 50, ['city', 'millage']);
  for (const key of ['logo', 'socialImage', 'shareImage']) validateContentURL(city[key], cityLabels[key], false, ['city', key]);
  for (const key of ['state', 'fiscalYear', 'description']) text(city[key], cityLabels[key], 2000, true, ['city', key]);
  validateContentURL(city.url, cityLabels.url, false, ['city', 'url']);
  let origin;
  try { origin = new URL(city.url); } catch { fail('Public site address must be an https:// address.', ['city', 'url']); }
  if (origin.protocol !== 'https:' || origin.pathname !== '/' || origin.search || origin.hash) fail('Public site address must be just the domain, like https://budget.yourcity.gov/ (nothing after the final slash).', ['city', 'url']);
  const facts = Object.fromEntries(KEY_FACTS.map(item => [item[0], item]));
  for (const [key, value] of Object.entries(city)) {
    if (key === 'millage') continue;
    const fact = facts[key], label = fact?.[1].replace(/ \(\$\)$/, '') || cityLabels[key] || key, at = ['city', key];
    if (fact?.[3] === 'money') { if (value !== null && value !== '' && value !== undefined) number(value, label, 0, 1e12, at); else if (fact[5]) fail(`${label} is required.`, at); }
    else if (fact?.[3] === 'url') validateContentURL(value, label, !fact[5], at);
    else if (fact?.[3] === 'choice') { if (!fact[6].includes(value)) fail(`Choose ${fact[6].join(' or ')} for ${label.toLowerCase()}.`, at); }
    else if (fact?.[3] === 'phone') { text(value, label, 40, fact[5], at); if (value && !/^[0-9+().\-\s]{7,}(?:\s*(?:x|ext\.?|extension)\s*\d{1,6})?$/i.test(value)) fail(`${label} should look like 386-555-0100 (an extension such as ext. 12 is fine).`, at); }
    else if (['url', 'logo', 'socialImage', 'shareImage'].includes(key)) validateContentURL(value, label, true, at);
    else text(value, label, 2000, Boolean(fact?.[5]), at);
  }
  object(config.copy, 'Page text', ['copy']);
  if (Object.keys(config.copy).length > 1000) fail('Use up to 1000 page text entries.');
  for (const [key, value] of Object.entries(config.copy)) {
    if (!/^[\w.-]{1,120}$/.test(key)) fail('Invalid page text key.');
    text(value, 'This page text', 12000, false, ['copy', key]);
  }
  // A link written as a key fact that is blank is fixed in Key facts, so point there.
  const blankFactLink = urls => {
    for (const url of urls) {
      const match = String(url).match(/^(?:tel:)?\{\{(\w+?)(?:Link)?\}\}$/);
      if (match && Object.hasOwn(city, match[1]) && (city[match[1]] === '' || city[match[1]] === null)) fail(`${facts[match[1]]?.[1].replace(/ \(\$\)$/, '') || match[1]} is needed in Key facts: a link uses it.`, ['city', match[1]]);
    }
  };
  const markdown = (value, label, max, required, field) => {
    text(value, label, max, required, field);
    blankFactLink(markdownLinks(value));
    // Links may be written with key facts, such as ({{publicRecordsUrl}}); check what they become.
    for (const url of markdownLinks(expandCopy(value, config))) if (!isAllowedMarkdownURL(url)) fail(`${label} has a link that can’t be used: “${url.slice(0, 80)}”. Links must start with https://, mailto:, tel:, / or #.`, field);
  };
  if (config.text !== undefined) {
    object(config.text, 'Page text', ['text']);
    for (const [key, value] of Object.entries(config.text)) {
      if (!Object.hasOwn(textFields, key)) fail('Unknown page text field.');
      markdown(value, 'This text', 12000, false, ['text', key]);
    }
  }
  if (config.sections !== undefined) {
    object(config.sections, 'Page sections', ['sections']);
    for (const id of Object.keys(config.sections)) if (!Object.hasOwn(REGIONS, id)) fail('Unknown page section.');
    for (const [id, region] of Object.entries(REGIONS)) {
      const value = config.sections[id];
      if (value === undefined) continue;
      const items = region.single ? [object(value, region.label, ['sections', id])] : list(value, region.label, region.max, ['sections', id]);
      if (!region.single && items.length < (region.min || 0)) fail(`Keep at least ${region.min} ${region.item.toLowerCase()} in ${region.label}.`, ['sections', id]);
      const seen = new Set();
      items.forEach((item, index) => {
        const at = region.single ? ['sections', id] : ['sections', id, index];
        object(item, region.item || region.label, at);
        if (!region.single) {
          identifier(item.id, `${region.item} ID`, at);
          if (seen.has(item.id)) fail(`${region.item} IDs must be unique.`, at);
          seen.add(item.id);
        }
        const name = region.single ? region.label : `${region.label}: ${region.item.toLowerCase()} ${index + 1}`;
        for (const [field, label, kind, max, required] of region.fields) {
          const path = [...at, field], value = item[field];
          if (kind === 'visibility') { if (!['always', 'analytics-on', 'analytics-off'].includes(value)) fail(`${name}: choose when this section is shown.`, path); }
          else if (kind === 'url') { text(value, `${name} ${label.toLowerCase()}`, 2048, Boolean(required), path); blankFactLink([value]); validateContentURL(expandCopy(value, config), `${name} ${label.toLowerCase()}`, !required, path); }
          else markdown(value, `${name} ${label.toLowerCase()}`, max, Boolean(required), path);
        }
      });
    }
  }
  object(config.links, 'Links', ['links']);
  if (Object.keys(config.links).length > 200) fail('Use up to 200 links.');
  for (const [key, value] of Object.entries(config.links)) {
    if (!/^[\w.-]{1,120}$/.test(key)) fail('Invalid link key.');
    text(value, 'This link', 2048, false, ['links', key]);
    blankFactLink([value]);
    const link = expandCopy(value, config);
    if (/^(?:mailto:|tel:|#)/.test(link) && !/[\s\\\u0000-\u001f]/.test(link)) continue;
    validateContentURL(link, 'This link', true, ['links', key]);
  }
  object(config.media, 'Images', ['media']);
  if (Object.keys(config.media).length > 100) fail('Use up to 100 images.');
  for (const [key, value] of Object.entries(config.media)) {
    if (!/^[\w.-]{1,120}$/.test(key)) fail('Invalid image key.');
    object(value, 'Image', ['media', key]);
    validateContentURL(value.url, 'Image address', true, ['media', key, 'url']);
    text(value.alt, 'Image description', 500, false, ['media', key, 'alt']);
  }
  if (config.heroImages !== undefined) {
    const heroIds = new Set();
    list(config.heroImages, 'Home hero images', 100, ['heroImages']).forEach((image, index) => {
      object(image, 'Home hero image', ['heroImages', index]); identifier(image.id, 'Home hero image ID', ['heroImages', index]);
      if (heroIds.has(image.id)) fail('Home hero image IDs must be unique.', ['heroImages', index]);
      heroIds.add(image.id);
      if (typeof image.url !== 'string' || !image.url.trim()) fail(`Home hero image URL must be nonempty: upload a photo for home photo ${index + 1} or remove it.`, ['heroImages', index, 'url']);
      validateContentURL(image.url, `Home photo ${index + 1} address`, false, ['heroImages', index, 'url']);
      text(image.alt, `Home photo ${index + 1} description`, 500, false, ['heroImages', index, 'alt']);
      text(image.label, `Home photo ${index + 1} caption`, 200, false, ['heroImages', index, 'label']);
    });
  }
  list(config.faqs, 'FAQs', 100, ['faqs']).forEach((item, index) => {
    object(item, 'FAQ', ['faqs', index]);
    text(item.question, `FAQ ${index + 1} question`, 500, true, ['faqs', index, 'question']);
    text(item.answer, `FAQ ${index + 1} answer`, 12000, true, ['faqs', index, 'answer']);
    for (const url of markdownLinks(expandCopy(item.answer, config))) if (!isAllowedMarkdownURL(url)) fail(`FAQ ${index + 1} answer has a link that can’t be used. Links must start with https://, mailto:, tel:, / or #.`, ['faqs', index, 'answer']);
  });
  const budget = object(config.budget, 'Budget', ['budget']);
  number(budget.target, 'Budget gap target', 0.01, 10000000000, ['budget', 'target']);
  text(budget.version, 'Budget version', 100, true);
  const services = list(budget.services, 'Departments', 30, ['budget', 'services']);
  if (!services.length) fail('Keep at least one budget department.', ['budget', 'services']);
  const serviceIds = new Set();
  const ids = new Set();
  let capacity = 0;
  services.forEach((service, index) => {
    const at = ['budget', 'services', index];
    object(service, 'Department', at);
    identifier(service.id, 'Department ID', at);
    if (['__proto__', 'constructor', 'prototype'].includes(service.id)) fail('Choose a different department ID.', at);
    if (serviceIds.has(service.id)) fail('Department IDs must be unique.', at);
    serviceIds.add(service.id);
    const name = typeof service.name === 'string' && service.name.trim() ? service.name : `Department ${index + 1}`;
    text(service.name, `Department ${index + 1} name`, 200, true, [...at, 'name']); text(service.desc, `${name} description`, 4000, false, [...at, 'desc']);
    identifier(service.icon, `${name} icon`, [...at, 'icon']); identifier(service.tone, `${name} color`, [...at, 'tone']);
    if (service.max !== undefined) number(service.max, 'Department display maximum', 0, 10000, at);
    if (service.cutExamples !== undefined) list(service.cutExamples, 'Impact messages', 20, at).forEach((value, i) => text(value, `${name} impact message`, 2000, false, [...at, 'cutExamples', i]));
    let serviceCents = 0;
    list(service.cuts, `${name} cost centers`, 100, at).forEach((cut, cutIndex) => {
      const cutAt = [...at, 'cuts', cutIndex];
      object(cut, 'Cost center', cutAt); identifier(cut.id, 'Cost center ID', cutAt);
      if (ids.has(cut.id)) fail('Service cut IDs must be unique.', cutAt);
      ids.add(cut.id);
      text(cut.name, `${name} cost center ${cutIndex + 1} name`, 200, true, [...cutAt, 'name']); text(cut.impact, `${name} cost center ${cutIndex + 1} community impact`, 4000, false, [...cutAt, 'impact']);
      number(cut.savings, `${name} cost center ${cutIndex + 1} annual amount`, -10000000000, 10000000000, [...cutAt, 'savings']);
      const cents = Math.round(cut.savings * 100);
      serviceCents += cents; capacity += Math.max(0, cents);
    });
    if (serviceCents < 0) fail(`Each department must have a nonnegative total baseline budget; ${name} totals less than $0.`, [...at, 'name']);
  });
  const revenues = list(budget.revenues, 'Revenues', 50, ['budget', 'revenues']);
  const revenueIds = new Set();
  revenues.forEach((revenue, index) => {
    const at = ['budget', 'revenues', index];
    object(revenue, 'Revenue', at); identifier(revenue.id, 'Revenue ID', at);
    if (revenueIds.has(revenue.id)) fail('Revenue IDs must be unique.', at);
    revenueIds.add(revenue.id);
    if (revenue.enabled !== undefined && typeof revenue.enabled !== 'boolean') fail('Choose whether residents see this revenue option.', [...at, 'enabled']);
    // A switched-off option keeps its settings but doesn't need them complete.
    const off = revenue.enabled === false;
    text(revenue.name, `Revenue option ${index + 1} name`, 200, !off, [...at, 'name']); text(revenue.description, 'Revenue description', 4000, false, [...at, 'description']); text(revenue.assumption, 'Revenue assumptions', 4000, false, [...at, 'assumption']);
    if (off && (revenue.amount === null || revenue.amount === '')) revenue.amount = 0;
    number(revenue.amount, `${revenue.name || `Revenue option ${index + 1}`} amount`, 0, 10000000000, [...at, 'amount']);
    if (revenue.enabled !== false) capacity += Math.round(revenue.amount * 100);
  });
  if (Math.round(budget.target * 100) > capacity) fail('The budget target exceeds all available cuts and revenues. Lower the target or add choices so residents can close the gap.', ['budget', 'target']);
  object(config.videos, 'Videos', ['videos']);
  for (const [service, videos] of Object.entries(config.videos)) {
    identifier(service, 'Video category');
    const videoIds = new Set();
    list(videos, 'Videos per department', 30, ['videos', service]).forEach((video, index) => {
      const at = ['videos', service, index];
      object(video, 'Video', at); identifier(video.id, 'Video ID', at);
      if (videoIds.has(video.id)) fail('Video IDs must be unique within their category.', at);
      videoIds.add(video.id); text(video.title, `Video ${index + 1} title`, 200, true, [...at, 'title']); if (video.duration === null || video.duration === '') video.duration = 0;
      number(video.duration, `Video ${index + 1} length in seconds`, 0, 86400, [...at, 'duration']);
      validateContentURL(video.url, `Video ${index + 1} file`, false, [...at, 'url']); validateContentURL(video.poster, `Video ${index + 1} poster image`, true, [...at, 'poster']);
    });
  }
  return config;
}
