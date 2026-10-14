// Guided Cloudflare setup for a new city installation.
//
//   npm run setup                         answer a few questions, then create everything
//   npm run setup -- --dry-run            show the plan and commands without changing anything
//   npm run setup -- admin you@city.gov   add another administrator (or --reset a password)
//
// Safe to rerun: existing projects, databases, buckets, secrets and accounts are
// reused, never overwritten. Passwords are written to a private file, never printed.
import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, copyFileSync, rmSync, existsSync, chmodSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { hashPassword } from '../server/staff-auth.js';
import { ROOT, CONFIG_PATH, readInstallation, installationConfig, writeInstallation, validSiteURL } from './lib/installation.mjs';

process.chdir(ROOT);
const args = process.argv.slice(2);
const flag = name => { const i = args.indexOf(`--${name}`); return i === -1 ? undefined : (args[i + 1]?.startsWith('--') || args[i + 1] === undefined ? true : args[i + 1]); };
const dryRun = Boolean(flag('dry-run'));
const assumeYes = Boolean(flag('yes'));
const emailPattern = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
const namePattern = /^[a-z0-9](?:[a-z0-9-]{1,56})[a-z0-9]$/;
const rl = createInterface({ input: stdin, output: stdout });
let accountId = '';

const say = (text = '') => console.log(text);
const step = text => say(`\n› ${text}`);
function stop(message) { console.error(`\n✗ ${message}`); rl.close(); process.exit(1); }
async function ask(question, fallback = '') {
  const answer = (await rl.question(`${question}${fallback ? ` [${fallback}]` : ''}: `)).trim();
  return answer || fallback;
}
async function confirm(question, fallback = true) {
  if (assumeYes) return true;
  const answer = (await ask(`${question} (${fallback ? 'Y/n' : 'y/N'})`)).toLowerCase();
  return answer ? answer.startsWith('y') : fallback;
}
function wrangler(argv, { input, capture = true, allowFailure = false, mutates = true } = {}) {
  const shown = `npx wrangler ${argv.join(' ')}`;
  if (dryRun && mutates) { say(`  (dry run) ${shown}`); return { ok: true, out: '' }; }
  const result = spawnSync('npx', ['wrangler', ...argv], {
    env: { ...process.env, ...(accountId ? { CLOUDFLARE_ACCOUNT_ID: accountId } : {}) },
    input, encoding: 'utf8', stdio: capture ? ['pipe', 'pipe', 'pipe'] : ['inherit', 'inherit', 'inherit'],
  });
  const ok = result.status === 0;
  if (!ok && !allowFailure) stop(`This command failed:\n  ${shown}\n${(result.stderr || result.stdout || result.error?.message || '').trim()}`);
  return { ok, out: result.stdout || '' };
}
const json = text => { try { return JSON.parse(text.slice(text.search(/[[{]/))); } catch { return null; } };
const sql = value => `'${String(value).replaceAll("'", "''")}'`;

function preflight() {
  step('Checking your computer');
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 13)) stop(`Node.js 22.13 or newer is required (you have ${process.versions.node}). Install it from https://nodejs.org and try again.`);
  if (!existsSync(`${ROOT}node_modules/wrangler`)) stop('Dependencies are missing. Run `npm ci` first.');
  const who = wrangler(['whoami', '--json'], { allowFailure: true, mutates: false });
  const identity = json(who.out);
  if (!who.ok || !identity?.loggedIn) stop('You are not signed in to Cloudflare. Run `npx wrangler login`, approve access in the browser, then run `npm run setup` again.');
  say(`  Node ${process.versions.node} · signed in to Cloudflare as ${identity.email || 'an API token'}`);
  return identity.accounts || [];
}

async function chooseAccount(accounts, preferred) {
  if (!accounts.length) stop('This Cloudflare login has no accounts available.');
  const match = accounts.find(item => item.id === preferred || item.name === preferred);
  if (preferred && !match) stop(`Cloudflare account "${preferred}" is not available to this login.`);
  if (match) return match;
  if (accounts.length === 1) {
    if (!await confirm(`Use the Cloudflare account "${accounts[0].name}"?`)) stop('Sign in with the right account (`npx wrangler logout`, then `npx wrangler login`) and run setup again.');
    return accounts[0];
  }
  say('\nWhich Cloudflare account should own this city site?');
  accounts.forEach((item, index) => say(`  ${index + 1}. ${item.name}`));
  const choice = accounts[Number(await ask('Account number')) - 1];
  if (!choice) stop('Choose one of the listed account numbers.');
  return choice;
}

async function adminCredentials(database, email, name, { reset = false } = {}) {
  const existing = json(wrangler(['d1', 'execute', database, '--remote', '--json', '--command', `SELECT id FROM staff_users WHERE email = ${sql(email)} COLLATE NOCASE`], { mutates: false, allowFailure: dryRun }).out);
  const found = existing?.[0]?.results?.[0];
  if (found && !reset) { say(`  ${email} already has an account; leaving its password unchanged. Use \`npm run setup -- admin ${email} --reset\` to issue a new one.`); return null; }
  const password = randomBytes(18).toString('base64url');
  const hash = await hashPassword(password);
  const statement = found
    ? `UPDATE staff_users SET password_hash = ${sql(hash)}, active = 1, role = 'admin', session_version = session_version + 1 WHERE id = ${sql(found.id)};`
    : `INSERT INTO staff_users (id, name, email, role, password_hash, created_at) VALUES (${sql(randomUUID())}, ${sql(name)}, ${sql(email)}, 'admin', ${sql(hash)}, ${sql(new Date().toISOString())});`;
  // A temporary file keeps the password hash out of the process list and shell history.
  const dir = `${ROOT}.cache/setup`; mkdirSync(dir, { recursive: true });
  const file = `${dir}/admin-${randomUUID()}.sql`;
  writeFileSync(file, statement, { mode: 0o600 });
  try { wrangler(['d1', 'execute', database, '--remote', '--yes', '--file', file]); }
  finally { rmSync(file, { force: true }); }
  return password;
}

function saveLogin(project, siteURL, email, password) {
  const dir = `${ROOT}.cache/${project}`; mkdirSync(dir, { recursive: true });
  const file = `${dir}/ADMIN-LOGIN.txt`;
  const body = `Dashboard: ${new URL('/admin/', siteURL)}\nEmail: ${email}\nPassword: ${password}\n\nStore this in a password manager, then delete this file.\nAdd more staff in the dashboard under Manage users.\n`;
  if (dryRun) { say(`  (dry run) would save the sign-in details to ${file}`); return file; }
  writeFileSync(file, body, { mode: 0o600 }); chmodSync(file, 0o600);
  return file;
}

async function addAdmin() {
  const email = String(args[1] || '').trim().toLowerCase();
  if (!emailPattern.test(email)) stop('Usage: npm run setup -- admin you@city.gov ["Full Name"] [--reset]');
  const name = args[2] && !args[2].startsWith('--') ? args[2] : 'Administrator';
  const installation = readInstallation();
  if (!installation?.database?.id) stop('wrangler.jsonc has no DASHBOARD_DB database. Run `npm run setup` first.');
  const accounts = preflight();
  accountId = (await chooseAccount(accounts, installation.accountId || flag('account'))).id;
  step(`${flag('reset') ? 'Resetting the password for' : 'Creating'} ${email} in ${installation.database.name}`);
  const password = await adminCredentials(installation.database.name, email, name, { reset: Boolean(flag('reset')) });
  if (password) say(`\n✓ Sign-in details saved privately to ${saveLogin(installation.project, installation.siteURL || `https://${installation.project}.pages.dev/`, email, password)}`);
  rl.close();
}

async function setup() {
  say('Set up a new city budget site on Cloudflare.\nThis creates a Pages project, a database, and a media bucket in your Cloudflare account,\nthen creates the first administrator. Nothing is made public: the site starts behind a\n"coming soon" page until an administrator opens it from the dashboard.');
  if (dryRun) say('\nDRY RUN: nothing will be created or changed.');
  const accounts = preflight();
  const account = await chooseAccount(accounts, flag('account'));
  accountId = account.id;

  const current = readInstallation();
  let project = typeof flag('name') === 'string' ? flag('name') : '';
  while (!namePattern.test(project)) {
    project = (await ask('\nShort name for this site, used for the web address and Cloudflare resources\n(lowercase letters, numbers, and hyphens, e.g. "springfield-budget")')).toLowerCase();
    if (!namePattern.test(project)) say('  Use 3 to 58 lowercase letters, numbers, or hyphens, starting and ending with a letter or number.');
  }
  const database = typeof flag('database') === 'string' ? flag('database') : `${project}-db`;
  const bucket = typeof flag('bucket') === 'string' ? flag('bucket') : `${project}-media`;
  let siteURL = validSiteURL(typeof flag('url') === 'string' ? flag('url') : '');
  while (!siteURL) {
    siteURL = validSiteURL(await ask('Public web address (you can add a custom domain later)', `https://${project}.pages.dev/`));
    if (!siteURL) say('  Enter an https:// address with no path, for example https://budget.springfield.gov/');
  }
  const productionBranch = typeof flag('branch') === 'string' ? flag('branch') : await ask('Git branch that publishes the live site', 'main');
  let adminEmail = typeof flag('admin-email') === 'string' ? flag('admin-email').toLowerCase() : '';
  while (!emailPattern.test(adminEmail)) {
    adminEmail = (await ask('Email address for the first dashboard administrator')).toLowerCase();
    if (!emailPattern.test(adminEmail)) say('  Enter a valid email address.');
  }
  const withPreview = flag('preview') ? true : flag('no-preview') ? false
    : await confirm('Also create a separate preview database and bucket for testing unreleased changes? (Only needed if you will connect Git and use preview branches.)', false);

  say(`\nPlan
  Cloudflare account   ${account.name}
  Pages project        ${project}
  Database             ${database}${withPreview ? ` (+ ${project}-preview-db)` : ''}
  Media bucket         ${bucket}${withPreview ? ` (+ ${project}-preview-media)` : ''}
  Public address       ${siteURL}
  Live branch          ${productionBranch}
  First administrator  ${adminEmail} (a strong password is generated for you)`);
  if (current?.project && current.project !== project) say(`\n  wrangler.jsonc currently points at "${current.project}". It will be replaced; a backup is kept in .cache/.`);
  if (!await confirm('\nCreate these now?')) stop('Nothing was changed.');

  step('Cloudflare Pages project');
  const projects = json(wrangler(['pages', 'project', 'list', '--json'], { mutates: false }).out) || [];
  if (projects.some(item => (item.name || item['Project Name']) === project)) say(`  "${project}" already exists in this account; it will be reused.`);
  else wrangler(['pages', 'project', 'create', project, '--production-branch', productionBranch]);

  const ensureDatabase = name => {
    const find = () => (json(wrangler(['d1', 'list', '--json'], { mutates: false }).out) || []).find(item => item.name === name);
    let found = find();
    if (found) say(`  Database "${name}" already exists; it will be reused.`);
    else { wrangler(['d1', 'create', name]); found = find() || (dryRun ? { uuid: '00000000-0000-4000-8000-000000000000' } : null); }
    if (!found) stop(`Database "${name}" was created but could not be found. Run setup again.`);
    return { name, id: found.uuid || found.id };
  };
  const ensureBucket = name => {
    const listed = wrangler(['r2', 'bucket', 'list'], { mutates: false, allowFailure: true });
    if (!listed.ok) stop('R2 storage is not available to this login. In the Cloudflare dashboard, open R2 and enable it (the free tier is enough), then run setup again.');
    if (new RegExp(`name:\\s+${name}\\s*$`, 'm').test(listed.out)) say(`  Bucket "${name}" already exists; it will be reused.`);
    else wrangler(['r2', 'bucket', 'create', name]);
    return name;
  };
  step('Database and media storage');
  const db = ensureDatabase(database);
  const media = ensureBucket(bucket);
  const preview = withPreview ? { database: ensureDatabase(`${project}-preview-db`), bucket: ensureBucket(`${project}-preview-media`) } : null;

  step('Writing wrangler.jsonc');
  if (!dryRun) {
    if (existsSync(CONFIG_PATH)) { mkdirSync(`${ROOT}.cache`, { recursive: true }); copyFileSync(CONFIG_PATH, `${ROOT}.cache/wrangler.before-setup-${Date.now()}.jsonc`); }
    writeInstallation(installationConfig({ project, accountId, siteURL, productionBranch, database: db, bucket: media, preview }));
  }
  say('  Saved. Commit this file so future deploys use the same resources.');

  step('Creating database tables');
  wrangler(['d1', 'migrations', 'apply', database, '--remote'], { capture: false });
  if (preview) wrangler(['d1', 'migrations', 'apply', preview.database.name, '--remote', '--env', 'preview'], { capture: false });

  step('Sign-in security key');
  const secrets = wrangler(['pages', 'secret', 'list', '--project-name', project], { mutates: false, allowFailure: true }).out;
  if (/REVIEWER_SESSION_SECRET/.test(secrets)) say('  Already set; leaving it unchanged.');
  else wrangler(['pages', 'secret', 'put', 'REVIEWER_SESSION_SECRET', '--project-name', project], { input: randomBytes(48).toString('base64url') });

  step('First administrator');
  const password = await adminCredentials(database, adminEmail, 'Administrator');
  const loginFile = password ? saveLogin(project, siteURL, adminEmail, password) : null;

  if (await confirm('\nBuild and upload the site now? (takes several minutes the first time)')) {
    rl.close();
    if (dryRun) say('  (dry run) npm run deploy');
    else {
      const result = spawnSync('npm', ['run', 'deploy'], { stdio: 'inherit' });
      if (result.status !== 0) stop('The deploy did not finish. Fix the error above, then run `npm run deploy`.');
    }
  } else { rl.close(); say('\nWhen ready, run `npm run deploy`.'); }

  say(`\n✓ Setup complete.
  Site:       ${siteURL}  (shows "coming soon" until you open it)
  Dashboard:  ${new URL('/admin/', siteURL)}
  ${loginFile ? `Sign-in:    saved privately to ${loginFile}` : 'Sign-in:    use your existing administrator account'}
${preview ? `\n  Preview environment: in the Cloudflare dashboard, open ${project} › Settings › Variables and Secrets,\n  choose Preview, and add REVIEWER_SESSION_SECRET (any random 48+ character value).\n` : ''}
Next: sign in, open Site content to replace the sample city content, then use
Site settings to add Google Analytics and open the site. See DEPLOYMENT.md.`);
}

if (args[0] === 'admin') await addAdmin();
else await setup();
