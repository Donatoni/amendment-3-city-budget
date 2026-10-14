// Pages' static video responses currently ignore Range. Browsers need a 206
// response to seek before a file has finished downloading.
export async function onRequest({ request, env }) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  }

  const assetRequest = new Request(request);
  assetRequest.headers.delete('Range');
  assetRequest.headers.delete('If-Range');
  const asset = await env.ASSETS.fetch(assetRequest);
  if (asset.status !== 200 || !asset.headers.get('Content-Type')?.startsWith('video/mp4')) return asset;

  const headers = new Headers(asset.headers);
  headers.set('Accept-Ranges', 'bytes');
  const range = request.headers.get('Range');
  const ifRange = request.headers.get('If-Range');
  const validatorMatches = !ifRange || (
    !ifRange.startsWith('W/') && (
      ifRange === headers.get('ETag') || (
        headers.has('Last-Modified') &&
        Date.parse(headers.get('Last-Modified')) <= Date.parse(ifRange)
      )
    )
  );

  // HEAD ignores Range. A stale If-Range asks for the full current representation.
  if (request.method === 'HEAD' || !range || !validatorMatches) {
    return new Response(asset.body, { headers });
  }
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  // Unsupported units, malformed ranges, and multipart ranges may be ignored.
  if (!match || (!match[1] && !match[2])) return new Response(asset.body, { headers });

  // Deployment preparation enforces the 25 MiB limit, bounding memory use here.
  const body = await asset.arrayBuffer();
  const size = body.byteLength;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  headers.delete('Content-Encoding');
  if (start >= size || start > end || !Number.isSafeInteger(start) || !Number.isSafeInteger(end)) {
    headers.set('Content-Range', `bytes */${size}`);
    headers.set('Content-Length', '0');
    return new Response(null, { status: 416, headers });
  }
  headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
  headers.set('Content-Length', String(end - start + 1));
  return new Response(body.slice(start, end + 1), { status: 206, headers });
}
