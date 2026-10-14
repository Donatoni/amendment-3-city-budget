import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { runtimeConfig } from './site-runtime.js';
import { formatMoney } from './key-facts.js';
import { dashboardTimestamp } from './dashboard-time.js';

const navy = [16, 45, 60], teal = [24, 118, 103], muted = [91, 112, 122];
const money = value => formatMoney(value);
const number = value => new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value);
// The standard PDF fonts support Latin text; normalize typographic punctuation.
const text = value => String(value).replace(/[\u2010-\u2015]/g, '-').replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/[^\x20-\x7e\xa0-\xff\n]/g, '');

export function createDashboardPDF({ summary: s, range, generatedAt = new Date(), config = runtimeConfig() }) {
  const doc = new jsPDF({ unit: 'mm', format: 'letter', compress: true });
  const width = doc.internal.pageSize.getWidth(), right = width - 14, available = width - 28;
  const period = `${range.from} to ${range.to} (Eastern Time)`;
  const cityName = config.city.name, siteName = config.city.siteName;
  doc.setProperties({ title: `${cityName} budget report - ${range.from} to ${range.to}`, author: `City of ${cityName}`, subject: 'Community budget submissions', creator: siteName });
  const write = (value, x, y, size = 10, color = navy, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(...color); doc.text(text(value), x, y);
  };
  const heading = (label, y) => write(label, 14, y, 13, navy, true);
  const table = (head, body, startY, columnStyles = {}) => autoTable(doc, {
    startY, head: [head.map(text)], body: body.map(row => row.map(text)), theme: 'striped',
    margin: { top: 32, bottom: 23, left: 14, right: 14 },
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 3, textColor: navy, overflow: 'linebreak', lineColor: [225, 232, 234] },
    headStyles: { fillColor: navy, textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [243, 247, 247] }, columnStyles, rowPageBreak: 'avoid',
  });
  heading('Community budget report', 40);
  write(period, 14, 48, 10, muted);
  const metrics = [
    ['SUBMISSIONS', number(s.count)], ['AVERAGE REDUCTION', s.count ? money(s.averageReduction) : '-'], ['MEDIAN REDUCTION', s.count ? money(s.medianReduction) : '-'],
    ['REVIEWED', number(s.reviewed)], ['AWAITING REVIEW', number(s.count - s.reviewed)], ['AVERAGE CUTS PER PLAN', s.count ? number(s.averageCuts) : '-'],
  ];
  const tileWidth = (available - 10) / 3;
  metrics.forEach(([label, value], index) => {
    const x = 14 + (index % 3) * (tileWidth + 5), y = 57 + Math.floor(index / 3) * 25;
    doc.setFillColor(242, 247, 246); doc.roundedRect(x, y, tileWidth, 21, 2, 2, 'F');
    write(label, x + 4, y + 6, 7, muted); write(value, x + 4, y + 15, 16, navy, true);
  });
  heading('Department budget comparison', 116);
  write('Annual dollars. Averages include plans with no cuts to a department.', 14, 123, 8, muted);
  table(['Department', s.baselineMixed ? 'Average saved baseline' : 'Saved baseline', 'Average cut', 'Average retained', 'Plans with cuts'], s.departments.map(d => [d.name, money(d.proposed), s.count ? money(d.average) : '-', s.count ? money(d.proposed - d.average) : '-', s.count ? `${d.selections} / ${s.count}` : '-']), 128, { 0: { cellWidth: 49 }, 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } });
  let y = doc.lastAutoTable.finalY + 12;
  doc.setFontSize(8);
  const chartHeight = 10 + s.departments.reduce((height, department) => height + Math.max(8, doc.splitTextToSize(text(department.name), 50).length * 3.6 + 3), 0);
  if (y + chartHeight > 253) { doc.addPage(); y = 40; }
  heading('Average reduction as a share of saved funding', y);
  y += 10;
  s.departments.forEach(d => {
    doc.setFontSize(8);
    const label = doc.splitTextToSize(text(d.name), 50);
    const rowHeight = Math.max(8, label.length * 3.6 + 3);
    if (y + rowHeight > 252) { doc.addPage(); y = 40; }
    write(label.join('\n'), 14, y, 8, muted);
    doc.setFillColor(231, 238, 239); doc.rect(68, y - 3, 105, 3.5, 'F');
    if (d.percent > 0) { doc.setFillColor(...teal); doc.rect(68, y - 3, 105 * Math.min(100, d.percent) / 100, 3.5, 'F'); }
    write(s.count ? `${number(d.percent)}%` : '-', 179, y, 9, navy, true); y += rowHeight;
  });
  doc.addPage();
  heading('Service-cut selections', 40);
  write('Ranked by the number of plans selecting each cut. Multiple selections per plan are possible.', 14, 48, 8, muted);
  if (s.cuts.length) {
    table(['Service cut', 'Department', 'Annual savings', 'Plans', 'Share of plans'], s.cuts.map(cut => [s.catalogVersions.length > 1 ? `${cut.name}\nCatalog: ${cut.catalogVersion}` : cut.name, cut.serviceName, money(cut.savings), number(cut.count), `${number(cut.count / s.count * 100)}%`]), 55, { 0: { cellWidth: 65 }, 1: { cellWidth: 40 }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } });
    y = doc.lastAutoTable.finalY + 13;
  } else { write('No service cuts selected in this reporting period.', 14, 61, 10, muted); y = 80; }
  if (s.revenues?.length) {
    if (y > 180) { doc.addPage(); y = 40; }
    heading('Potential revenue selections', y);
    table(['Revenue option', 'Annual estimate', 'Plans'], s.revenues.map(item => [item.name, money(item.amount), number(item.count)]), y + 7);
    y = doc.lastAutoTable.finalY + 13;
  }
  if (y > 207) { doc.addPage(); y = 40; }
  heading('Scope and interpretation', y); y += 8;
  const notes = [
    `Average potential revenue: ${money(s.averageRevenue)}. Average gap closed: ${money(s.averageGapClosed)}.`,
    'Counts represent submitted plans, not unique residents or representative polling. Every accepted plan meets the budget target saved with its catalog using net cuts and potential revenue. Reviewed means read by staff, not approved.',
    `Department averages include every plan, including those with no cuts in that department. ${s.baselineMixed ? 'Department baselines are averaged across the saved catalogs in this period.' : 'The comparison uses the catalog baseline saved with each submission.'} Selected-cut percentages do not sum to 100%.`,
    'Potential revenue figures are estimates. Older catalogs may use illustrative amounts or reconstructed baselines. This report includes all review statuses within the selected Eastern Time date range. Feedback responses are separate from budget-plan analytics.',
    `Saved budget targets: ${(s.targets || []).map(money).join(', ') || 'No submissions'}. Cities represented: ${(s.cityNames || []).join(', ') || cityName}.`,
    `Catalog versions: ${s.catalogVersions.join(', ') || 'No submissions'}.`,
  ];
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  for (const note of notes) {
    const lines = doc.splitTextToSize(text(note), available);
    if (y + lines.length * 4.3 > 253) { doc.addPage(); y = 40; }
    write(lines.join('\n'), 14, y, 9, muted); y += lines.length * 4.3 + 4;
  }
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    write(`CITY OF ${cityName.toUpperCase()}`, 14, 16, 10, navy, true);
    const brand = text(`${siteName.toUpperCase()} / COMMUNITY INSIGHTS`);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
    const brandSize = Math.min(7, 7 * available / Math.max(1, doc.getTextWidth(brand)));
    write(brand, 14, 22, brandSize, teal);
    doc.setDrawColor(200, 215, 219); doc.line(14, 26, right, 26); doc.line(14, 261, right, 261);
    write(period, 14, 267, 7, muted);
    doc.setFontSize(7); doc.setTextColor(...muted); doc.text(`Page ${page} of ${pages}`, right, 267, { align: 'right' });
    write(`Generated ${dashboardTimestamp(generatedAt)}`, 14, 272, 7, muted);
  }
  return doc;
}
