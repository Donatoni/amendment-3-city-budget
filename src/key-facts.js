// Key facts: city-specific values entered once and reused across the site
// through {{tokens}}. They live on config.city alongside the city name.
//
// Money facts are whole dollars and can be shown three ways:
//   {{yearTwoImpact}}        $8,800,000
//   {{yearTwoImpact:short}}  $8.8M
//   {{yearTwoImpact:words}}  $8.8 million
export const KEY_FACT_GROUPS = [
  ['identity', 'Name and tagline', 'How your city is named in headers, footers, and text.'],
  ['budget', 'Budget figures', 'Numbers residents see in the introduction and budget builder. The year-one gap comes from the Budget tab.'],
  ['contacts', 'Contacts and city pages', 'Shown on the Privacy page and linked from the Sources and Coming-soon pages.'],
  ['social', 'Social media', 'Icons in the site footer. Leave an address blank to hide that icon.'],
  ['dates', 'Dates', 'Dates shown to residents. Update them when you review the content.'],
];
// [key, label, help, type, group, required]
export const KEY_FACTS = [
  ['municipalityType', 'City or town', 'Most Volusia municipalities are cities; Pierson and Ponce Inlet are towns.', 'choice', 'identity', true, ['City', 'Town']],
  ['tagline', 'Tagline', 'Short line under the logo in every header and footer.', 'text', 'identity', true],
  ['yearTwoImpact', 'Year 2 budget impact ($)', 'Estimated annual reduction once the full exemption applies, usually the second year.', 'money', 'budget', true],
  ['nextFiscalYear', 'Fiscal year the gap begins', 'The fiscal year residents are planning for. Example: FY 2027/28.', 'text', 'budget', true],
  ['generalFundTotal', 'General Fund total ($)', 'The whole General Fund for the current fiscal year.', 'money', 'budget', true],
  ['generalFundDepartments', 'General Fund spread across the departments in this exercise ($)', 'The part of the General Fund the budget builder covers.', 'money', 'budget', true],
  ['cityWebsiteUrl', 'City website', 'Your main municipal website.', 'url', 'contacts', true],
  ['privacyPolicyUrl', 'City privacy policy page', 'Linked from the Privacy page.', 'url', 'contacts', true],
  ['publicRecordsUrl', 'Public records request page', 'Linked from the Privacy page.', 'url', 'contacts', true],
  ['clerkPhone', 'City Clerk phone', 'Shown as a tap-to-call link. Example: 386-555-0100.', 'phone', 'contacts', true],
  ['clerkAddress', 'City Clerk mailing address', 'One line. Example: 100 Main Street, Springfield, FL 32700.', 'text', 'contacts', true],
  ['budgetPageUrl', 'Annual budget page', 'Linked in Official sources.', 'url', 'contacts', true],
  ['millagePageUrl', 'Millage rate page', 'Linked in Official sources and the calculation notes.', 'url', 'contacts', true],
  ['sampleAddress', 'Example address for property search', 'Shown as a hint in the search box. Use a public address inside city limits, such as City Hall.', 'text', 'contacts', false],
  ['amendmentReviewedDate', 'Amendment information last reviewed', 'Shown under Official sources. Example: September 15, 2026.', 'date', 'dates', true],
  ['privacyUpdatedDate', 'Privacy notice last updated', 'Shown at the top of the Privacy page.', 'date', 'dates', true],
];
export const SOCIAL_LINKS = [
  ['home_site-footer_link_10', 'Facebook page'], ['home_site-footer_link_11', 'Instagram profile'],
  ['home_site-footer_link_12', 'YouTube channel'], ['home_site-footer_link_13', 'X (Twitter) profile'],
];
const MONEY_FACTS = new Set(KEY_FACTS.filter(item => item[3] === 'money').map(item => item[0]));

const trim = value => String(value).replace(/\.0$/, '');
export function formatMoney(value, style = '') {
  const amount = Number(value) || 0;
  // Round half up on whole tenths (toFixed misrounds values like 3.15).
  const millions = trim((Math.round(amount / 1e5) / 10).toFixed(1));
  if (style === 'short') {
    if (Math.abs(amount) >= 1e6) return `$${millions}M`;
    if (Math.abs(amount) >= 1e3) return `$${Math.round(amount / 1e3)}K`;
  }
  if (style === 'words' && Math.abs(amount) >= 1e6) return `$${millions} million`;
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

// Every token a text can use, with its value. Money tokens stay numbers so a
// format can be chosen where they appear.
export function tokenValues(config) {
  const city = config.city || {};
  const total = (config.budget?.services || []).reduce((sum, service) => sum + service.cuts.reduce((n, item) => n + Math.round(item.savings * 100), 0), 0) / 100;
  const departmentCount = config.budget?.services?.length || 0;
  // A tap-to-call link for each phone fact, whatever format staff type.
  const dial = Object.fromEntries(KEY_FACTS.filter(item => item[3] === 'phone').map(([key]) => {
    const [number, extension] = String(city[key] || '').split(/\s*(?:x|ext\.?|extension)\s*/i);
    const digits = number.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
    return [`${key}Link`, digits ? `tel:+1${digits}${extension ? `,${extension.replace(/\D/g, '')}` : ''}` : ''];
  }));
  return {
    values: { ...city, ...dial, city: city.name, municipality: `${city.municipalityType || 'City'} of ${city.name}`, target: config.budget?.target, halfTarget: (config.budget?.target || 0) / 2, totalBudget: total, departmentCount, departmentLabel: departmentCount === 1 ? 'department' : 'departments' },
    money: new Set([...MONEY_FACTS, 'target', 'halfTarget', 'totalBudget']),
  };
}
export const TOKEN_PATTERN = /\{\{(\w+)(?::(short|words))?\}\}/g;
// Plain-language names for tokens, shown in editor help.
export const TOKEN_LABELS = {
  city: 'City name', municipality: 'Official name (City of …)', siteName: 'Site name', state: 'State', fiscalYear: 'Fiscal year', millage: 'Millage rate',
  target: 'Year 1 budget gap', halfTarget: 'Half the budget gap', totalBudget: 'Total of the departments', departmentCount: 'Number of departments', departmentLabel: '“department” or “departments”',
  ...Object.fromEntries(KEY_FACTS.map(([key, label]) => [key, label.replace(/ \(\$\)$/, '')])),
};
