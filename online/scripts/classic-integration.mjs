import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { root, startRuntime, eventually } from './runtime.mjs';
import { SocketClient } from './socket-client.mjs';
import { makeCode } from '../src/protocol.mjs';
import { initialState, applyTurn, availableMoves, wallOptions, territory, activeIds } from '../../src/engine.mjs';
import { beginDraft, advanceDraft } from '../../src/turnDraft.mjs';
import { testTarget, authorizeTarget } from './test-target.mjs';
const target = testTarget();

// The oracle imports the protected, offline engine directly. No result, path,
// score, or actor returned by the network is used to choose the expected turn.
const report = { stage: 'M6.2', checkedAt: new Date().toISOString(), scenarios: [], latenciesMs: [], runtimeStarts: 0 };
const credentials = [], clients = [];
let runtime, combinedLog = '', group = [], oracle = initialState(), draft = beginDraft(oracle), seed = 0x6c2;
let durableStep;
function token() { const value = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url'); credentials.push(value); return value; }
function redact(value) { for (const secret of credentials) value = value.split(secret).join('[redacted]'); return value; }
function assertPrivate(value, label) { const text = typeof value === 'string' ? value : JSON.stringify(value); for (const secret of credentials) assert.ok(!text.includes(secret), label); }
async function api(route, body = {}, credential) {
  const response = await fetch(runtime.base + route, { method: 'POST', headers: { 'content-type': 'application/json', ...target?.headers, ...(credential ? { authorization: `Bearer ${credential}` } : {}) }, body: JSON.stringify(body) });
  const data = await response.json(); assertPrivate(data, 'Una respuesta HTTP expuso una credencial'); return { response, data };
}
async function shared(revision) { await eventually(() => group.every(c => c.state?.revision >= revision), 'Las cuatro vistas no alcanzaron la revisión compartida'); }
function assertBoard() {
  const expectedTerritory = territory(oracle), expectedActive = [...activeIds(oracle)].sort();
  for (const c of group) {
    const state = c.state;
    assert.equal(state.stage, 'M6.2'); assert.equal(state.config.ruleset, 'classic-online-v1');
    assert.deepEqual(state.classic.game, oracle); assert.deepEqual(state.classic.draft, draft);
    assert.deepEqual(state.classic.territory, expectedTerritory); assert.deepEqual([...state.classic.activeIds].sort(), expectedActive);
    if (!oracle.over) {
      assert.equal(state.status, 'active'); assert.equal(state.decision.kind, 'classic');
      assert.equal(state.decision.actor, oracle.currentActor); assert.equal(state.decision.team, oracle.turnTeam);
      assert.equal(state.clock.owner, oracle.turnTeam); assert.equal(state.canDecide, c.state.self.seat === oracle.currentActor);
      assert.deepEqual(state.decision.eligible, [group.find(p => p.state.self.seat === oracle.currentActor).state.self.id]);
    }
  }
}
async function accept(c, type, params = {}) {
  const before = performance.now(), envelope = c.envelope(type, params), ack = await c.request(envelope);
  assert.equal(ack.type, 'ack', ack.error?.code); assert.equal(ack.duplicate, false);
  report.latenciesMs.push(performance.now() - before); await shared(ack.receipt.revision); return { envelope, ack };
}
async function reject(c, type, params = {}, code) {
  const before = structuredClone(c.state.classic), revision = c.state.revision;
  const response = await c.request(c.envelope(type, params)); assert.equal(response.type, 'error');
  if (code) assert.equal(response.error.code, code);
  assert.deepEqual(response.state.classic, before); assert.equal(response.state.revision, revision); return response;
}
async function lobby() {
  const code = makeCode();
  for (let i = 0; i < 4; i++) {
    const credential = token(), result = await api(i ? `/api/rooms/${code}/join` : '/api/rooms', { code, credential, name: ['Ana', 'Beto', 'Carla', 'Diego'][i], mode: 'classic', policy: 'piece' });
    assert.equal(result.response.status, i ? 200 : 201);
    const c = await new SocketClient(runtime.base, code, credential, target?.headers).connect(); group.push(c); clients.push(c);
    if (i) {
      await eventually(() => group[0].state.requests.some(p => p.id === result.data.state.self.id), 'No llegó la solicitud de admisión');
      const ack = await group[0].command('admit', { playerId: result.data.state.self.id, seat: group[0].state.config.seats[i] }); await shared(ack.receipt.revision);
    }
  }
  await eventually(() => group.every(c => c.state.participants.length === 4 && c.state.participants.every(p => p.online)), 'La presencia inicial no coincide');
  assert.deepEqual(group.map(c => c.state.self.seat), ['A1', 'B1', 'A2', 'B2']);
  for (const c of group) { const ack = await c.command('ready', { ready: true }); await shared(ack.receipt.revision); }
  const started = Date.now(), ack = await group[0].command('start'); await shared(ack.receipt.revision);
  for (const c of group) { assert.equal(c.state.status, 'countdown'); assert.equal(c.state.clock.owner, null); assert.equal(c.state.config.clockMs, 480000); }
  await eventually(() => group.every(c => c.state.status === 'active'), 'No comenzó Clásico tras la cuenta atrás');
  assert.ok(Date.now() - started >= 2900, 'La cuenta atrás común terminó antes de tres segundos'); assertBoard();
}
function plannedTurn() {
  const first = [{ path: [8], to: 1 }, { path: [12, 11], to: 4 }, { path: [40, 41, 34], to: 27 }];
  if (first[oracle.moves]) return { actor: oracle.currentActor, ...first[oracle.moves] };
  const start = oracle.pieces.find(p => p.id === oracle.currentActor).pos;
  let paths = [[start]];
  for (let n = 0; n < oracle.moves % 3; n++) paths = paths.flatMap(p => availableMoves(oracle, oracle.currentActor, p.at(-1)).map(to => [...p, to]));
  let options = paths.flatMap(p => wallOptions(oracle, p.at(-1)).map(to => ({ actor: oracle.currentActor, path: p, to })));
  if (!options.length) options = wallOptions(oracle, start).map(to => ({ actor: oracle.currentActor, path: [start], to }));
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; assert.ok(options.length); return options[seed % options.length];
}
async function recoverCommittedStep(actor) {
  const old = group[actor], expected = structuredClone(old.state.classic), beforeClock = { ...old.state.clock.remainingMs };
  await old.abort();
  await eventually(() => group.filter((_, i) => i !== actor).every(c => c.state.clock.graceUntil && !c.state.participants.find(p => p.seat === old.state.self.seat).online), 'La desconexión del actor no abrió la gracia');
  const recovered = await new SocketClient(runtime.base, old.code, old.credential, target?.headers).connect(); clients.push(recovered); group[actor] = recovered;
  await eventually(() => group.every(c => c.state.clock.graceUntil === null && c.state.participants.every(p => p.online)), 'La reconexión no recuperó la decisión');
  assert.deepEqual(recovered.state.classic, expected); assert.equal(recovered.state.self.id, old.state.self.id); assert.equal(recovered.state.self.seat, 'A2');
  for (const team of ['A', 'B']) assert.ok(recovered.state.clock.remainingMs[team] <= beforeClock[team]); assertBoard();
  report.scenarios.push('Desconexión tras un paso irreversible: gracia M6.1 y recuperación de identidad, camino, dos muros y relojes');

  const checkpoint = await api(`/api/rooms/${old.code}/resume`, {}, old.credential); assert.equal(checkpoint.response.status, 200);
  const previous = group, stateDir = runtime.stateDir;
  for (const c of previous) clearInterval(c.ping);
  if (target) {
    for (const c of previous) await c.close();
  } else {
    combinedLog += runtime.logs(); await runtime.stop(); runtime = await startRuntime({ stateDir }); report.runtimeStarts++;
  }
  group = [];
  for (const oldClient of previous) { const c = await new SocketClient(runtime.base, oldClient.code, oldClient.credential, target?.headers).connect(); group.push(c); clients.push(c); }
  await eventually(() => group.every(c => c.state.participants.every(p => p.online) && c.state.clock.graceUntil === null), 'No se recuperaron las cuatro sesiones tras reiniciar');
  assertBoard();
  for (const c of group) for (const team of ['A', 'B']) assert.ok(c.state.clock.remainingMs[team] <= checkpoint.data.state.clock.remainingMs[team], 'El reinicio devolvió tiempo a un equipo');
  const duplicate = await group[actor].request(durableStep); assert.equal(duplicate.type, 'ack'); assert.equal(duplicate.duplicate, true); assertBoard();
  report.scenarios.push(target ? 'Cuatro conexiones sustituidas y recuperadas: estado, reloj y recibo idempotente conservados; no se fuerza un reinicio del proveedor' : 'Reinicio real de Wrangler/workerd con SQLite: cuatro sesiones, draft comprometido, muros, territorio, reloj y recibo idempotente persistidos');
}
try {
  await authorizeTarget(target);
  runtime = target ?? await startRuntime(); if (!target) report.runtimeStarts++;
  const health = await (await fetch(runtime.base + '/api/health', { headers: target?.headers, signal: AbortSignal.timeout(15000) })).json(); assert.equal(health.stage, target ? 'M6.3' : 'M6.2'); assert.equal(health.engines.classic.pieces, 4);
  if (target) { report.stage = 'M6.3'; report.target = target.base; report.https = target.publicServer; report.wss = target.publicServer; report.runtimeLogsInspected = false; assert.equal(health.localOnly, !target.publicServer); }
  await lobby(); report.scenarios.push('Cuatro clientes reales, posiciones A1/B1/A2/B2, admisión, preparación, cuenta atrás de tres segundos y reloj por equipo de ocho minutos');
  await reject(group[1], 'classic.step', { to: 9 });
  await reject(group[0], 'classic.step', { to: 48 });
  await reject(group[0], 'classic.wall', { to: -1 });
  await reject(group[0], 'classic.wall', { to: 1, actor: 'B1', path: [12] });
  await reject(group[0], 'probe.complete', {});
  report.scenarios.push('Actor ajeno, paso no vecino, muro exterior, suplantación de actor/path y sonda Clásico rechazada sin alterar el tablero');

  const counts = [0, 0, 0];
  while (!oracle.over) {
    const turn = plannedTurn(), index = group.findIndex(c => c.state.self.seat === turn.actor);
    for (let n = 1; n < turn.path.length; n++) {
      const c = group[index], before = structuredClone(oracle), expectedDraft = advanceDraft(oracle, draft, turn.path[n]);
      const { envelope } = await accept(c, 'classic.step', { to: turn.path[n] }); draft = expectedDraft; assert.deepEqual(oracle, before); assertBoard();
      if (oracle.moves === 2 && n === 1) { durableStep = envelope; await recoverCommittedStep(index); }
      if (oracle.moves === 2 && n === 2) {
        await reject(group[index], 'classic.step', { to: 41 });
        await reject(group[index], 'classic.reset', {});
      }
    }
    const c = group[index], wall = c.envelope('classic.wall', { to: turn.to });
    if (oracle.moves === 0) {
      const stale = await c.request({ ...wall, actionId: crypto.randomUUID(), expectedRevision: c.state.revision - 1 }); assert.equal(stale.error.code, 'STALE'); assertBoard();
    }
    const expected = applyTurn(oracle, turn), ack = await c.request(wall); assert.equal(ack.type, 'ack', ack.error?.code); await shared(ack.receipt.revision);
    oracle = expected; draft = beginDraft(oracle); counts[turn.path.length - 1]++; assertBoard();
    if (oracle.moves === 1) {
      const duplicate = await c.request(wall); assert.equal(duplicate.duplicate, true); assertBoard();
      const conflict = await c.request({ ...wall, params: { to: 7 } }); assert.equal(conflict.error.code, 'ACTION_CONFLICT'); assertBoard();
    }
  }
  const score = territory(oracle).score, winners = oracle.winner === 'Empate' ? ['A', 'B'] : [oracle.winner];
  for (const c of group) {
    assert.equal(c.state.status, 'finished'); assert.equal(c.state.decision, null); assert.equal(c.state.clock.owner, null); assert.equal(c.state.canDecide, false);
    assert.equal(c.state.outcome.reason, 'territory'); assert.deepEqual(c.state.outcome.score, score); assert.deepEqual(c.state.outcome.winners, winners);
  }
  assert.ok(counts.every(n => n > 0)); assert.equal(oracle.moves, 16); assert.deepEqual(score, { A: 46, B: 3, empty: 0, mixed: 0 });
  await reject(group[0], 'classic.wall', { to: 0 });
  report.game = { turns: oracle.moves, routesBySteps: counts, walls: oracle.walls.length, score, winners };
  report.scenarios.push('Partida completa de 16 turnos: rutas de 0/1/2 pasos, pasos definitivos, muros y decisión comparados tras cada comando contra el motor oficial independiente');
  report.scenarios.push('Final por territorio y puntuación exacta 46–3; reloj detenido, sin decisión ni nuevas acciones; duplicados, conflicto de actionId y revisión obsoleta');
  for (const c of clients) for (const message of c.messages) assertPrivate(message, 'Un estado WebSocket expuso una credencial');
  combinedLog += runtime.logs(); assertPrivate(combinedLog, 'El runtime registró una credencial');
  for (const file of await readdir(path.join(runtime.stateDir, 'logs')).catch(() => [])) assertPrivate(await readFile(path.join(runtime.stateDir, 'logs', file), 'utf8'), 'Un registro local expuso una credencial');
  report.scenarios.push(target ? 'Respuestas HTTP, WebSocket y URLs de conexión sin credenciales privadas; no se inspeccionan logs del proveedor' : 'HTTP, WebSocket, URLs de conexión y registros sin credenciales privadas'); report.ok = true;
} catch (error) { report.ok = false; report.error = redact(error.message); process.exitCode = 1; }
finally {
  for (const c of clients) { clearInterval(c.ping); try { c.ws?.terminate(); } catch {} }
  if (runtime) { report.runtimeLogErrors = target ? null : (runtime.logs().match(/\[ERROR\]/g) ?? []).length; await runtime.stop(); }
  await mkdir(path.join(root, 'evidence'), { recursive: true }); await writeFile(path.join(root, `evidence/classic-integration${target ? '-' + target.suffix : ''}.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
