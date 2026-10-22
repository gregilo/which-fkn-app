import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { updateSchedule } from '../scripts/update.js';

const PHI = { teamId: 1610612755, teamCity: 'Philadelphia', teamName: '76ers', teamTricode: 'PHI' };
const DET = { teamId: 1610612765, teamCity: 'Detroit', teamName: 'Pistons', teamTricode: 'DET' };

const game = (over = {}) => ({
  gameId: '0022600117',
  gameStatus: 1,
  gameStatusText: '7:30 pm ET',
  gameTimeUTC: '2026-10-25T23:30:00Z',
  gameDateEst: '2026-10-25T00:00:00Z',
  arenaName: 'Arena',
  arenaCity: 'Philadelphia',
  arenaState: 'PA',
  homeTeam: PHI,
  awayTeam: DET,
  ifNecessary: 'false',
  broadcasters: {
    nationalBroadcasters: [],
    homeTvBroadcasters: [
      {
        broadcasterMedia: 'tv',
        broadcasterDisplay: 'NBC Sports Philadelphia',
        broadcasterAbbreviation: 'NBCSP/PCK-PHI',
      },
    ],
    awayTvBroadcasters: [],
  },
  ...over,
});

const page = (games) =>
  `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
    props: { pageProps: { scheduleData: { schedule: games } } },
  })}</script></html>`;

let server;
let base;
let dir;
let outFile;

before(async () => {
  server = createServer((req, res) => {
    if (req.url === '/ok') res.end(page([game()]));
    else if (req.url === '/500') {
      res.statusCode = 500;
      res.end('boom');
    } else if (req.url === '/badjson') {
      res.end('<script id="__NEXT_DATA__" type="application/json">{not json</script>');
    } else if (req.url === '/invalid') {
      res.end(page([game({ gameTimeUTC: 'nope' })]));
    } else {
      res.statusCode = 404;
      res.end();
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  dir = await mkdtemp(join(tmpdir(), 'wfa-'));
  outFile = join(dir, 'schedule.json');
});

after(async () => {
  server.close();
  await rm(dir, { recursive: true, force: true });
});

for (const route of ['/500', '/badjson', '/invalid']) {
  test(`failed update (${route}) leaves previous file intact`, async () => {
    await writeFile(outFile, 'SENTINEL');
    await assert.rejects(updateSchedule({ url: base + route, outFile }));
    assert.equal(await readFile(outFile, 'utf8'), 'SENTINEL');
    await assert.rejects(access(`${outFile}.tmp`));
  });
}

test('successful update replaces the file', async () => {
  await writeFile(outFile, 'SENTINEL');
  const result = await updateSchedule({ url: base + '/ok', outFile });
  assert.deepEqual(result, { gameCount: 1, unmapped: [] });
  const data = JSON.parse(await readFile(outFile, 'utf8'));
  assert.equal(data.games[0].id, '0022600117');
});
