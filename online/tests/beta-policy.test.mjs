import test from 'node:test';
import assert from 'node:assert/strict';
import { apiAccess } from '../src/access-policy.mjs';
import { authorizeCreation } from '../src/beta-admission.mjs';
import { digest } from '../src/protocol.mjs';
const origin = 'https://cerconexo-m6-beta-staging.cerconexo-piloto-h89.workers.dev';
const pages = 'https://ligadejuegosymatematicas.github.io';
const env = { SERVICE_MODE: 'beta-staging', PUBLIC_CREATION: 'false', BACKEND_ORIGIN: origin, FRONTEND_ORIGINS: pages + ',http://127.0.0.1:8810', ALLOW_LOOPBACK_TESTS: 'true' };
test('Beta: API y CORS aceptan Pages exacto, conservan prefijo fuera del Origin y rechazan terceros', () => {
  const a = apiAccess(new URL(origin + '/api/rooms'), env, pages); assert.equal(a.cors['access-control-allow-origin'], pages); assert.equal(a.publicSite, true);
  assert.throws(() => apiAccess(new URL(origin + '/api/rooms'), env, pages + '/cerconexo'), { code: 'ORIGIN' });
  assert.throws(() => apiAccess(new URL(origin + '/api/rooms'), env, 'https://externo.invalid'), { code: 'ORIGIN' });
  assert.throws(() => apiAccess(new URL('https://cerconexo-m6-experimental.cerconexo-piloto-h89.workers.dev/api/rooms'), env, pages), { code: 'HOST' });
});
test('Beta: no se admiten comodines, HTTP externo, usuario en origen o rutas en la lista', () => {
  for (const value of ['*', 'http://externo.invalid', pages + '/cerconexo/', 'https://usuario@externo.invalid']) assert.throws(() => apiAccess(new URL(origin + '/api/rooms'), { ...env, FRONTEND_ORIGINS: value }, pages), { code: 'CONFIG' });
});
test('Beta: localhost solo puede habilitarse en staging, nunca en la configuración pública', () => {
  assert.equal(apiAccess(new URL(origin + '/api/rooms'), env, 'http://127.0.0.1:8810').publicSite, true);
  assert.throws(() => apiAccess(new URL(origin + '/api/rooms'), { ...env, SERVICE_MODE: 'beta-public' }, pages), { code: 'CONFIG' });
});
test('Staging cerrado: sin autorización o con una credencial ajena no se crean salas', async () => {
  const secret = 'A'.repeat(43), settings = { ...env, TEST_ADMISSION_HASH: await digest(secret) };
  await assert.rejects(() => authorizeCreation(new Request(origin), settings), { code: 'BETA_NOT_OPEN' });
  await assert.rejects(() => authorizeCreation(new Request(origin, { headers: { 'x-cerconexo-test-admission': 'B'.repeat(43) } }), settings), { code: 'BETA_NOT_OPEN' });
  await authorizeCreation(new Request(origin, { headers: { 'x-cerconexo-test-admission': secret } }), settings);
  await assert.rejects(() => authorizeCreation(new Request(origin), { ...settings, PUBLIC_CREATION: 'true' }), { code: 'CONFIG' });
});
test('Beta pública preparada: necesita apertura explícita; no consulta ninguna credencial del piloto', async () => {
  await assert.rejects(() => authorizeCreation(new Request(origin), { SERVICE_MODE: 'beta-public', PUBLIC_CREATION: 'false' }), { code: 'BETA_NOT_OPEN' });
  await authorizeCreation(new Request(origin), { SERVICE_MODE: 'beta-public', PUBLIC_CREATION: 'true' });
});
