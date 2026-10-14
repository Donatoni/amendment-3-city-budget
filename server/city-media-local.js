import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// A local-only implementation of the small R2 surface used by city-content.
export function localMediaBucket(directory = '.cache/city-media') {
  const root = resolve(directory);
  const path = key => {
    if (!/^[a-f0-9-]+\.(?:png|jpg|webp|gif|mp4|webm)$/.test(key)) throw new Error('Invalid media key.');
    return resolve(root, key);
  };
  return {
    async put(key, value, options) {
      await mkdir(root, { recursive: true });
      await writeFile(path(key), new Uint8Array(value), { flag: 'wx' });
      await writeFile(`${path(key)}.json`, JSON.stringify(options.httpMetadata), { flag: 'wx' });
    },
    async head(key) {
      try {
        const bytes = await readFile(path(key));
        return { size: bytes.length, httpMetadata: JSON.parse(await readFile(`${path(key)}.json`, 'utf8')), httpEtag: `"${key}"` };
      } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    },
    async get(key, options = {}) {
      const metadata = await this.head(key);
      if (!metadata) return null;
      const bytes = await readFile(path(key));
      const range = options.range;
      const body = range ? bytes.subarray(range.offset, range.offset + range.length) : bytes;
      return { ...metadata, body };
    },
  };
}
