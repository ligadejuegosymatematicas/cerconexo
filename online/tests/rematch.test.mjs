import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, joinRoom, presence, clientFeatures, applyCommand, advanceRoom, publicRoom, reconcileRoom, nextWake } from '../src/room-model.mjs';
import { matchId, REMATCH_MS } from '../src/rematch.mjs';
import { initialState } from '../../src/engine.mjs';

function finished() {
  const room = createRoom({ code: 'ABCDEFGH23', name: 'Ana', mode: 'classic', policy: 'piece', tokenHash: 'host' }, 0), ids = [room.hostId];
  presence(room, ids[0], true, 0);
  for (const [i, seat] of ['B1', 'A2', 'B2'].entries()) {
    const id = joinRoom(room, { name: seat, tokenHash: `p-${i}` }, 0); ids.push(id); presence(room, id, true, 0);
    applyCommand(room, ids[0], { type: 'admit', params: { playerId: id, seat } }, 0);
  }
  for (const id of ids) { clientFeatures(room, id, ['rematch-v1'], 0); applyCommand(room, id, { type: 'ready', params: { ready: true } }, 0); }
  applyCommand(room, ids[0], { type: 'start' }, 0); advanceRoom(room, 3000);
  applyCommand(room, ids[0], { type: 'classic.step', params: { to: 9 } }, 3000);
  advanceRoom(room, 483000); assert.equal(room.status, 'finished');
  return { room, ids, now: 484000 };
}
function propose(room, id, now) { applyCommand(room, id, { type: 'rematch.propose', params: { matchId: matchId(room) } }, now); return room.rematch.id; }
function vote(room, id, accept, now, proposalId = room.rematch.id, scope = matchId(room)) {
  applyCommand(room, id, { type: 'rematch.respond', params: { matchId: scope, proposalId, accept } }, now);
}
test('M6.2.1: propuesta exclusiva del anfitrión, sin alterar tablero, resultado ni relojes', () => {
  const { room, ids, now } = finished(), original = structuredClone({ classic: room.classic, outcome: room.outcome, clock: room.clock });
  assert.throws(() => propose(room, ids[1], now), { code: 'PERMISSION' });
  propose(room, ids[0], now); assert.equal(room.rematch.votes[ids[0]], true); assert.equal(room.rematch.expiresAt, now + REMATCH_MS);
  assert.deepEqual({ classic: room.classic, outcome: room.outcome, clock: room.clock }, original);
  assert.throws(() => propose(room, ids[0], now), { code: 'REMATCH_PENDING' });
});
test('M6.2.1: cuatro aceptaciones y cuenta atrás reinician solo el juego, conservando identidades e historial', () => {
  const { room, ids, now } = finished(), previous = structuredClone(room.outcome), people = structuredClone(room.participants);
  propose(room, ids[0], now);
  vote(room, ids[1], true, now + 1); vote(room, ids[2], true, now + 2);
  assert.equal(room.status, 'finished'); assert.equal(room.rematch.status, 'pending');
  vote(room, ids[3], true, now + 3); assert.equal(room.rematch.status, 'countdown');
  const startsAt = room.rematch.startsAt; advanceRoom(room, startsAt - 1); assert.equal(room.status, 'finished');
  advanceRoom(room, startsAt); assert.equal(room.status, 'active'); assert.equal(room.matchNumber, 2); assert.equal(matchId(room), room.code + ':2');
  assert.deepEqual(room.classic.game, initialState()); assert.deepEqual(room.clock.remainingMs, { A: 480000, B: 480000 });
  assert.equal(room.clock.owner, 'A'); assert.equal(room.outcome, null);
  assert.equal(room.previousResults.length, 1); assert.deepEqual(room.previousResults[0].outcome, previous);
  assert.deepEqual(room.participants, people);
  for (const id of ids) assert.equal(room.clock.players[id].usedMs, 0);
  advanceRoom(room, startsAt); assert.equal(room.previousResults.length, 1);
});
test('M6.2.1: rechazo o retirada conservan el resultado y permiten una propuesta nueva', () => {
  const { room, ids, now } = finished(), original = structuredClone(room.classic);
  const prior = propose(room, ids[0], now); vote(room, ids[1], true, now + 1); vote(room, ids[1], false, now + 2);
  assert.equal(room.rematch.status, 'rejected'); assert.deepEqual(room.classic, original);
  const next = propose(room, ids[0], now + 3); assert.notEqual(next, prior);
  assert.throws(() => vote(room, ids[2], true, now + 4, prior), { code: 'PROPOSAL' });
});
test('M6.2.1: propuesta vencida no bloquea la sala ni dispara una partida', () => {
  const { room, ids, now } = finished(); propose(room, ids[0], now);
  assert.equal(nextWake(room, now), now + REMATCH_MS);
  advanceRoom(room, now + REMATCH_MS); assert.equal(room.rematch.status, 'expired'); assert.equal(room.status, 'finished');
  propose(room, ids[0], now + REMATCH_MS + 1); assert.equal(room.rematch.status, 'pending');
});
test('M6.2.1: desconexión en cuenta atrás y lease vencido cancelan el inicio sin perder votos', () => {
  const { room, ids, now } = finished(); propose(room, ids[0], now);
  for (const id of ids.slice(1)) vote(room, id, true, now + 1);
  const original = structuredClone(room.classic), deadline = room.rematch.startsAt;
  reconcileRoom(room, [ids[1]], deadline + 1000);
  assert.equal(room.status, 'finished'); assert.equal(room.rematch.status, 'pending'); assert.deepEqual(room.classic, original);
  presence(room, ids[1], true, deadline + 2000); assert.equal(room.rematch.startsAt, deadline + 5000);
  advanceRoom(room, deadline + 5000); assert.equal(room.matchNumber, 2);
});
test('M6.2.1: instantánea persistida conserva propuesta, votos y expiración', () => {
  const { room, ids, now } = finished(); propose(room, ids[0], now); vote(room, ids[1], true, now + 1);
  const restored = JSON.parse(JSON.stringify(room)); assert.deepEqual(restored.rematch, room.rematch);
  for (const id of ids.slice(2)) vote(restored, id, true, now + 5);
  advanceRoom(restored, restored.rematch.startsAt); assert.equal(restored.matchNumber, 2); assert.equal(restored.previousResults.length, 1);
});
test('M6.2.1: mensajes de otra partida o sin identificación no pueden mover la revancha', () => {
  const { room, ids, now } = finished(), old = matchId(room); propose(room, ids[0], now);
  for (const id of ids.slice(1)) vote(room, id, true, now + 1);
  advanceRoom(room, room.rematch.startsAt); const before = structuredClone(room.classic);
  for (const params of [{ to: 9 }, { to: 9, matchId: old }]) assert.throws(() => applyCommand(room, ids[0], { type: 'classic.step', params }, now + 4000), { code: 'MATCH' });
  assert.deepEqual(room.classic, before);
  applyCommand(room, ids[0], { type: 'classic.step', params: { to: 9, matchId: matchId(room) } }, now + 4000);
  assert.deepEqual(room.classic.draft.path, [8, 9]);
});
test('M6.2.1: salas antiguas y comandos de primera partida siguen siendo compatibles', () => {
  const { room, ids } = finished(); delete room.matchNumber; delete room.previousResults; delete room.decisionSerial; delete room.decisionFingerprint; delete room.rematch;
  const view = publicRoom(room, ids[0], 483000); assert.equal(view.matchId, room.code + ':1'); assert.equal(view.features.rematch, true);
  const proposal = propose(room, ids[0], 484000); assert.ok(proposal);
});
test('M6.2.1: presencia y pasos no cambian la identidad de decisión; un nuevo turno sí', () => {
  const { room, ids, now } = finished(); propose(room, ids[0], now); for (const id of ids.slice(1)) vote(room, id, true, now + 1); advanceRoom(room, room.rematch.startsAt);
  const key = publicRoom(room, ids[0], now + 4000).decisionId;
  presence(room, ids[0], false, now + 4000); presence(room, ids[0], true, now + 4001);
  assert.equal(publicRoom(room, ids[0], now + 4001).decisionId, key);
  applyCommand(room, ids[0], { type: 'classic.step', params: { to: 9, matchId: matchId(room) } }, now + 4002);
  assert.equal(publicRoom(room, ids[0], now + 4002).decisionId, key);
  applyCommand(room, ids[0], { type: 'classic.wall', params: { to: 10, matchId: matchId(room) } }, now + 4003);
  assert.notEqual(publicRoom(room, ids[0], now + 4003).decisionId, key);
});

test('M6.2.1: alarma tardía inicia ocho minutos nuevos; el vencimiento conserva el resultado anterior', () => {
  const { room, ids, now } = finished(), previous = structuredClone(room.outcome);
  propose(room, ids[0], now); for (const id of ids.slice(1)) vote(room, id, true, now + 1);
  const enabledAt = room.rematch.startsAt + 10000;
  advanceRoom(room, enabledAt);
  assert.deepEqual(room.clock.remainingMs, { A: 480000, B: 480000 });
  advanceRoom(room, enabledAt + 480000);
  assert.equal(room.status, 'finished'); assert.equal(room.outcome.reason, 'timeout');
  assert.deepEqual(room.outcome.winners, ['B']); assert.deepEqual(room.previousResults[0].outcome, previous);
  assert.equal(room.matchNumber, 2);
});

test('M6.2.1: una página antigua no vota ni inicia una revancha y actualizar conserva su identidad', () => {
  const { room, ids, now } = finished(); propose(room, ids[0], now);
  for (const id of ids.slice(1)) vote(room, id, true, now + 1);
  const identity = structuredClone(room.participants[ids[3]]), board = structuredClone(room.classic);
  clientFeatures(room, ids[3], undefined, now + 2);
  assert.equal(room.rematch.status, 'pending'); assert.equal(room.rematch.startsAt, null);
  assert.throws(() => vote(room, ids[3], true, now + 3), { code: 'UPDATE_REQUIRED' });
  advanceRoom(room, now + 4000); assert.equal(room.matchNumber, 1); assert.deepEqual(room.classic, board);
  clientFeatures(room, ids[3], ['rematch-v1'], now + 5000);
  assert.equal(room.rematch.status, 'countdown'); assert.equal(room.rematch.startsAt, now + 8000);
  assert.deepEqual(room.participants[ids[3]], identity);
  advanceRoom(room, now + 8000); assert.equal(room.matchNumber, 2);
  clientFeatures(room, ids[3], [], now + 8001);
  assert.throws(() => applyCommand(room, ids[3], { type: 'classic.wall', params: { to: 1, matchId: matchId(room) } }, now + 8002), { code: 'UPDATE_REQUIRED' });
});
