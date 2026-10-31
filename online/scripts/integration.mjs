import assert from 'node:assert/strict';
import { mkdir, writeFile, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import WebSocket from 'ws';
import { once } from 'node:events';
import { root, startRuntime, eventually } from './runtime.mjs';
import { SocketClient } from './socket-client.mjs';
import { makeCode } from '../src/protocol.mjs';

const report = { stage: 'M6.1', checkedAt: new Date().toISOString(), runtime: 'Wrangler 4.156.0 / workerd SQLite', scenarios: [], latenciesMs: [] };
const credentials = [], clients = [];
let runtime, combinedLog = '';
function token() { const credential = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url'); credentials.push(credential); return credential; }
async function api(route, body = {}, credential, origin) {
  const response = await fetch(runtime.base + route, { method: 'POST', headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}), ...(credential ? { authorization: `Bearer ${credential}` } : {}) }, body: JSON.stringify(body) });
  const data = await response.json();
  for (const secret of credentials) assert.ok(!JSON.stringify(data).includes(secret), 'Una respuesta HTTP expuso una credencial');
  return { response, data };
}
async function shared(group, revision) { await eventually(() => group.every(c => c.state?.revision >= revision), 'Las cuatro vistas no alcanzaron la revisión compartida'); }
async function lobby(mode, policy = 'piece') {
  const code = makeCode(), names = ['Ana', 'Beto', 'Carla', 'Diego'], group = [];
  for (let i = 0; i < 4; i++) {
    const credential = token();
    const { response, data } = await api(i === 0 ? '/api/rooms' : `/api/rooms/${code}/join`, { code, credential, name: names[i], mode, policy });
    assert.equal(response.status, i === 0 ? 201 : 200);
    if (!i) {
      const retry = await api('/api/rooms', { code, credential, name: names[i], mode, policy });
      assert.equal(retry.response.status, 201); assert.equal(retry.data.state.self.id, data.state.self.id);
    }
    const c = await new SocketClient(runtime.base, code, credential).connect(); group.push(c); clients.push(c);
    if (i) {
      const host = group[0]; await eventually(() => host.state.requests.some(p => p.id === data.state.self.id), 'El anfitrión no recibió la solicitud');
      const ack = await host.command('admit', { playerId: data.state.self.id, seat: host.state.config.seats[i] }); await shared(group, ack.receipt.revision);
    }
  }
  await eventually(() => group.every(c => c.state.participants.length === 4 && c.state.participants.every(p => p.online)), 'Presencia inconsistente');
  for (const c of group) {
    const ack = await c.command('ready', { ready: true }); await shared(group, ack.receipt.revision);
  }
  const ack = await group[0].command('start'); await shared(group, ack.receipt.revision);
  await eventually(() => group.every(c => c.state.status === 'active'), 'La cuenta atrás no inició la sonda');
  return group;
}
try {
  runtime = await startRuntime();
  const health = await (await fetch(runtime.base + '/api/health')).json();
  assert.equal(health.engines.classic.pieces, 4); assert.equal(health.engines.arenaDuo.cells, 81); assert.equal(health.engines.arenaFfa.cells, 81);
  report.scenarios.push('Los motores protegidos se importan y ejecutan en workerd sin cambios');
  const classic = await lobby('classic'), host = classic[0];
  assert.equal(host.state.config.clockMs, 480000);
  const begin = performance.now(), committed = host.envelope('probe.complete'), accepted = await host.request(committed);
  assert.equal(accepted.type, 'ack'); await shared(classic, accepted.receipt.revision); report.latenciesMs.push(performance.now() - begin);
  for (const c of classic) assert.equal(c.state.probe.completed, 1);
  const repeated = await host.request(committed); assert.equal(repeated.duplicate, true); assert.equal(repeated.state.probe.completed, 1);
  const conflict = await host.request({ ...committed, type: 'probe.discard' }); assert.equal(conflict.error.code, 'ACTION_CONFLICT');
  report.scenarios.push('Cuatro posiciones, admisión, preparación, cuenta atrás, difusión e idempotencia');
  const invalid = await host.request(host.envelope('move', { to: 12 })); assert.equal(invalid.error.code, 'COMMAND');
  const wrongActor = await host.request(host.envelope('probe.complete')); assert.equal(wrongActor.error.code, 'DECISION');
  const current = classic[1], commonRevision = current.state.revision;
  const simultaneous = await Promise.all([current.request(current.envelope('probe.complete', {}, commonRevision)), current.request(current.envelope('probe.complete', {}, commonRevision))]);
  assert.equal(simultaneous.filter(m => m.type === 'ack').length, 1); assert.equal(simultaneous.filter(m => m.error?.code === 'STALE').length, 1);
  await shared(classic, simultaneous.find(m => m.type === 'ack').receipt.revision);
  report.scenarios.push('Acciones ajenas, comandos de juego y dos intenciones con una misma revisión se rechazan');
  const replacement = await new SocketClient(runtime.base, host.code, host.credential).connect(); clients.push(replacement);
  await eventually(() => host.messages.some(m => m.type === 'session-replaced'), 'La conexión anterior mantuvo el control');
  assert.equal(replacement.state.self.id, host.state.self.id); assert.equal(replacement.state.self.seat, 'A1');
  classic[0] = replacement; clearInterval(host.ping);
  const responder = classic[2], remaining = responder.state.clock.remainingMs.A;
  clearInterval(responder.ping);
  await eventually(() => classic[0].state.clock.graceUntil, 'La ausencia de heartbeat no expiró la presencia del actor', 20000);
  const recovered = await new SocketClient(runtime.base, responder.code, responder.credential).connect(); clients.push(recovered); classic[2] = recovered;
  await eventually(() => classic[0].state.clock.graceUntil === null, 'La reconexión no terminó la gracia');
  assert.ok(recovered.state.clock.remainingMs.A <= remaining); assert.equal(recovered.state.self.seat, 'A2');
  report.scenarios.push('Recuperación de identidad, exclusión de conexión anterior, presencia expirada tras 15 s sin heartbeat y gracia de la persona que decide');

  for (const [mode, policy] of [['arena-duo', 'piece'], ['arena-duo', 'team'], ['arena-ffa', 'piece']]) {
    const group = await lobby(mode, policy); assert.equal(group[0].state.config.clockMs, mode === 'arena-ffa' ? 300000 : 600000);
    if (policy === 'team') {
      const ack = await group[0].command('probe.discard'); await shared(group, ack.receipt.revision);
      assert.equal(group[0].state.clock.owner, 'B'); assert.equal(group[1].state.canDecide, true); assert.equal(group[3].state.canDecide, true);
      const responses = await Promise.all([group[1].request(group[1].envelope('probe.resolve')), group[3].request(group[3].envelope('probe.resolve'))]);
      assert.equal(responses.filter(m => m.type === 'ack').length, 1); assert.equal(responses.filter(m => m.error?.code === 'STALE').length, 1);
      const resolved = responses.find(m => m.type === 'ack'); await shared(group, resolved.receipt.revision); assert.equal(group[0].state.clock.owner, 'A');
    } else { const ack = await group[0].command('probe.complete'); await shared(group, ack.receipt.revision); }
    report.scenarios.push(`${mode}/${policy}: cuatro clientes y reloj configurado${policy === 'team' ? ', descarte rival y primera respuesta válida' : ''}`);
    for (const c of group) await c.close();
  }

  const noAuth = await fetch(runtime.base + `/api/rooms/${host.code}/resume`, { method: 'POST', body: '{}' }); assert.equal(noAuth.status, 401);
  const badOrigin = await api(`/api/rooms/${host.code}/resume`, {}, host.credential, 'https://untrusted.invalid'); assert.equal(badOrigin.response.status, 403);
  const urlCredential = await fetch(runtime.base + `/api/rooms/${host.code}/socket?credential=forbidden`, { headers: { origin: runtime.base } }); assert.equal(urlCredential.status, 400);
  const preflight = await fetch(runtime.base + '/api/rooms', { method: 'OPTIONS', headers: { origin: 'http://127.0.0.1:8790', 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' } });
  assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('access-control-allow-origin'), 'http://127.0.0.1:8790');
  const queryWithoutToken = await fetch(runtime.base + `/api/rooms/${host.code}/resume?token=forbidden`, { method: 'POST', headers: { authorization: `Bearer ${host.credential}` }, body: '{}' }); assert.equal(queryWithoutToken.status, 400);
  const badWs = new WebSocket(runtime.base.replace('http:', 'ws:') + `/api/rooms/${host.code}/socket`, { origin: runtime.base });
  await once(badWs, 'open'); badWs.send(JSON.stringify({ type: 'authenticate', protocolVersion: 1, roomId: host.code, credential: token() }));
  const [rejected] = await once(badWs, 'message'); assert.equal(JSON.parse(rejected.toString()).error.code, 'AUTH'); await once(badWs, 'close');
  const unauthenticated = new WebSocket(runtime.base.replace('http:', 'ws:') + `/api/rooms/${host.code}/socket`, { origin: runtime.base });
  await once(unauthenticated, 'open');
  const unauthPing = setInterval(() => { if (unauthenticated.readyState === WebSocket.OPEN) unauthenticated.send('m6:ping'); }, 500);
  const [closeCode] = await once(unauthenticated, 'close'); clearInterval(unauthPing); assert.equal(closeCode, 4003);
  report.scenarios.push('Credenciales fuera de URL, autenticación obligatoria, origen restringido y preflight CORS');
  report.scenarios.push('La ventana de autenticación de 5 s no se amplía enviando heartbeats sin autenticar');

  const restoredBefore = classic[0].state.probe.completed;
  const checkpoint = await api(`/api/rooms/${host.code}/resume`, {}, host.credential);
  assert.equal(checkpoint.response.status, 200);
  for (const c of classic) clearInterval(c.ping);
  const persistedPath = runtime.stateDir; combinedLog += runtime.logs(); await runtime.stop();
  runtime = await startRuntime({ stateDir: persistedPath });
  const restoredGroup = [];
  for (const previous of classic) { const c = await new SocketClient(runtime.base, previous.code, previous.credential).connect(); restoredGroup.push(c); clients.push(c); }
  await eventually(() => restoredGroup.every(c => c.state.participants.every(p => p.online)), 'No se recuperaron las cuatro sesiones tras reiniciar');
  for (const c of restoredGroup) {
    assert.equal(c.state.probe.completed, restoredBefore); assert.equal(c.state.participants.length, 4);
    assert.equal(c.state.decision.actor, checkpoint.data.state.decision.actor);
    for (const team of c.state.config.teams) assert.ok(c.state.clock.remainingMs[team] <= checkpoint.data.state.clock.remainingMs[team], 'Un reloj recuperó tiempo al reiniciar');
  }
  const durableDuplicate = await restoredGroup[0].request(committed); assert.equal(durableDuplicate.duplicate, true); assert.equal(durableDuplicate.state.probe.completed, restoredBefore);
  report.scenarios.push('Reinicio completo de Wrangler/workerd con SQLite persistida: cuatro sesiones, estado, relojes y recibos recuperados');
  const rateClient = restoredGroup[0];
  for (let i = 0; i < 65; i++) rateClient.ws.send(JSON.stringify({ type: 'sync', protocolVersion: 1, roomId: host.code }));
  await eventually(() => rateClient.messages.some(m => m.error?.code === 'RATE_LIMIT'), 'No se limitó la ráfaga de comandos');
  report.scenarios.push('Límite de 60 mensajes de aplicación por conexión en una ventana de 10 s');
  for (const c of clients) for (const message of c.messages) for (const secret of credentials) assert.ok(!JSON.stringify(message).includes(secret), 'Un estado WebSocket expuso una credencial');
  combinedLog += runtime.logs();
  for (const secret of credentials) assert.ok(!combinedLog.includes(secret), 'El runtime registró una credencial');
  const logDir = path.join(persistedPath, 'logs');
  for (const file of await readdir(logDir).catch(() => [])) {
    const text = await readFile(path.join(logDir, file), 'utf8');
    for (const secret of credentials) assert.ok(!text.includes(secret), 'Un archivo de registro expuso una credencial');
  }
  report.scenarios.push('Respuestas HTTP, instantáneas WebSocket y registros locales sin credenciales privadas');
  report.ok = true;
} catch (error) { report.ok = false; report.error = error.message; process.exitCode = 1; }
finally {
  for (const c of clients) { clearInterval(c.ping); try { c.ws?.terminate(); } catch {} }
  if (runtime) { report.runtimeLogErrors = (runtime.logs().match(/\[ERROR\]/g) ?? []).length; await runtime.stop(); }
  await mkdir(path.join(root, 'evidence'), { recursive: true }); await writeFile(path.join(root, 'evidence/integration.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
