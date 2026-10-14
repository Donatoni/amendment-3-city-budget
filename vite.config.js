import { handleCityPropertyRequest } from './server/property-endpoint.js';
import { defineConfig, loadEnv } from 'vite';
import { renderPage, renderRobots, renderSitemap, siteURL } from './src/seo.js';
import { localDatabase } from './server/dashboard-local.js';
import { reviewerAccess } from './server/reviewer-vite.js';
import { readInstallation } from './scripts/lib/installation.mjs';

function propertyLookupAPI(env) {
  const configure = server => {
    server.middlewares.use('/api/property', async (req, res) => {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 1024) {
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Search is too long.' }));
          return;
        }
        chunks.push(chunk);
      }
      const request = new Request(`http://${req.headers.host || 'localhost'}/api/property${req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''}`, {
        method: req.method, headers: req.headers,
        ...(['GET', 'HEAD'].includes(req.method) ? {} : { body: Buffer.concat(chunks) }),
      });
      const response = await handleCityPropertyRequest(request, env);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(await response.text());
    });
  };
  return { name: 'property-lookup-api', configureServer: configure, configurePreviewServer: configure };
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  if (command === 'serve') env.DASHBOARD_DB = localDatabase();
  // The public address comes from SITE_URL or this installation's wrangler.jsonc,
  // never from another city's defaults.
  const url = siteURL(env.SITE_URL ?? (mode === 'production' ? readInstallation()?.siteURL || '' : ''));
  const indexable = command === 'build' && Boolean(url) && env.SEO_NOINDEX !== 'true';

  return {
    appType: 'mpa', // Unknown paths must return 404, not a duplicate home page.
    plugins: [reviewerAccess(env), propertyLookupAPI(env), {
      name: 'static-seo',
      transformIndexHtml: { order: 'pre', handler: (html, context) => context.path.startsWith('/admin') ? html : renderPage(html, url, indexable) },
      buildStart() {
        if (command === 'build' && !url) this.warn('SITE_URL is unset: building a noindex preview without a canonical URL or sitemap. Set the public HTTPS origin for launch.');
      },
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'robots.txt', source: renderRobots(url, indexable) });
        if (url && indexable) this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: renderSitemap(url) });
      },
    }],
    build: { chunkSizeWarningLimit: 500, rolldownOptions: { input: { main: 'index.html', admin: 'admin/index.html' } } },
  };
});
