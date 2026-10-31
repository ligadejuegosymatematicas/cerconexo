import assert from 'node:assert/strict';

export function deploymentPolicy(template, { account, origin, publish = false, enableHttps = false, pilotAccessReviewed = false, freePlanConfirmed = false }) {
  assert.match(account ?? '', /^[a-f0-9]{32}$/, 'Se necesita el identificador de cuenta, nunca un token.');
  const url = new URL(origin);
  assert.ok(url.origin === origin && url.protocol === 'https:' && /^cerconexo-m6-experimental\.[a-z0-9-]+\.workers\.dev$/.test(url.hostname), 'Solo se permite el Worker experimental independiente.');
  assert.equal(template.name, 'cerconexo-m6-experimental');
  assert.ok(!template.routes && !template.route && !template.custom_domains, 'No se permiten rutas o dominios del sitio estable.');
  assert.deepEqual(template.migrations, [{ tag: 'm6-1', new_sqlite_classes: ['Room', 'AdmissionGate'] }], 'El piloto requiere exclusivamente Durable Objects SQLite.');
  if (publish) assert.ok(freePlanConfirmed, 'Comprueba Workers Free en el panel; este script no cambia el plan.');
  if (enableHttps) assert.ok(publish && pilotAccessReviewed, 'Antes de habilitar HTTPS deben revisarse la credencial privada del piloto y sus secretos de servidor.');
  const config = structuredClone(template);
  config.account_id = account;
  // The first upload has no public endpoint. Install the pilot secrets before
  // a second, explicit upload enables the workers.dev URL. Every asset is gated.
  config.workers_dev = enableHttps;
  config.preview_urls = false;
  config.assets.run_worker_first = true;
  config.vars = { INTEGRATED_SITE: 'true', LOCAL_DEMO: 'false', PUBLIC_DEMO: 'true', PUBLIC_ORIGIN: origin };
  delete config.$schema;
  return config;
}
