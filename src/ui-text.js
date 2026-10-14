import { postcardCopy } from './site-postcard-copy.js';
import { runtimeConfig, escapeText } from './site-runtime.js';
import { siteUICopy } from './site-ui-copy.js';
import { formatMoney } from './key-facts.js';

export function uiText(key, variables = {}, config = runtimeConfig()) {
  const value = config.copy?.[key] ?? siteUICopy[key] ?? postcardCopy[key] ?? key;
  const tokens = { ...config.city, city: config.city.name, target: formatMoney(config.budget.target), ...variables };
  return String(value).replace(/\{\{(\w+)\}\}/g, (match, token) => Object.hasOwn(tokens, token) ? String(tokens[token]) : match);
}
export const uiHTML = (key, variables, config) => escapeText(uiText(key, variables, config));
