import { spawnSync } from 'node:child_process';
import ffmpeg from 'ffmpeg-static';
import { ROOT, readInstallation } from './lib/installation.mjs';

process.chdir(ROOT);
// SITE_URL and PRODUCTION_BRANCH come from the environment (Cloudflare build
// variables) or, by default, from this installation's wrangler.jsonc.
const installation = readInstallation();
const productionBranch = process.env.PRODUCTION_BRANCH || installation?.productionBranch || 'main';
const preview = process.env.CF_PAGES === '1' && process.env.CF_PAGES_BRANCH !== productionBranch;
const env = {
  ...process.env,
  SITE_URL: process.env.SITE_URL || installation?.siteURL || '',
  SEO_NOINDEX: preview ? 'true' : (process.env.SEO_NOINDEX || 'false'),
  FFMPEG: process.env.FFMPEG || ffmpeg,
};
if (!env.SITE_URL) console.warn('! SITE_URL is not set (wrangler.jsonc vars.SITE_URL): building without a canonical address or sitemap.');

for (const [command, args] of [
  ['npm', ['test']],
  ['npm', ['run', 'build']],
  [process.env.PYTHON || 'python3', ['scripts/prepare-cloudflare.py']],
]) {
  const result = spawnSync(command, args, { env, stdio: 'inherit' });
  if (result.error) console.error(result.error.message);
  if (result.error || result.status !== 0) process.exit(result.status || 1);
}
