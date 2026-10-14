import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { uiText, uiHTML } from '../src/ui-text.js';
import { siteUICopy } from '../src/site-ui-copy.js';
import { defaultSiteConfig } from '../src/site-defaults.js';

test('editable UI text expands live counts, city, and targets without recursively interpreting inserted values', () => {
  const config = structuredClone(defaultSiteConfig);
  config.city.name = 'Port Orange'; config.budget.target = 1234567;
  config.copy.ui_budget_goal_title = '{{city}}: close {{target}}; {{count}} choices.';
  assert.equal(uiText('ui_budget_goal_title', { count: 4 }, config), 'Port Orange: close $1,234,567; 4 choices.');
  assert.equal(uiText('ui_budget_goal_title', { count: 4, target: '$1.23M' }, config), 'Port Orange: close $1.23M; 4 choices.');
  config.copy.ui_video_watch_track = 'Watch {{title}} for {{city}}';
  assert.equal(uiText('ui_video_watch_track', { title: '{{city}} title' }, config), 'Watch {{city}} title for Port Orange');
  config.copy.ui_budget_goal_title = '<b>{{city}}</b> & {{count}}';
  assert.equal(uiHTML('ui_budget_goal_title', { count: '<img onerror=bad()>' }, config), '&lt;b&gt;Port Orange&lt;/b&gt; &amp; &lt;img onerror=bad()&gt;');
});

test('all generated UI keys used by public modules have a registry fallback for previously saved configurations', async () => {
  const config = structuredClone(defaultSiteConfig); config.copy = {};
  const files = ['main.js', 'cost-center-builder.js', 'service-videos.js'];
  for (const file of files) {
    const source = await readFile(new URL(`../src/${file}`, import.meta.url), 'utf8');
    const keys = [...new Set([...source.matchAll(/["'](ui_[a-z_]+)["']/g)].map(match => match[1]))];
    assert.ok(keys.length > 5);
    for (const key of keys) {
      assert.ok(Object.hasOwn(siteUICopy, key), `${file}: ${key}`);
      assert.notEqual(uiText(key, {}, config), key);
    }
  }
});
