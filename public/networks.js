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

// Official App Store icons, vendored by `npm run assets` into public/icons/.
export const APPS = {
  Peacock: { appStoreId: 1508186374, icon: 'icons/peacock.png' },
  'NBC Sports app': { appStoreId: 542511686, icon: 'icons/nbc-sports.png' },
  'ESPN app': { appStoreId: 317469184, icon: 'icons/espn.png' },
  'Prime Video': { appStoreId: 545519333, icon: 'icons/prime-video.png' },
  'NBA app': { appStoreId: 484672289, icon: 'icons/nba.png' },
  'YouTube TV': { appStoreId: 1193350206, icon: 'icons/youtube-tv.png' },
  'Hulu + Live TV': { appStoreId: 376510438, icon: 'icons/hulu.png' },
  Fubo: { appStoreId: 905401434, icon: 'icons/fubo.png' },
  'Sling TV': { appStoreId: 945077360, icon: 'icons/sling-tv.png' },
  DIRECTV: { appStoreId: 1136238277, icon: 'icons/directv.png' },
};

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

export const NOT_ON_SERVICES = 'Not on your services';

// Limits watchOptions() output to the apps in `services` (a Set of APPS names).
export function onlyServices(opts, services) {
  const direct = opts.direct.filter((a) => services.has(a.app));
  const live = opts.live.filter((a) => services.has(a.app));
  const empty = direct.length === 0 && live.length === 0;
  const emptyMessage = !empty ? null : opts.empty ? opts.emptyMessage : NOT_ON_SERVICES;
  return { ...opts, direct, live, empty, emptyMessage };
}

// Parses the stored wfa.services value (string or null) into a Set of known APPS names.
export function parseServices(raw) {
  let list;
  try {
    list = JSON.parse(raw);
  } catch {
    return new Set();
  }
  if (!Array.isArray(list)) return new Set();
  return new Set(list.filter((n) => typeof n === 'string' && Object.hasOwn(APPS, n)));
}
