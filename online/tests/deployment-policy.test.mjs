import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { deploymentPolicy } from '../scripts/deployment-policy.mjs';
const template = JSON.parse(await readFile(new URL('../wrangler.experimental.jsonc', import.meta.url), 'utf8'));
const options = { account: '0'.repeat(32), origin: 'https://cerconexo-m6-experimental.piloto.workers.dev' };
test('M6.3: la preparación y la primera subida no exponen ninguna URL pública o de preview', () => {
  for (const extra of [{}, { publish: true, freePlanConfirmed: true }]) {
    const config = deploymentPolicy(template, { ...options, ...extra });
    assert.equal(config.workers_dev, false); assert.equal(config.preview_urls, false); assert.equal(config.assets.run_worker_first, true);
    assert.equal(config.vars.LOCAL_DEMO, 'false'); assert.equal(config.vars.PUBLIC_ORIGIN, options.origin);
  }
  assert.equal(template.vars.LOCAL_DEMO, 'true');
});
test('M6.3: HTTPS solo se habilita tras confirmar Free y revisar el acceso privado', () => {
  assert.throws(() => deploymentPolicy(template, { ...options, publish: true }));
  assert.throws(() => deploymentPolicy(template, { ...options, publish: true, freePlanConfirmed: true, enableHttps: true }));
  const config = deploymentPolicy(template, { ...options, publish: true, freePlanConfirmed: true, enableHttps: true, pilotAccessReviewed: true });
  assert.equal(config.workers_dev, true); assert.equal(config.preview_urls, false);
});
test('M6.3: se rechazan el sitio estable, otras candidatas y almacenamiento no SQLite', () => {
  for (const origin of ['https://ligadejuegosymatematicas.github.io/cerconexo/', 'https://otro.piloto.workers.dev', options.origin + '/'])
    assert.throws(() => deploymentPolicy(template, { ...options, origin }));
  assert.throws(() => deploymentPolicy({ ...template, routes: ['example.com/*'] }, options));
  assert.throws(() => deploymentPolicy({ ...template, migrations: [{ tag: 'm6-1', new_classes: ['Room'] }] }, options));
});
