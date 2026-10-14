import { loadPublishedConfig } from '../server/city-content.js';
import { escapeText } from '../src/site-runtime.js';

export async function onRequest({ request, env }) {
  if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed.', { status: 405 });
  const config = await loadPublishedConfig(env);
  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${escapeText(config.city.url)}</loc></url></urlset>`;
  return new Response(request.method === 'HEAD' ? null : xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'no-store' } });
}
