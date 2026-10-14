import { runtimeConfig } from './site-runtime.js';
import { budgetModel } from './budget-model.js';
import { formatMoney } from './key-facts.js';
// Budget data and Amendment 3 tax math. The millage and budget come from the
// published site content (City & branding and Budget in the dashboard).

// The city's operating millage, held constant for this illustration. It is not
// a forecast of the 2027 or 2028 rate.
export const CITY_MILLAGE = runtimeConfig().city.millage;
export const CURRENT_TOTAL_EXEMPTION = 51411; // today's exemption: $25k all millages + $26,411 non-school (2026, indexed)
export const REDUCTION_TARGET_M = runtimeConfig().budget.target / 1e6; // millions that must be cut before submitting
// Shared submission storage, served by Vite locally and Pages Functions in production.
export const SUBMIT_ENDPOINT = "/api/submissions";
export const FEEDBACK_ENDPOINT = "/api/feedback";

export const SERVICES = budgetModel().services;

export const PROPOSED_TOTAL = SERVICES.reduce((s, x) => s + Math.round(x.proposed * 1e8), 0) / 1e8; // Sum of the workbook’s net Cost Center - Everything amounts.

// Illustrative scenario bands, not validated service-level or staffing forecasts.
// Compare unrounded percentages; the displayed percentage is rounded separately.
export function serviceImpact(service, funding) {
  if (!Number.isFinite(funding) || service.proposed - funding < 0.05) return null;
  const cutPercent = Math.min(100, (service.proposed - Math.max(0, funding)) / service.proposed * 100);
  const level = cutPercent <= 17 + 1e-9 ? 0
    : cutPercent <= 33.5 + 1e-9 ? 1
    : cutPercent <= 50 + 1e-9 ? 2 : 3;
  return {
    cutPercent,
    level,
    text: funding <= 0
      ? "No funding remains for this service group in your plan. Its services would need another funding source to continue."
      : service.cutExamples[level],
  };
}

function currentHomesteadExemption(value) {
  // The additional current exemption starts above $50,000 of assessed value.
  return Math.min(value, 25000)
    + Math.min(Math.max(0, value - 50000), CURRENT_TOTAL_EXEMPTION - 25000);
}

// 2026 exemption baseline, using the same fixed millage as the savings estimates.
export function currentCityTax(assessedValue) {
  const value = Number.isFinite(assessedValue) ? Math.max(0, assessedValue) : 0;
  return ((value - currentHomesteadExemption(value)) * CITY_MILLAGE) / 1000;
}

// Yearly city-tax savings for a homestead under Amendment 3.
// Non-school exemption goes from ~$51,411 today to min(value, cap).
export function citySavings(assessedValue, capYear) {
  const value = Number.isFinite(assessedValue) ? Math.max(0, assessedValue) : 0;
  const cap = capYear >= 2028 ? 250000 : 150000;
  const newExempt = Math.min(value, cap);
  const currentExempt = currentHomesteadExemption(value);
  const added = Math.max(0, newExempt - currentExempt);
  return (added * CITY_MILLAGE) / 1000;
}

export const fmtUSD = value => formatMoney(value);

// Accept ordinary US currency pasted from a property record without turning
// cents into extra dollars (for example, 300,000.00 must remain 300000).
export function parseAssessedValue(input) {
  const normalized = String(input ?? '').replace(/[$,\s]/g, '');
  if (!/^\d+(?:\.\d{0,2})?$/.test(normalized)) return 0;
  const value = Number(normalized);
  return Number.isFinite(value) && value <= Number.MAX_SAFE_INTEGER ? value : 0;
}

// Small nonzero gaps must never look like zero before the target is met.
export const fmtM = (value) => {
  const n = Math.round(value * 1e8) / 1e8 || 0;
  return n !== 0 && Math.abs(n) < 0.01
    ? (n * 1e6).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 })
    : `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 2 })}M`;
};
