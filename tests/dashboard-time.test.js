import test from 'node:test';
import assert from 'node:assert/strict';
import { dashboardDate, dashboardDay, dashboardTimestamp, shiftDay } from '../src/dashboard-time.js';
import { dateRange } from '../server/dashboard-api.js';

test('admin timestamps follow Eastern standard and daylight time', () => {
  assert.equal(dashboardTimestamp('2026-01-15T02:30:00Z'), 'Jan 14, 2026, 09:30:00 PM EST');
  assert.equal(dashboardTimestamp('2026-07-15T02:30:00Z'), 'Jul 14, 2026, 10:30:00 PM EDT');
  assert.equal(dashboardDay('2026-09-21T03:59:59Z'), '2026-09-20');
  assert.equal(dashboardDay('2026-09-21T04:00:00Z'), '2026-09-21');
});

test('calendar labels and preset arithmetic do not shift to the previous date', () => {
  assert.equal(dashboardDate('2026-09-01', { year: 'numeric' }), 'Sep 1, 2026');
  assert.equal(shiftDay('2026-03-09', -1), '2026-03-08');
  assert.equal(shiftDay('2026-11-02', -1), '2026-11-01');
});

test('reporting ranges cover 23-hour and 25-hour Eastern transition days', () => {
  const spring = dateRange(new URLSearchParams({ from: '2026-03-08', to: '2026-03-08' }));
  assert.equal(spring.start, '2026-03-08T05:00:00.000Z');
  assert.equal(spring.end, '2026-03-09T04:00:00.000Z');
  const fall = dateRange(new URLSearchParams({ from: '2026-11-01', to: '2026-11-01' }));
  assert.equal(fall.start, '2026-11-01T04:00:00.000Z');
  assert.equal(fall.end, '2026-11-02T05:00:00.000Z');
});
