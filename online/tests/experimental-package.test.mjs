import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { experimentalPayload } from '../scripts/build-experimental.mjs';
test('M6.3: el paquete conserva el juego completo y modifica solo su HTML generado', async () => {
  const payload = await experimentalPayload();
  const manifest = JSON.parse(await readFile(new URL('../../scripts/pages-files.json', import.meta.url), 'utf8'));
  for (const name of manifest) {
    if (name.endsWith('index.html')) continue;
    assert.deepEqual(payload.get(name), await readFile(new URL('../../' + name, import.meta.url)), name);
  }
  for (const page of ['index.html', 'clasico/index.html', 'arena/index.html']) {
    const text = payload.get(page).toString();
    assert.equal((text.match(/data-online/g) ?? []).length, 1);
    assert.match(text, /aria-label="Cerconexo Clásico">\s*<a[^>]*data-online/);
    assert.doesNotMatch(text, /Arena online|arena-online/);
  }
  assert.match(payload.get('clasico/index.html').toString(), /Online · Cuatro personas/);
  assert.match(payload.get('online/index.html').toString(), /href="\/online\/classic.css" data-classic-styles/);
  assert.match(payload.get('_headers').toString(), /sha256-/);
  assert.doesNotMatch(payload.get('_headers').toString(), /script-src[^;]*unsafe-inline/);
  assert.ok([...payload.keys()].every(name => !/(node_modules|worker\.mjs|\.state|\.env|wrangler|evidence)/.test(name)));
});
