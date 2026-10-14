import test from 'node:test';
import assert from 'node:assert/strict';
import { downloadCard } from '../src/share.js';

const file = new File(['png fixture'], 'postcard.png', { type: 'image/png' });
const canvas = { toDataURL: () => 'data:image/png;base64,cG5n' };

function browser(t, navigator, document) {
  for (const [key, value] of Object.entries({ navigator, document })) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => {
      if (original) Object.defineProperty(globalThis, key, original);
      else delete globalThis[key];
    });
  }
}

test('Facebook iPhone and other mobile browsers without file sharing never navigate to a data URL', async t => {
  const navigator = { userAgent: '' };
  browser(t, navigator, { createElement: () => assert.fail('Mobile save must not click a download link') });
  for (const userAgent of ['Mozilla/5.0 (iPhone) [FBAN/FBIOS;FBAV/500.0]', 'Mozilla/5.0 (iPhone)', 'Mozilla/5.0 (Linux; Android 15)', 'Instagram', 'Mozilla/5.0 (iPad)']) {
    navigator.userAgent = userAgent;
    assert.equal(await downloadCard(canvas, 'daylight-postcard', file), 'preview');
  }
  navigator.userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X)';
  navigator.platform = 'MacIntel';
  navigator.maxTouchPoints = 5;
  assert.equal(await downloadCard(canvas, 'daylight-postcard', file), 'preview');
});

test('mobile save hands off only the selected PNG before user activation expires', async t => {
  let call;
  browser(t, { userAgent: 'iPhone', canShare: () => true, share: data => { call = data; return Promise.resolve(); } });
  const pending = downloadCard(canvas, 'citrus-budget', file);
  assert.ok(call, 'The native share call must happen before yielding');
  assert.deepEqual(Object.keys(call), ['files']);
  assert.equal(call.files[0].name, 'my-deland-citrus-budget.png');
  assert.equal(call.files[0].type, 'image/png');
  assert.equal(await call.files[0].text(), await file.text());
  assert.equal(await pending, 'shared-image');
});

test('unavailable or blocked mobile sharing offers a preview; cancellation does not download', async t => {
  const navigator = { userAgent: 'iPhone', canShare: () => false, share: () => assert.fail('Unsupported sharing') };
  browser(t, navigator, { createElement: () => assert.fail('No mobile navigation fallback') });
  assert.equal(await downloadCard(canvas, 'postcard', file), 'preview');
  navigator.canShare = () => { throw new Error('Unavailable'); };
  assert.equal(await downloadCard(canvas, 'postcard', file), 'preview');
  navigator.canShare = () => true;
  navigator.share = () => Promise.reject(new DOMException('Blocked', 'NotAllowedError'));
  assert.equal(await downloadCard(canvas, 'postcard', file), 'preview');
  navigator.share = () => Promise.reject(new DOMException('Cancelled', 'AbortError'));
  assert.equal(await downloadCard(canvas, 'postcard', file), 'cancelled');
});

test('desktop save downloads the selected canvas with the chosen filename and cleans up the link', async t => {
  const events = [];
  const link = { click: () => events.push('click'), remove: () => events.push('remove') };
  browser(t, { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)', platform: 'MacIntel', maxTouchPoints: 0 }, {
    createElement: tag => { assert.equal(tag, 'a'); return link; },
    body: { append: element => { assert.equal(element, link); events.push('append'); } },
  });
  assert.equal(await downloadCard(canvas, 'bluehour-budget', file), 'download');
  assert.equal(link.download, 'my-deland-bluehour-budget.png');
  assert.equal(link.href, canvas.toDataURL());
  assert.deepEqual(events, ['append', 'click', 'remove']);
});
