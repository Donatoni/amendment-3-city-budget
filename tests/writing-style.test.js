import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultSiteConfig } from '../src/site-defaults.js';

// House style: no em dashes as punctuation. A lone "—" standing for an empty
// value (for example in a table cell) is allowed.
const punctuation = /\s—\s|\w—\w/;
const root = fileURLToPath(new URL('..', import.meta.url));
const skip = new Set(['node_modules', 'dist', '.cache', '.git', 'media-originals', 'previous-starter.js']);
function files(dir, extensions) {
  return readdirSync(dir).flatMap(name => {
    if (skip.has(name)) return [];
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path, extensions);
    return extensions.some(extension => name.endsWith(extension)) ? [path] : [];
  });
}

test('starter site content uses no em dash punctuation', () => {
  const strings = [];
  const walk = (value, at) => {
    if (typeof value === 'string') strings.push([at, value]);
    else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) walk(item, `${at}.${key}`);
  };
  walk(defaultSiteConfig, 'config');
  assert.deepEqual(strings.filter(([, value]) => punctuation.test(value)).map(([at]) => at), []);
});

test('templates, code and documentation use no em dash punctuation', () => {
  const found = files(root, ['.html', '.js', '.mjs', '.css', '.md', '.py'])
    .flatMap(path => readFileSync(path, 'utf8').split('\n').map((line, index) => [path, index + 1, line]))
    .filter(([, , line]) => punctuation.test(line))
    .map(([path, line]) => `${relative(root, path)}:${line}`);
  assert.deepEqual(found, []);
});
