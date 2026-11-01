import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { cloudflareAPI } from './cloudflare-api.mjs';
import { API_BASE } from '../config.mjs';
const account = process.argv[process.argv.indexOf('--account-id') + 1];
const worker = 'cerconexo-m6-beta-staging', pilot = 'cerconexo-m6-experimental';
const get = route => cloudflareAPI(account, route);
const [settings, namespaces, deployments, subdomain, pilotDeployments] = await Promise.all([
  get(`workers/scripts/${worker}/settings`), get('workers/durable_objects/namespaces'),
  get(`workers/scripts/${worker}/deployments`), get(`workers/scripts/${worker}/subdomain`), get(`workers/scripts/${pilot}/deployments`)
]);
const bindings = settings.bindings.map(b => ({ name: b.name, type: b.type, ...(b.class_name ? { className: b.class_name, namespaceId: b.namespace_id } : {}), ...(b.type === 'plain_text' ? { value: b.text } : {}) }));
const vars = Object.fromEntries(bindings.filter(b => b.type === 'plain_text').map(b => [b.name, b.value]));
assert.equal(vars.SERVICE_MODE, 'beta-staging'); assert.equal(vars.PUBLIC_CREATION, 'false');
assert.equal(vars.BACKEND_ORIGIN, API_BASE); assert.equal(settings.observability?.enabled ?? false, false);
assert.equal(vars.FRONTEND_ORIGINS, 'https://ligadejuegosymatematicas.github.io'); assert.equal(vars.ALLOW_LOOPBACK_TESTS, 'false');
assert.deepEqual(bindings.filter(b => b.type === 'secret_text').map(b => b.name).sort(), ['TEST_ADMISSION_HASH']);
const stores = bindings.filter(b => b.type === 'durable_object_namespace'); assert.equal(stores.length, 2);
for (const binding of stores) {
  assert.ok(!['3fe20d0401cd4bafb948ba2bcf4809a0', 'f53964a2313946f38e68869ce5294f27'].includes(binding.namespaceId));
  const ns = namespaces.find(n => n.id === binding.namespaceId); assert.ok(ns?.use_sqlite); assert.equal(ns.script, worker);
}
const active = list => (list.deployments ?? list)[0].versions.map(v => v.version_id);
assert.deepEqual(active(pilotDeployments), ['a78f6f07-0711-45e7-9a77-37fdbfb9c874']);
assert.equal(subdomain.enabled, true); assert.equal(subdomain.previews_enabled, false);
const result = { ok: true, checkedAt: new Date().toISOString(), worker, backend: API_BASE,
  versions: active(deployments), bindings, subdomain, independentSQLite: true,
  pilot: { unchanged: true, version: active(pilotDeployments)[0] }, billingChanged: false,
  note: 'Revisión mediante GET de Workers; no solicita permisos de facturación ni accede a sesiones del piloto.' };
await mkdir(new URL('../evidence/', import.meta.url), { recursive: true });
await writeFile(new URL('../evidence/beta-staging-review.json', import.meta.url), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
