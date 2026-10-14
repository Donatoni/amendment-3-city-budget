import { budgetModel, configuredPlan } from '../src/budget-model.js';
import { defaultSiteConfig } from '../src/site-defaults.js';
import { summarizeSubmissions } from '../src/dashboard-data.js';
import { dashboardDay, dashboardDayStart, shiftDay } from '../src/dashboard-time.js';
import { dashboardStore } from './dashboard-store.js';
import { hashPassword, publicUser, staffSession } from './staff-auth.js';
import { handleContentAdmin, loadPublishedConfig } from './city-content.js';
import { GOOGLE_ANALYTICS_SETTING, normalizeAnalyticsId } from '../src/analytics.js';

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
async function readBody(request) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) fail('Use a JSON request body.', 415);
  const reader = request.body?.getReader();
  let length = 0;
  const chunks = [];
  if (reader) while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 32768) { await reader.cancel(); fail('Request is too large.', 413); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try {
    const data = JSON.parse(new TextDecoder().decode(bytes));
    if (!data || Array.isArray(data) || typeof data !== 'object') fail('Invalid JSON request.');
    return data;
  } catch { fail('Invalid JSON request.'); }
}
export function validateSubmission(data, config = defaultSiteConfig) {
  const model = budgetModel(config);
  if (!uuid(data.id)) fail('A valid submission identifier is required.');
  if (data.costCenterVersion !== model.version) fail('This budget catalog has changed. Reload the page before submitting.', 409);
  if (!Array.isArray(data.cuts) || data.cuts.length > model.items.length) fail('Select valid service cuts.');
  const ids = data.cuts.map(cut => typeof cut === 'string' ? cut : cut?.id);
  if (new Set(ids).size !== ids.length || ids.some(id => !model.items.some(cut => cut.id === id))) fail('The selected service cuts are invalid.');
  const revenueIds = data.revenues ?? [];
  if (!Array.isArray(revenueIds) || revenueIds.length > model.revenues.length || new Set(revenueIds).size !== revenueIds.length || revenueIds.some(id => !model.revenues.some(item => item.id === id))) fail('The selected potential revenues are invalid.');
  let plan;
  try { plan = configuredPlan(ids, revenueIds, data.millageRate, config); }
  catch (error) { fail(error.message); }
  if (!plan.targetMet) fail(`Your plan must meet the ${model.target.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} gap target.`);
  // All names, costs, totals and timestamps are established on the server.
  return { id: data.id, submitted_at: new Date().toISOString(), catalog_version: model.version, reduction: plan.reduction,
    snapshot: JSON.stringify({ cityName: config.city.name, target: model.target, baseline: model.services.map(service => ({ id: service.id, name: service.name, proposed: Math.round(service.proposed * 1e8) / 100 })), illustrative: false, cuts: plan.items, revenues: plan.revenues, millageRate: plan.millageRate, revenue: plan.revenue, gapClosed: plan.gapClosed, budget: Object.fromEntries(model.services.map((service, i) => [service.id, plan.values[i]])) }) };
}
function deserialize(row) {
  return { ...JSON.parse(row.snapshot), id: row.id, submittedAt: row.submitted_at, status: row.status, catalogVersion: row.catalog_version, reduction: row.reduction };
}
export function dateRange(params) {
  const from = params.get('from') || shiftDay(dashboardDay(), -29);
  const to = params.get('to') || dashboardDay();
  const valid = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  if (!valid(from) || !valid(to) || from > to) fail('Choose a valid start and end date.');
  if (Date.parse(to) - Date.parse(from) > 365 * 86400000) fail('Choose a date range of up to 366 days.');
  return { from, to, start: dashboardDayStart(from), end: dashboardDayStart(shiftDay(to, 1)) };
}
export async function handleDashboardRequest(request, env) {
  let response;
  try {
    const path = new URL(request.url).pathname.replace(/\/$/, '');
    const method = request.method;
    if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(method)) fail('Method not allowed.', 405);
    if (method !== 'GET' && request.headers.get('Origin') !== new URL(request.url).origin) fail('Refresh the page and try again.', 403);
    if (path === '/api/submissions' && method === 'POST') {
      const row = validateSubmission(await readBody(request), await loadPublishedConfig(env));
      const store = dashboardStore(env);
      await store.createSubmission(row);
      const saved = await store.submission(row.id);
      if (saved.snapshot !== row.snapshot || saved.catalog_version !== row.catalog_version) fail('This submission identifier has already been used for another plan.', 409);
      response = Response.json({ id: saved.id, submittedAt: saved.submitted_at }, { status: 201 });
    } else if (path === '/api/feedback' && method === 'POST') {
      const data = await readBody(request);
      if (data.botcheck) fail('The feedback could not be accepted.');
      if (!uuid(data.id)) fail('A valid feedback identifier is required.');
      if (!['yes', 'somewhat', 'no'].includes(data.helpful)) fail('Choose a helpfulness rating.');
      if (typeof data.comment !== 'string' || data.comment.length > 500) fail('Use a comment of up to 500 characters.');
      const row = { id: data.id, helpful: data.helpful, comment: data.comment.trim(), submitted_at: new Date().toISOString() };
      const store = dashboardStore(env);
      await store.createFeedback(row);
      const saved = await store.feedbackById(row.id);
      if (saved.helpful !== row.helpful || saved.comment !== row.comment) fail('This feedback identifier has already been used.', 409);
      response = Response.json({ success: true, id: saved.id }, { status: 201 });
    } else {
      const user = await staffSession(request, env);
      if (!user) fail('Sign in with a staff account to open the dashboard.', 401);
      if (['/api/admin/content', '/api/admin/content/publish', '/api/admin/media'].includes(path)) {
        response = await handleContentAdmin(request, env, user);
      } else if (path === '/api/admin/session' && method === 'GET') {
        response = Response.json({ user: publicUser(user), storage: env.DASHBOARD_DB ? 'connected' : 'unavailable' });
      } else {
        const store = dashboardStore(env);
        if (method === 'DELETE' && /^\/api\/admin\/(?:submissions|feedback)\/[^/]+$/.test(path)) {
          if (user.role !== 'admin') fail('Administrator access is required.', 403);
          const id = path.split('/').at(-1);
          if (!uuid(id)) fail('A valid response identifier is required.');
          const feedback = path.startsWith('/api/admin/feedback/');
          if (!await (feedback ? store.feedbackById(id) : store.submission(id))) fail('Response not found.', 404);
          await (feedback ? store.deleteFeedback(id) : store.deleteSubmission(id));
          response = Response.json({ id, deleted: true });
        } else if (path === '/api/admin/settings') {
          if (user.role !== 'admin') fail('Administrator access is required.', 403);
          if (method === 'PATCH') {
            const data = await readBody(request);
            if (data.comingSoon === undefined && data.googleAnalyticsId === undefined) fail('Choose a setting to change.');
            if (data.comingSoon !== undefined && typeof data.comingSoon !== 'boolean') fail('Choose whether the coming-soon page is enabled.');
            const analyticsId = data.googleAnalyticsId === undefined ? undefined : normalizeAnalyticsId(data.googleAnalyticsId);
            if (analyticsId === null) fail('Enter a Google Analytics measurement ID that starts with G-, for example G-AB12CD34EF, or leave it blank to turn analytics off.');
            if (data.comingSoon !== undefined) await store.setSetting('coming_soon', String(data.comingSoon));
            if (analyticsId !== undefined) await store.setSetting(GOOGLE_ANALYTICS_SETTING, analyticsId);
          } else if (method !== 'GET') fail('Method not allowed.', 405);
          response = Response.json({ comingSoon: (await store.setting('coming_soon'))?.value !== 'false', googleAnalyticsId: normalizeAnalyticsId((await store.setting(GOOGLE_ANALYTICS_SETTING))?.value) || '' });
        } else if (path === '/api/admin/feedback' && method === 'GET') {
          const range = dateRange(new URL(request.url).searchParams);
          response = Response.json({ feedback: await store.feedback(range.start, range.end), range: { from: range.from, to: range.to } });
        } else if (path.startsWith('/api/admin/feedback/') && method === 'PATCH') {
          if (user.role !== 'admin') fail('Administrator access is required.', 403);
          const id = path.split('/').at(-1);
          const data = await readBody(request);
          if (!['new', 'reviewed'].includes(data.status)) fail('Invalid review status.');
          if (!await store.feedbackById(id)) fail('Feedback not found.', 404);
          await store.reviewFeedback(id, data.status);
          response = Response.json({ id, status: data.status });
        } else if (path === '/api/admin/submissions' && method === 'GET') {
          const range = dateRange(new URL(request.url).searchParams);
          const config = await loadPublishedConfig(env);
          const catalog = new URL(request.url).searchParams.get('catalog');
          const rows = (await store.submissions(range.start, range.end)).map(deserialize).filter(row => !catalog || row.catalogVersion === catalog);
          response = Response.json({ submissions: rows, summary: summarizeSubmissions(rows, budgetModel(config).services), currentCatalog: { version: config.budget.version, target: config.budget.target, cityName: config.city.name }, range: { from: range.from, to: range.to } });
        } else if (path.startsWith('/api/admin/submissions/') && method === 'PATCH') {
          if (user.role !== 'admin') fail('Administrator access is required.', 403);
          const id = path.split('/').at(-1);
          const data = await readBody(request);
          if (!['new', 'reviewed'].includes(data.status)) fail('Invalid review status.');
          if (!await store.submission(id)) fail('Submission not found.', 404);
          await store.review(id, data.status);
          response = Response.json({ id, status: data.status });
        } else if (path === '/api/admin/users' && method === 'GET') {
          if (user.role !== 'admin') fail('Administrator access is required.', 403);
          response = Response.json({ users: (await store.users()).map(publicUser) });
        } else if (path === '/api/admin/users' && method === 'POST') {
          if (user.role !== 'admin') fail('Administrator access is required.', 403);
          const data = await readBody(request);
          const name = typeof data.name === 'string' ? data.name.trim() : '';
          const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
          if (!name || name.length > 100 || email.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Enter a name and a valid email address.');
          if (!['admin', 'viewer'].includes(data.role)) fail('Choose an administrator or viewer role.');
          if (typeof data.password !== 'string' || data.password.length < 12 || data.password.length > 256) fail('Use a password between 12 and 256 characters.');
          if (email === env.ADMIN_EMAIL?.toLowerCase() || email === (env.REVIEWER_USERNAME || 'reviewer').toLowerCase() || await store.userByEmail(email)) fail('An account already uses this email.', 409);
          const created = { id: crypto.randomUUID(), name, email, role: data.role, active: 1, password_hash: await hashPassword(data.password), created_at: new Date().toISOString() };
          try { await store.createUser(created); } catch (error) { if (/unique/i.test(error.message)) fail('An account already uses this email.', 409); throw error; }
          response = Response.json({ user: publicUser(created) }, { status: 201 });
        } else if (path.startsWith('/api/admin/users/') && method === 'PATCH') {
          if (user.role !== 'admin') fail('Administrator access is required.', 403);
          const id = path.split('/').at(-1);
          if (id === user.id || id === 'bootstrap') fail('You cannot change your own access here.');
          const target = await store.user(id);
          if (!target) fail('User not found.', 404);
          const data = await readBody(request);
          if (data.role !== undefined) {
            if (!['admin', 'viewer'].includes(data.role)) fail('Invalid role.');
            target.role = data.role;
          }
          if (data.active !== undefined) {
            if (typeof data.active !== 'boolean') fail('Invalid account status.');
            target.active = Number(data.active);
          }
          if (data.password !== undefined) {
            if (typeof data.password !== 'string' || data.password.length < 12 || data.password.length > 256) fail('Use a password between 12 and 256 characters.');
            target.password_hash = await hashPassword(data.password);
          }
          await store.updateUser(target);
          response = Response.json({ user: publicUser(target) });
        } else fail('Not found.', 404);
      }
    }
  } catch (error) {
    response = Response.json({ error: error.status ? error.message : 'The request could not be completed. Please try again.', ...(error.status && Array.isArray(error.field) ? { field: error.field } : {}) }, { status: error.status || 500 });
  }
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  return response;
}
