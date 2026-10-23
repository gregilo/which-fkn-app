import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { APPS } from '../public/networks.js';
import { downloadAssets } from '../scripts/assets.js';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(8)]);

function fakeFetch({ dropTrackId, badPngId, badLogoId } = {}) {
  return async (url) => {
    if (url.startsWith('https://itunes.apple.com/lookup')) {
      const results = Object.values(APPS)
        .filter((a) => a.appStoreId !== dropTrackId)
        .map((a) => ({ trackId: a.appStoreId, artworkUrl512: `https://example.test/${a.appStoreId}/512x512bb.jpg` }));
      return Response.json({ resultCount: results.length, results });
    }
    if (url.endsWith('/128x128bb.png')) {
      return new Response(url.includes(`/${badPngId}/`) ? '<html>nope</html>' : PNG);
    }
    if (url.startsWith('https://cdn.nba.com/logos/nba/')) {
      return new Response(url.includes(`/${badLogoId}/`) ? '<html>nope</html>' : '<svg></svg>');
    }
    return new Response('', { status: 404 });
  };
}

let root;
before(async () => {
  root = await mkdtemp(join(tmpdir(), 'wfa-'));
});
after(async () => {
  await rm(root, { recursive: true, force: true });
});

const freshDir = () => mkdtemp(join(root, 'case-'));

test('writes every icon and logo when all assets validate', async () => {
  const out = await freshDir();
  assert.deepEqual(await downloadAssets({ fetchFn: fakeFetch(), outDir: out }), { icons: 10, logos: 30 });
  assert.equal((await readdir(join(out, 'icons'))).length, 10);
  assert.equal((await readdir(join(out, 'logos'))).length, 30);
});

test('missing App Store artwork rejects and writes nothing', async () => {
  const out = await freshDir();
  await assert.rejects(
    downloadAssets({ fetchFn: fakeFetch({ dropTrackId: 1508186374 }), outDir: out }),
    /No App Store artwork for Peacock/,
  );
  assert.deepEqual(await readdir(out), []);
});

test('non-PNG icon rejects and writes nothing', async () => {
  const out = await freshDir();
  await assert.rejects(downloadAssets({ fetchFn: fakeFetch({ badPngId: 317469184 }), outDir: out }), /Not a PNG/);
  assert.deepEqual(await readdir(out), []);
});

test('non-SVG logo rejects and writes nothing', async () => {
  const out = await freshDir();
  await assert.rejects(downloadAssets({ fetchFn: fakeFetch({ badLogoId: 1610612755 }), outDir: out }), /Not an SVG/);
  assert.deepEqual(await readdir(out), []);
});
