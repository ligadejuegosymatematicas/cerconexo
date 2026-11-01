import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { betaOperator } from './beta-operator.mjs';
import { SocketClient } from './socket-client.mjs';
import { eventually } from './runtime.mjs';
import { API_BASE } from '../config.mjs';
import { wallOptions, initialState, applyTurn } from '../../src/engine.mjs';
const origin = 'https://ligadejuegosymatematicas.github.io', file = new URL('../.state/beta-persistence/session.json', import.meta.url);
const clients = [], report = { checkedAt: new Date().toISOString(), backend: API_BASE };
async function post(path, body, headers = {}) {
  const r = await fetch(API_BASE + path, { method: 'POST', headers: { Origin: origin, 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
  const data = await r.json(); if (!r.ok) throw new Error(data.error.code); return data.state;
}
try {
  if (process.argv.includes('--prepare')) {
    const operator = await betaOperator(), alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const code = [...crypto.getRandomValues(new Uint8Array(10))].map(b => alphabet[b & 31]).join('');
    const credentials = Array.from({ length: 4 }, () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url'));
    await post('/api/rooms', { code, credential: credentials[0], name: 'Persistencia A1', mode: 'classic', policy: 'piece', players: 4 }, { 'x-cerconexo-test-admission': operator.credential });
    const states = [];
    clients.push(await new SocketClient(API_BASE, code, credentials[0], {}, undefined, origin).connect());
    for (let i = 1; i < 4; i++) {
      states[i] = await post(`/api/rooms/${code}/join`, { credential: credentials[i], name: `Persistencia ${i}` });
      await clients[0].command('admit', { playerId: states[i].self.id, seat: ['A1', 'B1', 'A2', 'B2'][i] });
      clients.push(await new SocketClient(API_BASE, code, credentials[i], {}, undefined, origin).connect());
    }
    const sameRevision = () => clients.every(c => c.state.revision === clients[0].state.revision);
    for (const c of clients) { await eventually(sameRevision, 'Vistas del lobby distintas'); await c.command('ready', { ready: true }); }
    await eventually(sameRevision, 'Preparación no compartida'); await clients[0].command('start');
    await eventually(() => clients.every(c => c.state.status === 'active'), 'Cuenta atrás incompleta', 20000);
    const command = clients[0].envelope('classic.step', { to: 9, matchId: clients[0].state.matchId });
    const ack = await clients[0].request(command); assert.equal(ack.type, 'ack');
    const state = ack.state; assert.deepEqual(state.classic.draft.path, [8, 9]);
    await mkdir(new URL('../.state/beta-persistence/', import.meta.url), { recursive: true });
    await writeFile(file, JSON.stringify({ code, credentials, command, state, preparedAt: Date.now() }));
    report.ok = true; report.phase = 'prepared'; report.partialPath = [8, 9];
  } else {
    const fixture = JSON.parse(await readFile(file, 'utf8'));
    for (const credential of fixture.credentials) clients.push(await new SocketClient(API_BASE, fixture.code, credential, {}, undefined, origin).connect());
    const before = fixture.state, restored = clients[0].state;
    assert.equal(restored.status, 'active'); assert.deepEqual(restored.classic, before.classic);
    assert.deepEqual(restored.participants.map(p => [p.id, p.seat]), before.participants.map(p => [p.id, p.seat]));
    for (const team of ['A', 'B']) assert.ok(restored.clock.remainingMs[team] <= before.clock.remainingMs[team]);
    const duplicate = await clients[0].request(fixture.command); assert.equal(duplicate.duplicate, true);
    assert.deepEqual(duplicate.state.classic, before.classic);
    const wall = wallOptions(restored.classic.game, 9)[0];
    await clients[0].command('classic.wall', { to: wall, matchId: restored.matchId });
    const expected = applyTurn(initialState(), { actor: 'A1', path: [8, 9], to: wall });
    await eventually(() => clients.every(c => JSON.stringify(c.state.classic.game) === JSON.stringify(expected)), 'No convergieron tras recuperar', 20000);
    report.ok = true; report.phase = 'recovered'; report.clients = 4; report.partialPreserved = true; report.duplicateNotApplied = true;
    report.identitiesPreserved = true; report.clocksNotRestored = true; report.wallAfterRecovery = true;
    report.elapsedMs = Date.now() - fixture.preparedAt;
  }
} catch (error) { report.ok = false; report.error = error.message; process.exitCode = 1; }
finally { for (const c of clients) await c.close().catch(() => {}); await mkdir(new URL('../evidence/', import.meta.url), { recursive: true }); await writeFile(new URL(`../evidence/beta-persistence-${report.phase ?? 'failure'}.json`, import.meta.url), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2)); }
