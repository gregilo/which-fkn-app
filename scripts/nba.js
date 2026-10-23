export const SCHEDULE_URL = 'https://www.nba.com/sixers/schedule';
export const PHI_TEAM_ID = 1610612755;
// Regular season, playoffs, play-in, Cup final. Excludes preseason (001) and summer league (15x).
export const INCLUDED_GAME_ID_PREFIXES = ['002', '004', '005', '006'];

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

export async function fetchSchedulePage(url = SCHEDULE_URL) {
  const res = await fetch(url, {
    headers: { 'user-agent': USER_AGENT, accept: 'text/html' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`NBA.com responded ${res.status} for ${url}`);
  return res.text();
}

export function extractNextData(html) {
  const m = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/.exec(html);
  if (!m) throw new Error('NBA.com page missing __NEXT_DATA__');
  return JSON.parse(m[1]);
}

const isInstant = (s) => typeof s === 'string' && Number.isFinite(Date.parse(s));
const isNonEmptyString = (s) => typeof s === 'string' && s.length > 0;

function tv(list) {
  return (list ?? [])
    .filter((b) => b.broadcasterMedia !== 'radio')
    .map((b) => ({ name: b.broadcasterDisplay, abbr: b.broadcasterAbbreviation }));
}

function mapGame(g) {
  const home = g.homeTeam?.teamId === PHI_TEAM_ID;
  const opp = (home ? g.awayTeam : g.homeTeam) ?? {};
  const dateEt = String(g.gameDateEst ?? '').slice(0, 10);
  const statusText = String(g.gameStatusText ?? '').trim();
  const timeTbd = /^TBD$/i.test(statusText);
  const startUtc = isInstant(g.gameTimeUTC)
    ? g.gameTimeUTC
    : timeTbd
      ? `${dateEt}T16:00:00Z`
      : g.gameTimeUTC;
  const b = g.broadcasters ?? {};
  return {
    id: g.gameId,
    dateEt,
    startUtc,
    timeTbd,
    status: g.gameStatus,
    statusText,
    home,
    opponent: {
      teamId: opp.teamId,
      tricode: opp.teamTricode,
      name: `${opp.teamCity} ${opp.teamName}`,
    },
    arena: `${g.arenaName}, ${g.arenaCity}${g.arenaState ? ', ' + g.arenaState : ''}`,
    label: [g.gameLabel, g.gameSubLabel, g.seriesGameNumber].filter(Boolean).join(' · ') || null,
    ifNecessary: g.ifNecessary === 'true',
    broadcasts: {
      national: tv(b.nationalBroadcasters),
      local: tv(home ? b.homeTvBroadcasters : b.awayTvBroadcasters),
    },
  };
}

function validate(game) {
  const checks = [
    ['id', typeof game.id === 'string' && /^\d{10}$/.test(game.id)],
    ['dateEt', /^\d{4}-\d{2}-\d{2}$/.test(game.dateEt)],
    ['startUtc', isInstant(game.startUtc)],
    ['status', [1, 2, 3].includes(game.status)],
    ['opponent.tricode', isNonEmptyString(game.opponent.tricode)],
    ['opponent.name', isNonEmptyString(game.opponent.name) && !/undefined/.test(game.opponent.name)],
  ];
  const failed = checks.find(([, ok]) => !ok);
  if (failed) throw new Error(`Invalid game ${game.id ?? '(no id)'}: ${failed[0]}`);
}

export function normalizeSchedule(nextData) {
  const schedule = nextData?.props?.pageProps?.scheduleData?.schedule;
  if (!Array.isArray(schedule) || schedule.length === 0) {
    throw new Error('NBA.com payload missing scheduleData.schedule');
  }
  const kept = schedule.filter(
    (g) =>
      typeof g?.gameId === 'string' && INCLUDED_GAME_ID_PREFIXES.some((p) => g.gameId.startsWith(p)),
  );
  if (kept.length === 0) {
    throw new Error('NBA.com schedule has no regular-season or postseason games');
  }
  const season =
    nextData.props.pageProps.cmsSiteSettings?.seasonYear?.schedule ?? kept[0].seasonYear;
  const games = kept.map(mapGame);
  games.forEach(validate);
  games.sort((a, b) => Date.parse(a.startUtc) - Date.parse(b.startUtc));
  return { season, games };
}
