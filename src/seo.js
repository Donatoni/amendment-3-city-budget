import { CITY_MILLAGE } from './budget.js';
import { taxComparison, taxMoney, taxEquation } from './tax-comparison.js';
import { defaultSiteConfig } from './site-defaults.js';
import { expandCopy, escapeText } from './site-runtime.js';
import { markdownToText } from './markdown.js';
import { structuredData } from './structured-data.js';

// Build-time fallbacks taken from the starter content. On a deployed site the
// request-time renderer (site-document.js) replaces the title, metadata,
// FAQs, sources and structured data with the city's published content.
const starter = defaultSiteConfig.city;
export const seo = {
  name: starter.siteName,
  title: expandCopy(starter.searchTitle, defaultSiteConfig),
  description: expandCopy(starter.description, defaultSiteConfig),
  image: starter.socialImage,
  imageAlt: starter.socialImageAlt,
};
export const faqs = defaultSiteConfig.faqs.map(item => ({ question: expandCopy(item.question, defaultSiteConfig), answer: markdownToText(expandCopy(item.answer, defaultSiteConfig)) }));

export function siteURL(value = '') {
  if (!value.trim()) return null;
  const url = new URL(value.trim());
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
    || url.pathname !== '/' || url.hostname === 'localhost' || !url.hostname.includes('.')) {
    throw new Error('SITE_URL must be the public HTTPS origin, with no path, credentials, query, or fragment.');
  }
  return url.origin + '/';
}

export const starterStructuredData = url => structuredData({ ...defaultSiteConfig, city: { ...starter, url } }, { title: seo.title, description: seo.description, image: new URL(seo.image, url).href });

export function renderHead(url, indexable) {
  const meta = (key, content, property = false) => `<meta ${property ? 'property' : 'name'}="${key}" content="${escapeText(content)}" />`;
  return [
    `<title>${escapeText(seo.title)}</title>`,
    meta('description', seo.description),
    meta('robots', indexable ? 'index, follow, max-image-preview:large' : 'noindex, follow'),
    ...(url ? [`<link rel="canonical" href="${escapeText(url)}" />`, meta('og:url', url, true)] : []),
    meta('og:type', 'website', true), meta('og:locale', 'en_US', true), meta('og:site_name', seo.name, true),
    meta('og:title', seo.title, true), meta('og:description', seo.description, true),
    meta('twitter:card', 'summary_large_image'), meta('twitter:title', seo.title), meta('twitter:description', seo.description),
    ...(url ? [meta('og:image', new URL(seo.image, url).href, true), meta('og:image:width', '1200', true), meta('og:image:height', '630', true), meta('og:image:type', 'image/png', true), meta('og:image:alt', seo.imageAlt, true), meta('twitter:image', new URL(seo.image, url).href), meta('twitter:image:alt', seo.imageAlt)] : []),
    ...(url ? [`<script type="application/ld+json">${JSON.stringify(starterStructuredData(url)).replace(/</g, '\\u003c')}</script>`] : []),
  ].join('\n  ');
}

export function renderResources() {
  return `<section class="faq-section" id="faq" aria-labelledby="faq-title">
      <div class="section-shell resources-layout">
        <div class="resources-intro">
          <p class="eyebrow">Questions, answered</p>
          <h2 id="faq-title">DeLand budget &amp; property tax FAQs</h2>
          <p>Understand the proposal, the estimates, and how to use this budget exercise.</p>
          <a href="#sources">Check the sources below</a>
        </div>
        <div class="faq-list">
          ${faqs.map(item => `<details><summary>${escapeText(item.question)}</summary><div class="faq-answer"><p>${escapeText(item.answer)}</p></div></details>`).join('\n          ')}
        </div>
      </div>
    </section>
    <section class="sources-section" id="sources" aria-labelledby="sources-title">
      <div class="section-shell">
        <div class="section-heading split">
          <div><p class="eyebrow">Behind the numbers</p><h2 id="sources-title">Sources &amp; calculation assumptions</h2></div>
          <p>Follow the numbers back to their source. Explore the calculation, its assumptions, and the official references.</p>
        </div>
        <div class="sources-grid">
          <article id="methodology" class="source-method">
            <h3>How we estimate city tax savings</h3>
            <div class="source-formula">
              <span>Estimated annual city savings</span>
              <p>Additional exempt taxable value <b>× city millage ÷ 1,000</b></p>
              <small>City of DeLand taxes only</small>
            </div>
            <details class="source-detail">
              <summary>Rate &amp; baseline</summary>
              <div class="source-detail-content">
                <p>When a complete 2026 county tax record is available, the calculator uses its DeLand millage rate. Otherwise it uses DeLand’s <strong>illustrative FY 2026–27 rate of ${CITY_MILLAGE}</strong>. It holds that rate constant for both future years. One mill equals $1 per $1,000 of taxable value. See the City’s <a href="https://www.deland.org/367/Millage-Rate">millage rate resolutions</a>.</p>
                <p><strong>The 2026 figure uses VCPA’s published DeLand “Estimated Taxes” amount when available.</strong> Its roll and rate status are shown; it is not a final tax bill. Missing or non-2026 tax records fall back to a labeled model using the selected assessed value. Manual entries assume standard homestead. Each future year shows the same baseline minus that year’s homestead savings, leaving the estimated city tax still due. Savings are not cumulative.</p>
              </div>
            </details>
            <details class="source-detail">
              <summary>Exemptions &amp; eligibility assumptions</summary>
              <div class="source-detail-content">
                <p>The 2026 model applies $25,000 to the first assessed-value band and up to $26,411 above $50,000. The proposed model exempts up to $150,000 in 2027 and $250,000 in 2028.</p>
                <p>Homestead savings assume eligibility and Florida residency by December 31, 2026. A county record without homestead receives no homestead savings. For a complete 2026 county record, the calculation reduces its city taxable value by the additional homestead exemption, retaining other existing exemptions and capping savings at the city tax amount. The model holds assessed value and millage constant. Manual entries assume no additional exemptions. It excludes future inflation adjustments, other taxing authorities, and non-ad valorem assessments. Future rates and implementing rules may change actual savings.</p>
              </div>
            </details>
          </article>
          <div class="source-directory" aria-labelledby="official-sources-title">
            <div class="source-directory-heading"><h3 id="official-sources-title">Explore the official sources</h3></div>
            <ul class="source-links">
              <li><a target="_blank" rel="noopener noreferrer" href="https://vcpa.vcgov.org/info/amendment3"><span class="source-link-copy"><strong>Amendment 3 &amp; eligibility</strong><small>Volusia County Property Appraiser</small></span><span class="source-link-arrow" aria-hidden="true">↗</span></a></li>
              <li><a target="_blank" rel="noopener noreferrer" href="https://vcpa.vcgov.org/search/real-property"><span class="source-link-copy"><strong>Property records &amp; assessed values</strong><small>Volusia County Property Appraiser</small></span><span class="source-link-arrow" aria-hidden="true">↗</span></a></li>
              <li><a target="_blank" rel="noopener noreferrer" href="https://www.deland.org/283/Annual-Budget"><span class="source-link-copy"><strong>Proposed &amp; adopted annual budgets</strong><small>City of DeLand</small></span><span class="source-link-arrow" aria-hidden="true">↗</span></a></li>
              <li><a target="_blank" rel="noopener noreferrer" href="https://www.deland.org/367/Millage-Rate"><span class="source-link-copy"><strong>Millage rate resolutions</strong><small>City of DeLand</small></span><span class="source-link-arrow" aria-hidden="true">↗</span></a></li>
              <li><a target="_blank" rel="noopener noreferrer" href="https://floridarevenue.com/property/Pages/Taxpayers_Exemptions.aspx"><span class="source-link-copy"><strong>Homestead exemptions</strong><small>Florida Department of Revenue</small></span><span class="source-link-arrow" aria-hidden="true">↗</span></a></li>
            </ul>
            <p class="source-reviewed">Amendment information reviewed <time datetime="2026-09-15">September 15, 2026</time>. Check the linked agencies for updates.</p>
          </div>
        </div>
      </div>
    </section>`;
}

export function renderPage(html, url, indexable) {
  const model = taxComparison(300000);
  let page = html.replace('<!-- seo:head -->', renderHead(url, indexable))
    .replace('<!-- seo:resources -->', renderResources())
    .replace('<!-- seo:tax-2026 -->', taxMoney(model.baseline));
  for (const row of model.years) {
    page = page.replace(`<!-- seo:equation-${row.year} -->`, taxEquation(row))
      .replace(`<!-- seo:savings-${row.year} -->`, taxMoney(row.savings))
      .replace(`<!-- seo:remaining-${row.year} -->`, taxMoney(row.remaining));
  }
  return page;
}

export function renderSitemap(url) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${escapeText(url)}</loc></url></urlset>\n`;
}

export function renderRobots(url, indexable) {
  // Let crawlers read the noindex directive on preview HTML; do not disallow it.
  return `User-agent: *\nAllow: /\n${url && indexable ? `\nSitemap: ${new URL('sitemap.xml', url).href}\n` : ''}`;
}
