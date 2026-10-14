import test from 'node:test';
import assert from 'node:assert/strict';
import { taxComparison, renderTaxComparison } from '../src/tax-comparison.js';
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';

const property = {
  year: 2026, rollStatus: 'working', inCity: true, homestead: true, assessedValue: 300000,
  cityTax: { amount: 1670.12, taxableValue: 238589, millage: 7, rateStatus: 'proposed', kind: 'estimate' },
};

test('manual entry shows complete annual equations with cent-exact totals', () => {
  const model = taxComparison(300000);
  assert.equal(model.fromCounty, false);
  assert.equal(model.baseline, 1537.30);
  assert.deepEqual(model.years.map(({ savings, remaining }) => ({ savings, remaining })), [
    { savings: 609.68, remaining: 927.62 }, { savings: 1228.09, remaining: 309.21 },
  ]);
});

test('display rounds to whole dollars without changing the cent-exact model', () => {
  const { document } = parseHTML(readFileSync(new URL('../index.html', import.meta.url), 'utf8'));
  const model = renderTaxComparison(300000, null, document);
  assert.equal(document.querySelector('#tax-2026').textContent, '$1,537');
  assert.equal(document.querySelector('#save-2027').textContent, '$610');
  assert.equal(document.querySelector('#remaining-2027').textContent, '$928');
  assert.equal(document.querySelector('#equation-2027').textContent, '$1,537 − $610 ≈ $928');
  assert.equal(model.baseline, 1537.30);
  assert.equal(model.years[0].savings, 609.68);
  assert.equal(model.years[0].remaining, 927.62);
});

test('record uses published city amount, rate, and taxable value including other exemptions', () => {
  const model = taxComparison(300000, property);
  assert.equal(model.fromCounty, true);
  assert.equal(model.baseline, 1670.12);
  assert.equal(model.millage, 7);
  assert.equal(model.years[0].remaining, 980);
  assert.equal(model.years[0].savings, 690.12);
  assert.equal(model.years[1].remaining, 280);
  assert.equal(model.years[1].savings, 1390.12);
});

test('non-homesteaded and fully exempt records cannot receive invented savings', () => {
  for (const p of [{ ...property, homestead: false },
    { ...property, cityTax: { ...property.cityTax, taxableValue: 0, amount: 0 } }]) {
    const model = taxComparison(300000, p);
    for (const row of model.years) {
      assert.equal(row.savings, 0);
      assert.equal(row.remaining, model.baseline);
    }
  }
  const noTax = taxComparison(300000, { ...property, homestead: false, cityTax: null });
  assert.equal(noTax.baseline, 1855.23);
  assert.equal(noTax.years[0].savings, 0);
});

test('old/future rolls, mismatched values, and incomplete or invalid taxes use labeled fallback', () => {
  const { document } = parseHTML(readFileSync(new URL('../index.html', import.meta.url), 'utf8'));
  for (const p of [{ ...property, year: 2025 }, { ...property, year: 2027 },
    { ...property, cityTax: null }, { ...property, assessedValue: 400000 },
    { ...property, cityTax: { ...property.cityTax, amount: NaN } }]) {
    const model = renderTaxComparison(300000, p, document);
    assert.equal(model.fromCounty, false);
    assert.equal(model.baseline, 1537.30);
    assert.match(document.querySelector('#calc-baseline-note').textContent, /unavailable/);
    assert.match(document.querySelector('#calc-baseline-label').textContent, /modeled/i);
  }
});

test('low values, large values, exemption boundaries, and invalid values stay bounded', () => {
  for (const value of [0, 25000, 40000, 50000, 75000, 76411, 150000, 250000, 300000, 9000000, -1, NaN, Infinity]) {
    const model = taxComparison(value);
    for (const row of model.years) {
      assert.ok(row.savings >= 0 && row.savings <= row.before);
      assert.ok(row.remaining >= 0);
      assert.equal(Math.round(row.savings * 100) + Math.round(row.remaining * 100), Math.round(row.before * 100));
    }
  }
  const { document } = parseHTML(readFileSync(new URL('../index.html', import.meta.url), 'utf8'));
  renderTaxComparison(100000, null, document);
  assert.match(document.querySelector('#calc-tax-reminder').textContent, /leaves \$0/);
  assert.match(document.querySelector('#calc-tax-reminder').textContent, /School taxes/);
});
