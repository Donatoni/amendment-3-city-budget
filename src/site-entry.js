import { configureSite } from './site-runtime.js';

async function start() {
  if (new URL(location.href).searchParams.get('editorPreview') === '1') {
    const { startEditorPreview } = await import('./editor-preview-runtime.js');
    await startEditorPreview();
    return;
  }
  const embedded = document.querySelector('#city-site-config');
  if (embedded) configureSite(JSON.parse(embedded.textContent));
  else {
    const preview = new URL(location.href).searchParams.get('contentPreview') === '1';
    const response = await fetch(`/api/site-config${preview ? '?preview=1' : ''}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Site configuration is unavailable. Please reload.');
    const value = await response.json();
    configureSite(value.config || value);
  }
  if (location.pathname.startsWith('/admin')) await import('./dashboard.js');
  else await import('./main.js');
}
start().catch(error => {
  if (new URL(location.href).searchParams.get('editorPreview') === '1') {
    document.documentElement.style.visibility = 'visible';
    if (window.parent !== window) window.parent.postMessage({ type: 'city-editor:error', message: error.message }, location.origin);
  }
  const notice = document.createElement('p');
  notice.setAttribute('role', 'alert');
  notice.textContent = error.message;
  document.body.prepend(notice);
});
