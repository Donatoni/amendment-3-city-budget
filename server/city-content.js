import { defaultSiteConfig } from '../src/site-defaults.js';
import { validateSiteConfig } from '../src/site-config-schema.js';
import { normalizeContent } from '../src/content-model.js';
import { previousStarter } from '../src/previous-starter.js';
import { KEY_FACTS } from '../src/key-facts.js';

// Lines split into several starter fragments, upgraded only as a whole.
const STARTER_GROUPS = [['home_nav_4', 'home_nav_5', 'home_nav_6'], ['home_site-footer_459', 'home_site-footer_460', 'home_site-footer_461'], ['home_feedback-modal_436', 'home_feedback-modal_437', 'home_feedback-modal_438'], ['privacy_header_4', 'privacy_header_5', 'privacy_header_6'], ['launch_launch_4', 'launch_launch_5', 'launch_launch_6'], ['login_header_4', 'login_header_5', 'login_header_6'], ['privacy_browser-storage_33', 'privacy_browser-storage_34', 'privacy_browser-storage_35']];
import { staffSession } from './staff-auth.js';

const key = 'city_content_v1';
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
// A new installation starts from the sample content, addressed to its own
// public URL (wrangler.jsonc vars.SITE_URL) rather than the source city's.
function starterConfig(env = {}) {
  const config = structuredClone(defaultSiteConfig);
  try {
    const url = new URL(env.SITE_URL);
    if (url.protocol === 'https:') config.city.url = url.origin + '/';
  } catch {}
  return config;
}
const initial = env => ({ draft: starterConfig(env), published: starterConfig(env), revision: 0 });
function withCurrentFields(config) {
  const copy = { ...defaultSiteConfig.copy, ...config.copy };
  const links = { ...defaultSiteConfig.links, ...config.links };
  const city = { ...defaultSiteConfig.city, ...config.city };
  // An older installation for another city has no contact key facts yet. Start
  // them blank (the review list asks for them) rather than showing DeLand's.
  if (city.name !== defaultSiteConfig.city.name) {
    for (const [key, , , type] of KEY_FACTS) if (!Object.hasOwn(config.city, key) && (['url', 'phone', 'date'].includes(type) || ['clerkAddress', 'sampleAddress'].includes(key))) city[key] = '';
  }
  // The starter image description only fits the starter image.
  if (!Object.hasOwn(config.city, 'socialImageAlt') && city.socialImage !== defaultSiteConfig.city.socialImage) city.socialImageAlt = '';
  // Wording that would show a blank key fact keeps its old (flagged) text.
  const usesBlankFact = value => [...String(value).matchAll(/\{\{(\w+?)(?:Link)?(?::\w+)?\}\}/g)].some(([, key]) => Object.hasOwn(city, key) && (city[key] === '' || city[key] === null));
  const untouched = (list, saved, name) => (previousStarter[list][name] || []).includes(saved[name]);
  // Starter wording nobody edited moves to the current starter, which reads
  // its numbers, names and contacts from key facts. Fragments of one line
  // (such as "Budget", "&", "community priorities") move only together.
  const grouped = new Set(STARTER_GROUPS.flat());
  for (const name of Object.keys(previousStarter.copy)) if (!grouped.has(name) && untouched('copy', copy, name) && !usesBlankFact(defaultSiteConfig.copy[name])) copy[name] = defaultSiteConfig.copy[name];
  for (const group of STARTER_GROUPS) if (group.every(name => untouched('copy', copy, name))) for (const name of group) copy[name] = defaultSiteConfig.copy[name];
  for (const name of Object.keys(previousStarter.links)) if (untouched('links', links, name) && !usesBlankFact(defaultSiteConfig.links[name])) links[name] = defaultSiteConfig.links[name];
  // Only untouched starter wording receives the new department-count tokens.
  for (const [name, value] of Object.entries(defaultSiteConfig.copy)) {
    const legacy = value.replaceAll('{{departmentCount}} {{departmentLabel}}', 'five departments').replaceAll('{{departmentCount}} department', 'five department');
    if (copy[name] === legacy) copy[name] = value;
  }
  const faqs = config.faqs.map(item => {
    const current = defaultSiteConfig.faqs.find(faq => faq.answer.replaceAll('{{departmentCount}} {{departmentLabel}}', 'five departments') === item.answer);
    return current ? { ...item, answer: current.answer } : item;
  });
  const tourDescriptions = { fire: 'home_services_166', police: 'home_services_171', streets: 'home_services_176', parks: 'home_services_181', planning: 'home_services_186' };
  const services = config.budget.services.map(service => {
    const name = tourDescriptions[service.id];
    const description = copy[name];
    if (!name || description === defaultSiteConfig.copy[name]) return service;
    // The Budget editor now owns service descriptions. Carry over earlier Page
    // Text edits only where staff have not also customized the budget field.
    copy[name] = defaultSiteConfig.copy[name];
    const original = defaultSiteConfig.budget.services.find(item => item.id === service.id);
    return service.desc === original.desc ? { ...service, desc: description } : service;
  });
  // Whole paragraphs and repeating sections are built from older fragment
  // edits the first time they are loaded.
  return normalizeContent({ ...config, city,
    copy, faqs, budget: { ...config.budget, services },
    media: { ...structuredClone(defaultSiteConfig.media), ...config.media },
    links });
}
async function document(env) {
  if (!env.DASHBOARD_DB) fail('Content storage is not configured.', 503);
  const row = await env.DASHBOARD_DB.prepare('SELECT value FROM site_settings WHERE key = ?').bind(key).first();
  const state = row ? JSON.parse(row.value) : initial(env);
  state.draft = withCurrentFields(state.draft);
  state.published = withCurrentFields(state.published);
  return { state, raw: row?.value };
}
export async function publishedSiteConfig(env = {}) {
  if (!env.DASHBOARD_DB) return starterConfig(env);
  return (await document(env)).state.published;
}
export const loadPublishedConfig = publishedSiteConfig;
export async function loadDraftConfig(env) { return (await document(env)).state.draft; }
export async function boundedBytes(request, limit) {
  if (Number(request.headers.get('Content-Length')) > limit) fail('Request is too large.', 413);
  const reader = request.body?.getReader();
  const chunks = [];
  let length = 0;
  if (reader) while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > limit) { await reader.cancel(); fail('Request is too large.', 413); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}
async function jsonBody(request) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) fail('Use a JSON request body.', 415);
  const bytes = await boundedBytes(request, 512 * 1024);
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { fail('Invalid JSON request.'); }
}
async function saveDocument(env, previous, state) {
  const value = JSON.stringify(state);
  const result = previous.raw === undefined
    ? await env.DASHBOARD_DB.prepare('INSERT OR IGNORE INTO site_settings(key, value) VALUES (?, ?)').bind(key, value).run()
    : await env.DASHBOARD_DB.prepare('UPDATE site_settings SET value = ? WHERE key = ? AND value = ?').bind(value, key, previous.raw).run();
  if (Number(result.meta?.changes ?? result.changes) !== 1) fail('Another administrator changed this draft. Reload before saving.', 409);
}
const mediaTypes = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'video/mp4': 'mp4', 'video/webm': 'webm' };
function validSignature(bytes, type) {
  const ascii = (offset, length) => new TextDecoder().decode(bytes.slice(offset, offset + length));
  if (type === 'image/png') return bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((v, i) => bytes[i] === v);
  if (type === 'image/jpeg') return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (type === 'image/gif') return ['GIF87a', 'GIF89a'].includes(ascii(0, 6));
  if (type === 'image/webp') return ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP';
  if (type === 'video/mp4') return ascii(4, 4) === 'ftyp';
  return [26,69,223,163].every((v, i) => bytes[i] === v);
}
export async function handleContentAdmin(request, env, user) {
  if (user?.role !== 'admin') fail('Administrator access is required.', 403);
  if (request.method !== 'GET' && request.headers.get('Origin') !== new URL(request.url).origin) fail('Refresh the page and try again.', 403);
  const path = new URL(request.url).pathname.replace(/\/$/, '');
  if (path === '/api/admin/media') {
    if (request.method !== 'POST') fail('Method not allowed.', 405);
    if (!env.CITY_MEDIA) fail('Media storage is not configured. Add the CITY_MEDIA R2 binding.', 503);
    const type = request.headers.get('Content-Type')?.split(';')[0];
    if (!mediaTypes[type]) fail('Upload a PNG, JPEG, WebP, GIF, MP4, or WebM file.', 415);
    const bytes = await boundedBytes(request, type.startsWith('video/') ? 25 * 1024 * 1024 : 8 * 1024 * 1024);
    if (!validSignature(bytes, type)) fail('The file does not match its media type.', 415);
    const filename = `${crypto.randomUUID()}.${mediaTypes[type]}`;
    await env.CITY_MEDIA.put(filename, bytes, { httpMetadata: { contentType: type } });
    return Response.json({ url: `/api/media/${filename}` }, { status: 201 });
  }
  const previous = await document(env);
  const state = previous.state;
  if (path === '/api/admin/content' && request.method === 'GET') return Response.json(state);
  const publish = path === '/api/admin/content/publish' && request.method === 'POST';
  if (!publish && !(path === '/api/admin/content' && request.method === 'PATCH')) fail('Method not allowed.', 405);
  const data = await jsonBody(request);
  if (!data || !Number.isSafeInteger(data.revision) || data.revision !== state.revision) fail('Another administrator changed this draft. Reload before saving.', 409);
  if (publish) {
    state.draft = validateSiteConfig(state.draft);
    const signature = config => JSON.stringify({ city: { name: config.city.name, authority: config.city.authority }, budget: { ...config.budget, version: undefined } });
    state.draft.budget.version = signature(state.draft) === signature(state.published)
      ? state.published.budget.version : `city-${crypto.randomUUID()}`;
    state.published = structuredClone(state.draft);
  } else {
    state.draft = validateSiteConfig(data.config);
    // Clients cannot choose the revision used to validate public submissions.
    state.draft.budget.version = state.published.budget.version;
  }
  state.revision += 1;
  await saveDocument(env, previous, state);
  return Response.json(state);
}
export async function handleSiteConfig(request, env) {
  const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
  if (request.method !== 'GET') return Response.json({ error: 'Method not allowed.' }, { status: 405, headers });
  try {
    if (new URL(request.url).searchParams.get('preview') === '1') {
      if ((await staffSession(request, env))?.role !== 'admin') return Response.json({ error: 'Administrator access is required.' }, { status: 403, headers });
      return Response.json(await loadDraftConfig(env), { headers });
    }
    return Response.json(await publishedSiteConfig(env), { headers });
  }
  catch { return Response.json({ error: 'Site configuration is temporarily unavailable.' }, { status: 503, headers }); }
}
export async function handleCityMedia(request, env) {
  const headers = new Headers({ 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store' });
  if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed.', { status: 405, headers });
  const filename = new URL(request.url).pathname.slice('/api/media/'.length);
  if (!/^[a-f0-9-]{36}\.(?:png|jpg|webp|gif|mp4|webm)$/.test(filename)) return new Response('Not found.', { status: 404, headers });
  if (!env.CITY_MEDIA) return new Response('Media storage is not configured.', { status: 503, headers });
  const metadata = await env.CITY_MEDIA.head(filename);
  if (!metadata) return new Response('Not found.', { status: 404, headers });
  headers.set('Content-Type', metadata.httpMetadata.contentType);
  headers.set('ETag', metadata.httpEtag);
  headers.set('Accept-Ranges', 'bytes');
  let range;
  const ifRange = request.headers.get('If-Range');
  const match = request.method === 'GET' && (!ifRange || ifRange === metadata.httpEtag) && /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('Range') || '');
  if (match && (match[1] || match[2])) {
    const start = match[1] ? Number(match[1]) : Math.max(0, metadata.size - Number(match[2]));
    const end = match[1] && match[2] ? Math.min(Number(match[2]), metadata.size - 1) : metadata.size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= metadata.size) {
      headers.set('Content-Range', `bytes */${metadata.size}`);
      return new Response(null, { status: 416, headers });
    }
    range = { offset: start, length: end - start + 1 };
    headers.set('Content-Range', `bytes ${start}-${end}/${metadata.size}`);
  }
  headers.set('Content-Length', String(range?.length ?? metadata.size));
  const body = request.method === 'HEAD' ? null : (await env.CITY_MEDIA.get(filename, range ? { range } : {}))?.body;
  return new Response(body, { status: range ? 206 : 200, headers });
}
