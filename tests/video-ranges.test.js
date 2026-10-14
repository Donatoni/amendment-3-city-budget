import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/assets/videos/[file].js';

const bytes = Uint8Array.from({ length: 100 }, (_, i) => i);
async function serve(headers = {}, method = 'GET', status = 200) {
  return onRequest({
    request: new Request('https://example.test/assets/videos/example.mp4', { method, headers }),
    env: { ASSETS: { fetch: async request => {
      assert.equal(request.headers.has('Range'), false);
      assert.equal(request.headers.has('If-Range'), false);
      return new Response(method === 'HEAD' || status === 304 ? null : bytes, {
        status,
        headers: { 'Content-Type': 'video/mp4', 'Content-Length': '100', ETag: '"video-v1"' },
      });
    } } },
  });
}

test('video seeks return exact byte intervals, including suffix and open-ended ranges', async () => {
  for (const [range, start, end] of [
    ['bytes=10-19', 10, 19], ['bytes=90-', 90, 99], ['bytes=-8', 92, 99],
    ['bytes=95-200', 95, 99], ['bytes=0-0', 0, 0], ['bytes=-200', 0, 99],
  ]) {
    const response = await serve({ Range: range });
    assert.equal(response.status, 206, range);
    assert.equal(response.headers.get('Content-Range'), `bytes ${start}-${end}/100`);
    assert.equal(response.headers.get('Content-Length'), String(end - start + 1));
    assert.equal(response.headers.get('Accept-Ranges'), 'bytes');
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes.slice(start, end + 1));
  }
});

test('unsatisfiable video ranges return 416 and the full resource length', async () => {
  for (const range of ['bytes=100-', 'bytes=20-10', 'bytes=-0']) {
    const response = await serve({ Range: range });
    assert.equal(response.status, 416);
    assert.equal(response.headers.get('Content-Range'), 'bytes */100');
    assert.equal((await response.arrayBuffer()).byteLength, 0);
  }
});

test('full requests, unsupported ranges, and stale validators preserve the full video', async () => {
  for (const headers of [{}, { Range: 'bytes=0-1,5-6' }, { Range: 'items=0-1' },
    { Range: 'bytes=-' }, { Range: 'bytes=1-5', 'If-Range': '"old-video"' },
    { Range: 'bytes=1-5', 'If-Range': 'W/"video-v1"' }]) {
    const response = await serve(headers);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Accept-Ranges'), 'bytes');
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
  }
  assert.equal((await serve({ Range: 'bytes=1-5', 'If-Range': '"video-v1"' })).status, 206);
});

test('HEAD, missing files, conditional responses, and disallowed methods keep HTTP semantics', async () => {
  const head = await serve({ Range: 'bytes=10-19' }, 'HEAD');
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('Content-Length'), '100');
  assert.equal((await head.arrayBuffer()).byteLength, 0);
  assert.equal((await serve({ Range: 'bytes=10-19' }, 'GET', 404)).status, 404);
  assert.equal((await serve({ 'If-None-Match': '"video-v1"' }, 'GET', 304)).status, 304);
  const post = await serve({}, 'POST');
  assert.equal(post.status, 405);
  assert.equal(post.headers.get('Allow'), 'GET, HEAD');
});
