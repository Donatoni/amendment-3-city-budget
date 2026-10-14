import { defaultSiteConfig } from './site-defaults.js';
import { tokenValues, formatMoney, TOKEN_PATTERN } from './key-facts.js';

// Browser configuration is set once before application modules are imported.
// Server handlers pass configuration explicitly; never mutate shared worker state.
let current;
export const runtimeConfig = () => current || defaultSiteConfig;
export function configureSite(config) { current = config; }
export { escapeHTML as escapeText } from './markdown.js';
export function expandCopy(value, config = runtimeConfig()) {
  const { values, money } = tokenValues(config);
  return String(value ?? '').replace(TOKEN_PATTERN, (match, key, style) => {
    if (values[key] === undefined) return match;
    // A blank fact shows nothing rather than its code; the review list flags it.
    if (values[key] === null || values[key] === '') return '';
    return money.has(key) ? formatMoney(values[key], style) : String(values[key]);
  });
}
