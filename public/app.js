import { APPS, onlyServices, parseServices, watchOptions } from './networks.js';

const REFRESH_MS = 10 * 60 * 1000;
const STALE_MS = 24 * 60 * 60 * 1000;
const STORAGE_KEY = 'wfa.market';
const PAST_KEY = 'wfa.showPast';
const SERVICES_KEY = 'wfa.services';
const ONLY_MINE_KEY = 'wfa.onlyMine';

const dowFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
const dowFmtUtc = new Intl.DateTimeFormat(undefined, { weekday: 'short', timeZone: 'UTC' });
const dayFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const dayFmtUtc = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
const timeFmt = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'short',
});
const updatedFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

const seasonEl = document.getElementById('season');
const statusEl = document.getElementById('status');
const gamesEl = document.getElementById('games');
const radios = [...document.querySelectorAll('input[name="market"]')];
const pastToggle = document.getElementById('show-past');
const pastCountEl = document.getElementById('past-count');
const onlyMineToggle = document.getElementById('only-mine');
const onlyMineHint = document.getElementById('only-mine-hint');
const servicesCountEl = document.getElementById('services-count');
const serviceListEl = document.getElementById('service-list');

let data = null;
let hasScrolled = false;
let refreshFailed = false;

function readMarket() {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'in' ? 'in' : 'out';
  } catch {
    return 'out';
  }
}

function currentMarket() {
  return radios.find((r) => r.checked)?.value ?? 'out';
}

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

function renderHeader() {
  statusEl.replaceChildren();
  if (!data) return;
  seasonEl.textContent = data.season ? `Philadelphia 76ers · ${data.season} season` : 'Philadelphia 76ers';
  const fetched = Date.parse(data.fetchedAt);
  const formatted = Number.isFinite(fetched) ? updatedFmt.format(fetched) : data.fetchedAt;
  if (refreshFailed) {
    statusEl.textContent = `Couldn't refresh — showing data from ${formatted}`;
    return;
  }
  statusEl.append(`Updated ${formatted}`);
  if (!Number.isFinite(fetched) || Date.now() - fetched > STALE_MS) {
    statusEl.append(el('span', 'stale', ' — data may be stale'));
  }
}

function initials(name) {
  return (name.match(/[A-Za-z0-9]+/g) ?? [])
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

function image(src, className, fallback) {
  const img = document.createElement('img');
  img.className = className;
  img.alt = '';
  img.decoding = 'async';
  img.addEventListener('error', () => img.replaceWith(fallback()));
  img.src = src;
  return img;
}

function teamBadge(opponent) {
  const fallback = () => el('span', 'team-logo tricode', opponent.tricode);
  return opponent.teamId ? image(`logos/${opponent.teamId}.svg`, 'team-logo', fallback) : fallback();
}

function appIcon(name) {
  const fallback = () => el('span', 'app-icon fallback', initials(name));
  const icon = APPS[name]?.icon;
  return icon ? image(icon, 'app-icon', fallback) : fallback();
}

function appGroup(title, items) {
  const group = el('section', 'apps-group');
  group.append(el('p', 'apps-title', title));
  const list = el('ul', 'apps');
  for (const item of items) {
    const li = el('li', 'app');
    const text = el('span', 'app-text');
    text.append(el('span', 'app-name', item.app));
    if (item.note) text.append(el('span', 'app-note', item.note));
    li.append(appIcon(item.app), text);
    list.append(li);
  }
  group.append(list);
  return group;
}

function renderGame(game, market, isNext, mine) {
  const li = el('li', 'game');
  if (game.status === 3) li.classList.add('past');
  if (isNext) li.classList.add('next');
  li.dataset.id = game.id;

  const [dow, day] = game.timeTbd
    ? [dowFmtUtc, dayFmtUtc].map((f) => f.format(new Date(`${game.dateEt}T12:00:00Z`)))
    : [dowFmt, dayFmt].map((f) => f.format(Date.parse(game.startUtc)));
  const date = el('div', 'date');
  date.append(el('span', 'dow', dow), el('span', 'day', day));

  const body = el('div', 'body');

  const matchup = el('div', 'matchup');
  const names = el('div');
  const opp = el('div', 'opp');
  opp.append(el('span', 'side', game.home ? 'vs' : '@'), ` ${game.opponent.name}`);
  const meta = el('div', 'meta');
  if (game.status === 3) meta.append(el('span', 'result', game.statusText));
  else if (game.status === 2) meta.append(el('span', 'badge live', 'Live'));
  else if (game.timeTbd) meta.append(el('span', 'time', 'Time TBD'));
  else meta.append(el('span', 'time', timeFmt.format(Date.parse(game.startUtc))));
  if (game.arena) meta.append(' · ', el('span', 'arena', game.arena));
  names.append(opp, meta);
  matchup.append(teamBadge(game.opponent), names);
  body.append(matchup);

  const tags = el('div', 'tags');
  if (isNext && game.status === 1) tags.append(el('span', 'tag', 'Next game'));
  if (game.label) tags.append(el('span', 'tag', game.label));
  if (game.ifNecessary) tags.append(el('span', 'tag', 'If necessary'));
  if (tags.childNodes.length) body.append(tags);

  const all = watchOptions(game, market);
  const opts = mine ? onlyServices(all, mine) : all;
  const chips = el('div', 'networks');
  for (const n of opts.networks) {
    const chip = el('span', n.known ? 'chip' : 'chip unknown', n.label);
    if (!n.known) chip.title = 'No app mapping yet';
    chips.append(chip);
  }
  if (chips.childNodes.length) body.append(chips);

  if (opts.direct.length) body.append(appGroup('Stream', opts.direct));
  if (opts.live.length) body.append(appGroup('Live TV', opts.live));
  if (opts.empty) body.append(el('div', 'empty', opts.emptyMessage));

  li.append(date, body);
  return li;
}

function readShowPast() {
  try {
    return localStorage.getItem(PAST_KEY) === '1';
  } catch {
    return false;
  }
}

function readOnlyMine() {
  try {
    return localStorage.getItem(ONLY_MINE_KEY) === '1';
  } catch {
    return false;
  }
}

function readServices() {
  try {
    return parseServices(localStorage.getItem(SERVICES_KEY));
  } catch {
    return new Set();
  }
}

let services = readServices();

function saveServices() {
  try {
    localStorage.setItem(SERVICES_KEY, JSON.stringify(Object.keys(APPS).filter((n) => services.has(n))));
  } catch {
    // storage unavailable; selection still applies for this session
  }
}

function scrollToNext() {
  gamesEl.querySelector('.game.next')?.scrollIntoView({ block: 'center' });
}

function render() {
  renderHeader();
  if (!data) return;
  const market = currentMarket();
  const mine = onlyMineToggle.checked && services.size > 0 ? services : null;
  const pastCount = data.games.filter((g) => g.status === 3).length;
  pastCountEl.textContent = pastCount ? `(${pastCount})` : '';
  const nextId = data.games.find((g) => g.status !== 3)?.id;
  const visible = pastToggle.checked ? data.games : data.games.filter((g) => g.status !== 3);
  if (visible.length === 0) {
    gamesEl.replaceChildren(el('li', 'message', 'No upcoming games. Turn on "Show past games" to see results.'));
  } else {
    gamesEl.replaceChildren(...visible.map((g) => renderGame(g, market, g.id === nextId, mine)));
  }
  if (!hasScrolled) {
    hasScrolled = true;
    // With past games hidden the next game is already at the top.
    if (pastToggle.checked) scrollToNext();
  }
}

async function load() {
  try {
    const res = await fetch('data/schedule.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
    refreshFailed = false;
    render();
  } catch {
    if (!data) {
      gamesEl.replaceChildren(el('li', 'message', "Couldn't load schedule data. Try again later."));
    } else {
      refreshFailed = true;
      renderHeader();
    }
  }
}

const saved = readMarket();
for (const r of radios) {
  r.checked = r.value === saved;
  r.addEventListener('change', () => {
    if (!r.checked) return;
    try {
      localStorage.setItem(STORAGE_KEY, r.value);
    } catch {
      // storage unavailable; selection still applies for this session
    }
    render();
  });
}

pastToggle.checked = readShowPast();
pastToggle.addEventListener('change', () => {
  try {
    localStorage.setItem(PAST_KEY, pastToggle.checked ? '1' : '0');
  } catch {
    // storage unavailable; selection still applies for this session
  }
  render();
  scrollToNext();
});

function syncServiceControls() {
  servicesCountEl.textContent = services.size ? `(${services.size})` : '';
  if (services.size) {
    onlyMineToggle.removeAttribute('aria-disabled');
    onlyMineToggle.removeAttribute('aria-describedby');
    onlyMineHint.classList.remove('is-open');
  } else {
    onlyMineToggle.setAttribute('aria-disabled', 'true');
    onlyMineToggle.setAttribute('aria-describedby', 'only-mine-hint');
  }
}

for (const name of Object.keys(APPS)) {
  const label = el('label', 'service');
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.value = name;
  box.checked = services.has(name);
  box.addEventListener('change', () => {
    if (box.checked) services.add(name);
    else services.delete(name);
    saveServices();
    syncServiceControls();
    render();
  });
  label.append(box, appIcon(name), el('span', 'service-name', name));
  serviceListEl.append(label);
}

onlyMineToggle.checked = readOnlyMine();
onlyMineToggle.addEventListener('change', () => {
  try {
    localStorage.setItem(ONLY_MINE_KEY, onlyMineToggle.checked ? '1' : '0');
  } catch {
    // storage unavailable; selection still applies for this session
  }
  render();
});
// While no services are picked the switch is aria-disabled: block the toggle and show the hint.
onlyMineToggle.addEventListener('click', (e) => {
  if (services.size) return;
  e.preventDefault();
  onlyMineHint.classList.add('is-open');
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('.switch-group')) onlyMineHint.classList.remove('is-open');
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') onlyMineHint.classList.remove('is-open');
});
syncServiceControls();

load();
setInterval(load, REFRESH_MS);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') load();
});
