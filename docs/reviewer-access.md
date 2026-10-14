# Coming soon and reviewer access

By default, the public homepage displays `public/coming-soon.html`. Administrators
can change this in **Site settings**; disabling coming soon opens the public site
while staff pages and APIs continue to require sign-in. `/login` opens the sign-in form.
Individual staff accounts sign in there and open `/admin/`; see
[staff dashboard setup](staff-dashboard.md). An optional shared reviewer account
can also sign in to see the site before it opens; it cannot open the dashboard.
The budget, its source/assets, API, videos, and shared-result endpoints all pass
through `functions/_middleware.js`; public illustration, logo, font, and launch
page assets are explicitly allowlisted. `/coming-soon` always previews the public page.
The existing budget footer includes a **Sign out** button.

## Configuration

Server-only configuration (never use a `VITE_` prefix):

| Variable | Purpose |
| --- | --- |
| `REVIEWER_SESSION_SECRET` | Required. Random signing secret, at least 32 characters. `npm run setup` sets it for you. |
| `REVIEWER_PASSWORD` | Optional. Turns on the shared reviewer account. |
| `REVIEWER_USERNAME` | Optional. The shared reviewer's username; defaults to `reviewer`. |

For local work, put them in the ignored `.env.local` (Vite) and `.dev.vars`
(local Wrangler). Neither file belongs in Git, and neither is uploaded.

In Cloudflare they are **encrypted runtime secrets** on the Pages project, one
set per environment (Production and Preview). To add the optional reviewer
password, use the Pages dashboard or Wrangler's interactive prompt:
`npx wrangler pages secret put REVIEWER_PASSWORD --project-name=YOUR-NAME`.
Do not put passwords in command-line arguments or committed configuration.

If the session secret is missing, the site stays gated and sign-in reports that
access is not configured. Changing the reviewer password or the signing secret
signs everyone out.

## Local use and verification

- `npm run dev` and `npm run preview` use the same access logic as Pages.
- `npm run build` followed by `npx wrangler pages dev dist` exercises the actual
  Pages middleware and local `.dev.vars`.
- `npm test` checks authentication, route protection, cookie tampering/expiry,
  same-origin form posts, redirect validation, throttling, and cache behavior.

Sessions last eight hours and use a signed, HTTP-only, same-site cookie with
`Secure` enabled on HTTPS. The password is submitted only to the server. Staff sessions use a separate
HTTP-only cookie, check the current account status on every request, and are
revoked by role, password, or account-status changes. Sign out clears both cookies. Login
errors do not reveal which credential was wrong. A per-isolate, per-IP backoff
limits repeated failed sign-ins; this is best-effort protection, not a global
rate limit across Cloudflare isolates. Private responses and auth responses use
`no-store` and `noindex`; the runtime blocks crawling and suppresses the sitemap.
Shared preview links also require login during the coming-soon period.

The gate requires the Vite server or Cloudflare Pages Functions. Do not publish
the `dist` directory to a static-only host: it contains the original budget HTML.
For public launch, disable coming soon in Site settings. The middleware continues
to protect staff pages and APIs, while public routes use their built indexing settings.
