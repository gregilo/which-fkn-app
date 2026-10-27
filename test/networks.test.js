import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import {
  APPS,
  LEAGUE_PASS_APPS,
  NETWORKS,
  NOT_ON_SERVICES,
  onlyServices,
  parseServices,
  resolveNetwork,
  watchOptions,
} from '../public/networks.js';

const b = (name, abbr) => ({ name, abbr });
const NBCSP = b('NBC Sports Philadelphia', 'NBCSP/PCK-PHI');
const mk = (id, national, local) => ({ id, broadcasts: { national, local } });
const apps = (list) => list.map((x) => (x.note ? `${x.app} (${x.note})` : x.app));

const LP = [
  'NBA app (NBA League Pass, subject to blackouts)',
  'Prime Video (NBA League Pass channel, subject to blackouts)',
];

test('(a) local-only NBCSP game', () => {
  const g = mk('0022600117', [], [NBCSP]);
  const out = watchOptions(g, 'out');
  assert.deepEqual(apps(out.direct), LP);
  assert.deepEqual(out.live, []);
  const inn = watchOptions(g, 'in');
  assert.deepEqual(apps(inn.direct), [
    'Peacock (NBC Sports Philadelphia add-on)',
    'NBC Sports app (TV provider login)',
  ]);
  assert.deepEqual(apps(inn.live), ['YouTube TV', 'Hulu + Live TV', 'Fubo']);
});

test('(b) NBA TV national + NBCSP local', () => {
  const g = mk('0022600118', [b('NBA TV', 'NBA TV')], [NBCSP]);
  const out = watchOptions(g, 'out');
  assert.deepEqual(apps(out.direct), ['NBA app (NBA TV or League Pass)']);
  assert.deepEqual(apps(out.live), ['Sling TV (NBA TV add-on)']);
  const inn = watchOptions(g, 'in');
  assert.deepEqual(apps(inn.direct), [
    'Peacock (NBC Sports Philadelphia add-on)',
    'NBC Sports app (TV provider login)',
  ]);
  assert.deepEqual(apps(inn.live), ['YouTube TV', 'Hulu + Live TV', 'Fubo']);
});

test('(c) Prime Video national only', () => {
  const g = mk('0022600119', [b('Prime Video', 'Prime Video')], []);
  for (const m of ['in', 'out']) {
    const r = watchOptions(g, m);
    assert.deepEqual(apps(r.direct), ['Prime Video (Amazon Prime)']);
    assert.deepEqual(r.live, []);
  }
});

test('(d) NBC + Peacock lists Peacock once', () => {
  const g = mk('0022600120', [b('NBC', 'NBC'), b('Peacock', 'Peacock')], []);
  const r = watchOptions(g, 'out');
  assert.equal(r.direct.filter((x) => x.app === 'Peacock').length, 1);
});

test('(e) unknown network', () => {
  assert.equal(resolveNetwork({ name: 'Foo TV', abbr: 'FOO' }), null);
  const r = watchOptions(mk('0022600121', [b('Foo TV', 'FOO')], []), 'out');
  assert.deepEqual(r.networks, [{ label: 'Foo TV', known: false }]);
  assert.equal(r.empty, true);
});

test('(f) no broadcasters at all', () => {
  const g = mk('0022600122', [], []);
  const inn = watchOptions(g, 'in');
  assert.equal(inn.empty, true);
  assert.equal(inn.emptyMessage, 'No in-market broadcast listed yet');
  const out = watchOptions(g, 'out');
  assert.equal(out.empty, true);
  assert.equal(out.direct.length, 0);
});

test('(g) NBCSP+ resolves before NBCSP', () => {
  assert.equal(resolveNetwork({ abbr: 'NBCSP+/PCK-PHI' }), 'nbcsp-plus');
  assert.equal(resolveNetwork({ abbr: 'NBCSP/PCK-PHI' }), 'nbcsp');
});

test('(h) Cup final never gets League Pass', () => {
  const r = watchOptions(mk('0062600001', [], [NBCSP]), 'out');
  assert.equal(r.empty, true);
  assert.deepEqual(r.direct, []);
});

test('(i) NBCSN-only national', () => {
  const g = mk('0022600123', [b('NBC Sports Network', 'NBCSN')], []);
  for (const m of ['in', 'out']) {
    const r = watchOptions(g, m);
    assert.deepEqual(apps(r.direct), ['Peacock']);
    assert.deepEqual(apps(r.live), ['YouTube TV', 'Fubo']);
  }
});

test('(j) every listed app has a vendored icon', () => {
  const names = new Set([...Object.values(NETWORKS).flatMap((n) => n.apps.map((a) => a.app)), ...LEAGUE_PASS_APPS.map((a) => a.app)]);
  for (const name of names) {
    assert.ok(APPS[name], `APPS is missing "${name}"`);
    assert.ok(existsSync(new URL(`../public/${APPS[name].icon}`, import.meta.url)), `missing file public/${APPS[name].icon}`);
  }
});

test('(k) onlyServices limits apps to my services', () => {
  const game = mk('0022600117', [], [NBCSP]);

  const prime = onlyServices(watchOptions(game, 'out'), new Set(['Prime Video']));
  assert.deepEqual(apps(prime.direct), ['Prime Video (NBA League Pass channel, subject to blackouts)']);
  assert.deepEqual(prime.live, []);
  assert.equal(prime.empty, false);
  assert.equal(prime.emptyMessage, null);

  const fuboIn = onlyServices(watchOptions(game, 'in'), new Set(['Fubo']));
  assert.deepEqual(fuboIn.direct, []);
  assert.deepEqual(apps(fuboIn.live), ['Fubo']);

  const unfiltered = watchOptions(game, 'out');
  const fuboOut = onlyServices(unfiltered, new Set(['Fubo']));
  assert.equal(fuboOut.empty, true);
  assert.equal(fuboOut.emptyMessage, NOT_ON_SERVICES);
  assert.deepEqual(fuboOut.networks, unfiltered.networks);

  const none = onlyServices(watchOptions(mk('0022600122', [], []), 'in'), new Set(['Fubo']));
  assert.equal(none.emptyMessage, 'No in-market broadcast listed yet');
});

test('(l) parseServices keeps only known app names', () => {
  assert.deepEqual([...parseServices(null)], []);
  assert.deepEqual([...parseServices('not json')], []);
  assert.deepEqual([...parseServices('{"Fubo":true}')], []);
  assert.deepEqual([...parseServices('"Fubo"')], []);
  assert.deepEqual([...parseServices('["Bogus","Fubo",1,"__proto__"]')], ['Fubo']);
  assert.deepEqual([...parseServices('["Fubo","Peacock","Fubo"]')], ['Fubo', 'Peacock']);
});
