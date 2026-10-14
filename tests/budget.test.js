import test from 'node:test';
import assert from 'node:assert/strict';
import { citySavings, currentCityTax, serviceImpact, SERVICES, CITY_MILLAGE, PROPOSED_TOTAL, parseAssessedValue } from '../src/budget.js';

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.000001, `${actual} ≠ ${expected}`);

test('pasted assessed values preserve cents and never inflate currency amounts', () => {
  for (const value of ['300000', '300,000', '300,000.00', '$300,000.00', ' $ 300,000.00 ']) {
    assert.equal(parseAssessedValue(value), 300000);
    near(currentCityTax(parseAssessedValue(value)), currentCityTax(300000));
  }
  assert.equal(parseAssessedValue('$123,456.78'), 123456.78);
  assert.equal(parseAssessedValue('300000.'), 300000);
  for (const value of ['', '-300000', '(300,000)', '1.2.3', 'unknown', 'Infinity', '9007199254740992']) {
    assert.equal(parseAssessedValue(value), 0);
  }
});

test('current city tax baseline handles exemption bands and invalid values', () => {
  near(currentCityTax(300000), 1537.2992349);
  near(currentCityTax(25000), 0);
  near(currentCityTax(40000), 92.7615);
  near(currentCityTax(50000), 154.6025);
  near(currentCityTax(75000), 154.6025);
  near(currentCityTax(76411), 154.6025);
  for (const value of [-1, NaN, Infinity, undefined]) assert.equal(currentCityTax(value), 0);
  near(currentCityTax(300000) - citySavings(300000, 2027), 927.615);
  near(currentCityTax(300000) - citySavings(300000, 2028), 309.205);
});

test('illustrative city savings use the documented rate and annual exemption caps', () => {
  assert.equal(CITY_MILLAGE, 6.1841);
  near(citySavings(300000, 2027), 609.6842349);
  near(citySavings(300000, 2028), 1228.0942349);
  near(citySavings(1000000, 2028), citySavings(300000, 2028));
  near(PROPOSED_TOTAL, 41.98788216);
});

test('current exemption respects the $25,000–$50,000 taxable band at lower values', () => {
  near(citySavings(25000, 2027), 0);
  near(citySavings(40000, 2027), 92.7615);
  near(citySavings(50000, 2027), 154.6025);
  near(citySavings(75000, 2027), 154.6025);
  near(citySavings(76411, 2027), 154.6025);
});

test('invalid and negative assessed values cannot create fabricated savings', () => {
  for (const value of [-1, NaN, Infinity, undefined]) assert.equal(citySavings(value, 2027), 0);
});

test('service effects escalate at exact cut boundaries for every department', () => {
  for (const service of SERVICES) {
    for (const [percent, level] of [[10, 0], [17, 0], [17.01, 1], [33.5, 1], [33.51, 2], [50, 2], [50.01, 3], [85, 3]]) {
      const effect = serviceImpact(service, service.proposed * (1 - percent / 100));
      assert.equal(effect.level, level, `${service.id} at ${percent}%`);
      assert.equal(effect.text, service.cutExamples[level]);
      near(effect.cutPercent, percent);
    }
    assert.equal(new Set(service.cutExamples).size, 4);
    assert.match(serviceImpact(service, 0).text, /No funding remains/);
    assert.equal(serviceImpact(service, 0).cutPercent, 100);
    assert.equal(serviceImpact(service, service.proposed), null);
    assert.equal(serviceImpact(service, service.max), null);
    assert.equal(serviceImpact(service, NaN), null);
  }
});
