import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCHEDULE_URL, extractNextData, fetchSchedulePage, normalizeSchedule } from './nba.js';
import { resolveNetwork } from '../public/networks.js';

const DEFAULT_OUT_FILE = fileURLToPath(new URL('../public/data/schedule.json', import.meta.url));

export async function updateSchedule({ url = SCHEDULE_URL, outFile = DEFAULT_OUT_FILE } = {}) {
  const html = await fetchSchedulePage(url);
  const nextData = extractNextData(html);
  const { season, games } = normalizeSchedule(nextData);

  const unmapped = new Set();
  for (const g of games) {
    for (const b of [...g.broadcasts.national, ...g.broadcasts.local]) {
      if (resolveNetwork(b) === null) unmapped.add(b.name);
    }
  }

  const data = { season, source: url, fetchedAt: new Date().toISOString(), games };
  await mkdir(dirname(outFile), { recursive: true });
  const tmp = `${outFile}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2) + '\n');
  await rename(tmp, outFile);
  return { gameCount: games.length, unmapped: [...unmapped] };
}

// Shared by the CLI and the server's periodic refresh. Returns true on success; never throws.
export async function runUpdateAndLog(options) {
  try {
    const { gameCount, unmapped } = await updateSchedule(options);
    console.log(`Wrote ${gameCount} games to public/data/schedule.json`);
    for (const name of unmapped) {
      console.warn(`Unmapped network "${name}" — add a rule to public/networks.js`);
    }
    return true;
  } catch (err) {
    console.error(`Update failed: ${err.message}`);
    return false;
  }
}

if (import.meta.main) {
  if (!(await runUpdateAndLog())) process.exitCode = 1;
}
