# Amendment 3 city budget site

A ready-to-use website that helps residents understand Florida's **Property
Tax Amendment 3** (November 2026 ballot) and what it could mean for their city.
It was built by the City of DeLand and shared so any Volusia County city can run
its own copy.

**See it live:** [amendment-3.delandfl.gov](https://amendment-3.delandfl.gov) (DeLand's version)

## What residents can do

- **Learn** what Amendment 3 changes, in plain language.
- **Estimate their savings:** look up their home through the Volusia County
  Property Appraiser (or type a value) and see estimated city tax savings for
  2027 and 2028.
- **Balance the budget:** choose service cuts and potential new revenue to
  close the city's budget gap, then submit their plan.
- **Share** a personalized postcard of their plan on social media.
- **Give feedback** on whether the information was useful.

## What city staff get

- A **staff dashboard** to read submitted plans and feedback, with charts,
  CSV exports and a printable PDF report.
- A **content editor** to change every word, photo, video, FAQ and budget figure
  without touching code, with a draft, preview and publish workflow and a
  checklist of anything that still looks like DeLand's.
- **Settings** to keep a "coming soon" page up until you're ready, and to add
  Google Analytics if you use it.
- **Staff accounts** with administrator and read-only roles.

Each city's copy is completely separate: its own website, database, file
storage and staff accounts. Nothing is shared with DeLand or other cities.

## Getting started

| Step | Who | Guide | Time |
| --- | --- | --- | --- |
| 1. Put your copy online | IT or a technical staff member | [DEPLOYMENT.md](DEPLOYMENT.md) | About 45 minutes |
| 2. Make it your city's | Communications and Finance | [Content guide](docs/city-template-setup.md) | A few hours to gather and enter content |
| 3. Open it to the public | An administrator | One switch in **Site settings** | A minute |

**What you need:** a free [Cloudflare](https://dash.cloudflare.com/sign-up)
account to host it, a computer with [Node.js](https://nodejs.org) 22.13 or newer,
and about 45 minutes. Hosting on Cloudflare's free plan costs nothing for most
cities. No developer is needed for day-to-day use.

**Before you start, gather:**

- Your city's operating millage rate (from Finance).
- The budget gap you want residents to work on, and the departments and budget
  items to offer, with annual amounts (from Finance).
- Your logo, a few photos of city services, and optionally department videos.
- City Clerk phone and mailing address, and links to your budget, millage,
  privacy policy and public records pages.

## Good to know

- **The site starts with DeLand's content as an example**, including three
  banner photos and one video for each of four departments. Every page works on
  day one, and the editor lists what still needs to be replaced. Replace all of
  it before opening the site; DeLand's numbers don't apply to your city.
- **Volusia County only.** The property lookup uses the Volusia County Property
  Appraiser. Other counties need developer work.
- **The tax math is built in.** Amendment 3's exemption amounts are the same for
  every Florida city and aren't editable. Your city's millage rate and budget are.
- **You own your copy.** Updates to this repository are optional; your content
  lives in your own database and is never overwritten by a code update.

## Seeing visitor numbers in Google Analytics

Once a measurement ID is saved in **Site settings**, Google Analytics measures
the public pages. Counts start from the day you add the ID; nothing is measured
before that.

**Visitors, where they come from, and where they are.** These come with Google
Analytics automatically. In [Google Analytics](https://analytics.google.com),
open your property and go to:

- **Reports › Reports snapshot** for total visitors (shown as "Active users")
  over the date range at the top right.
- **Reports › Acquisition › Traffic acquisition** for where visitors came from,
  such as search, social media, email or typing the address directly.
- **Reports › User › User attributes › Demographic details**, then choose
  **City** or **Region** from the table's first column, for general location.
  Location is approximate and based on the visitor's network.

**Budget challenge abandonment.** The site sends three events as a resident
works through the budget challenge. Each is counted at most once per visit to
the page:

| Event | When it is sent |
| --- | --- |
| `challenge_start` | The resident first checks a cut, adds a revenue, or moves the millage slider. |
| `challenge_target_met` | Their plan reaches the budget target. |
| `challenge_submit` | The city's server confirms their plan was saved. Failed saves aren't counted. |

If someone opens a shared plan and submits it unchanged, the earlier events are
sent too, so "started" is never lower than "submitted." Opening a shared plan
that already meets the target doesn't count until the resident changes
something.

To see how many residents start and then leave:

1. Go to **Explore** and choose **Funnel exploration**.
2. Under **Steps**, click the pencil icon and add three steps. For each, choose
   **Add new condition › Event name** and enter `challenge_start`, then
   `challenge_target_met`, then `challenge_submit`. Click **Apply**.
3. Set the date range at the top left. The chart shows how many visitors reached
   each step. The **Abandonment** and **Abandonment rate** rows show how many
   left at each step; the drop from step 1 to step 3 is the total abandonment.
4. Rename the exploration (for example, "Budget challenge funnel") so you can
   find it again under **Explore**.

Good to know:

- To check that events are arriving, open **Reports › Realtime**, try the
  challenge yourself on the live site, and look for the event names in the
  **Event count by Event name** card. New events can take a day or two to
  appear in the other reports.
- Optionally, mark `challenge_submit` as a key event (**Admin › Data display ›
  Events**, then turn on **Mark as key event**) so submissions show up in
  standard reports alongside traffic sources.
- Google Analytics counts are usually a little lower than the dashboard's
  submission count, because some browsers and ad blockers block Google
  Analytics. Use the dashboard for the number of plans received and Google
  Analytics for the share of people who start and finish.

## Questions

Contact the person at the City of DeLand who shared this with you. Technical
details are below and in [DEPLOYMENT.md](DEPLOYMENT.md#if-something-goes-wrong).

## License

[MIT](LICENSE). You're free to use, change and share this code, including the
sample photos and videos, for your own city's site.

## Technical reference

The rest of this page is for whoever maintains the code.

### Staff dashboard

`/admin/` has Overview, Submissions, Reports & insights, Feedback, **Site
content**, **Site settings** and **Manage users**. Administrators edit and
publish content and settings; viewers can read responses and reports. Reports
export to CSV and PDF and use Eastern Time. See
[docs/staff-dashboard.md](docs/staff-dashboard.md) for metrics and access rules.

### Local development

Requires Node.js 22.13 or newer (for built-in SQLite) and Python 3 (only for
preparing videos during deployment).

```bash
npm ci
```

```bash
cp .env.example .env.local
```

Set `REVIEWER_SESSION_SECRET` in `.env.local` to 32 or more random characters,
then create a local administrator (the password is printed once):

```bash
npm run admin:create -- you@example.gov "Your Name"
```

```bash
npm run dev
```

Sign in at `/login`. Local data lives in `.cache/dashboard.sqlite` and uploads
in `.cache/city-media/`; neither syncs anywhere.

| Command | What it does |
| --- | --- |
| `npm run dev` | Local server with sign-in, the dashboard and the APIs. |
| `npm test` | All automated checks (about 10 seconds). |
| `npm run build` | Production build into `dist/`, using `SITE_URL` from `wrangler.jsonc`. |
| `npm run preview` | Serves the built site with the same sign-in and APIs. |
| `npm run setup` | Creates or reuses a city's Cloudflare resources and writes `wrangler.jsonc`. |
| `npm run deploy` | Tests, builds and uploads to the project in `wrangler.jsonc`. |
| `npm run build:cloudflare` | The build Cloudflare runs for Git deployments. |

The site needs Vite or Cloudflare Pages Functions to run its sign-in gate and
APIs. Don't publish `dist/` to a static-only host.

### Configuration

| Where | Setting | Purpose |
| --- | --- | --- |
| `wrangler.jsonc` | `vars.SITE_URL` | The public address, used for canonical links, the sitemap and sharing. |
| `wrangler.jsonc` | `vars.PRODUCTION_BRANCH` | The Git branch that publishes the live site. |
| `wrangler.jsonc` | `vars.CLOUDFLARE_ACCOUNT_ID` | The account that owns the project (not a secret). |
| `wrangler.jsonc` | `DASHBOARD_DB`, `CITY_MEDIA` | The D1 database and R2 media bucket. |
| Pages secret | `REVIEWER_SESSION_SECRET` | Required. Signs sign-in sessions. Set by `npm run setup`. |
| Pages secret | `REVIEWER_USERNAME`, `REVIEWER_PASSWORD` | Optional shared reviewer account. |
| Pages secret | `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Emergency recovery administrator only. |
| Build variable | `SEO_NOINDEX=true` | Marks a build as not for search engines. |

`npm run setup` writes `wrangler.jsonc`; a fresh copy doesn't have one. Content,
staff accounts, submissions, feedback and settings live in D1; uploads live in R2. See [docs/reviewer-access.md](docs/reviewer-access.md) for the sign-in
gate and secrets.

### How the code is organized

| Path | Contents |
| --- | --- |
| `index.html`, `public/*.html`, `admin/index.html` | Page templates (home, privacy, coming soon, sign-in, 404, dashboard). |
| `src/main.js` and friends | The public site: calculator, budget builder, sharing, motion. |
| `src/content-editor*.js`, `src/dashboard*.js` | The staff dashboard and the Site content editor. |
| `src/site-defaults.js` | The starter content every new installation begins with (DeLand's, as a sample). |
| `src/site-document.js` | Applies published content to each page as it is served: text, images, search and sharing metadata, structured data, analytics. |
| `src/key-facts.js`, `src/content-model.js`, `src/markdown.js` | Key facts and `{{tokens}}`, whole-paragraph text and repeating sections, and the small, safe Markdown dialect the editor saves. |
| `src/site-config-schema.js` | Validation for everything the editor saves. |
| `server/` | Shared server code: content storage, sign-in, dashboard API, property lookup, share images. |
| `functions/` | Cloudflare Pages Functions (routes for the APIs, sharing, sitemap and videos). |
| `migrations/` | D1 database schema. |
| `scripts/` | Setup, deploy, build and maintenance scripts. |
| `tests/` | `node --test` suites. |

Two files are generated: `src/site-bindings.js` and `src/content-recipes.js`.
After changing the text structure of a page template, run
`node scripts/generate-content-model.mjs`; a test fails if they are out of date.
`src/previous-starter.js` lists earlier starter wording so saved content that
was never edited moves to the current wording.

### How content works

- **Draft and publish.** The editor saves a draft with a revision number;
  publishing copies it to the published version that every page reads.
  Conflicting saves from two administrators are refused rather than merged.
- **Key facts.** City-specific values (fiscal years, General Fund totals, Clerk
  contacts, city pages, review dates) are entered once and used in text as
  `{{tokens}}`, shown in the editor as shaded chips.
- **Rendering.** Pages are built once with DeLand's starter text, then
  `src/site-document.js` replaces it with the published content on every
  request (through `functions/_middleware.js` in Cloudflare and the Vite plugin
  locally). Search titles, descriptions, link previews, structured data and the
  sitemap all come from published content, so nothing city-specific is baked
  into the build except the site address.
- **Analytics.** A GA4 measurement ID saved in Site settings is added to public
  pages only, never to previews, sign-in or the dashboard. The budget challenge
  sends funnel events through `createChallengeTracker` in `src/analytics.js`;
  without an ID there is no `gtag` and nothing is sent.

### Calculator and property lookup

The calculator uses assessed value before exemptions and the city's operating
millage from City & branding. For 2027 and 2028 it subtracts the additional
homestead exemption (up to $150,000, then $250,000) from city taxable value,
holding value and rate constant. When the county record includes a complete
2026 city tax line, its published estimate and rate are used instead of the
model. School, county and other taxes and assessments are excluded.

`POST /api/property` searches the Volusia County Property Appraiser's public
website by address or parcel ID (at most 12 results, owner names removed) and
reads the parcel summary. A property counts as in the city only when its record
lists the city's operating authority; a mailing address is not enough. Missing
or changed data fails safely to manual entry. Searches are not stored or logged.

### Budget versions and submissions

Each published budget has a version. Submissions store the version, the chosen
items and their amounts and impacts at the time, and are recalculated and
validated on the server. Shared links carry the version, so a link from an
older budget is refused rather than reinterpreted. Changing a city's budget
therefore never changes earlier responses.

### Sharing, videos and media

- `/share/` links return personalized titles, descriptions and a 1200×630
  PNG built on the server, so social networks preview the resident's plan.
- Videos are served with HTTP byte ranges so they can be scrubbed.
  `scripts/prepare-cloudflare.py` re-encodes copies larger than Cloudflare's
  25 MiB file limit during deployment; sources stay unchanged.
- Images and videos uploaded in the dashboard are stored in R2 and served from
  `/api/media/`.
- Fonts are hosted locally. There is no third-party player or tracking unless
  a city adds Google Analytics.

### Testing

`npm test` runs every suite: tax math, property lookup parsing, budget and
submission validation, sign-in and access control, dashboard reports and time
zones, content editing, publishing and migration of older content, rendering
and escaping, search metadata, sharing, video ranges, and a house-style check
that blocks em dashes in content and docs. Before a release also run:

```bash
npm run build
```

```bash
npx wrangler pages functions build --outdir=.cache/functions-check
```
