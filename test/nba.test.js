import test from 'node:test';
import assert from 'node:assert/strict';
import { extractNextData, normalizeSchedule, PHI_TEAM_ID } from '../scripts/nba.js';

const PHI = { teamId: PHI_TEAM_ID, teamCity: 'Philadelphia', teamName: '76ers', teamTricode: 'PHI' };
const DET = { teamId: 1610612765, teamCity: 'Detroit', teamName: 'Pistons', teamTricode: 'DET' };
const tvb = (display, abbr, media = 'tv') => ({
  broadcasterMedia: media,
  broadcasterDisplay: display,
  broadcasterAbbreviation: abbr,
});

function game(over = {}) {
  return {
    gameId: '0022600117',
    gameStatus: 1,
    gameStatusText: '7:30 pm ET   ',
    gameTimeUTC: '2026-10-25T23:30:00Z',
    gameDateEst: '2026-10-25T00:00:00Z',
    arenaName: 'Xfinity Mobile Arena',
    arenaCity: 'Philadelphia',
    arenaState: 'PA',
    homeTeam: PHI,
    awayTeam: DET,
    gameLabel: '',
    gameSubLabel: '',
    seriesGameNumber: '',
    ifNecessary: 'false',
    broadcasters: {
      nationalBroadcasters: [],
      homeTvBroadcasters: [tvb('NBC Sports Philadelphia', 'NBCSP/PCK-PHI')],
      awayTvBroadcasters: [tvb('Fox Detroit', 'FDET')],
    },
    ...over,
  };
}

const nextData = (schedule) => ({
  props: { pageProps: { scheduleData: { schedule }, cmsSiteSettings: { seasonYear: { schedule: '2026-27' } } } },
});

test('extractNextData parses script tag and throws without it', () => {
  const html = '<html><script id="__NEXT_DATA__" type="application/json">{"a":1}</script></html>';
  assert.deepEqual(extractNextData(html), { a: 1 });
  assert.throws(() => extractNextData('<html></html>'), /NBA\.com page missing __NEXT_DATA__/);
});

test('normalizeSchedule drops summer league and preseason, keeps regular season', () => {
  const { season, games } = normalizeSchedule(
    nextData([
      game({ gameId: '1522600001' }),
      game({ gameId: '0012600001' }),
      game({ gameId: '0022600117' }),
    ]),
  );
  assert.equal(season, '2026-27');
  assert.deepEqual(games.map((g) => g.id), ['0022600117']);
});

test('away game takes local broadcasters from awayTvBroadcasters', () => {
  const { games } = normalizeSchedule(nextData([game({ homeTeam: DET, awayTeam: PHI })]));
  assert.equal(games[0].home, false);
  assert.equal(games[0].opponent.tricode, 'DET');
  assert.equal(games[0].opponent.teamId, 1610612765);
  assert.deepEqual(games[0].broadcasts.local, [{ name: 'Fox Detroit', abbr: 'FDET' }]);
});

test('radio is excluded and statusText is trimmed', () => {
  const g = game();
  g.broadcasters.homeTvBroadcasters.push(tvb('94 WIP', 'WIP', 'radio'));
  const { games } = normalizeSchedule(nextData([g]));
  assert.equal(games[0].broadcasts.local.length, 1);
  assert.equal(games[0].statusText, '7:30 pm ET');
});

test('output is sorted by startUtc', () => {
  const { games } = normalizeSchedule(
    nextData([
      game({ gameId: '0022600002', gameTimeUTC: '2026-11-01T00:00:00Z', gameDateEst: '2026-10-31T00:00:00Z' }),
      game({ gameId: '0022600001', gameTimeUTC: '2026-10-20T00:00:00Z', gameDateEst: '2026-10-19T00:00:00Z' }),
    ]),
  );
  assert.deepEqual(games.map((g) => g.id), ['0022600001', '0022600002']);
});

test('empty schedule and no included games throw', () => {
  assert.throws(() => normalizeSchedule(nextData([])), /missing scheduleData\.schedule/);
  assert.throws(() => normalizeSchedule({}), /missing scheduleData\.schedule/);
  assert.throws(
    () => normalizeSchedule(nextData([game({ gameId: '1522600001' })])),
    /no regular-season or postseason games/,
  );
});

test('malformed gameTimeUTC with a normal status fails validation', () => {
  assert.throws(
    () =>
      normalizeSchedule(
        nextData([game({ gameId: '0022600999', gameTimeUTC: 'nope', gameStatusText: '7:00 pm ET' })]),
      ),
    /Invalid game 0022600999: startUtc/,
  );
});

test('TBD status with empty gameTimeUTC yields placeholder start', () => {
  const { games } = normalizeSchedule(
    nextData([game({ gameStatusText: 'TBD', gameTimeUTC: '' })]),
  );
  assert.equal(games[0].timeTbd, true);
  assert.equal(games[0].startUtc, `${games[0].dateEt}T16:00:00Z`);
});
