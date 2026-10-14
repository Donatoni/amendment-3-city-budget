# Set up this site for your city

This guide is for the person at a city who will put their own copy of this site
online. You don't need to be a developer, but you will type a few commands into a
terminal. Plan on about 45 minutes; most of that is waiting for the first upload.

When you're done you will have:

- your own site at `https://<your-name>.pages.dev/` (you can add a custom domain later),
- a staff dashboard at `/admin/` where you edit every word, photo, and budget figure,
- a "coming soon" page in front of everything until you choose to open the site.

Nothing is shared with DeLand or any other city. Your copy gets its own database,
its own file storage, and its own staff accounts.

> **Only Volusia County cities are supported.** The property lookup uses the
> Volusia County Property Appraiser. Supporting another county needs developer work.

## What you need

| | |
| --- | --- |
| A Cloudflare account | Free at [dash.cloudflare.com](https://dash.cloudflare.com/sign-up). The free plan is enough for most cities. |
| Node.js 22.13 or newer | From [nodejs.org](https://nodejs.org) (choose the LTS version). |
| Python 3 | Already on Macs. On Windows, install from [python.org](https://www.python.org). |
| Git | From [git-scm.com](https://git-scm.com), or use GitHub Desktop. |
| An email address | For the first dashboard administrator. |

## 1. Get your own copy of the code

On this repository's GitHub page, click **Use this template › Create a new
repository** and create it under your city's GitHub account or organization
(private is fine). That gives you a clean copy you own. Then download it:

```bash
git clone https://github.com/YOUR-CITY/YOUR-REPO.git
```

No GitHub account? Use **Code › Download ZIP** on this page instead, unzip it,
and open a terminal in that folder. You can still do every step below; you just
won't get automatic deploys from GitHub.

```bash
cd YOUR-REPO
```

```bash
npm ci
```

## 2. Sign in to Cloudflare

```bash
npx wrangler login
```

A browser window opens. Sign in with the Cloudflare account that should own the
site and click **Allow**.

## 3. Run the setup

```bash
npm run setup
```

It asks up to six questions:

1. **Which Cloudflare account** (only if you have more than one).
2. **A short name**, such as `springfield-budget`. This becomes your web address
   (`springfield-budget.pages.dev`) and the name of everything it creates.
3. **The public web address.** Press Enter to use the `pages.dev` address for now.
4. **The Git branch for the live site.** Press Enter for `main`.
5. **The first administrator's email.**
6. **Whether to create a separate preview database and bucket.** Say no unless
   you will connect GitHub and use preview branches (see below).

It then shows the plan and asks before creating anything. Setup creates a
Cloudflare Pages project, a database, and a media bucket; sets up the database
tables and a sign-in security key; and creates the administrator with a strong
generated password. The password is **not** shown on screen. It's saved to a
private file, `.cache/<your-name>/ADMIN-LOGIN.txt`. Move it into a password
manager and delete the file.

Setup also writes `wrangler.jsonc`, which records your project, database, bucket,
and web address. Commit that file to your repository so future updates go to the
same place. It contains no passwords.

Setup is safe to run again: it reuses anything that already exists and never
resets an existing password.

Want to see what it would do first? Run `npm run setup -- --dry-run`.

## 4. Put the site online

Setup offers to do this for you. If you said no, run:

```bash
npm run deploy
```

The first upload takes a few minutes because of the sample videos. The command
checks that you're signed in to the right Cloudflare account before it uploads
anything.

## 5. Make it your city's site

Open `https://<your-name>.pages.dev/admin/` and sign in.

The site starts with **DeLand's content as a sample**: its text, photos, budget,
and tax rate. Open **Site content**; it opens on **Start here**, a checklist of
steps in order. Each step shows how many items still need attention, and the
same numbers appear on the tabs.

1. **City & branding:** pick your city, enter its **municipal operating
   millage** (have Finance confirm it; picking a city does not fill in its rate),
   then the site name, the title and description search engines show, the
   public address, tagline, logo, and link preview image.
2. **Key facts:** figures, contacts, and dates the site uses in many places,
   entered once: the Year 2 budget impact, fiscal years, General Fund totals,
   City Clerk phone and address, records and privacy pages, social media links,
   and review dates. Wherever page text uses one, it updates everywhere.
3. **Budget:** how the budget is introduced, your departments, budget items,
   potential revenue, the property tax slider (which you can turn off), and the
   gap target. Have Finance review these.
4. **Home page, Privacy, Coming soon, Sign-in:** one tab per page; the home
   page is split into its parts. **Videos** holds the department videos. The
   fields most cities change come first; headings, buttons and labels are
   folded into **More wording**. Paragraphs are edited whole with a small toolbar for bold, italic, links,
   lists, and **Insert a fact**. Shaded values in text are key facts and fill
   in automatically. Repeating parts, such as privacy sections, FAQs, key points
   and official sources, are lists you can add to, remove from and reorder.
   Click anything in the live preview to jump to its field, or use **Find text
   on this page**.

The yellow **items to review** panel lists anything that still looks like
DeLand or is missing. **Show me** jumps to each one.

Edits are saved as a **draft**. Use **Save draft**, check it with **Preview saved
draft**, then **Publish changes**. The [content guide](docs/city-template-setup.md)
explains each tab.

Then open **Site settings**:

- **Google Analytics (optional):** paste your GA4 measurement ID (it starts
  with `G-`). Find it in Google Analytics under **Admin › Data streams › Web**.
  The Privacy page then shows its analytics section automatically; edit that
  wording under **Site content › Privacy page**.
- **Who can see the site:** switch from **Coming soon** to **Open to the
  public** when you are ready. Save once for both settings.

Add colleagues under **Manage users**. Viewers can see responses and reports;
administrators can also edit content and settings.

## Using your own domain

1. In Cloudflare, open **Workers & Pages › your project › Custom domains** and
   add the domain (for example `budget.springfield.gov`). Follow the DNS steps it shows.
2. In `wrangler.jsonc`, change `SITE_URL` (in both places if you have a preview
   section) to `https://budget.springfield.gov/`, commit, and run `npm run deploy`.
3. In the dashboard, set **Site content › City & branding › Public site address**
   to the same address and publish.

## Updating the site later

- **Content** (text, photos, budget, FAQs): edit in the dashboard. No deploy needed.
- **Code** (new features or fixes from the original project): pull the changes
  into your repository, then run `npm run deploy`. Deploying never changes your
  content, users, or resident responses; those live in your database.

### Automatic deploys from GitHub (optional)

If you'd rather have Cloudflare deploy every time you push to GitHub, create the
project in Cloudflare **before** running setup, because a project created by
setup can't be connected to Git later:

1. Cloudflare dashboard › **Workers & Pages › Create › Pages › Connect to Git**.
2. Choose your repository. Build command: `npm run build:cloudflare`. Build
   output directory: `dist`. Add the environment variable `NODE_VERSION` = `22`.
3. Run `npm run setup` and give it the **same project name**. It will reuse the
   project and fill in everything else.
4. Commit and push the new `wrangler.jsonc`. Cloudflare reads your database,
   bucket, and web address from it on every build.

Pushes to your live branch then update the site. Other branches get private
preview links. If you'll use preview branches, answer yes when setup offers a
separate preview database, so testing never touches real data.

## Staff access

- **Add someone:** dashboard › **Manage users**.
- **Forgot the only admin password:**

  ```bash
  npm run setup -- admin you@city.gov --reset
  ```

  A new password is saved to the private file described in step 3.

## Backups

Your content, staff accounts, and resident responses live in the database, not in
Git. Back them up before big changes:

```bash
npx wrangler d1 export YOUR-NAME-db --remote --output backup.sql
```

Uploaded photos and videos are in the R2 bucket `YOUR-NAME-media`.

## If something goes wrong

| Message | What to do |
| --- | --- |
| "You are not signed in to Cloudflare" | Run `npx wrangler login`. |
| "belongs to Cloudflare account …, which this login cannot access" | You're signed in to a different account. Run `npx wrangler logout`, then `npx wrangler login` with the right one. |
| "The database in wrangler.jsonc … is not in this Cloudflare account" | `wrangler.jsonc` still describes someone else's site. Run `npm run setup`. |
| "R2 storage is not available" | In the Cloudflare dashboard, open **R2** once and enable it (free), then rerun setup. |
| Sign-in says the password is wrong | Use the reset command under **Staff access**. |
| Image uploads fail with "Media storage is not configured" | `wrangler.jsonc` has no `CITY_MEDIA` bucket. Rerun `npm run setup`. |
| Node version error | Install Node.js 22.13 or newer. |

## Limits to know about

- **Needs a developer:** the Amendment 3 tax formulas and exemption amounts,
  support for counties other than Volusia, and page layout and colors.
  Everything else (words, links, images, videos, FAQs, budget, millage, search
  and sharing details, analytics) is in the dashboard.
- **Property lookup** reads the Volusia County Property Appraiser's public
  website. If that website changes, lookups fail safely (residents can type a
  value) until the code is updated.
- **Content history:** the editor keeps one draft and one published version.
  Back up the database before big changes.
- **Media:** replacing an image or video does not delete the old file, and
  videos are not converted or captioned for you. Upload files with captions
  already included.
- **Sample content:** DeLand's photos, videos, budget and wording ship as a
  sample. The review list in Site content flags what still looks like DeLand.

---

## Notes for AI assistants

If you're an AI helping a city with this, follow the steps above with these rules:

- Ask the person to confirm the Cloudflare account by name before creating
  anything. Never infer it from an existing login, `wrangler.jsonc`, or this repo.
- Use `npm run setup`. For a non-interactive run, pass every answer:
  `npm run setup -- --account <id> --name <name> --url https://<name>.pages.dev/ --branch main --admin-email <email> --no-preview --yes`.
  Preview with `--dry-run` first.
- Never print, log, or ask for passwords. Setup writes them to a `0600` file;
  tell the person where it is.
- Never deploy to, modify, or delete DeLand's project (`amendment-3`) or any
  resource you didn't create in this session.
- Content edits belong in the dashboard or the authenticated content API
  (`GET /api/admin/content`, `PATCH {config, revision}`, `POST /api/admin/content/publish {revision}`),
  never as raw SQL into the `site_settings` table.
- Opening the site to the public (turning off coming-soon) and adding a custom
  domain are the city's decisions. Don't do them unless asked.
