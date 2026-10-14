// Google Analytics 4 is opt-in per installation. Staff enter a measurement ID
// in Site settings; nothing is sent to Google until they do.
export const GOOGLE_ANALYTICS_SETTING = 'google_analytics_id';
const pattern = /^G-[A-Z0-9]{4,20}$/;

// Returns the normalized ID, '' for "off", or null when the value is invalid.
export function normalizeAnalyticsId(value) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') return null;
  const id = value.trim().toUpperCase();
  if (!id) return '';
  return pattern.test(id) ? id : null;
}

export function injectAnalytics(document, analyticsId) {
  const id = normalizeAnalyticsId(analyticsId);
  if (!id || !document.head) return;
  const loader = document.createElement('script');
  loader.setAttribute('async', '');
  loader.setAttribute('src', `https://www.googletagmanager.com/gtag/js?id=${id}`);
  const init = document.createElement('script');
  // The ID is validated against a strict pattern above, so it is safe inline.
  init.textContent = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${id}');`;
  document.head.prepend(init);
  document.head.prepend(loader);
}
