import { dashboardStore } from './dashboard-store.js';
import { GOOGLE_ANALYTICS_SETTING, normalizeAnalyticsId } from '../src/analytics.js';

// Fail closed if the binding or migration is unavailable. Never cache a launch
// setting across requests: changes must take effect for anonymous visitors.
export async function comingSoonEnabled(env) {
  try { return (await dashboardStore(env).setting('coming_soon'))?.value !== 'false'; }
  catch { return true; }
}
// Analytics fails open to "off": a storage problem must never break pages.
export async function googleAnalyticsId(env) {
  try { return normalizeAnalyticsId((await dashboardStore(env).setting(GOOGLE_ANALYTICS_SETTING))?.value) || ''; }
  catch { return ''; }
}
