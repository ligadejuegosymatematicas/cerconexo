import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { pilotGate, createPilotSession, validPilotSession, PILOT_COOKIE, PILOT_SESSION_MS } from '../src/pilot-gate.mjs';
const origin = 'https://cerconexo-m6-experimental.piloto.workers.dev', credential = 'A'.repeat(43);
const env = { PUBLIC_DEMO: 'true', PUBLIC_ORIGIN: origin, PILOT_CREDENTIAL_HASH: createHash('sha256').update(credential).digest('hex'), PILOT_SESSION_KEY: 'B'.repeat(43),
  ADMISSION: { idFromName: name => name, get: () => ({ fetch: async () => new Response('{}') }) } };
const request = (path, options) => new Request(origin + path, options);
test('M6.3: el piloto falla cerrado sin secretos y no revela juego, API ni WSS sin autorización', async () => {
  assert.equal((await pilotGate(request('/'), { PUBLIC_DEMO: 'true' })).status, 503);
  for (const path of ['/', '/src/engine.mjs', '/arena/', '/online/?room=ABCDEFGH23']) assert.equal((await pilotGate(request(path), env)).status, 303);
  for (const path of ['/api/health', '/api/rooms/ABCDEFGH23/socket']) assert.equal((await pilotGate(request(path), env)).status, 401);
  assert.equal((await pilotGate(request('/api/rooms/ABCDEFGH23/socket', { headers: { upgrade: 'websocket' } }), env)).status, 401);
  assert.equal(await pilotGate(request('/'), { LOCAL_DEMO: 'true' }), null);
  assert.equal(await pilotGate(request('/pilot-login.mjs'), env), null);
});
test('M6.3: solo la credencial correcta emite cookie Secure, HttpOnly, host-only y SameSite', async () => {
  const post = value => request('/pilot/session', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ credential: value }) });
  assert.equal((await pilotGate(post('C'.repeat(43)), env, 1000)).status, 401);
  const logged = await pilotGate(post(credential), env, 1000), cookie = logged.headers.get('set-cookie');
  assert.equal(logged.status, 200); assert.deepEqual(await logged.json(), { ok: true });
  assert.match(cookie, /Path=\/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800$/); assert.doesNotMatch(cookie, /Domain=/);
  assert.ok(!cookie.includes(credential));
  for (const path of ['/', '/api/rooms/ABCDEFGH23/socket']) assert.equal(await pilotGate(request(path, { headers: { cookie: cookie.split(';')[0] } }), env, 1001), null);
  const badOrigin = post(credential); badOrigin.headers.set('origin', 'https://externo.invalid');
  assert.equal((await pilotGate(badOrigin, env)).status, 403);
});
test('M6.3: firmas falsas, otro origen, vencimiento exacto y rotación invalidan la sesión', async () => {
  const token = await createPilotSession(env, origin, 1000);
  assert.equal(await validPilotSession(token, env, origin, 1001), true);
  assert.equal(await validPilotSession(token, env, origin, 1000 + PILOT_SESSION_MS), false);
  assert.equal(await validPilotSession(token, env, origin + '.otro', 1001), false);
  assert.equal(await validPilotSession(token, { ...env, PILOT_SESSION_KEY: 'D'.repeat(43) }, origin, 1001), false);
  assert.equal(await validPilotSession(token.split('.')[0] + '.AAAA', env, origin, 1001), false);
  assert.equal(await validPilotSession('x'.repeat(2000), env, origin, 1001), false);
});
test('M6.3: límite de intentos y redirecciones impiden fuerza bruta básica y retorno a otro dominio', async () => {
  const limited = { ...env, ADMISSION: { idFromName: name => name, get: () => ({ fetch: async () => new Response('{}', { status: 429 }) }) } };
  const response = await pilotGate(request('/pilot/session', { method: 'POST', headers: { origin }, body: JSON.stringify({ credential }) }), limited);
  assert.equal(response.status, 429);
  const token = await createPilotSession(env, origin, 1000);
  const redirect = await pilotGate(request('/pilot/?return=//evil.invalid', { headers: { cookie: `${PILOT_COOKIE}=${token}` } }), env, 1001);
  assert.equal(redirect.headers.get('location'), origin + '/');
});
