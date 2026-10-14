import { runtimeConfig } from '../src/site-runtime.js';
import { budgetDisplayRows } from '../src/budget-model.js';
import { paintPostcard, HEADLINES, postcardHeadlines } from '../src/postcard.js';
import { SERVICES, fmtM } from '../src/budget.js';
import { resultDescription } from '../src/share-plan.js';
import { SVGCanvas, xml } from './svg-canvas.js';

export function resultImageSVG(plan, assets, config = runtimeConfig()) {
  const SERVICES = budgetDisplayRows(plan.values, config);
  const HEADLINES = postcardHeadlines(config);
  const ctx = new SVGCanvas();
  paintPostcard(ctx, plan.values, plan, { ...assets, config });
  // Match the share studio's fixed frame while the postcard keeps its chosen theme.
  const t = { paper: '#fffefa', ink: '#263e32', muted: '#61715d', line: '#dfe4d6', panel: '#eff3e8', link: '#607153' };
  const { total, delta, revenue } = resultDescription(plan, config);
  const text = (value,x,y,size,weight=600,color=t.ink,anchor='start') => `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="Inter" font-size="${size}" font-weight="${weight}" fill="${color}">${xml(value)}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
    <defs>
      <clipPath id="studio-frame"><rect x="16" y="12" width="1168" height="606" rx="24"/></clipPath>
      <clipPath id="studio-postcard"><rect x="60" y="75" width="400" height="500" rx="3"/></clipPath>
      <radialGradient id="studio-sage" cx="50%" cy="40%" r="75%">
        <stop offset="0" stop-color="#eef2e3"/><stop offset="1" stop-color="#dbe3d3"/>
      </radialGradient>
      <filter id="studio-shadow" x="-20%" y="-20%" width="140%" height="160%" color-interpolation-filters="sRGB">
        <feGaussianBlur in="SourceAlpha" stdDeviation="12"/>
        <feOffset dy="16" result="o"/>
        <feFlood flood-color="#263723" flood-opacity="0.20"/>
        <feComposite in2="o" operator="in"/>
      </filter>
    </defs>
    <rect width="1200" height="630" fill="#2c3e39"/>
    <g clip-path="url(#studio-frame)">
    <rect x="16" y="12" width="1168" height="606" fill="${t.paper}"/>
    <rect x="16" y="12" width="488" height="606" fill="url(#studio-sage)"/>
    <path d="M504 12V618" stroke="#dbe2d3"/>
    <circle cx="57" cy="46" r="3" fill="#567c50"/>
    ${text('YOUR CITY, IN A POSTCARD',69,50,12,600,t.muted)}
    <g transform="rotate(-2 260 325)">
      <rect x="60" y="75" width="400" height="500" rx="3" fill="#263723" filter="url(#studio-shadow)"/>
      <g clip-path="url(#studio-postcard)"><svg x="60" y="75" width="400" height="500" viewBox="0 0 1080 1350">${ctx.markup()}</svg></g>
    </g>
    ${text('Made from your choices. Ready for your feed.',260,600,12,400,t.muted,'middle')}
    ${text(`MY ${config.city.name.toUpperCase()} BUDGET`,536,54,16,600,'#50784e')}
    ${text(HEADLINES[plan.headline][0],536,99,40,800)}
    ${text(HEADLINES[plan.headline][1],536,144,40,800)}
    <rect x="536" y="164" width="624" height="78" rx="14" fill="${t.panel}"/>
    ${text('MY CITY BUDGET',558,186,12,600,t.muted)}${text(fmtM(total),558,225,34,800)}
    ${text(delta>=0?'GAP CLOSED':'GAP INCREASE',878,186,12,600,t.muted)}${text(fmtM(Math.abs(delta)),878,225,34,800)}
    ${text('DEPARTMENT',536,271,12,600,t.muted)}
    ${text('MY FUNDING',980,271,12,600,t.muted,'end')}
    ${text('FROM PROPOSED',1160,271,12,600,t.muted,'end')}
    ${SERVICES.map((s,i)=>{
      const y=306+i*43;
      const deduction=Math.round((s.proposed-s.value)*1e6)/1e6;
      const change=deduction>0?`${fmtM(deduction)} deducted`:deduction<0?`${fmtM(-deduction)} added`:'No change';
      return text(s.name.replace('Planning & Economic Development','Planning & Development'),536,y,18,400)
        +text(fmtM(s.value),980,y,18,600,t.ink,'end')
        +text(change,1160,y,16,600,t.muted,'end')
        +(i<SERVICES.length-1?`<path d="M536 ${y+17}H1160" stroke="${t.line}"/>`:'');
    }).join('')}
    ${text(`Potential revenue: ${fmtM(revenue)}`,536,528,18,600,t.muted)}
    ${text('Explore my choices.',536,568,20,400,t.muted)}
    ${text('Build your own',748,568,22,600,t.link)}
    <path d="M748 575H904" stroke="${t.link}" stroke-width="1.5"/>
    <path d="M925 560H950M942 552L950 560L942 568" fill="none" stroke="${t.link}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    ${text(`${new URL(config.city.url).host} · Personal budget proposal`,536,600,13,400,t.muted)}
    </g>
    <rect x="16" y="12" width="1168" height="606" rx="24" fill="none" stroke="#ffffff" stroke-opacity="0.24"/>
  </svg>`;
}
