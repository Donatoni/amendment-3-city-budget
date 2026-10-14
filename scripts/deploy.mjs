// Build and upload this installation to Cloudflare Pages.
//
//   npm run deploy                     deploy the live site (PRODUCTION_BRANCH)
//   npm run deploy -- --branch test    upload a private preview instead
//
// Everything comes from wrangler.jsonc (written by `npm run setup`). Before
// uploading, this checks that the signed-in Cloudflare login can reach the
// configured account and database, so a copied config can't deploy to the
// wrong city's resources.
import { spawnSync } from 'node:child_process';
import { ROOT, readInstallation, validSiteURL } from './lib/installation.mjs';

process.chdir(ROOT);
const args = process.argv.slice(2);
const branchFlag = args.includes('--branch') ? args[args.indexOf('--branch') + 1] : '';
function stop(message) { console.error(`\n✗ ${message}`); process.exit(1); }
const installation = readInstallation();
if (!installation) stop('wrangler.jsonc is missing. Run `npm run setup` first.');
const { project, database, bucket, productionBranch } = installation;
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || installation.accountId;
const siteURL = validSiteURL(process.env.SITE_URL || installation.siteURL);
const branch = branchFlag || process.env.DEPLOY_BRANCH || productionBranch;
if (!project) stop('wrangler.jsonc has no project "name". Run `npm run setup`.');
if (!database?.id) stop('wrangler.jsonc has no DASHBOARD_DB database. Run `npm run setup`.');
if (!siteURL) stop('Set vars.SITE_URL in wrangler.jsonc to the public https:// address (or run `npm run setup`).');
if (!bucket) console.warn('! wrangler.jsonc has no CITY_MEDIA bucket: image and video uploads in the dashboard will not work until one is added.');

const env = { ...process.env, SITE_URL: siteURL, PRODUCTION_BRANCH: productionBranch, ...(accountId ? { CLOUDFLARE_ACCOUNT_ID: accountId } : {}) };
const capture = argv => spawnSync('npx', ['wrangler', ...argv], { env, encoding: 'utf8' });
function run(command, argv) {
  const result = spawnSync(command, argv, { env, stdio: 'inherit' });
  if (result.error) console.error(result.error.message);
  if (result.error || result.status !== 0) process.exit(result.status || 1);
}

const who = capture(['whoami', '--json']);
let identity = null; try { identity = JSON.parse(who.stdout); } catch {}
if (who.status !== 0 || !identity?.loggedIn) stop('Sign in to Cloudflare first: `npx wrangler login`.');
const accounts = identity.accounts || [];
if (accountId && accounts.length && !accounts.some(item => item.id === accountId)) {
  stop(`wrangler.jsonc belongs to Cloudflare account ${accountId}, which this login cannot access.\n  Sign in with the right account (\`npx wrangler logout\`, then \`npx wrangler login\`), or run \`npm run setup\` if this is a new city.`);
}
if (!accountId && accounts.length > 1) stop('This login can reach several Cloudflare accounts. Add vars.CLOUDFLARE_ACCOUNT_ID to wrangler.jsonc (or run `npm run setup`).');
const databases = capture(['d1', 'list', '--json']);
let listed = []; try { listed = JSON.parse(databases.stdout.slice(databases.stdout.indexOf('['))); } catch {}
if (databases.status === 0 && !listed.some(item => (item.uuid || item.id) === database.id)) {
  stop(`The database in wrangler.jsonc (${database.name}) is not in this Cloudflare account.\n  If this is a copy for a new city, run \`npm run setup\` to create its own resources.`);
}

const live = branch === productionBranch;
console.log(`\nDeploying ${project} (${live ? 'live site' : `preview of branch "${branch}"`}) · ${siteURL}`);
run('npm', ['run', 'build:cloudflare']);
run('npx', ['wrangler', 'pages', 'deploy', 'dist', `--project-name=${project}`, `--branch=${branch}`]);
console.log(live
  ? `\n✓ Deployed. Visitors see the coming-soon page until an administrator opens the site in ${new URL('/admin/#settings', siteURL)}.`
  : '\n✓ Preview uploaded. Its address is shown above; it is not indexed by search engines.');
