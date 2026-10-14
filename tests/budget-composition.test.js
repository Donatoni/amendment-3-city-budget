import test from 'node:test';
import assert from 'node:assert/strict';
import { budgetComposition } from '../src/budget-composition.js';
import { SERVICES, PROPOSED_TOTAL } from '../src/budget.js';

const proposed = SERVICES.map(service => service.proposed);
const totalPercent = result => result.percentages.reduce((sum, percentage) => sum + percentage, 0);

test('budget visualization preserves reductions as empty space instead of reallocating them', () => {
  const unchanged = budgetComposition(proposed);
  assert.ok(Math.abs(totalPercent(unchanged) - 100) < 1e-9);
  const reduced = budgetComposition(proposed.map(value => value / 2));
  assert.ok(Math.abs(totalPercent(reduced) - 50) < 1e-9);
  assert.ok(Math.abs(reduced.total - PROPOSED_TOTAL / 2) < 1e-9);
  assert.match(reduced.description, /Fire Department: \$6.28M/);
});

test('budget visualization fits added spending and handles a completely unfunded plan', () => {
  const expanded = budgetComposition(SERVICES.map(service => service.max));
  assert.ok(Math.abs(totalPercent(expanded) - 100) < 1e-9);
  assert.ok(expanded.total > PROPOSED_TOTAL);
  const empty = budgetComposition(SERVICES.map(() => 0));
  assert.equal(empty.total, 0);
  assert.equal(totalPercent(empty), 0);
  assert.match(empty.description, /\$41.99M reduced/);
});
