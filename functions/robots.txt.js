import { loadPublishedConfig } from '../server/city-content.js';

export async function onRequest({ request, env }) {
  if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed.', { status: 405 });
  const config = await loadPublishedConfig(env);
  const productionHost = new URL(config.city.url).host === new URL(request.url).host;
  return new Response(request.method === 'HEAD' ? null : `User-agent: *\nAllow: /\n${productionHost ? `Sitemap: ${new URL('/sitemap.xml', config.city.url)}\n` : ''}`, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
}
