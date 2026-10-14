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

// Budget challenge funnel events. Each step is sent at most once per page load,
// and each later step also sends any earlier step that was skipped (for
// example, submitting a shared plan without changes), so started >= target met
// >= submitted and the difference is abandonment. Without a measurement ID
// there is no gtag, and nothing is sent.
const CHALLENGE_STEPS = ['challenge_start', 'challenge_target_met', 'challenge_submit'];

export function createChallengeTracker(send = (...args) => globalThis.gtag?.(...args)) {
  const sent = new Set();
  function reach(step) {
    for (const name of CHALLENGE_STEPS.slice(0, CHALLENGE_STEPS.indexOf(step) + 1)) {
      if (sent.has(name)) continue;
      sent.add(name);
      try { send('event', name); } catch { /* Analytics must never break the challenge. */ }
    }
  }
  return {
    started: () => reach('challenge_start'),
    // Only counts once the resident has started, so loading a shared plan that
    // already meets the target is not reported as progress.
    targetMet: () => { if (sent.has('challenge_start')) reach('challenge_target_met'); },
    submitted: () => reach('challenge_submit'),
  };
}
