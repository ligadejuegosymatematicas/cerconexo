import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import WebSocket from 'ws';
import { once } from 'node:events';
import { betaOperator } from './beta-operator.mjs';
import { SocketClient } from './socket-client.mjs';
import { eventually } from './runtime.mjs';
import { API_BASE } from '../config.mjs';
const operator = await betaOperator(), origin = 'https://ligadejuegosymatematicas.github.io';
const checks = [], report = { checkedAt: new Date().toISOString(), backend: API_BASE, checks };
let client;
async function request(path, { method = 'GET', headers = {}, body, status = 200, code } = {}) {
  const response = await fetch(API_BASE + path, { method, headers: { Origin: origin, ...headers }, ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }), signal: AbortSignal.timeout(20000) });
  assert.equal(response.status, status, path); const text = await response.text(), data = text ? JSON.parse(text) : null;
  if (code) assert.equal(data.error.code, code); return { response, data };
}
try {
  const health = await request('/api/health'); assert.equal(health.data.publicCreation, false); assert.equal(health.data.baseSha, 'cd22390f9571e6b6f03a43b84922a825ec823def');
  assert.equal(health.response.headers.get('access-control-allow-origin'), origin); checks.push('HTTPS, motor M5-D y creación pública cerrada');
  await request('/api/health', { headers: { Origin: 'https://example.org' }, status: 403, code: 'ORIGIN' });
  const preflight = await request('/api/rooms', { method: 'OPTIONS', status: 204 }); assert.equal(preflight.response.headers.get('access-control-allow-origin'), origin);
  assert.equal(preflight.response.headers.get('access-control-allow-credentials'), null); checks.push('CORS exacto, sin comodín ni cookies');
  await request('/api/rooms', { method: 'POST', body: {}, status: 409, code: 'BETA_NOT_OPEN' });
  await request('/api/rooms', { method: 'POST', headers: { 'x-cerconexo-test-admission': 'X'.repeat(43) }, body: {}, status: 403, code: 'BETA_NOT_OPEN' }); checks.push('Creación reservada al operador, credencial independiente');
  await request('/api/health?credential=not-a-secret', { status: 400, code: 'QUERY' });
  await request('/api/rooms', { method: 'POST', headers: { 'x-cerconexo-test-admission': operator.credential }, body: 'x'.repeat(17000), status: 413, code: 'SIZE' }); checks.push('Rechazo de credenciales en URL y cuerpos excesivos');
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', code = [...crypto.getRandomValues(new Uint8Array(10))].map(b => alphabet[b & 31]).join('');
  const credential = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
  await request('/api/rooms', { method: 'POST', headers: { 'content-type': 'application/json', 'x-cerconexo-test-admission': operator.credential }, body: { code, credential, name: 'Seguridad beta', mode: 'classic', policy: 'piece', players: 4 }, status: 201 });
  await request(`/api/rooms/${code}/resume`, { method: 'POST', body: {}, status: 401, code: 'AUTH' });
  const endpoint = API_BASE.replace('https:', 'wss:') + `/api/rooms/${code}/socket`;
  const forbidden = new WebSocket(endpoint, { origin: 'https://example.org' });
  await new Promise((resolve, reject) => { forbidden.on('unexpected-response', (_req, res) => { try { assert.equal(res.statusCode, 403); res.resume(); resolve(); } catch (error) { reject(error); } }); forbidden.on('open', () => reject(new Error('WSS aceptó origen ajeno'))); forbidden.on('error', reject); }); forbidden.terminate(); checks.push('WSS rechaza origen ajeno y HTTP exige sesión');
  const anonymous = new WebSocket(endpoint, { origin }); await once(anonymous, 'open'); const [closed] = await once(anonymous, 'close'); assert.equal(closed, 4003); checks.push('Conexión WSS sin autenticación caduca');
  client = await new SocketClient(API_BASE, code, credential, {}, undefined, origin).connect(); const revision = client.state.revision;
  for (let i = 0; i < 65; i++) client.ws.send(JSON.stringify({ type: 'sync', roomId: code, protocolVersion: 1 }));
  await eventually(() => client.messages.some(m => m.error?.code === 'RATE_LIMIT'), 'El límite WSS no respondió', 20000);
  assert.equal(client.state.revision, revision); checks.push('Límite de 60 mensajes/10 s sin alterar la revisión');
  assert.ok(!JSON.stringify(client.state).includes(credential)); assert.ok(!JSON.stringify(client.state).includes(operator.credential)); checks.push('Estado público sin credenciales personales ni administrativas');
  report.ok = true;
} catch (error) { report.ok = false; report.error = error.message; process.exitCode = 1; }
finally { if (client) { clearInterval(client.ping); client.ws?.terminate(); } await mkdir(new URL('../evidence/', import.meta.url), { recursive: true }); await writeFile(new URL('../evidence/beta-security.json', import.meta.url), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2)); }
