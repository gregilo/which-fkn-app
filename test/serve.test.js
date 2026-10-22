import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveStaticPath } from '../scripts/serve.js';

const PUB = '/abs/public';

test('resolves static paths inside public', () => {
  assert.deepEqual(resolveStaticPath(PUB, '/'), { status: 200, file: '/abs/public/index.html' });
  assert.deepEqual(resolveStaticPath(PUB, '/app.js'), { status: 200, file: '/abs/public/app.js' });
  assert.deepEqual(resolveStaticPath(PUB, '/data/schedule.json'), {
    status: 200,
    file: '/abs/public/data/schedule.json',
  });
});

test('encoded traversal stays inside public', () => {
  assert.deepEqual(resolveStaticPath(PUB, '/..%2f..%2fpackage.json'), {
    status: 200,
    file: '/abs/public/package.json',
  });
});

test('malformed encoding and NUL bytes are 400', () => {
  assert.deepEqual(resolveStaticPath(PUB, '/%E0%A4%A'), { status: 400 });
  assert.deepEqual(resolveStaticPath(PUB, '/a%00b'), { status: 400 });
});
