import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveNetwork, watchOptions } from '../public/networks.js';

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
