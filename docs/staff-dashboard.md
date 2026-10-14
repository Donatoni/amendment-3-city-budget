# Staff dashboard

The dashboard lives at `/admin/`, behind individual staff sign-in. It includes:

- Overview: submission count, average reduction, average selected cuts, reviewed
  count, participation over time, proportional department reductions, recent plans.
- Submissions: search by plan ID, department, or cut; filter review status; sort
  by receipt date or reduction; view each saved cut, impact, and retained funding.
  Administrators can mark a plan reviewed or new, or permanently delete an individual
  plan after confirmation. Lists use 10 rows per page.
- Reports: most selected cuts, median reduction, department-level average cuts
  and retained funding, plus CSV export and a printable PDF report for the selected
  date range. PDFs include summary metrics, department comparisons, proportional
  reductions, all selected-cut rankings, methodology, timestamps, and page numbers.
- Feedback: helpfulness totals, comments, search, status/date filters, CSV export,
  and administrator review/delete controls.
- Site content: administrators edit and publish the public site's words,
  images, budget and videos (see the [content guide](city-template-setup.md)).
- Site settings: administrators choose who can see the site (coming soon or open
  to the public) and set an optional Google Analytics measurement ID.
- Users: administrators can add accounts, change roles, disable/re-enable access,
  and reset passwords. Viewers can read reports and export data but cannot review
  plans or manage users. No invitation email is sent.

## Local development

Use Node 22.13+ for built-in SQLite support. `npm run dev` and `npm run preview`
automatically create/migrate `.cache/dashboard.sqlite`, shared across local
servers started from this repository. It is ignored by Git. Back it up before
clearing `.cache` if you need the local records. Local data never syncs to production.

Keep `REVIEWER_SESSION_SECRET` (32+ random characters) in `.env.local`. To create
a local administrator:

```sh
npm run admin:create -- your-email@example.gov "Your Name"
```

Save the generated password securely. The command refuses to overwrite an
existing account. Sign in at `/login?next=%2Fadmin%2F` with that email and password.
The shared reviewer credentials continue to open only the budget experience.
Do not put real staff passwords in source code or shell arguments.

## Cloudflare deployment

Each installation's `wrangler.jsonc` names its `DASHBOARD_DB` database (and an
optional separate preview database). `npm run setup` creates the database,
applies the migrations in `migrations/`, sets the session secret and creates
the first administrator; see [DEPLOYMENT.md](../DEPLOYMENT.md). Add other staff
in **Manage users**. Accounts and submissions persist in D1 across deployments.

For a future schema change, apply the new migration to each environment before
deploying code that needs it:

```sh
npx wrangler d1 migrations apply YOUR-NAME-db --remote
```

Keep `REVIEWER_SESSION_SECRET` (32+ random characters) configured as an
encrypted runtime secret in each environment. Local `.env.local` and `.dev.vars`
are never uploaded.

To recover when no administrator can sign in, run
`npm run setup -- admin you@city.gov --reset`. As a last resort you can set
server-only `ADMIN_EMAIL` and `ADMIN_PASSWORD` Pages secrets and redeploy; that
recovery account is not listed in Users. Remove both secrets and redeploy once
an ordinary administrator works again.

Staff passwords use salted PBKDF2-SHA256 hashes (100,000 iterations, compatible
with Workers Web Crypto), never plaintext. New passwords must be 12 to 256
characters. For local Pages verification, apply D1 migrations with `--local`,
put test secrets in `.dev.vars`, then run `npx wrangler pages dev dist`. Vite's
SQLite database is separate from Wrangler's database and from remote D1.

If storage is missing, the submission API returns 503 and the budget experience
shows a save failure. It does not claim success or fall back to localStorage.
The dashboard shows an actionable storage error.

## Collection and interpretation

`POST /api/submissions` saves anonymous budget plans. The current reviewer gate
still protects this endpoint during the coming-soon period. The server checks
the budget version, unique valid item IDs, and the published gap target; it derives the
costs, impacts, department totals, and timestamp instead of trusting client
values. It excludes property searches, assessed home values, contact details,
and IP addresses. A client-generated UUID makes retries of the same plan
idempotent; a conflicting plan using the same identifier is rejected.

Successful submission means the shared database has accepted the plan.
Sharing and downloading still work if saving fails. Feedback is handled by
`/api/feedback` and shown in Feedback; it does not send an email notification.

Reports default to the last 30 calendar days, inclusive, in Eastern Time (America/New_York), with automatic daylight-saving changes. Presets cover
7 and 90 days; custom ranges cover up to 366 days. Larger periods group the
activity chart in seven-day buckets beginning on the range's first date. Date
filters and daily chart groups use Eastern calendar days; stored server receipt timestamps remain UTC. Dashboard dates and CSV/PDF exports use Eastern Time. All status values contribute to metrics;
reviewed means read by staff, not approved. Submissions search/status filters
apply to the submission list and its CSV; overview and reports use every plan
in the date range. Reports export the aggregate report and all selected-cut
frequencies, while overview exports all plans in range.

Averages include every plan, including those with zero cuts to a department.
Proportional cuts divide average cuts by each department's proposed budget.
Cut frequency divides selections by total plans; multiple cuts can occur in
one plan, so percentages do not sum to 100%. Names, costs, impacts, and retained
funding come from saved snapshots; cut rankings distinguish catalog versions.
The proposed-budget comparison uses the currently published budget. When the
budget changes, report earlier and later plans by date period rather than
combining them.

These are submitted plans, not unique residents or a representative poll. The
budget choices are illustrative and must not be described as adopted decisions.

## Access and validation

API routes independently enforce staff authentication and administrator roles.
The page itself also rejects reviewer-only sessions. Mutations require a
same-origin request. Password/role/status changes increment the account session
version, revoking older cookies (including after re-enabling an account). A user
cannot change their own access through this screen. Cookies expire in eight
hours and use HTTP-only, same-site, secure-on-HTTPS attributes. Existing login
backoff applies to staff logins too; it remains per-process/isolate protection.
Private pages and APIs use no-store/noindex. CSV exports escape fields and
neutralize formula prefixes. Submissions are never fabricated to fill the UI.

The first version loads all submissions in the requested bounded date range for
aggregation and browser filtering. For high response volumes, move aggregation
and pagination into SQL before increasing range limits.

Run `npm test`, `npm run build`, and
`npx wrangler pages functions build --outdir=.cache/dashboard-functions`.
Dashboard tests cover persistence, server recalculation, retry deduplication,
access roles, session revocation, request validation, date boundaries, aggregates,
and CSV escaping. No test sends feedback email or writes to production.

## Site availability and feedback

Migration `0002_feedback_and_settings.sql` adds feedback and site settings.
The coming-soon setting defaults to enabled, including when the setting cannot
be read. Only administrators can read or change settings. Disabling coming soon
opens the public site, assets, property lookup, budget submissions, and feedback.
Staff pages and APIs still require staff authentication, and viewer restrictions
remain unchanged. `/coming-soon` remains a preview of the holding page.
Public pages and APIs use no-store so changing availability takes effect promptly.
When open, public pages use the published search and sharing settings; staff pages stay noindex.

Feedback includes a UUID, server receipt timestamp, rating, comment, and review
status. Comments are limited to 500 characters and escaped in the dashboard; CSV
exports use the existing formula-neutralization helper. UUID retries are
idempotent, and attempts to reuse an ID with a different response are rejected.
No contact field, property data, visitor IP, or client timestamp is retained.

## Response deletion

Only administrators can delete submissions or feedback. Each action requires a
confirmation in the dashboard and removes one specified record permanently.
There is no bulk-delete action. The API independently checks role, origin, and
record ID. Deleting a plan removes it from subsequent dashboard reports and
exports; PDFs and CSVs downloaded earlier remain unchanged. Viewers cannot delete.

The PDF is generated in the browser from the same date-filtered summary shown
in Reports & insights. Download it and open it in a PDF viewer to print on US
Letter paper. PDF generation is loaded on demand and sends no report data to an
external service. Empty date ranges produce a report with zero submissions.
