const pageForSection = section => ({ privacy: '/privacy', login: '/login', launch: '/coming-soon' })[section] || '/';

export function actualPreviewMarkup() {
  return `<aside class="ce-actual-preview" aria-label="Live website preview">
    <div class="ce-preview-controls"><div><strong>Live website preview</strong><p id="ce-preview-status" role="status">Loading your site…</p></div><button type="button" class="button secondary small" id="ce-preview-expand" aria-expanded="false">Expand preview</button></div>
    <div class="ce-preview-options"><div class="ce-preview-choice" role="group" aria-label="Preview screen size"><button type="button" data-preview-width="desktop" aria-pressed="true">Desktop</button><button type="button" data-preview-width="mobile" aria-pressed="false">Mobile</button></div><div class="ce-preview-choice" role="group" aria-label="Preview interaction"><button type="button" data-preview-mode="select" aria-pressed="true">Click to edit</button><button type="button" data-preview-mode="interact" aria-pressed="false">Try the site</button></div><button type="button" class="ce-preview-refresh" id="ce-preview-refresh">Refresh</button></div>
    <p class="ce-actual-help" id="ce-preview-help">Click text, images, or links in the site to find their settings. Changes appear here before saving.</p>
    <div class="ce-preview-viewport"><div class="ce-preview-stage"><iframe id="ce-site-preview" title="Your website with unsaved content changes" sandbox="allow-scripts allow-same-origin" referrerpolicy="same-origin"></iframe></div></div>
    <p class="ce-preview-footnote">Actual website · private draft preview · no publishing or visitor submissions</p>
  </aside>`;
}

// The frame is reloaded only after content changes settle. Every load receives a
// fresh snapshot before public application modules start, including their state.
export function createSitePreview(root, { getConfig, getContext, onSelect, windowRef = window }) {
  const panel = root.querySelector('.ce-actual-preview');
  const frame = panel.querySelector('#ce-site-preview');
  const status = panel.querySelector('#ce-preview-status');
  const viewport = panel.querySelector('.ce-preview-viewport');
  const stage = panel.querySelector('.ce-preview-stage');
  const origin = windowRef.location?.origin;
  let timer, timeout, disposed = false, ready = false, currentPage = '', width = 'desktop', mode = 'select';
  let sequence = 0;
  const setStatus = text => { status.textContent = text; };
  const post = () => {
    if (!ready || disposed || !origin || !frame.contentWindow) return;
    frame.contentWindow.postMessage({ type: 'city-editor:render', config: getConfig(), ...getContext(), mode }, origin);
  };
  const resize = () => {
    const nativeWidth = width === 'mobile' ? 390 : 1280;
    const available = viewport.clientWidth || nativeWidth;
    const scale = Math.min(1, available / nativeWidth);
    const expanded = panel.classList.contains('ce-preview-expanded');
    const height = expanded ? Math.max(360, (windowRef.innerHeight || 900) - 235) : 540;
    frame.style.width = `${nativeWidth}px`;
    frame.style.height = `${Math.round(height / scale)}px`;
    frame.style.transform = `scale(${scale})`;
    stage.style.width = `${nativeWidth * scale}px`;
    stage.style.height = `${height}px`;
  };
  const load = () => {
    if (disposed || !getConfig()) return;
    clearTimeout(timer); clearTimeout(timeout);
    currentPage = pageForSection(getContext().section); ready = false;
    setStatus('Updating preview…');
    frame.src = `${currentPage}?contentPreview=1&editorPreview=1&previewVersion=${++sequence}`;
    timeout = setTimeout(() => setStatus('Preview is taking longer than expected. Refresh it or check your staff sign-in.'), 20000);
    timeout.unref?.();
  };
  const message = event => {
    if (disposed || !origin || event.origin !== origin || event.source !== frame.contentWindow) return;
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'city-editor:ready') { ready = true; post(); }
    else if (data.type === 'city-editor:rendered') { clearTimeout(timeout); setStatus('Showing your current edits'); }
    else if (data.type === 'city-editor:error') { clearTimeout(timeout); setStatus(typeof data.message === 'string' ? `Preview: ${data.message}` : 'Preview could not load. Try refreshing.'); }
    else if (data.type === 'city-editor:select' && Array.isArray(data.path) && data.path.length && data.path.length <= 8 && data.path.every(part => typeof part === 'string' || Number.isInteger(part))) {
      if (panel.classList.contains('ce-preview-expanded')) {
        panel.classList.remove('ce-preview-expanded');
        const button = panel.querySelector('#ce-preview-expand'); button.setAttribute('aria-expanded', 'false'); button.textContent = 'Expand preview'; resize();
      }
      onSelect(data.path);
    }
  };
  const click = event => {
    const button = event.target.closest('button');
    if (!button || !panel.contains(button)) return;
    if (button.dataset.previewWidth) {
      width = button.dataset.previewWidth;
      panel.querySelectorAll('[data-preview-width]').forEach(item => item.setAttribute('aria-pressed', String(item.dataset.previewWidth === width)));
      resize();
    }
    if (button.dataset.previewMode) {
      mode = button.dataset.previewMode;
      panel.querySelectorAll('[data-preview-mode]').forEach(item => item.setAttribute('aria-pressed', String(item.dataset.previewMode === mode)));
      panel.querySelector('#ce-preview-help').textContent = mode === 'select' ? 'Click text, images, or links in the site to find their settings. Changes appear here before saving.' : 'Try menus, the calculator, budget choices, and sharing. Changes here do not publish content or save visitor submissions.';
      post();
    }
    if (button.id === 'ce-preview-refresh') load();
    if (button.id === 'ce-preview-expand') {
      const expanded = panel.classList.toggle('ce-preview-expanded');
      button.setAttribute('aria-expanded', String(expanded)); button.textContent = expanded ? 'Close expanded preview' : 'Expand preview'; resize();
    }
  };
  const keydown = event => {
    if (event.key === 'Escape' && panel.classList.contains('ce-preview-expanded')) {
      panel.classList.remove('ce-preview-expanded');
      const button = panel.querySelector('#ce-preview-expand'); button.setAttribute('aria-expanded', 'false'); button.textContent = 'Expand preview'; button.focus(); resize();
    }
  };
  panel.addEventListener('click', click);
  windowRef.addEventListener('message', message); windowRef.addEventListener('resize', resize); windowRef.addEventListener('keydown', keydown);
  const observer = typeof windowRef.ResizeObserver === 'function' ? new windowRef.ResizeObserver(resize) : null;
  observer?.observe(viewport); resize(); load();
  return {
    contentChanged() {
      clearTimeout(timer); setStatus('Updating preview…');
      if (ready) { timer = setTimeout(load, 500); timer.unref?.(); }
    },
    contextChanged() {
      if (pageForSection(getContext().section) !== currentPage) load();
      else post();
    },
    destroy() {
      disposed = true; clearTimeout(timer); clearTimeout(timeout); observer?.disconnect();
      panel.removeEventListener('click', click);
      windowRef.removeEventListener('message', message); windowRef.removeEventListener('resize', resize); windowRef.removeEventListener('keydown', keydown);
    },
  };
}
