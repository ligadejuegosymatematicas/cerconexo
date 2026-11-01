import test from 'node:test';
import assert from 'node:assert/strict';
import { active, command, offline, online } from './helpers.mjs';
import { advanceRoom, seated, publicRoom } from '../src/room-model.mjs';
import { clockDeadline } from '../src/clocks.mjs';

test('Predeterminados inmutables por modalidad: 8, 10 y 5 minutos, sin incremento', () => {
  for (const [mode, ms] of [['classic', 480000], ['arena-duo', 600000], ['arena-ffa', 300000]]) {
    const room = active(mode); assert.ok(Object.values(room.clock.remainingMs).every(n => n === ms));
    assert.equal(room.config.graceIncidentMs, 30000); assert.equal(room.config.graceTotalMs, 60000);
  }
});
test('Solo descuenta el equipo responsable y cambia al completar una decisión válida', () => {
  const r = active(); advanceRoom(r, 13000);
  assert.deepEqual(r.clock.remainingMs, { A: 470000, B: 480000 });
  command(r, r.hostId, 'probe.complete', 13000); advanceRoom(r, 16000);
  assert.deepEqual(r.clock.remainingMs, { A: 470000, B: 477000 });
});
test('Un comando inválido y una recarga no devuelven tiempo', () => {
  const r = active(), rival = seated(r)[1];
  assert.throws(() => command(r, rival.id, 'probe.complete', 13000));
  const restored = JSON.parse(JSON.stringify(r)); advanceRoom(restored, 23000);
  assert.deepEqual(restored.clock.remainingMs, { A: 460000, B: 480000 });
});
test('La desconexión de quien no decide no pausa ningún reloj', () => {
  const r = active(); offline(r, seated(r)[1].id, 4000); advanceRoom(r, 14000);
  assert.equal(r.clock.grace, null); assert.equal(r.clock.remainingMs.A, 469000);
});
test('Gracia de 30 segundos, seguida de descuento sin acciones automáticas', () => {
  const r = active(); offline(r, r.hostId, 4000);
  assert.equal(r.clock.grace.until, 34000); advanceRoom(r, 44000);
  assert.equal(r.clock.remainingMs.A, 469000); assert.equal(r.clock.players[r.hostId].usedMs, 30000);
  assert.equal(r.probe.completed, 0); assert.equal(r.decision.actor, 'A1');
});
test('Reconexión temprana consume solo la pausa utilizada', () => {
  const r = active(); offline(r, r.hostId, 4000); online(r, r.hostId, 11000); advanceRoom(r, 16000);
  assert.equal(r.clock.players[r.hostId].usedMs, 7000); assert.equal(r.clock.remainingMs.A, 474000);
  assert.equal(r.clock.grace, null);
});
test('Dos incidencias consumen como máximo 60 segundos y la tercera no pausa', () => {
  const r = active(); offline(r, r.hostId, 4000); online(r, r.hostId, 34000);
  offline(r, r.hostId, 35000); online(r, r.hostId, 65000); offline(r, r.hostId, 66000);
  assert.equal(r.clock.players[r.hostId].usedMs, 60000); assert.equal(r.clock.grace, null);
  advanceRoom(r, 76000); assert.equal(r.clock.remainingMs.A, 467000);
});
test('Una incidencia no obtiene otra ventana de gracia al volver su decisión', () => {
  const r = active('arena-duo', 'team'), [a1, b1, a2] = seated(r);
  offline(r, a1.id, 4000); offline(r, a2.id, 4000); advanceRoom(r, 34000);
  online(r, a2.id, 35000); command(r, a2.id, 'probe.complete', 35000);
  command(r, b1.id, 'probe.complete', 36000); offline(r, a2.id, 37000);
  assert.equal(r.decision.team, 'A'); assert.deepEqual(r.clock.grace.players, [a2.id]);
  assert.equal(r.clock.players[a1.id].until, 34000); advanceRoom(r, 67000);
  assert.equal(r.clock.grace, null); assert.equal(r.clock.players[a1.id].usedMs, 30000); assert.equal(r.clock.players[a2.id].usedMs, 60000);
});
test('Por equipo, un compañero legalmente habilitado evita la gracia', () => {
  const r = active('arena-duo', 'team'); offline(r, r.hostId, 4000); advanceRoom(r, 14000);
  assert.equal(r.clock.grace, null); assert.equal(r.clock.remainingMs.A, 589000);
});
test('Si ambos pueden decidir, sus pausas transcurren en paralelo', () => {
  const r = active('arena-duo', 'team'), a = seated(r).filter(p => p.seat.startsWith('A'));
  offline(r, a[0].id, 4000); offline(r, a[1].id, 4000); advanceRoom(r, 34000);
  for (const p of a) assert.equal(r.clock.players[p.id].usedMs, 30000);
  assert.equal(r.clock.remainingMs.A, 599000); assert.equal(r.clock.grace, null);
});
test('Descarte rival: el reloj pasa al propietario y vuelve al equipo original', () => {
  const r = active('arena-duo', 'team'), b = seated(r).find(p => p.seat === 'B2');
  command(r, r.hostId, 'probe.discard', 13000); assert.equal(r.clock.owner, 'B');
  command(r, b.id, 'probe.resolve', 18000); assert.equal(r.clock.owner, 'A');
  advanceRoom(r, 20000); assert.deepEqual(r.clock.remainingMs, { A: 588000, B: 595000 });
});
test('Descarte compartido sin un compañero no pausa mientras otro puede resolver', () => {
  const r = active('arena-duo', 'team'), b = seated(r).filter(p => p.seat.startsWith('B'));
  offline(r, b[0].id, 4000); command(r, r.hostId, 'probe.discard', 5000); advanceRoom(r, 15000);
  assert.equal(r.clock.grace, null); assert.equal(r.clock.remainingMs.B, 590000);
});
test('Exactamente en el límite vence el reloj y una alarma repetida no duplica el resultado', () => {
  const r = active(); const deadline = clockDeadline(r.clock);
  advanceRoom(r, deadline - 1); assert.equal(r.status, 'active');
  advanceRoom(r, deadline); assert.equal(r.status, 'finished'); assert.deepEqual(r.outcome.winners, ['B']);
  const before = JSON.stringify(r); advanceRoom(r, deadline); assert.equal(JSON.stringify(r), before);
  assert.throws(() => command(r, r.hostId, 'probe.complete', deadline));
});
test('Alarma tardía FFA no descuenta retrospectivamente el reloj siguiente', () => {
  const r = active('arena-ffa'); advanceRoom(r, 350000);
  assert.deepEqual(r.probe.eliminatedTeams, ['A']); assert.equal(r.clock.owner, 'B'); assert.equal(r.clock.remainingMs.B, 300000);
  advanceRoom(r, 350000); assert.equal(r.probe.eliminatedTeams.length, 1);
});
test('La sonda FFA preserva relojes restantes y registra eliminaciones hasta el último', () => {
  const r = active('arena-ffa');
  for (const now of [303000, 603000, 903000]) advanceRoom(r, now);
  assert.equal(r.status, 'finished'); assert.deepEqual(r.outcome.winners, ['D']); assert.deepEqual(r.probe.eliminatedTeams, ['A', 'B', 'C']);
});
test('La vista pública interpola sin modificar el reloj persistido', () => {
  const r = active(), before = JSON.stringify(r.clock), view = publicRoom(r, r.hostId, 13000);
  assert.equal(view.clock.remainingMs.A, 470000); assert.equal(JSON.stringify(r.clock), before);
});
test('Un ajuste de hora hacia atrás no repone tiempo', () => {
  const r = active(); advanceRoom(r, 13000); advanceRoom(r, 12000);
  assert.equal(r.clock.remainingMs.A, 470000); assert.equal(r.clock.anchoredAt, 13000);
});
