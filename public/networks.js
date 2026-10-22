// Shared by the browser, scripts/update.js and tests. All "which app" knowledge lives here.
export const MARKETS = ['out', 'in'];

const both = ['out', 'in'];
const IN = ['in'];
const OUT = ['out'];

const direct = (app, markets, note) => ({ app, kind: 'direct', markets, ...(note && { note }) });
const live = (app, markets, note) => ({ app, kind: 'live', markets, ...(note && { note }) });

const PEACOCK_NBCSP = direct('Peacock', IN, 'NBC Sports Philadelphia add-on');
const NBC_SPORTS_APP = (markets) => direct('NBC Sports app', markets, 'TV provider login');
const ESPN_APP = direct('ESPN app', both, 'ESPN Unlimited or TV provider login');

export const NETWORKS = {
  'nbcsp-plus': {
    label: 'NBC Sports Philadelphia+',
    apps: [PEACOCK_NBCSP, NBC_SPORTS_APP(IN), live('Fubo', IN)],
  },
  nbcsp: {
    label: 'NBC Sports Philadelphia',
    apps: [
      PEACOCK_NBCSP,
      NBC_SPORTS_APP(IN),
      live('YouTube TV', IN),
      live('Hulu + Live TV', IN),
      live('Fubo', IN),
    ],
  },
  nbc: {
    label: 'NBC',
    apps: [
      direct('Peacock', both),
      NBC_SPORTS_APP(both),
      live('YouTube TV', both),
      live('Hulu + Live TV', both),
      live('Fubo', both),
      live('Sling TV', both, 'Blue, select markets'),
      live('DIRECTV', both),
    ],
  },
  peacock: {
    label: 'Peacock',
    apps: [direct('Peacock', both)],
  },
  nbcsn: {
    label: 'NBCSN',
    apps: [direct('Peacock', both), live('YouTube TV', both), live('Fubo', both)],
  },
  telemundo: {
    label: 'Telemundo (Spanish)',
    apps: [
      direct('Peacock', both, 'Spanish broadcast'),
      live('YouTube TV', both),
      live('Hulu + Live TV', both),
      live('Fubo', both),
    ],
  },
  espn: {
    label: 'ESPN',
    apps: [
      ESPN_APP,
      live('YouTube TV', both),
      live('Hulu + Live TV', both),
      live('Fubo', both),
      live('Sling TV', both, 'Orange'),
      live('DIRECTV', both),
    ],
  },
  abc: {
    label: 'ABC',
    apps: [
      ESPN_APP,
      live('YouTube TV', both),
      live('Hulu + Live TV', both),
      live('Fubo', both),
      live('DIRECTV', both),
    ],
  },
  prime: {
    label: 'Prime Video',
    apps: [direct('Prime Video', both, 'Amazon Prime')],
  },
  nbatv: {
    label: 'NBA TV',
    apps: [direct('NBA app', OUT, 'NBA TV or League Pass'), live('Sling TV', OUT, 'NBA TV add-on')],
  },
};

// Order matters: nbcsp-plus must be checked before nbcsp.
export const NETWORK_RULES = [
  { key: 'nbcsp-plus', test: /^NBCSP\+/i },
  { key: 'nbcsp', test: /^NBCSP(\/|$)/i },
  { key: 'nbc', test: /^NBC$/i },
  { key: 'peacock', test: /^Peacock$/i },
  { key: 'nbcsn', test: /^(NBC Sports Network|NBCSN)$/i },
  { key: 'telemundo', test: /^Telemundo$/i },
  { key: 'espn', test: /^ESPN2?$/i },
  { key: 'abc', test: /^ABC$/i },
  { key: 'prime', test: /^Prime Video$/i },
  { key: 'nbatv', test: /^NBA ?TV$/i },
];

export function resolveNetwork({ name, abbr } = {}) {
  for (const value of [abbr?.trim(), name?.trim()]) {
    if (!value) continue;
    const rule = NETWORK_RULES.find((r) => r.test.test(value));
    if (rule) return rule.key;
  }
  return null;
}

export const LEAGUE_PASS_APPS = [
  { app: 'NBA app', kind: 'direct', note: 'NBA League Pass, subject to blackouts' },
  { app: 'Prime Video', kind: 'direct', note: 'NBA League Pass channel, subject to blackouts' },
];

function addApp(list, { app, note }) {
  if (!list.some((x) => x.app === app)) list.push({ app, note: note ?? null });
}

export function watchOptions(game, market) {
  const all = [...game.broadcasts.national, ...game.broadcasts.local];
  const keyed = all.map((b) => ({ b, key: resolveNetwork(b) }));

  const networks = [];
  for (const { b, key } of keyed) {
    const label = NETWORKS[key]?.label ?? b.name;
    if (!networks.some((n) => n.label === label)) networks.push({ label, known: key !== null });
  }

  const direct = [];
  const liveApps = [];
  for (const { key } of keyed) {
    if (key === null) continue;
    for (const a of NETWORKS[key].apps) {
      if (!a.markets.includes(market)) continue;
      addApp(a.kind === 'direct' ? direct : liveApps, a);
    }
  }

  if (
    market === 'out' &&
    game.broadcasts.national.length === 0 &&
    game.broadcasts.local.length > 0 &&
    game.id.startsWith('002')
  ) {
    for (const a of LEAGUE_PASS_APPS) addApp(direct, a);
  }

  const empty = direct.length === 0 && liveApps.length === 0;
  const emptyMessage = !empty
    ? null
    : market === 'in'
      ? 'No in-market broadcast listed yet'
      : 'No out-of-market option listed yet';
  return { networks, direct, live: liveApps, empty, emptyMessage };
}
