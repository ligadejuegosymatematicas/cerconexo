import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, joinRoom, presence, applyCommand, advanceRoom, reconcileRoom } from '../src/room-model.mjs';

function readyRoom() {
  const room = createRoom({ code: 'ABCDEFGH23', name: 'A1', mode: 'classic', policy: 'piece', tokenHash: 'host' }, 0);
  presence(room, room.hostId, true, 0);
  for (const seat of ['B1', 'A2', 'B2']) {
    const id = joinRoom(room, { name: seat, tokenHash: seat }, 0); presence(room, id, true, 0);
    applyCommand(room, room.hostId, { type: 'admit', params: { playerId: id, seat } }, 0);
  }
  for (const p of Object.values(room.participants)) applyCommand(room, p.id, { type: 'ready', params: { ready: true } }, 0);
  applyCommand(room, room.hostId, { type: 'start' }, 0); return room;
}
test('M6.2: un lease vencido cancela la cuenta atrás antes de habilitar el tablero aunque la alarma llegue tarde', () => {
  const room = readyRoom(), board = structuredClone(room.classic);
  reconcileRoom(room, [room.hostId], 16000);
  assert.equal(room.status, 'lobby'); assert.equal(room.startsAt, null); assert.equal(room.clock.owner, null);
  assert.deepEqual(room.classic, board); assert.deepEqual(room.clock.remainingMs, { A: 480000, B: 480000 });
});
test('M6.2: durante el turno se descuenta primero el tiempo real y luego se conserva el paso con gracia', () => {
  const room = readyRoom(); advanceRoom(room, 3000); advanceRoom(room, 5000);
  applyCommand(room, room.hostId, { type: 'classic.step', params: { to: 9 } }, 5000);
  reconcileRoom(room, [room.hostId], 10000);
  assert.equal(room.status, 'active'); assert.equal(room.clock.remainingMs.A, 473000);
  assert.equal(room.clock.grace.until, 40000); assert.deepEqual(room.classic.draft.path, [8, 9]);
  advanceRoom(room, 40000); assert.equal(room.clock.remainingMs.A, 473000);
});
