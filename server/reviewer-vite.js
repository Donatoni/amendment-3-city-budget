import { comingSoonEnabled, googleAnalyticsId } from './site-settings.js';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { handleDashboardRequest } from './dashboard-api.js';
import { reviewerGate, publicAssets } from './reviewer-access.js';
import { handleSiteConfig, handleCityMedia, loadPublishedConfig, loadDraftConfig } from './city-content.js';
import { localMediaBucket } from './city-media-local.js';
import { renderConfiguredHTML, editorPreviewHTML, editorEntrySource } from './site-html.js';
import { staffSession } from './staff-auth.js';

export function reviewerAccess(env) {
  env.CITY_MEDIA ||= localMediaBucket();
  const configure = server => {
    server.middlewares.use(async (req, res, next) => {
      try {
        const headers = new Headers();
        for (const [name, value] of Object.entries(req.headers)) if (value) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
        headers.set('CF-Connecting-IP', req.socket.remoteAddress || 'local');
        const request = new Request(`http://${req.headers.host || 'localhost'}${req.url}`, {
          method: req.method, headers,
          ...(['GET', 'HEAD'].includes(req.method) ? {} : { body: req, duplex: 'half' }),
        });
        const requestURL = new URL(request.url);
        const editorPreview = requestURL.searchParams.get('editorPreview') === '1';
        const wantsPreview = requestURL.searchParams.get('contentPreview') === '1' || editorPreview;
        const preview = wantsPreview && (await staffSession(request, env))?.role === 'admin';
        if (wantsPreview && !preview) {
          res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store' });
          res.end('Administrator access is required to preview draft content.');
          return;
        }
        if (editorPreview && requestURL.searchParams.get('contentPreview') !== '1') {
          res.writeHead(400); res.end('Draft preview mode is required.'); return;
        }
        if (editorPreview && (request.method !== 'GET' || !['/', '/index.html', '/privacy', '/privacy/', '/privacy.html', '/login', '/login/', '/login.html', '/coming-soon', '/coming-soon/', '/coming-soon.html'].includes(requestURL.pathname))) {
          res.writeHead(request.method !== 'GET' ? 405 : 404); res.end('Preview page unavailable.'); return;
        }
        let response = editorPreview ? null : await reviewerGate(request, env, async filename => new Response(await readFile(new URL(`../public/${filename}`, import.meta.url)), { headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
        if (editorPreview && !['/', '/index.html'].includes(requestURL.pathname)) {
          const filename = requestURL.pathname.replace(/^\//, '').replace(/\/$/, '').replace(/\.html$/, '') + '.html';
          response = new Response(await readFile(new URL(`../public/${filename}`, import.meta.url)), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        }
        if (!response && /^\/api\/(?:admin(?:\/|$)|(?:submissions|feedback)(?:\/|$))/.test(new URL(request.url).pathname)) response = await handleDashboardRequest(request, env);
        if (!response && new URL(request.url).pathname === '/api/site-config') response = await handleSiteConfig(request, env);
        if (!response && new URL(request.url).pathname.startsWith('/api/media/')) response = await handleCityMedia(request, env);
        if (response) {
          if (request.method !== 'HEAD' && response.headers.get('Content-Type')?.includes('text/html')) {
            const html = await response.text();
            const entry = editorPreview ? (server.transformIndexHtml ? '/src/site-entry.js'
              : editorEntrySource(await readFile(resolve(server.config.root, server.config.build.outDir, 'index.html'), 'utf8'))) : null;
            const rendered = editorPreview ? editorPreviewHTML(html, entry)
              : renderConfiguredHTML(html, preview ? await loadDraftConfig(env) : await loadPublishedConfig(env), { preview, url: request.url, analyticsId: await googleAnalyticsId(env) });
            response = new Response(rendered, { status: response.status, headers: response.headers });
            if (editorPreview) {
              response.headers.set('Cache-Control', 'private, no-store'); response.headers.set('X-Robots-Tag', 'noindex, nofollow');
              response.headers.set('Content-Security-Policy', "frame-ancestors 'self'; form-action 'none'");
            }
            response.headers.delete('Content-Length');
            response.headers.delete('Content-Encoding');
          }
          const responseHeaders = Object.fromEntries(response.headers);
          if (response.headers.getSetCookie().length) responseHeaders['set-cookie'] = response.headers.getSetCookie();
          res.writeHead(response.status, responseHeaders);
          res.end(Buffer.from(await response.arrayBuffer()));
          return;
        }
        if (!publicAssets.has(new URL(request.url).pathname)) {
          res.setHeader('Cache-Control', 'private, no-store');
          if (/^\/(?:admin|api)(?:[/.]|$)/.test(new URL(request.url).pathname) || await comingSoonEnabled(env)) res.setHeader('X-Robots-Tag', 'noindex, nofollow');
        }
        // Vite serves normal HTML downstream. Apply saved content to that HTML
        // too, after its own transforms, using configuration scoped to this request.
        const originalWrite = res.write.bind(res);
        const originalEnd = res.end.bind(res);
        const htmlChunks = [];
        const isHTML = () => req.method !== 'HEAD' && String(res.getHeader('Content-Type') || '').includes('text/html');
        res.write = (chunk, encoding, callback) => {
          if (!isHTML()) return originalWrite(chunk, encoding, callback);
          htmlChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, typeof encoding === 'string' ? encoding : undefined));
          if (typeof encoding === 'function') encoding();
          else if (callback) callback();
          return true;
        };
        res.end = (chunk, encoding, callback) => {
          if (!isHTML()) return originalEnd(chunk, encoding, callback);
          if (chunk) htmlChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, typeof encoding === 'string' ? encoding : undefined));
          const finish = async () => {
            const template = Buffer.concat(htmlChunks).toString('utf8');
            const html = editorPreview ? editorPreviewHTML(template)
              : renderConfiguredHTML(template, preview ? await loadDraftConfig(env) : await loadPublishedConfig(env), { preview, url: request.url, analyticsId: await googleAnalyticsId(env) });
            if (editorPreview) { res.setHeader('X-Robots-Tag', 'noindex, nofollow'); res.setHeader('Content-Security-Policy', "frame-ancestors 'self'; form-action 'none'"); }
            res.removeHeader('Content-Length'); res.removeHeader('Content-Encoding'); res.removeHeader('ETag');
            originalEnd(html, 'utf8', typeof encoding === 'function' ? encoding : callback);
          };
          finish().catch(error => { res.write = originalWrite; res.end = originalEnd; next(error); });
          return res;
        };
        next();
      } catch (error) { next(error); }
    });
  };
  return { name: 'reviewer-access', configureServer: configure, configurePreviewServer: configure };
}
