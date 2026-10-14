import { parseHTML } from 'linkedom';
import { applyConfiguredDocument } from '../src/site-document.js';

export function editorEntrySource(html) {
  const sources = [...parseHTML(html).document.querySelectorAll('script[type="module"][src]')]
    .map(script => script.getAttribute('src'));
  return sources.find(source => source.split('?')[0] === '/src/site-entry.js')
    || sources.find(source => !source.startsWith('/@vite/') && !source.startsWith('/@react-refresh'));
}

// The editor must start from the original template: applying copy twice would
// lose stable text-node positions and edits to fields removed by a saved draft.
export function editorPreviewHTML(html, entrySource) {
  const { document } = parseHTML(html);
  const entry = entrySource || editorEntrySource(html);
  if (!entry) throw new Error('The editor preview entry point is unavailable.');
  for (const script of document.querySelectorAll('script')) script.remove();
  for (const preload of document.querySelectorAll('link[rel="preload"][as="image"]')) preload.remove();
  document.documentElement.dataset.editorPreview = '1';
  document.documentElement.style.visibility = 'hidden';
  const script = document.createElement('script');
  script.type = 'module'; script.src = entry; document.body.append(script);
  return document.toString();
}

export function editorPreviewResponse(response, entrySource) {
  return response.text().then(html => {
    const headers = new Headers(response.headers);
    for (const key of ['Content-Length', 'Content-Encoding', 'ETag']) headers.delete(key);
    headers.set('Cache-Control', 'private, no-store'); headers.set('X-Robots-Tag', 'noindex, nofollow');
    headers.set('Content-Security-Policy', "frame-ancestors 'self'; form-action 'none'");
    return new Response(editorPreviewHTML(html, entrySource), { status: response.status, headers });
  });
}

export function renderConfiguredHTML(html, config, options = {}) {
  const { document } = parseHTML(html);
  applyConfiguredDocument(document, config, options);
  return document.toString();
}

export function configuredHTMLResponse(response, config, options = {}) {
  if (!response.headers.get('Content-Type')?.includes('text/html')) return response;
  return response.text().then(html => {
    const headers = new Headers(response.headers);
    for (const key of ['Content-Length', 'Content-Encoding', 'ETag']) headers.delete(key);
    headers.set('Cache-Control', 'private, no-store');
    if (options.preview) headers.set('X-Robots-Tag', 'noindex, nofollow');
    return new Response(renderConfiguredHTML(html, config, options), { status: response.status, headers });
  });
}
