import { uiText } from './ui-text.js';
import { runtimeConfig } from './site-runtime.js';
import { budgetModel, budgetDisplayRows, configuredPlan } from './budget-model.js';
// Shared drawing commands for the browser export and server social preview.
import { costCenterPlan } from './cost-centers.js';
import { SERVICES, PROPOSED_TOTAL, fmtM } from './budget.js';

const COLORS = ['#c45e45', '#396bc5', '#b08028', '#408466', '#8b64ad', '#3d8a97'];
export const THEMES = {
  daylight: { paper: '#edf5fc', ink: '#15285b', muted: '#637089', line: '#dbe4ef', accent: '#2864ed', panel: '#ffffff' },
  bluehour: { paper: '#172e48', ink: '#f3efdf', muted: '#b7c9cf', line: '#38536b', accent: '#b4dbde', panel: '#213e56' },
  citrus: { paper: '#ffe5a3', ink: '#563e28', muted: '#8a6744', line: '#dcc080', accent: '#e88854', panel: '#fff1cb' },
};
export const postcardHeadlines = (config = runtimeConfig()) => [0, 1, 2].map(i => ['top', 'bottom'].map(side => uiText(`ui_postcard_headline_${i}_${side}`, {}, config)));
export const HEADLINES = postcardHeadlines();
function box(ctx, x, y, w, h, r, fill) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fillStyle = fill; ctx.fill();
}
function text(ctx, value, x, y, size, color, weight = 500, align = 'left') {
  ctx.font = `${weight} ${size}px Inter, sans-serif`;
  ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(value, x, y);
}
function line(ctx, x, y, x2, y2, color) {
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
}

export function paintPostcard(ctx, values, { theme = 'daylight', headline = 0, side = 'front', revenues = [], millageRate } = {}, { seal, illustration, config = runtimeConfig() } = {}) {
  const model = budgetModel(config);
  const SERVICES = model.services, PROPOSED_TOTAL = model.total;
  const costCenterPlan = (ids, revenue, rate) => configuredPlan(ids, revenue, rate, config);
  const HEADLINES = postcardHeadlines(config);
  const copy = (key, vars) => uiText(`ui_postcard_${key}`, vars, config);
  const t = THEMES[theme] || THEMES.daylight;
  const total = values.reduce((sum, value) => sum + value, 0);
  const cut = PROPOSED_TOTAL - total;
  const revenue = costCenterPlan([], revenues, millageRate).revenue / 1e6;
  const displayRows = budgetDisplayRows(values, config);
  const scale = Math.max(20, ...displayRows.map(service => service.proposed), ...displayRows.map(service => service.value));
  ctx.clearRect(0, 0, 1080, 1350);
  ctx.fillStyle = t.paper; ctx.fillRect(0, 0, 1080, 1350);
  // A restrained paper grid keeps the graphic tactile without raster assets.
  ctx.save(); ctx.globalAlpha = 0.35;
  for (let x = 30; x < 1080; x += 30) for (let y = 25; y < 1350; y += 30) {
    ctx.fillStyle = t.line; ctx.fillRect(x, y, 1.5, 1.5);
  }
  ctx.restore();
  if (seal) ctx.drawImage(seal, 58, 54, 64, 64);
  text(ctx, `${config.city.name.toUpperCase()} / ${config.city.state.toUpperCase()}`, 140, 80, 22, t.ink, 700);
  text(ctx, copy('eyebrow'), 140, 109, 15, t.muted, 500);
  text(ctx, side === 'front' ? copy('front_label') : copy('back_label'), 1018, 92, 16, t.muted, 600, 'right');
  line(ctx, 60, 145, 1020, 145, t.line);

  if (side === 'front') {
    const title = HEADLINES[headline] || HEADLINES[0];
    text(ctx, title[0], 60, 265, 90, t.ink, 800);
    text(ctx, title[1], 55, 377, Math.min(108, 1300 / title[1].length), t.ink, 800);
    // Postmark, deliberately presented as a personal proposal, not approval.
    ctx.save(); ctx.translate(920, 288); ctx.rotate(0.13);
    ctx.setLineDash([5, 6]); ctx.beginPath(); ctx.arc(0, 0, 77, 0, Math.PI * 2); ctx.strokeStyle = t.muted; ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]);
    text(ctx, copy('stamp_top'), 0, -23, 17, t.ink, 700, 'center');
    text(ctx, copy('stamp_middle'), 0, 8, 26, t.ink, 800, 'center');
    text(ctx, copy('stamp_bottom'), 0, 35, 12, t.muted, 600, 'center'); ctx.restore();
    // Painted landmark puzzle; funding is represented by the real figures below
    // and on the reverse, rather than by changing the depicted city buildings.
    ctx.save();
    ctx.beginPath(); ctx.roundRect(60, 422, 960, 576, 18); ctx.clip();
    const scale = Math.max(960 / illustration.width, 576 / illustration.height);
    const width = illustration.width * scale;
    const height = illustration.height * scale;
    ctx.drawImage(illustration, 60 + (960 - width) / 2, 422 + (576 - height) / 2, width, height);
    ctx.restore();
    text(ctx, copy('art_caption'), 540, 1035, 18, t.muted, 600, 'center');
    box(ctx, 60, 1070, 960, 150, 18, t.panel);
    const stats = [[copy('budget'), fmtM(total)], [copy('gap'), fmtM(cut + revenue)], [copy('revenue'), fmtM(revenue)]];
    stats.forEach(([label, value], index) => {
      const x = 88 + index * 320;
      if (index) line(ctx, x - 18, 1100, x - 18, 1190, t.line);
      text(ctx, label, x, 1112, 15, t.muted, 600);
      text(ctx, value, x, 1180, 53, t.ink, 700);
    });
  } else {
    text(ctx, copy('back_title_top'), 60, 265, 86, t.ink, 800);
    text(ctx, copy('back_title_bottom'), 60, 364, 86, t.ink, 800);
    text(ctx, copy('summary', {total: fmtM(total), gap: fmtM(cut + revenue)}), 64, 428, 27, t.muted, 500);
    text(ctx, copy('funding'), 65, 490, 15, t.muted, 600);
    text(ctx, copy('comparison'), 1015, 490, 15, t.muted, 600, 'right');
    displayRows.forEach((service, i) => {
      const y = 518 + i * 109;
      text(ctx, String(i + 1).padStart(2, '0'), 65, y + 29, 19, COLORS[i], 700);
      text(ctx, service.name, 115, y + 29, Math.min(27, 850 / service.name.length), t.ink, 600);
      text(ctx, fmtM(service.value), 1015, y + 27, 31, t.ink, 700, 'right');
      const delta = service.value - service.proposed;
      text(ctx, Math.abs(delta) < 0.0000005 ? copy('no_change') : `${delta > 0 ? '+' : '−'}${fmtM(Math.abs(delta))}`, 1015, y + 59, 17, t.muted, 500, 'right');
      box(ctx, 115, y + 53, 620, 9, 4, t.line);
      const fillWidth = 620 * Math.max(0, service.value) / scale;
      if (fillWidth > 0) box(ctx, 115, y + 53, fillWidth, 9, Math.min(4, fillWidth / 2), COLORS[i]);
      const marker = 115 + 620 * service.proposed / scale;
      line(ctx, marker, y + 47, marker, y + 70, t.ink);
      line(ctx, 65, y + 91, 1015, y + 91, t.line);
    });
    text(ctx, copy('revenue_summary', {revenue: fmtM(revenue), cuts: fmtM(cut)}), 65, 1145, 24, t.ink, 600);
    text(ctx, copy('scale', {scale: fmtM(scale)}), 65, 1210, 18, t.muted, 500);
  }
  text(ctx, copy('question'), 60, 1290, 26, t.ink, 600);
  text(ctx, copy('cta'), 994, 1290, 18, t.ink, 700, 'right');
  line(ctx, 1006, 1283, 1020, 1283, t.ink);
  line(ctx, 1014, 1277, 1020, 1283, t.ink);
  line(ctx, 1014, 1289, 1020, 1283, t.ink);
  text(ctx, copy('footer'), 60, 1325, 14, t.muted, 400);
}
