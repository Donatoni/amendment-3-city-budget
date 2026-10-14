import { comingSoonEnabled, googleAnalyticsId } from '../server/site-settings.js';
import { reviewerGate, privateResponse, publicAssets } from '../server/reviewer-access.js';
import { loadPublishedConfig, loadDraftConfig } from '../server/city-content.js';
import { configuredHTMLResponse, editorEntrySource, editorPreviewResponse } from '../server/site-html.js';
import { staffSession } from '../server/staff-auth.js';

export async function onRequest(context) {
  const { request, env } = context;
  const requestURL = new URL(request.url);
  if (requestURL.searchParams.get('editorPreview') === '1') {
    if ((await staffSession(request, env))?.role !== 'admin') return new Response('Administrator access is required.', { status: 403, headers: { 'Cache-Control': 'no-store' } });
    if (requestURL.searchParams.get('contentPreview') !== '1') return new Response('Draft preview mode is required.', { status: 400 });
    if (request.method !== 'GET') return new Response('Method not allowed.', { status: 405 });
    const page = requestURL.pathname.replace(/\/$/, '') || '/';
    if (!['/', '/index.html', '/privacy', '/privacy.html', '/login', '/login.html', '/coming-soon', '/coming-soon.html'].includes(page)) return new Response('Preview page not found.', { status: 404 });
    const home = await env.ASSETS.fetch(new Request(new URL('/', request.url)));
    const homeHTML = await home.text();
    const source = editorEntrySource(homeHTML);
    const response = ['/', '/index.html'].includes(page)
      ? new Response(homeHTML, { status: home.status, headers: home.headers })
      : await env.ASSETS.fetch(new Request(new URL(page, request.url)));
    return editorPreviewResponse(response, source);
  }
  const response = await reviewerGate(request, env, filename => env.ASSETS.fetch(new Request(new URL(`/${filename.replace(/\.html$/, '')}`, request.url))));
  const path = new URL(request.url).pathname;
  const preview = new URL(request.url).searchParams.get('contentPreview') === '1';
  if (preview && (await staffSession(request, env))?.role !== 'admin') return new Response('Administrator access is required.', { status: 403, headers: { 'Cache-Control': 'no-store' } });
  const configure = async result => request.method !== 'HEAD' && result.headers.get('Content-Type')?.includes('text/html')
    ? configuredHTMLResponse(result, preview ? await loadDraftConfig(env) : await loadPublishedConfig(env), { preview, url: request.url, analyticsId: await googleAnalyticsId(env) }) : result;
  if (response) return configure(response);
  // City media remains available to the branded holding page, while write APIs
  // independently require an administrator. Media files have unguessable IDs.
  let result = await context.next();
  if (!path.startsWith('/share')) result = await configure(result);
  if (publicAssets.has(path)) return result;
  const responseHeaders = privateResponse(result, request.method);
  if (!/^\/(?:admin|api)(?:[/.]|$)/.test(path) && !await comingSoonEnabled(env)) responseHeaders.headers.delete('X-Robots-Tag');
  return responseHeaders;
}
