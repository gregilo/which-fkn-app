import { watchOptions } from './networks.js';

const REFRESH_MS = 10 * 60 * 1000;
const STALE_MS = 24 * 60 * 60 * 1000;
const STORAGE_KEY = 'wfa.market';

const dateFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const dateFmtUtc = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});
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
  statusEl.className = '';
  if (!data) return;
  seasonEl.textContent = data.season ? `${data.season} season` : '';
  if (refreshFailed) {
    statusEl.textContent = `Couldn't refresh — showing data from ${data.fetchedAt}`;
    return;
  }
  const fetched = Date.parse(data.fetchedAt);
  statusEl.append(`Updated ${Number.isFinite(fetched) ? updatedFmt.format(fetched) : data.fetchedAt}`);
  if (!Number.isFinite(fetched) || Date.now() - fetched > STALE_MS) {
    statusEl.append(el('span', 'stale', ' — data may be stale, run npm run update'));
  }
}

function appLine(title, items) {
  const line = el('div', 'line');
  line.append(el('b', undefined, `${title}: `));
  items.forEach((item, i) => {
    if (i > 0) line.append(', ');
    line.append(item.app);
    if (item.note) line.append(el('span', 'note', ` (${item.note})`));
  });
  return line;
}

function renderGame(game, market) {
  const li = el('li', 'game');
  if (game.status === 3) li.classList.add('past');

  const when = el('div', 'when');
  const date = game.timeTbd ? dateFmtUtc.format(new Date(`${game.dateEt}T12:00:00Z`)) : dateFmt.format(Date.parse(game.startUtc));
  let time;
  if (game.status === 3) time = game.statusText;
  else if (game.status === 2) time = 'Live';
  else if (game.timeTbd) time = 'Time TBD';
  else time = timeFmt.format(Date.parse(game.startUtc));
  when.append(date, el('span', 'time', time));
  li.append(when);

  li.append(el('div', 'matchup', `${game.home ? 'vs' : '@'} ${game.opponent.name}`));

  const tags = el('div');
  if (game.label) tags.append(el('span', 'tag', game.label));
  if (game.ifNecessary) tags.append(el('span', 'tag', 'If necessary'));
  if (tags.childNodes.length) li.append(tags);

  const opts = watchOptions(game, market);
  const chips = el('div');
  for (const n of opts.networks) {
    const chip = el('span', n.known ? 'chip' : 'chip unknown', n.label);
    if (!n.known) chip.title = 'No app mapping yet';
    chips.append(chip);
  }
  if (chips.childNodes.length) li.append(chips);

  if (opts.direct.length) li.append(appLine('Stream', opts.direct));
  if (opts.live.length) li.append(appLine('Live TV', opts.live));
  if (opts.empty) li.append(el('div', 'line empty', opts.emptyMessage));
  return li;
}

function render() {
  renderHeader();
  if (!data) return;
  const market = currentMarket();
  gamesEl.replaceChildren(...data.games.map((g) => renderGame(g, market)));
  if (!hasScrolled) {
    hasScrolled = true;
    const idx = data.games.findIndex((g) => g.status !== 3);
    if (idx >= 0) gamesEl.children[idx].scrollIntoView({ block: 'center' });
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
      gamesEl.replaceChildren(el('li', 'message', 'No schedule data yet. Run `npm run update` (or `npm start`).'));
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

load();
setInterval(load, REFRESH_MS);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') load();
});
