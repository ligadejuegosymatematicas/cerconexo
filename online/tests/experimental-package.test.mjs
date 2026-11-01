import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('../../', import.meta.url);
test('Beta: manifiesto público explícito, una copia de cada motor y M5-D preservado', async () => {
  const files = JSON.parse(await readFile(new URL('scripts/pages-files.json', root), 'utf8'));
  assert.equal(files.filter(n => n === 'src/engine.mjs').length, 1);
  assert.equal(files.filter(n => n === 'arena/src/engine.mjs').length, 1);
  assert.ok(files.includes('online/index.html')); assert.ok(files.includes('online/new-game.mjs'));
  assert.ok(files.every(n => !/node_modules|\.state|\.env|wrangler|online\/(?:src|scripts|tests|public)\//.test(n)));
  const reference = JSON.parse(await readFile(new URL('./fixtures/m5d-canonical.json', import.meta.url), 'utf8'));
  assert.equal(reference.baseSha, 'cd22390f9571e6b6f03a43b84922a825ec823def');
  assert.equal(Object.keys(reference.files).length, 50);
  for (const [file, expected] of Object.entries(reference.files)) {
    assert.equal(createHash('sha256').update(await readFile(new URL(file, root))).digest('hex'), expected, file);
  }
  const classic = await readFile(new URL('clasico/index.html', root), 'utf8'), arena = await readFile(new URL('arena/index.html', root), 'utf8');
  assert.match(classic, /data-online-control/); assert.match(arena, /name="opponent" value="online" disabled/);
  assert.doesNotMatch(await readFile(new URL('online/config.mjs', root), 'utf8'), /credential|PILOT_|ADMISSION_HASH/);
});
