import test from 'node:test';
import assert from 'node:assert/strict';
import { apiAccess, boundedJson } from '../src/access-policy.mjs';
const publicOrigin = 'https://cerconexo-m6-experimental.example.workers.dev';
const env = { PUBLIC_DEMO: 'true', PUBLIC_ORIGIN: publicOrigin };
test('M6.3: el acceso público exige HTTPS y un origen exacto configurado', () => {
  assert.equal(apiAccess(new URL(publicOrigin + '/api/health'), env, publicOrigin).publicSite, true);
  for (const origin of ['', '*', 'http://example.com', publicOrigin + '/', 'https://127.0.0.1'])
    assert.throws(() => apiAccess(new URL(publicOrigin + '/api/health'), { ...env, PUBLIC_ORIGIN: origin }, null));
  for (const target of ['https://otro.workers.dev', publicOrigin.replace('https:', 'http:')])
    assert.throws(() => apiAccess(new URL(target + '/api/health'), env, null), { code: 'HOST' });
});
test('M6.3: origen externo y parámetros API se rechazan; la sesión sigue siendo necesaria', () => {
  assert.throws(() => apiAccess(new URL(publicOrigin + '/api/rooms'), env, 'https://externo.example'), { code: 'ORIGIN' });
  assert.throws(() => apiAccess(new URL(publicOrigin + '/api/rooms?credential=secret'), env, publicOrigin), { code: 'QUERY' });
  assert.deepEqual(apiAccess(new URL(publicOrigin + '/api/rooms'), env, null).cors, {});
});
test('M6.3: el laboratorio no queda expuesto por añadir una configuración pública separada', () => {
  const local = { LOCAL_DEMO: 'true', ALLOWED_ORIGINS: 'http://127.0.0.1:8787' };
  assert.equal(apiAccess(new URL('http://127.0.0.1:8787/api/health'), local, null).publicSite, false);
  assert.throws(() => apiAccess(new URL(publicOrigin + '/api/health'), local, null), { code: 'LOCAL_ONLY' });
});
test('M6.3: mensajes HTTP fragmentados se limitan antes de consumir todo el cuerpo', async () => {
  let cancelled = false;
  const stream = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(5000)); }, cancel() { cancelled = true; } });
  await assert.rejects(boundedJson(new Request('https://internal', { method: 'POST', body: stream, duplex: 'half' })), { code: 'SIZE' });
  assert.equal(cancelled, true);
  await assert.rejects(boundedJson(new Request('https://internal', { method: 'POST', body: '{}', headers: { 'content-length': '9000' } })), { code: 'SIZE' });
  assert.deepEqual(await boundedJson(new Request('https://internal', { method: 'POST', body: '{"to":9}' })), { to: 9 });
  await assert.rejects(boundedJson(new Request('https://internal', { method: 'POST', body: '{' })), { code: 'JSON' });
});
