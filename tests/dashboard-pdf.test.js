import test from 'node:test';
import assert from 'node:assert/strict';
import { createDashboardPDF } from '../src/dashboard-pdf.js';
import { defaultSiteConfig } from '../src/site-defaults.js';

const config = { ...defaultSiteConfig, city: { ...defaultSiteConfig.city, name: 'Port Orange', siteName: 'Build Your Port Orange' } };
const summary = {
  count: 2, averageReduction: 400000, medianReduction: 400000, reviewed: 1, averageCuts: 2, averageRevenue: 800000, averageGapClosed: 1200000,
  baselineMixed: true, targets: [1000000, 1400000], cityNames: ['Port Orange'], catalogVersions: ['city-first', 'city-second'],
  departments: [{ name: 'Emergency Services', proposed: 3000000, average: 400000, percent: 13.3, selections: 2 }], cuts: [], revenues: [],
};

test('dashboard PDF brands the configured city and explains historical targets and averaged baselines', () => {
  const report = createDashboardPDF({ config, summary, range: { from: '2026-10-01', to: '2026-10-09' }, generatedAt: new Date('2026-10-09T16:00:00Z') });
  const source = report.output();
  const pageText = [...report.internal.pages.flat().join('\n').matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)].map(match => match[1]).join(' ');
  assert.match(source, /Port Orange budget report/);
  assert.match(source, /City of Port Orange/);
  assert.match(pageText, /CITY OF PORT ORANGE/);
  assert.match(pageText, /\$1,000,000/);
  assert.match(pageText, /\$1,400,000/);
  assert.match(pageText, /baselines are averaged across the saved/);
  assert.doesNotMatch(pageText, /\$5\.2|CITY OF DELAND|current proposed funding baseline|FY 2026\/27/);
});
