import './dashboard.css';
import { mountContentEditor, canLeaveContentEditor } from './content-editor.js';
import { runtimeConfig, configureSite, escapeText as esc } from './site-runtime.js';
import { SERVICES } from './budget.js';
import { formatMoney } from './key-facts.js';
import { submissionsCSV, csvCell } from './dashboard-data.js';
import { dashboardDate as date, dashboardDay, shiftDay, dashboardTimestamp, DASHBOARD_TIME_ZONE } from './dashboard-time.js';

let site = runtimeConfig();
let cityName = site.city.name;
const officialName = () => `${site.city.municipalityType || 'City'} of ${cityName}`;
let siteName = site.city.siteName;
let citySlug = cityName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const $ = selector => document.querySelector(selector);
const icons = {
  settings: '<path d="M4 7h16M4 17h16"/><circle cx="8" cy="7" r="3"/><circle cx="16" cy="17" r="3"/>',
  overview: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  inbox: '<path d="M4 4h16l2 12v4H2v-4L4 4Z"/><path d="M2 15h6l2 3h4l2-3h6M8 8h8m-8 3h8"/>',
  chart: '<path d="M4 3v17h17M8 15v-4m5 4V7m5 8V3"/>',
  users: '<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m0-17a3 3 0 0 1 0 6m3 4a5 5 0 0 1 3 5v2"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18"/>',
  refresh: '<path d="M20 10a8 8 0 0 0-14-5L3 8m0-6v6h6m-5 6a8 8 0 0 0 14 5l3-3m0 6v-6h-6"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
  logout: '<path d="M9 4H4v16h5m4-12 4 4-4 4m-5-4h13"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  check: '<path d="m5 12 4 4L19 6"/><circle cx="12" cy="12" r="10"/>',
  dollar: '<path d="M12 2v20m5-15c0-4-10-4-10 1s10 3 10 8-10 5-10 1"/>',
  insight: '<path d="M9 18h6m-6 3h6M8 14a7 7 0 1 1 8 0l-1 2H9l-1-2Z"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
  plus: '<path d="M12 4v16M4 12h16"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.chart}</svg>`;
const money = value => formatMoney(value);
const compactMoney = value => value >= 1e6 ? `$${(value / 1e6).toFixed(2)}M` : value >= 1000 ? `$${Math.round(value / 1000)}K` : money(value);
const planCount = value => `${number(value)} ${value === 1 ? 'plan' : 'plans'}`;
const number = value => new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value);
const statusBadge = status => `<span class="badge ${status === 'reviewed' ? 'reviewed' : 'new'}">${status === 'reviewed' ? 'Reviewed' : 'New'}</span>`;
const state = { user: null, rows: [], summary: null, users: [], feedback: [], feedbackSearch: '', feedbackStatus: 'all', feedbackPage: 1, settings: null, range: null, view: 'overview', search: '', status: 'all', sort: 'recent', page: 1, editing: null, deleting: null, pdfBusy: false, request: 0 };
let views;
const describeViews = () => views = {
  overview: ['Overview', 'Community overview', `See how people are shaping their ${cityName} budget.`],
  submissions: ['Submissions', 'Every plan, in one place', 'Explore the choices behind each community budget submission.'],
  reports: ['Reports & insights', 'From responses to perspective', 'Understand the trade-offs people are making across City services.'],
  feedback: ['Feedback', 'What people are saying', 'Review helpfulness ratings and comments about the site.'],
  content: ['Site content', 'Make this site your city’s', 'Edit a draft, preview the changes, and publish reviewed city content.'],
  settings: ['Site settings', 'Availability & analytics', 'Choose what visitors see when they open the site and whether visits are measured.'],
  users: ['Manage users', 'Your team, connected', 'Manage who can explore submissions and administer this workspace.'],
};
describeViews();
function applyBranding() {
  document.querySelectorAll('[data-dashboard-city]').forEach(el => { el.textContent = officialName(); });
  document.querySelectorAll('[data-dashboard-site]').forEach(el => { el.textContent = siteName; });
  if (site?.city.logo) $('.brand img').src = site.city.logo;
}
// Publishing new content updates names and the logo here without a reload.
window.addEventListener('city-content:published', event => {
  configureSite(event.detail); site = event.detail;
  cityName = site.city.name; siteName = site.city.siteName; citySlug = cityName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  describeViews(); applyBranding(); document.title = `${views[state.view][0]} | ${officialName()}`;
});
function notice(message = '') { $('#notice').textContent = message; $('#notice').hidden = !message; }
async function api(path, options = {}) {
  const response = await fetch(path, { credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', ...options.headers }, signal: AbortSignal.timeout(20000) });
  const data = await response.json();
  if (response.status === 401) { location.assign('/login?next=%2Fadmin%2F&staff=1'); throw new Error('Your session has ended. Please sign in again.'); }
  if (!response.ok) throw new Error(data.error || 'The request could not be completed.');
  return data;
}
function hydrateIcons(root = document) { root.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); }); }
function empty(title, description, link = false) { return `<div class="empty-state"><div class="empty-symbol">${icon('inbox')}</div><h3>${title}</h3><p>${description}</p>${link ? '<a class="button secondary small" href="/" target="_blank" rel="noopener noreferrer">View site ↗</a>' : ''}</div>`; }
function metric(label, value, note, symbol) { return `<article class="metric"><div class="metric-top">${label}<span class="metric-icon">${icon(symbol)}</span></div><div class="metric-value">${value}</div><div class="metric-note">${note}</div></article>`; }
function targetLabel() {
  const targets = state.summary?.targets || [];
  if (targets.length > 1) return 'Multiple saved budget targets';
  return `${compactMoney(targets[0] ?? site.budget.target)} target`;
}
function baselineNote(summary) {
  return summary.baselineMixed ? 'Department baselines are averages across the saved catalogs in this reporting period.' : 'Department baselines use the catalog saved with each submission.';
}
function metrics() {
  const s = state.summary;
  return `<section class="metrics" aria-label="Key metrics">${metric('Budget submissions', number(s.count), 'Plans received in this period', 'inbox')}${metric('Average gap closed', s.count ? compactMoney(s.averageGapClosed) : '—', `Cuts + revenue · ${targetLabel()}`, 'dollar')}${metric('Average cuts selected', s.count ? number(s.averageCuts) : '—', 'Service choices per plan', 'chart')}${metric('Reviewed submissions', number(s.reviewed), `<span class="accent">${number(s.count - s.reviewed)} awaiting review</span>`, 'check')}</section>`;
}
function trend() {
  const days = new Map(state.summary.days.map(day => [day.date, day.count]));
  const start = Date.parse(state.range.from), end = Date.parse(state.range.to);
  const group = end - start > 60 * 86400000 ? 7 : 1;
  const buckets = [];
  for (let t = start; t <= end; t += group * 86400000) {
    let count = 0;
    for (let d = 0; d < group && t + d * 86400000 <= end; d++) count += days.get(new Date(t + d * 86400000).toISOString().slice(0, 10)) || 0;
    buckets.push({ date: new Date(t).toISOString().slice(0, 10), count });
  }
  const max = Math.max(1, ...buckets.map(bucket => bucket.count));
  return `<section class="panel"><div class="panel-header"><div><h2>Submission activity</h2><p>${group === 7 ? 'Weekly groups starting on the first date' : 'Daily participation'} · Eastern Time</p></div><span class="legend">Submissions</span></div><div class="panel-body">${state.rows.length ? `<div class="trend" role="group" aria-label="Submission counts by ${group === 7 ? 'week' : 'day'}">${buckets.map(bucket => `<div class="trend-column" tabindex="0" aria-label="${date(bucket.date)}${group === 7 ? ', week starting' : ''}: ${bucket.count} submissions"><div class="trend-bar" style="height:${bucket.count / max * 95}%;${bucket.count ? '' : 'background:transparent'}"></div><span class="trend-tip">${date(bucket.date)} · ${bucket.count}</span></div>`).join('')}</div><div class="chart-axis"><span>${date(state.range.from)}</span><span>${number(max)} at peak</span><span>${date(state.range.to)}</span></div><p class="chart-foot">${planCount(state.summary.count)} submitted across this reporting period.</p>` : empty('Your community story starts here', 'New budget submissions will appear in this chart. No submissions in the selected period.')}</div></section>`;
}
function departmentChart() {
  const s = state.summary;
  return `<section class="panel"><div class="panel-header"><div><h2>Where people make reductions</h2><p>Average cut as a share of each department’s budget</p></div></div><div class="panel-body">${s.departments.map(dept => `<div class="dept-row"><span class="dept-name">${esc(dept.name)}</span><div class="bar-track" aria-hidden="true"><div class="bar-fill" style="width:${dept.percent}%"></div></div><span class="dept-value">${s.count ? `${number(dept.percent)}%` : '—'}</span></div>`).join('')}<p class="chart-foot">Includes plans with no cuts to a department. ${baselineNote(s)}</p></div></section>`;
}
function insight() {
  const s = state.summary;
  const largest = [...s.departments].sort((a, b) => b.percent - a.percent)[0];
  return `<div class="insight-banner">${icon('insight')}<p>${s.count ? `<strong>${esc(largest.name)} has the largest average proportional reduction (${number(largest.percent)}%).</strong> This reflects ${planCount(s.count)} submitted in this period, not a representative survey of residents.` : '<strong>A place to listen before you plan.</strong> As submissions arrive, this workspace will show the service trade-offs people select.'}</p></div>`;
}
function table(rows) {
  if (!rows.length) return empty(state.rows.length ? 'No matching submissions' : 'No submissions yet', state.rows.length ? 'Try another search, review status, or date range.' : 'Completed budget plans will appear here after they are submitted.', !state.rows.length);
  return `<div class="table-wrap"><table><thead><tr><th scope="col">Submission</th><th scope="col">Received · Eastern Time</th><th scope="col">Gap closed</th><th scope="col">Cuts</th><th scope="col">Status</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead><tbody>${rows.map(row => `<tr><td><button class="row-open table-id" data-detail="${row.id}" aria-label="View submission ${row.id}">#${row.id.slice(0, 8).toUpperCase()}</button></td><td class="table-date">${date(row.submittedAt, { year: 'numeric' })}<br /><small>${date(row.submittedAt, { hour: '2-digit', minute: '2-digit' }).split(', ').at(-1)}</small></td><td>${compactMoney(row.gapClosed ?? row.reduction)}</td><td>${row.cuts.length}</td><td>${statusBadge(row.status)}</td><td><button class="row-open" data-detail="${row.id}" aria-label="Open submission ${row.id}">View <span aria-hidden="true">↗</span></button>${state.user.role === 'admin' ? ` <button class="row-open danger-text" data-delete-kind="submissions" data-delete-id="${row.id}">Delete</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
}
function overview() {
  return `${metrics()}<div class="chart-grid">${trend()}${departmentChart()}</div>${insight()}<section class="panel table-panel"><div class="panel-header"><div><h2>Recent submissions</h2><p>A closer look at the latest community priorities</p></div><a class="subtle-link" href="#submissions">View all submissions →</a></div>${table(state.rows.slice(0, 5))}<div class="table-footer"><span>Showing ${Math.min(5, state.rows.length)} of ${number(state.rows.length)} submissions</span><span>Selected reporting period</span></div></section>`;
}
function filteredRows() {
  const search = state.search.trim().toLowerCase().replace(/^#/, '');
  return state.rows.filter(row => (state.status === 'all' || state.status === row.status) && (!search || `${row.id} ${row.cuts.map(cut => `${cut.name} ${cut.serviceName}`).join(' ')} ${(row.revenues || []).map(item => item.name).join(' ')}`.toLowerCase().includes(search))).sort((a, b) => state.sort === 'reduction' ? (b.gapClosed ?? b.reduction) - (a.gapClosed ?? a.reduction) : state.sort === 'oldest' ? a.submittedAt.localeCompare(b.submittedAt) : b.submittedAt.localeCompare(a.submittedAt));
}
function submissionResults() {
  const rows = filteredRows();
  const pages = Math.max(1, Math.ceil(rows.length / 10));
  state.page = Math.min(state.page, pages);
  const start = (state.page - 1) * 10;
  return `${table(rows.slice(start, start + 10))}<div class="table-footer"><span>${rows.length ? `${start + 1}–${Math.min(start + 10, rows.length)} of ${number(rows.length)}` : '0'} submissions</span><div class="pagination"><button class="icon-button" data-page="-1" aria-label="Previous page" ${state.page === 1 ? 'disabled' : ''}>←</button><span>${state.page} / ${pages}</span><button class="icon-button" data-page="1" aria-label="Next page" ${state.page >= pages ? 'disabled' : ''}>→</button></div></div>`;
}
function submissions() {
  return `<section class="panel"><div class="table-filters"><label class="search-field">${icon('search')}<span class="sr-only">Search submissions</span><input id="submission-search" placeholder="Search by ID, service, or revenue option…" value="${esc(state.search)}" /></label><label class="sr-only" for="status-filter">Review status</label><select id="status-filter"><option value="all">All statuses</option><option value="new" ${state.status === 'new' ? 'selected' : ''}>New</option><option value="reviewed" ${state.status === 'reviewed' ? 'selected' : ''}>Reviewed</option></select><label class="sr-only" for="sort-filter">Sort submissions</label><select id="sort-filter"><option value="recent">Newest first</option><option value="oldest" ${state.sort === 'oldest' ? 'selected' : ''}>Oldest first</option><option value="reduction" ${state.sort === 'reduction' ? 'selected' : ''}>Largest gap closed</option></select></div><div id="submission-results">${submissionResults()}</div></section><div class="methodology"><h3>About these submissions</h3><p>Plans are anonymous. The budget exercise does not attach property searches, names, or contact details. A person can submit more than one plan; totals measure submissions, not unique residents.</p></div>`;
}
function reports() {
  const s = state.summary;
  return `<div class="report-stack">${metrics()}${insight()}<section class="panel revenue-report"><div class="panel-header"><div><h2>Potential revenue choices</h2><p>Options selected to add funding back to the budget</p></div><div class="revenue-average"><span>Average revenue added</span><strong>${money(s.averageRevenue)}</strong></div></div><div class="panel-body revenue-options">${s.revenues.map(item => `<article class="revenue-option"><div class="revenue-option-icon">${icon('dollar')}</div><div class="rank-content"><h3>${esc(item.name)}</h3><p>${money(item.amount)} estimated annually</p></div><span class="revenue-count">${planCount(item.count)}</span></article>`).join('') || '<p class="muted">No revenue options selected in this period.</p>'}</div></section><div class="report-grid"><section class="panel"><div class="panel-header"><div><h2>Most selected service cuts</h2><p>Share of all submissions in the reporting period</p></div></div><div class="panel-body">${s.cuts.length ? s.cuts.slice(0, 8).map((cut, i) => `<div class="rank-row"><span class="rank-number">${i + 1}</span><div class="rank-content"><strong>${esc(cut.name)}</strong><small>${esc(cut.serviceName)} · ${money(cut.savings)}${s.catalogVersions.length > 1 ? ` · ${esc(cut.catalogVersion)}` : ''}</small></div><div class="rank-value">${number(cut.count / s.count * 100)}%<small>${planCount(cut.count)}</small></div></div>`).join('') : empty('Patterns will appear here', 'This report ranks the service cuts selected in submitted plans.')}</div></section><div>${departmentChart()}<div class="methodology"><h3>Reading the report</h3><p>The median reduction is <strong>${s.count ? compactMoney(s.medianReduction) : '—'}</strong> per plan. Department averages include every submission, including plans that retain all funding in that department.</p><p>The chart compares proportional cuts, so departments with different budgets can be compared fairly. It does not predict actual service outcomes.</p></div></div></div><section class="panel table-panel"><div class="panel-header"><div><h2>The bigger budget picture</h2><p>Proposed funding compared with the average submitted plan</p></div><span class="badge neutral">Annual dollars</span></div><div class="table-wrap"><table class="report-table"><thead><tr><th>Department</th><th>${s.baselineMixed ? 'Average saved baseline' : 'Saved baseline'}</th><th>Average cut</th><th>Average retained</th><th>Plans with cuts</th></tr></thead><tbody>${s.departments.map(dept => `<tr><td>${esc(dept.name)}</td><td>${money(dept.proposed)}</td><td>${s.count ? money(dept.average) : '—'}</td><td>${s.count ? money(dept.proposed - dept.average) : '—'}</td><td>${s.count ? `${number(dept.selections)} / ${number(s.count)}` : '—'}</td></tr>`).join('')}</tbody></table></div></section><div class="methodology"><h3>Scope &amp; methodology</h3><p>${number(s.count)} submissions · ${date(state.range.from, { year: 'numeric' })}–${date(state.range.to, { year: 'numeric' })} (Eastern Time). Every accepted plan meets its saved catalog’s budget target. ${esc(targetLabel())}. Counts are plans, not unique people, and are not representative polling. Review status is a staff workflow and does not endorse a plan.</p><p>${baselineNote(s)} Potential revenues are estimates. Older catalogs may contain illustrative amounts or reconstructed baselines. Catalog versions: ${s.catalogVersions.map(esc).join(', ') || 'No submissions'}. Reports use saved submission snapshots. Feedback is shown in its own section.</p></div></div>`;
}
function users() {
  return `<div class="user-intro"><p>${state.users.length} staff account${state.users.length === 1 ? '' : 's'}<br /><small>Administrators manage users. Viewers have read-only access.</small></p><button class="button" id="add-user">${icon('plus')} Add user</button></div><section class="panel"><div class="table-wrap"><table><thead><tr><th>User</th><th>Role</th><th>Status</th><th>Added</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>${state.users.map(user => `<tr><td><div class="user-cell"><span class="avatar">${esc(user.name.split(/\s+/).map(word => word[0]).slice(0, 2).join('').toUpperCase())}</span><div><strong>${esc(user.name)}${user.id === state.user.id ? ' (you)' : ''}</strong><small>${esc(user.email)}</small></div></div></td><td><span class="badge ${user.role === 'admin' ? 'admin' : 'neutral'}">${user.role === 'admin' ? 'Administrator' : 'Viewer'}</span></td><td><span class="badge ${user.active ? 'reviewed' : 'neutral'}">${user.active ? 'Active' : 'Disabled'}</span></td><td class="table-date">${date(user.createdAt, { year: 'numeric' })}</td><td>${user.id !== state.user.id ? `<button class="row-open" data-edit-user="${user.id}">Manage</button>` : '—'}</td></tr>`).join('')}</tbody></table></div>${!state.users.length ? empty('Bring your team into the picture', 'Add staff accounts so colleagues can review submissions and explore reports.') : ''}</section><div class="methodology"><h3>Staff access</h3><p>Disabling an account, changing its role, or resetting its password ends its existing sessions. Creating a user does not send an email invitation.</p></div>`;
}
const ratingLabel = rating => ({ yes: 'Yes', somewhat: 'Somewhat', no: 'No' })[rating];
function filteredFeedback() {
  const search = state.feedbackSearch.trim().toLowerCase();
  return state.feedback.filter(row => (state.feedbackStatus === 'all' || row.status === state.feedbackStatus) && (!search || `${row.id} ${row.comment} ${ratingLabel(row.helpful)}`.toLowerCase().includes(search)));
}
function feedbackResults() {
  const rows = filteredFeedback(), pages = Math.max(1, Math.ceil(rows.length / 10));
  state.feedbackPage = Math.min(state.feedbackPage, pages);
  const start = (state.feedbackPage - 1) * 10;
  return `${rows.length ? `<div class="feedback-list">${rows.slice(start, start + 10).map(row => `<article class="feedback-entry"><header class="feedback-meta"><span class="feedback-rating ${esc(row.helpful)}">${icon(row.helpful === 'yes' ? 'check' : row.helpful === 'no' ? 'close' : 'insight')}<strong>Helpful: ${ratingLabel(row.helpful)}</strong></span>${statusBadge(row.status)}<time datetime="${esc(row.submitted_at)}">${date(row.submitted_at, { year: 'numeric', hour: '2-digit', minute: '2-digit' })} Eastern Time</time></header><p class="feedback-text">${row.comment ? esc(row.comment) : '<span class="muted">No comment provided.</span>'}</p><footer class="feedback-footer"><span class="feedback-id">Response #${row.id.slice(0, 8).toUpperCase()}</span>${state.user.role === 'admin' ? `<div class="feedback-actions"><button class="button secondary small" data-review-feedback="${row.id}" data-status="${row.status === 'new' ? 'reviewed' : 'new'}">${icon(row.status === 'new' ? 'check' : 'refresh')}Mark as ${row.status === 'new' ? 'reviewed' : 'new'}</button><button class="button secondary small danger-text" data-delete-kind="feedback" data-delete-id="${row.id}">Delete</button></div>` : ''}</footer></article>`).join('')}</div>` : empty('No feedback found', 'Feedback will appear here after visitors send a response. Try another date range or filter.')}<div class="table-footer"><span>${rows.length ? `${start + 1}–${Math.min(start + 10, rows.length)} of ${rows.length}` : '0'} ${rows.length === 1 ? 'response' : 'responses'}</span><div class="pagination"><button class="icon-button" data-feedback-page="-1" aria-label="Previous feedback page" ${state.feedbackPage === 1 ? 'disabled' : ''}>←</button><span>${state.feedbackPage} / ${pages}</span><button class="icon-button" data-feedback-page="1" aria-label="Next feedback page" ${state.feedbackPage === pages ? 'disabled' : ''}>→</button></div></div>`;
}
function feedback() {
  const awaiting = state.feedback.filter(row => row.status === 'new').length;
  return `<section class="metrics" aria-label="Feedback summary">${metric('Feedback responses', state.feedback.length, 'Responses in this period', 'inbox')}${['yes', 'somewhat', 'no'].map(rating => metric(ratingLabel(rating), state.feedback.filter(row => row.helpful === rating).length, 'Was this information helpful?', rating === 'yes' ? 'check' : rating === 'no' ? 'close' : 'insight')).join('')}</section><section class="panel feedback-panel"><div class="panel-header"><div><h2>Community feedback</h2><p>Ratings and comments from visitors</p></div><span class="badge ${awaiting ? 'new' : 'reviewed'}">${number(awaiting)} awaiting review</span></div><div class="table-filters"><label class="search-field">${icon('search')}<span class="sr-only">Search feedback</span><input id="feedback-search" placeholder="Search comments, ratings, or IDs…" value="${esc(state.feedbackSearch)}" /></label><label class="sr-only" for="feedback-status">Review status</label><select id="feedback-status"><option value="all">All statuses</option><option value="new" ${state.feedbackStatus === 'new' ? 'selected' : ''}>New</option><option value="reviewed" ${state.feedbackStatus === 'reviewed' ? 'selected' : ''}>Reviewed</option></select></div><div id="feedback-results">${feedbackResults()}</div></section>`;
}
function settings() {
  if (!state.settings) return empty('Settings are unavailable', 'Reload this page to try again.');
  const { comingSoon, googleAnalyticsId: id } = state.settings;
  const choice = (value, title, text) => `<label class="setting-choice"><input type="radio" name="visibility" value="${value}" ${comingSoon === (value === 'coming') ? 'checked' : ''} /><span><strong>${title}</strong><small>${text}</small></span></label>`;
  return `<form id="site-settings-form" class="settings-form" novalidate><section class="panel settings-panel"><div class="panel-header"><div><h2>Who can see the site</h2><p>Right now: <strong>${comingSoon ? 'Visitors see the coming-soon page' : 'Open to the public'}</strong></p></div><span class="badge ${comingSoon ? 'new' : 'reviewed'}">${comingSoon ? 'Coming soon' : 'Live'}</span></div><div class="panel-body"><fieldset class="setting-choices"><legend class="sr-only">Who can see the site</legend>${choice('coming', 'Coming soon', 'Visitors see a holding page. Staff and invited reviewers can sign in to see the full site.')}${choice('open', 'Open to the public', 'Anyone can use the site and send budget plans and feedback.')}</fieldset><p class="muted">The staff dashboard always requires sign-in. Publishing content and opening the site are separate: publish your content first, then open the site here.</p></div></section><section class="panel settings-panel"><div class="panel-header"><div><h2>Google Analytics</h2><p>Visitor measurement: <strong>${id ? `On · ${esc(id)}` : 'Off'}</strong></p></div><span class="badge ${id ? 'reviewed' : 'neutral'}">${id ? 'On' : 'Off'}</span></div><div class="panel-body"><label class="settings-field" for="analytics-id"><span>Measurement ID</span><input id="analytics-id" name="googleAnalyticsId" value="${esc(id)}" placeholder="G-XXXXXXXXXX" autocomplete="off" spellcheck="false" maxlength="22" aria-describedby="analytics-help" /></label><div id="analytics-help" class="muted"><p>Find this in Google Analytics under <strong>Admin › Data streams › Web</strong>. It starts with <strong>G-</strong>. Leave it blank to turn analytics off.</p><p>Only the public pages are measured: home, privacy, and coming-soon. Draft previews, sign-in, and this dashboard are never measured. The Privacy page shows the sections marked “Only while Google Analytics is on” and hides the ones marked “Only while it’s off”. Edit them in Site content › Privacy page.</p></div><p id="analytics-error" class="form-error" role="alert" hidden></p></div></section><div class="settings-actions settings-save"><span id="settings-state" class="muted" role="status">No unsaved changes</span><button class="button" id="save-settings" type="submit" disabled>Save settings</button></div></form>`;
}
function render() {
  if (!state.user) return;
  const view = views[state.view];
  $('#breadcrumb').textContent = view[0]; $('#page-title').textContent = view[1]; $('#page-description').textContent = view[2];
  document.title = `${view[0]} | ${officialName()}`;
  document.querySelectorAll('[data-view]').forEach(link => { if (link.dataset.view === state.view) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current'); });
  $('#date-toolbar').hidden = ['users', 'settings', 'content'].includes(state.view); $('#export-button').hidden = ['users', 'settings', 'content'].includes(state.view);
  $('#pdf-button').hidden = state.view !== 'reports'; $('#pdf-button').disabled = !state.summary || state.pdfBusy;
  $('#export-button').disabled = !(state.view === 'feedback' ? state.feedback.length : state.rows.length);
  if (state.view !== 'content') { $('#content').onclick = null; $('#content').oninput = null; $('#content').onchange = null; $('#content').onsubmit = null; }
  $('#content').innerHTML = state.view === 'content' ? '' : state.view === 'users' ? users() : state.view === 'settings' ? settings() : !state.summary ? empty('Data is unavailable', 'Check the message above, then refresh to try again.') : ({ overview, submissions, reports, feedback })[state.view]();
  $('#content').hidden = false; $('#loading').hidden = true;
  if (state.view === 'content') mountContentEditor($('#content'));
  $('#nav-count').textContent = state.summary ? number(state.summary.count) : '';
}
async function loadData() {
  const revision = ++state.request;
  $('#refresh-button').disabled = true; $('#export-button').disabled = true; $('#pdf-button').disabled = true;
  $('#content').setAttribute('aria-busy', 'true');
  notice();
  try {
    const params = new URLSearchParams({ from: $('#date-from').value, to: $('#date-to').value });
    const [data, feedbackData] = await Promise.all([api(`/api/admin/submissions?${params}`), api(`/api/admin/feedback?${params}`)]);
    if (revision !== state.request) return;
    state.feedback = feedbackData.feedback; state.feedbackPage = 1; state.rows = data.submissions; state.summary = data.summary; state.range = data.range; state.page = 1;
    $('#range-label').textContent = `${date(data.range.from, { year: 'numeric' })} – ${date(data.range.to, { year: 'numeric' })} · Eastern Time`;
    $('#updated-label').textContent = `Updated ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: DASHBOARD_TIME_ZONE })} · Dates in Eastern Time`;
  } catch (error) {
    if (revision !== state.request) return;
    state.feedback = []; state.rows = []; state.summary = null; state.range = null;
    $('#range-label').textContent = ''; notice(error.message);
  } finally {
    if (revision === state.request) { $('#refresh-button').disabled = false; $('#content').removeAttribute('aria-busy'); render(); }
  }
}
async function navigate() {
  const next = location.hash.slice(1);
  if (state.view === 'content' && next !== 'content' && !canLeaveContentEditor()) { history.replaceState(null, '', '#content'); return; }
  if (state.view === 'settings' && next !== 'settings' && settingsChanged() && !window.confirm('Leave without saving your settings changes?')) { history.replaceState(null, '', '#settings'); return; }
  state.view = Object.hasOwn(views, next) && (!['users', 'settings', 'content'].includes(next) || state.user?.role === 'admin') ? next : 'overview';
  if (state.summary) notice();
  if (state.view === 'users') {
    try { const data = await api('/api/admin/users'); state.users = data.users; }
    catch (error) { notice(error.message); }
  }
  if (state.view === 'settings') {
    state.settings = null;
    try { state.settings = await api('/api/admin/settings'); } catch (error) { notice(error.message); }
  }
  render();
  window.scrollTo({ top: 0, behavior: 'instant' });
}
function setPeriod(days) {
  $('#date-to').value = dashboardDay();
  $('#date-from').value = shiftDay($('#date-to').value, 1 - days);
}
function openDetail(id) {
  const row = state.rows.find(row => row.id === id);
  if (!row) return;
  $('#detail-title').textContent = `Plan #${row.id.slice(0, 8).toUpperCase()}`;
  $('#detail-content').innerHTML = `<div class="detail-meta">${date(row.submittedAt, { year: 'numeric', hour: '2-digit', minute: '2-digit' })} Eastern Time · ${statusBadge(row.status)}<br />${esc(row.cityName || cityName)}${row.target ? ` · ${money(row.target)} target` : ''}<br />Catalog ${esc(row.catalogVersion)} · ${row.illustrative ? 'Illustrative service cuts' : 'Service cuts'}</div><div class="detail-summary"><div><small>Annual gap closed</small><strong>${money(row.gapClosed ?? row.reduction)}</strong></div><div><small>Services selected for cuts</small><strong>${row.cuts.length}</strong></div></div>${(row.baseline || SERVICES).map(service => {
    const cuts = row.cuts.filter(cut => cut.serviceId === service.id);
    return `<h3 class="detail-group">${esc(service.name)} · ${money(row.budget[service.id] * 1e6)} retained</h3>${cuts.length ? cuts.map(cut => `<div class="detail-cut"><span class="cut-price">${money(cut.savings)}</span><strong>${esc(cut.name)}</strong><p>${esc(cut.impact)}</p></div>`).join('') : '<p class="muted">No cuts selected.</p>'}`;
  }).join('')}<h3 class="detail-group">Potential revenue · ${money(row.revenue || 0)}</h3>${(row.revenues || []).map(item => `<div class="detail-cut"><span class="cut-price">+${money(item.amount)}</span><strong>${esc(item.name)}</strong><p>${esc(item.description)} ${esc(item.assumption)}</p></div>`).join('') || '<p class="muted">No revenue selected.</p>'}<p id="detail-error" class="form-error" role="alert" hidden></p><div class="detail-actions"><p>Reviewing marks this plan as read.</p>${state.user.role === 'admin' ? `<button class="button" id="review-submission" data-id="${id}" data-status="${row.status === 'new' ? 'reviewed' : 'new'}">${row.status === 'new' ? 'Mark as reviewed' : 'Mark as new'}</button><button class="button secondary danger-text" data-delete-kind="submissions" data-delete-id="${id}">Delete submission</button>` : '<span class="badge neutral">Read-only access</span>'}</div>`;
  if (!$('#detail-dialog').open) $('#detail-dialog').showModal();
}
function openUser(id = null) {
  const user = state.users.find(user => user.id === id);
  state.editing = user || null;
  const form = $('#user-form'); form.reset();
  $('#user-title').textContent = user ? 'Manage user' : 'Add a user';
  $('#user-description').textContent = user ? `${user.name} · ${user.email}` : 'Give a colleague access to community submissions and reports.';
  ['name', 'email'].forEach(key => { form.elements[key].closest('label').hidden = Boolean(user); form.elements[key].required = !user; form.elements[key].value = user?.[key] || ''; });
  form.elements.role.value = user?.role || 'viewer'; form.elements.active.value = String(user?.active ?? true);
  $('#active-label').hidden = !user;
  form.elements.password.required = !user;
  $('#password-label').textContent = user ? 'Reset password (optional)' : 'Password';
  $('#password-help').textContent = user ? 'Leave blank to keep the current password. Access changes end existing sessions.' : 'At least 12 characters. Share credentials with your colleague securely. No email is sent.';
  $('#save-user').textContent = user ? 'Save changes' : 'Create user'; $('#user-error').hidden = true;
  $('#user-dialog').showModal();
}
function openDelete(kind, id) {
  if (state.user.role !== 'admin' || !['submissions', 'feedback'].includes(kind)) return;
  const row = (kind === 'feedback' ? state.feedback : state.rows).find(row => row.id === id);
  if (!row) return;
  state.deleting = { kind, id };
  $('#delete-title').textContent = kind === 'feedback' ? 'Delete feedback?' : 'Delete submission?';
  $('#delete-description').textContent = `Delete ${kind === 'feedback' ? 'feedback' : 'submission'} #${id.slice(0, 8).toUpperCase()}, received ${date(row.submittedAt || row.submitted_at, { year: 'numeric', hour: '2-digit', minute: '2-digit' })} Eastern Time?`;
  $('#delete-error').hidden = true; $('#confirm-delete').disabled = false;
  $('#delete-dialog').showModal();
}
async function downloadPDF() {
  if (!state.summary || !state.range || state.pdfBusy) return;
  const snapshot = { summary: state.summary, range: state.range };
  state.pdfBusy = true; $('#pdf-button').disabled = true;
  notice('Preparing your PDF report…');
  try {
    const { createDashboardPDF } = await import('./dashboard-pdf.js');
    const report = createDashboardPDF(snapshot);
    report.save(`${citySlug}-report-${snapshot.range.from}-to-${snapshot.range.to}.pdf`);
    notice('PDF downloaded. Open it to print the report.');
  } catch (error) { notice('The PDF could not be created. Please try again.'); }
  finally { state.pdfBusy = false; $('#pdf-button').disabled = !state.summary; }
}
function downloadCSV() {
  let csv;
  if (state.view === 'feedback') {
    csv = '\ufeff' + [['ID', 'Received (Eastern Time)', 'Helpful', 'Comment', 'Status'], ...filteredFeedback().map(row => [row.id, dashboardTimestamp(row.submitted_at), ratingLabel(row.helpful), row.comment, row.status])].map(row => row.map(csvCell).join(',')).join('\r\n');
  } else if (state.view === 'reports') {
    const s = state.summary;
    const rows = [[`${siteName}: submission analytics`], ['From (Eastern Time)', state.range.from, 'Through (Eastern Time)', state.range.to], ['Submissions (not unique people)', s.count], ['Average reduction ($)', s.averageReduction], ['Median reduction ($)', s.medianReduction], ['Average potential revenue ($)', s.averageRevenue], ['Average gap closed ($)', s.averageGapClosed], ['Average cuts per plan', s.averageCuts], ['Reviewed submissions', s.reviewed], [], ['Department', 'Saved baseline average ($)', 'Average cut ($)', 'Average retained ($)', 'Average reduction (%)', 'Plans with cuts'], ...s.departments.map(dept => [dept.name, dept.proposed, dept.average, dept.proposed - dept.average, dept.percent, dept.selections]), [], ['Selected cut', 'Department', 'Catalog', 'Count', 'Share of submissions (%)'], ...s.cuts.map(cut => [cut.name, cut.serviceName, cut.catalogVersion, cut.count, cut.count / s.count * 100]), [], ['Potential revenue', 'Catalog', 'Annual estimate ($)', 'Selections'], ...s.revenues.map(item => [item.name, item.catalogVersion, item.amount, item.count]), [], ['Methodology', `Anonymous plans; repeat submissions possible. ${baselineNote(s)} Potential revenue estimates and older illustrative catalogs may differ. Not representative polling or adopted City decisions. Department averages include all plans. ${targetLabel()}.`]];
    csv = '\ufeff' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
  } else csv = submissionsCSV(state.view === 'submissions' ? filteredRows() : state.rows);
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = `${citySlug}-${state.view === 'reports' ? 'report' : state.view === 'feedback' ? 'feedback' : 'submissions'}-${state.range.from}-to-${state.range.to}.csv`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notice('CSV exported for the selected reporting period' + (state.view === 'submissions' ? ' and current filters.' : '.'));
}
hydrateIcons();
document.addEventListener('click', async event => {
  const deletion = event.target.closest('[data-delete-id]'); if (deletion) openDelete(deletion.dataset.deleteKind, deletion.dataset.deleteId);
  const close = event.target.closest('[data-close]'); if (close) $(`#${close.dataset.close}`).close();
  const feedbackPage = event.target.closest('[data-feedback-page]');
  if (feedbackPage) { state.feedbackPage += Number(feedbackPage.dataset.feedbackPage); $('#feedback-results').innerHTML = feedbackResults(); }
  const feedbackReview = event.target.closest('[data-review-feedback]');
  if (feedbackReview) {
    feedbackReview.disabled = true;
    try {
      await api(`/api/admin/feedback/${feedbackReview.dataset.reviewFeedback}`, { method: 'PATCH', body: JSON.stringify({ status: feedbackReview.dataset.status }) });
      await loadData(); notice('Feedback review status updated.');
    } catch (error) { notice(error.message); feedbackReview.disabled = false; }
  }
  const detail = event.target.closest('[data-detail]'); if (detail) openDetail(detail.dataset.detail);
  const page = event.target.closest('[data-page]'); if (page) { state.page += Number(page.dataset.page); $('#submission-results').innerHTML = submissionResults(); }
  if (event.target.closest('#add-user')) openUser();
  const edit = event.target.closest('[data-edit-user]'); if (edit) openUser(edit.dataset.editUser);
  const review = event.target.closest('#review-submission');
  if (review) {
    review.disabled = true;
    try {
      await api(`/api/admin/submissions/${review.dataset.id}`, { method: 'PATCH', body: JSON.stringify({ status: review.dataset.status }) });
      $('#detail-dialog').close(); await loadData(); notice('Submission review status updated.');
    } catch (error) { $('#detail-error').textContent = error.message; $('#detail-error').hidden = false; review.disabled = false; }
  }
});
document.addEventListener('input', event => {
  if (event.target.id === 'feedback-search') { state.feedbackSearch = event.target.value; state.feedbackPage = 1; $('#feedback-results').innerHTML = feedbackResults(); return; }
  if (event.target.id !== 'submission-search') return;
  state.search = event.target.value; state.page = 1; $('#submission-results').innerHTML = submissionResults();
});
document.addEventListener('change', event => {
  if (event.target.id === 'feedback-status') { state.feedbackStatus = event.target.value; state.feedbackPage = 1; $('#feedback-results').innerHTML = feedbackResults(); return; }
  if (!['status-filter', 'sort-filter'].includes(event.target.id)) return;
  state[event.target.id === 'status-filter' ? 'status' : 'sort'] = event.target.value; state.page = 1; $('#submission-results').innerHTML = submissionResults();
});
// Site settings: one form, one save, so nothing typed is lost.
function settingsDraft() {
  const form = $('#site-settings-form');
  return { comingSoon: form.elements.visibility.value === 'coming', googleAnalyticsId: $('#analytics-id').value.trim().toUpperCase() };
}
function settingsChanged() {
  if (!$('#site-settings-form') || !state.settings) return false;
  const draft = settingsDraft();
  return draft.comingSoon !== state.settings.comingSoon || draft.googleAnalyticsId !== (state.settings.googleAnalyticsId || '');
}
document.addEventListener('input', event => {
  if (!event.target.closest?.('#site-settings-form')) return;
  const changed = settingsChanged();
  $('#save-settings').disabled = !changed;
  $('#settings-state').textContent = changed ? 'Unsaved changes' : 'No unsaved changes';
});
document.addEventListener('submit', async event => {
  if (event.target.id !== 'site-settings-form') return;
  event.preventDefault();
  const button = $('#save-settings'), error = $('#analytics-error');
  if (button.disabled) return;
  const draft = settingsDraft();
  if (draft.googleAnalyticsId && !/^G-[A-Z0-9]{4,20}$/.test(draft.googleAnalyticsId)) { error.textContent = 'Enter a measurement ID that starts with G-, for example G-AB12CD34EF. Universal Analytics (UA-) IDs no longer collect data.'; error.hidden = false; $('#analytics-id').focus(); return; }
  if (state.settings.comingSoon && !draft.comingSoon && !window.confirm('Open the site to the public? Anyone will be able to see it and send budget plans and feedback. Make sure your content is published first.')) return;
  button.disabled = true; error.hidden = true;
  try {
    const before = state.settings;
    state.settings = await api('/api/admin/settings', { method: 'PATCH', body: JSON.stringify(draft) });
    render();
    const changes = [];
    if (before.comingSoon !== state.settings.comingSoon) changes.push(state.settings.comingSoon ? 'Visitors now see the coming-soon page.' : 'The site is now open to the public.');
    if ((before.googleAnalyticsId || '') !== state.settings.googleAnalyticsId) changes.push(state.settings.googleAnalyticsId ? `Google Analytics is on (${state.settings.googleAnalyticsId}). Visits appear in Google Analytics within a few minutes.` : 'Google Analytics is off.');
    notice(changes.join(' ') || 'Settings saved.');
  } catch (failure) { error.textContent = failure.message; error.hidden = false; button.disabled = false; }
});
$('#delete-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!state.deleting || $('#confirm-delete').disabled) return;
  const { kind, id } = state.deleting;
  $('#confirm-delete').disabled = true; $('#delete-error').hidden = true;
  try {
    await api(`/api/admin/${kind}/${id}`, { method: 'DELETE' });
    $('#delete-dialog').close();
    if (kind === 'submissions') $('#detail-dialog').close();
    state.deleting = null; await loadData(); notice(kind === 'feedback' ? 'Feedback deleted.' : 'Submission deleted.');
  } catch (error) { $('#delete-error').textContent = error.message; $('#delete-error').hidden = false; $('#confirm-delete').disabled = false; }
});
$('#pdf-button').addEventListener('click', downloadPDF);
$('#user-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = $('#save-user'); if (button.disabled) return;
  button.disabled = true; $('#user-error').hidden = true;
  const values = Object.fromEntries(new FormData(event.target));
  const body = state.editing ? { role: values.role, active: values.active === 'true', ...(values.password ? { password: values.password } : {}) } : { name: values.name, email: values.email, role: values.role, password: values.password };
  try {
    const data = await api(`/api/admin/users${state.editing ? `/${state.editing.id}` : ''}`, { method: state.editing ? 'PATCH' : 'POST', body: JSON.stringify(body) });
    state.users = [data.user, ...state.users.filter(user => user.id !== data.user.id)];
    $('#user-dialog').close(); event.target.reset(); render(); notice(state.editing ? 'User access updated.' : 'User created. Share their sign-in credentials securely; no email was sent.');
  } catch (error) { $('#user-error').textContent = error.message; $('#user-error').hidden = false; }
  finally { button.disabled = false; }
});
$('#user-dialog').addEventListener('close', () => { $('#user-form').elements.password.value = ''; });
$('#period').addEventListener('change', () => { const custom = $('#period').value === 'custom'; $('#custom-dates').hidden = !custom; if (!custom) { setPeriod(Number($('#period').value)); loadData(); } });
$('#apply-dates').addEventListener('click', () => { if ($('#date-from').reportValidity() && $('#date-to').reportValidity()) loadData(); });
$('#refresh-button').addEventListener('click', loadData);
$('#export-button').addEventListener('click', downloadCSV);
window.addEventListener('hashchange', navigate);
async function init() {
  applyBranding();
  setPeriod(30);
  try {
    const session = await api('/api/admin/session'); state.user = session.user;
    $('#account-name').textContent = state.user.name; $('#account-role').textContent = state.user.role === 'admin' ? 'Administrator' : 'Viewer';
    $('#avatar').textContent = state.user.name.split(/\s+/).map(word => word[0]).slice(0, 2).join('').toUpperCase();
    $('#content-nav').hidden = state.user.role !== 'admin';
    $('#administration-nav').hidden = state.user.role !== 'admin'; $('#users-nav').hidden = state.user.role !== 'admin'; $('#settings-nav').hidden = state.user.role !== 'admin';
    await loadData(); await navigate();
  } catch (error) { $('#loading').hidden = true; notice(error.message); }
}
init();
