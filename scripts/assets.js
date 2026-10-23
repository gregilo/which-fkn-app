import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APPS } from '../public/networks.js';

const PUBLIC_DIR = fileURLToPath(new URL('../public/', import.meta.url));
// All 30 NBA team IDs.
const TEAM_IDS = Array.from({ length: 30 }, (_, i) => 1610612737 + i);
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function get(fetchFn, url) {
  const res = await fetchFn(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  return res;
}

async function collectIcons(fetchFn, outDir) {
  const entries = Object.entries(APPS);
  const ids = entries.map(([, { appStoreId }]) => appStoreId);
  const lookup = await (await get(fetchFn, `https://itunes.apple.com/lookup?id=${ids.join(',')}&country=us`)).json();
  const artwork = new Map((lookup.results ?? []).map((r) => [r.trackId, r.artworkUrl512]));

  return Promise.all(
    entries.map(async ([name, { appStoreId, icon }]) => {
      const url = artwork.get(appStoreId);
      if (!url) throw new Error(`No App Store artwork for ${name} (${appStoreId})`);
      const sized = url.replace(/\/\d+x\d+bb\.\w+$/, '/128x128bb.png');
      if (sized === url) throw new Error(`Unexpected artwork URL for ${name}: ${url}`);
      const body = Buffer.from(await (await get(fetchFn, sized)).arrayBuffer());
      if (!body.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error(`Not a PNG: ${sized}`);
      return { file: path.join(outDir, icon), body };
    }),
  );
}

async function collectLogos(fetchFn, outDir) {
  return Promise.all(
    TEAM_IDS.map(async (id) => {
      const url = `https://cdn.nba.com/logos/nba/${id}/global/L/logo.svg`;
      const body = await (await get(fetchFn, url)).text();
      if (!body.includes('<svg')) throw new Error(`Not an SVG: ${url}`);
      return { file: path.join(outDir, 'logos', `${id}.svg`), body };
    }),
  );
}

// Downloads and validates everything in memory first; writes only if every asset passed.
export async function downloadAssets({ fetchFn = fetch, outDir = PUBLIC_DIR } = {}) {
  const [icons, logos] = await Promise.all([collectIcons(fetchFn, outDir), collectLogos(fetchFn, outDir)]);
  await mkdir(path.join(outDir, 'icons'), { recursive: true });
  await mkdir(path.join(outDir, 'logos'), { recursive: true });
  await Promise.all([...icons, ...logos].map(({ file, body }) => writeFile(file, body)));
  return { icons: icons.length, logos: logos.length };
}

if (import.meta.main) {
  try {
    const { icons, logos } = await downloadAssets();
    console.log(`Wrote ${icons} app icons and ${logos} team logos`);
  } catch (err) {
    console.error(`Assets failed: ${err.message}`);
    process.exitCode = 1;
  }
}
