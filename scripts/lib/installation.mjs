// Reads and writes this installation's wrangler.jsonc. That one file identifies
// the city's Cloudflare project, database, media bucket, public URL and account,
// so every script (setup, build, deploy) agrees on where the site lives.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const CONFIG_PATH = `${ROOT}wrangler.jsonc`;

// JSONC: drop comments and trailing commas outside of strings.
export function parseJSONC(text) {
  let out = '', inString = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i], next = text[i + 1];
    if (inString) {
      out += char;
      if (char === '\\') out += text[++i];
      else if (char === '"') inString = false;
    } else if (char === '"') { inString = true; out += char; }
    else if (char === '/' && next === '/') { while (i < text.length && text[i] !== '\n') i++; out += '\n'; }
    else if (char === '/' && next === '*') { i = text.indexOf('*/', i + 2) + 1; if (i === 0) break; }
    else out += char;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'));
}

export function readInstallation(path = CONFIG_PATH) {
  if (!existsSync(path)) return null;
  const config = parseJSONC(readFileSync(path, 'utf8'));
  const db = config.d1_databases?.find(item => item.binding === 'DASHBOARD_DB');
  const media = config.r2_buckets?.find(item => item.binding === 'CITY_MEDIA');
  return {
    config,
    project: config.name,
    database: db ? { name: db.database_name, id: db.database_id } : null,
    bucket: media?.bucket_name || null,
    siteURL: config.vars?.SITE_URL || '',
    productionBranch: config.vars?.PRODUCTION_BRANCH || 'main',
    accountId: config.vars?.CLOUDFLARE_ACCOUNT_ID || '',
  };
}

export function installationConfig({ project, accountId, siteURL, productionBranch, database, bucket, preview }) {
  const vars = { SITE_URL: siteURL, PRODUCTION_BRANCH: productionBranch, CLOUDFLARE_ACCOUNT_ID: accountId };
  const bindings = (db, media) => ({
    d1_databases: [{ binding: 'DASHBOARD_DB', database_name: db.name, database_id: db.id, migrations_dir: 'migrations' }],
    r2_buckets: [{ binding: 'CITY_MEDIA', bucket_name: media }],
  });
  return {
    $schema: 'node_modules/wrangler/config-schema.json',
    name: project,
    pages_build_output_dir: './dist',
    compatibility_date: '2026-09-15',
    vars,
    ...bindings(database, bucket),
    ...(preview ? { env: { preview: { vars, ...bindings(preview.database, preview.bucket) } } } : {}),
  };
}

export function writeInstallation(config, path = CONFIG_PATH) {
  const header = [
    '// This installation\'s Cloudflare resources. Written by `npm run setup`.',
    '// SITE_URL is the public address (used for canonical links and the sitemap).',
    '// PRODUCTION_BRANCH is the branch that builds the live, indexable site.',
    '// None of these values are secrets; secrets live in Cloudflare, not here.',
  ].join('\n');
  writeFileSync(path, `${header}\n${JSON.stringify(config, null, 2)}\n`);
}

export function validSiteURL(value) {
  try {
    const url = new URL(String(value).trim());
    if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash || url.username || !url.hostname.includes('.')) return '';
    return url.origin + '/';
  } catch { return ''; }
}
