import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, active, command, offline } from './helpers.mjs';
import { createRoom, joinRoom, findPlayer, publicRoom, applyCommand, advanceRoom, presence, seated } from '../src/room-model.mjs';
import { configuration, makeCode, roomCode, commandEnvelope, canonical, nameOf } from '../src/protocol.mjs';

test('Cuatro participantes, posiciones únicas y estado común en las tres modalidades', () => {
  for (const [mode, policy] of [['classic', 'piece'], ['arena-duo', 'piece'], ['arena-duo', 'team'], ['arena-ffa', 'piece']]) {
    const r = fixture(mode, policy), views = seated(r).map(p => publicRoom(r, p.id, 0));
    assert.equal(seated(r).length, 4); assert.equal(new Set(seated(r).map(p => p.seat)).size, 4);
    for (const v of views) assert.deepEqual(v.participants, views[0].participants);
  }
});
test('El código de sala y la invitación no recuperan una sesión ni ocupan una posición', () => {
  const r = fixture(), before = seated(r).length;
  const id = joinRoom(r, { name: 'Invitado', tokenHash: 'other' }, 1000);
  assert.equal(r.participants[id].admitted, false); assert.equal(r.participants[id].seat, null); assert.equal(seated(r).length, before);
  assert.throws(() => findPlayer(r, r.code));
});
test('La misma credencial recupera identidad y repetir entrada no duplica solicitudes', () => {
  const r = fixture(), size = Object.keys(r.participants).length;
  const id = joinRoom(r, { name: 'Beto', tokenHash: 'hash-1' }, 1000);
  assert.equal(id, findPlayer(r, 'hash-1').id); assert.equal(Object.keys(r.participants).length, size);
});
test('Solo el anfitrión admite, y no puede asignar una posición ya ocupada', () => {
  const r = fixture(), id = joinRoom(r, { name: 'Elena', tokenHash: 'new' }, 0), rival = seated(r)[1];
  assert.throws(() => applyCommand(r, rival.id, { type: 'admit', params: { playerId: id, seat: 'A1' } }, 0));
  assert.throws(() => applyCommand(r, r.hostId, { type: 'admit', params: { playerId: id, seat: 'A1' } }, 0));
});
test('No comienza con personas pendientes, sin preparar o desconectadas', () => {
  const r = fixture(), p = seated(r)[1];
  p.ready = false; assert.throws(() => applyCommand(r, r.hostId, { type: 'start' }, 0));
  p.ready = true; presence(r, p.id, false, 0); assert.throws(() => applyCommand(r, r.hostId, { type: 'start' }, 0));
});
test('Cuenta atrás común de tres segundos; una desconexión la cancela sin consumir tiempo', () => {
  const r = fixture(); applyCommand(r, r.hostId, { type: 'start' }, 0);
  advanceRoom(r, 2999); assert.equal(r.status, 'countdown'); assert.equal(r.clock.owner, null);
  offline(r, r.hostId, 2999); assert.equal(r.status, 'lobby'); assert.equal(r.startsAt, null);
  advanceRoom(r, 6000); assert.equal(r.status, 'lobby'); assert.equal(r.clock.remainingMs.A, 480000);
});
test('Una cuenta atrás tardía habilita el reloj al publicar la primera decisión', () => {
  const r = fixture(); applyCommand(r, r.hostId, { type: 'start' }, 0); advanceRoom(r, 13000);
  assert.equal(r.clock.anchoredAt, 13000); assert.equal(r.clock.remainingMs.A, 480000);
});
test('Las acciones fuera de la decisión y los comandos de juego aún no implementados se rechazan', () => {
  const r = active(), rival = seated(r)[1];
  assert.throws(() => command(r, rival.id, 'probe.complete', 3000));
  assert.throws(() => command(r, r.hostId, 'move', 3000, { to: 12 }));
  assert.throws(() => command(r, r.hostId, 'wall', 3000, { to: 12 }));
});
test('Cualquiera del equipo puede resolver; la segunda resolución no se aplica', () => {
  const r = active('arena-duo', 'team'), b = seated(r).filter(p => p.seat.startsWith('B'));
  command(r, r.hostId, 'probe.discard', 3000); command(r, b[0].id, 'probe.resolve', 4000);
  assert.throws(() => command(r, b[1].id, 'probe.resolve', 4000));
});
test('El estado recuperado conserva decisión y reloj después de serializar', () => {
  const r = active('arena-duo', 'team'); command(r, r.hostId, 'probe.discard', 5000);
  const restored = JSON.parse(JSON.stringify(r)); advanceRoom(restored, 10000);
  assert.equal(restored.decision.kind, 'discard-probe'); assert.equal(restored.clock.owner, 'B'); assert.equal(restored.clock.remainingMs.B, 595000);
});
test('Una vista compartida nunca contiene hashes, credenciales ni solicitudes ajenas', () => {
  const r = fixture(), id = joinRoom(r, { name: 'Elena', tokenHash: 'very-private-hash' }, 0);
  const hiddenId = joinRoom(r, { name: 'Fabio', tokenHash: 'hidden-request-hash' }, 0);
  const host = publicRoom(r, r.hostId, 0), guest = publicRoom(r, id, 0);
  assert.equal(host.requests.length, 2); assert.deepEqual(guest.requests, []);
  assert.ok(!JSON.stringify(guest.clock).includes(hiddenId));
  for (const p of Object.values(r.participants)) assert.ok(!JSON.stringify(host).includes(p.tokenHash));
  assert.ok(!JSON.stringify(host).includes('tokenHash'));
});
test('Un lobby expira a las 24 horas; presencia no extiende su retención', () => {
  const r = fixture(), expires = r.expiresAt; presence(r, r.hostId, false, expires - 1);
  assert.equal(r.expiresAt, expires); advanceRoom(r, expires); assert.equal(r.status, 'expired');
});
test('Modalidades inválidas, nombres con control y versiones incompatibles se rechazan', () => {
  assert.throws(() => configuration('classic', 'team')); assert.throws(() => configuration('arena-ffa', 'team'));
  assert.throws(() => nameOf('<script>')); assert.throws(() => nameOf('a\u0000b'));
  assert.throws(() => commandEnvelope({ protocolVersion: 99 }, 'ABCDEFGH23'));
});
test('Códigos de 50 bits legibles y canonización estable para idempotencia', () => {
  for (let i = 0; i < 100; i++) assert.equal(roomCode(makeCode()).length, 10);
  assert.equal(canonical({ b: 1, a: { d: 2, c: 3 } }), canonical({ a: { c: 3, d: 2 }, b: 1 }));
});
