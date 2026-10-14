import { runtimeConfig } from './site-runtime.js';
import { formatMoney } from './key-facts.js';
import { CITY_MILLAGE, CURRENT_TOTAL_EXEMPTION, currentCityTax } from './budget.js';

const cents = value => Math.round((value + Number.EPSILON) * 100);
export const taxMoney = value => formatMoney(value);
export const taxEquation = row => `${taxMoney(row.before)} − ${taxMoney(row.savings)} ≈ ${taxMoney(row.remaining)}`;

export function taxComparison(assessedValue, property = null) {
  const value = Number.isFinite(assessedValue) ? Math.max(0, assessedValue) : 0;
  const tax = property?.cityTax;
  const fromCounty = property?.inCity === true && property.year === 2026
    && property.assessedValue === value && tax?.kind === 'estimate'
    && [tax.amount, tax.taxableValue, tax.millage].every(n => Number.isFinite(n) && n >= 0)
    && tax.taxableValue <= value
    && Math.abs(tax.amount - tax.taxableValue * tax.millage / 1000) <= 0.02;
  const homestead = property?.homestead !== false;
  const millage = fromCounty ? tax.millage : CITY_MILLAGE;
  const standardExemption = Math.min(value, 25000)
    + Math.min(Math.max(0, value - 50000), CURRENT_TOTAL_EXEMPTION - 25000);
  const taxableValue = fromCounty ? tax.taxableValue : value - (homestead ? standardExemption : 0);
  const baselineCents = cents(fromCounty ? tax.amount : homestead ? currentCityTax(value) : value * millage / 1000);
  return {
    fromCounty, homestead, millage, taxableValue, baseline: baselineCents / 100,
    years: [2027, 2028].map(year => {
      const cap = year === 2027 ? 150000 : 250000;
      const addedExemption = homestead ? Math.max(0, Math.min(value, cap) - standardExemption) : 0;
      // Retain the county's other exemptions and never save more than city tax.
      const remainingCents = addedExemption === 0 ? baselineCents
        : Math.min(baselineCents, cents(Math.max(0, taxableValue - addedExemption) * millage / 1000));
      return { year, cap, before: baselineCents / 100,
        savings: (baselineCents - remainingCents) / 100, remaining: remainingCents / 100 };
    }),
  };
}

export function renderTaxComparison(value, property = null, root = document) {
  const model = taxComparison(value, property);
  const set = (id, text) => { root.querySelector(`#${id}`).textContent = text; };
  set('tax-2026', taxMoney(model.baseline));
  set('calc-baseline-label', model.fromCounty ? `County estimate · ${property.rollStatus} roll` : 'Modeled estimate');
  set('calc-baseline-note', model.fromCounty
    ? `VCPA’s published estimate · 2026 ${property.rollStatus} roll · ${property.cityTax.rateStatus} rate. Not a final tax bill.`
    : property
      ? `2026 county city-tax amount unavailable. Modeled from the selected ${property.year} assessed value; ${model.homestead ? 'standard homestead only' : 'no exemptions assumed'}.`
      : 'Estimated city tax with standard homestead. Search for your property to use its 2026 county tax amount.');
  for (const row of model.years) {
    set(`save-${row.year}`, taxMoney(row.savings));
    set(`remaining-${row.year}`, taxMoney(row.remaining));
    set(`equation-${row.year}`, taxEquation(row));
  }
  set('calc-rate-description', model.fromCounty
    ? `Holds the county record’s ${model.millage} mills, assessed value, and other exemptions constant. Each year’s savings is compared with 2026, not added to the prior year.`
    : `Holds ${runtimeConfig().city.name}’s illustrative rate of ${model.millage} mills and assessed value constant. Each year’s savings is compared with 2026, not added to the prior year.`);
  set('calc-tax-reminder', model.years.every(row => row.remaining === 0)
    ? 'This estimate leaves $0 in city tax. School taxes and other charges may still apply.'
    : 'School taxes and other charges are separate.');
  return model;
}
