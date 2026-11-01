import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, joinRoom, presence, clientFeatures, applyCommand, advanceRoom, publicRoom, canDecide } from '../src/room-model.mjs';
import { matchId } from '../src/rematch.mjs';
import { initialState, legalActors, availableMoves, wallOptions, applyTurn, territory } from '../../src/engine.mjs';
import { beginDraft, selectDraft, advanceDraft } from '../../src/turnDraft.mjs';

function setup(players, policy) {
  const room = createRoom({ code: 'ABCDEFGH23', name: 'Ana', mode: 'classic', policy, players, tokenHash: 'host' }, 0);
  const ids = [room.hostId]; presence(room, room.hostId, true, 0);
  for (let i = 1; i < players; i++) {
    const id = joinRoom(room, { name: `Persona ${i + 1}`, tokenHash: `token-${i}` }, 0); ids.push(id); presence(room, id, true, 0);
    applyCommand(room, ids[0], { type: 'admit', params: { playerId: id, seat: room.config.seats[i] } }, 0);
  }
  for (const id of ids) { clientFeatures(room, id, ['rematch-v1', 'classic-config-v2'], 0); applyCommand(room, id, { type: 'ready', params: { ready: true } }, 0); }
  applyCommand(room, ids[0], { type: 'start' }, 0); advanceRoom(room, 3000);
  return { room, ids };
}
const owner = (room, actor) => Object.values(room.participants).find(p => publicRoom(room, p.id, 3000).self.controlledPieces.includes(actor)).id;
const play = (room, id, type, params, now) => { advanceRoom(room, now); applyCommand(room, id, { type, params: { ...params, matchId: matchId(room) } }, now); };

for (const players of [2, 4]) for (const policy of ['piece', 'team']) test(`Clásico ${players} personas/${policy}: partida completa con motor oficial y revancha unánime`, () => {
  const { room, ids } = setup(players, policy); let oracle = initialState({ turnMode: policy }), now = 3000;
  const used = new Set(), routes = new Set();
  assert.equal(room.status, 'active'); assert.equal(room.config.clockMs, 480000);
  assert.deepEqual(ids.flatMap(id => publicRoom(room, id, now).self.controlledPieces).sort(), ['A1', 'A2', 'B1', 'B2']);
  while (!oracle.over) {
    assert.ok(oracle.moves < 90);
    const actors = legalActors(oracle), actor = actors[oracle.moves % actors.length], id = owner(room, actor); used.add(actor);
    let expectedDraft = beginDraft(oracle);
    if (expectedDraft.actor !== actor) { play(room, id, 'classic.select', { actor }, now += 100); expectedDraft = selectDraft(oracle, expectedDraft, actor); }
    let paths = [[oracle.pieces.find(p => p.id === actor).pos]];
    for (let i = 0; i < oracle.moves % 3; i++) {
      const next = paths.flatMap(path => availableMoves(oracle, actor, path.at(-1)).map(to => [...path, to])); if (next.length) paths = next;
    }
    const turns = paths.flatMap(path => wallOptions(oracle, path.at(-1)).map(to => ({ actor, path, to })));
    const turn = turns[(oracle.moves * 17 + 3) % turns.length]; assert.ok(turn); routes.add(turn.path.length - 1);
    for (const to of turn.path.slice(1)) { play(room, id, 'classic.step', { to }, now += 100); expectedDraft = advanceDraft(oracle, expectedDraft, to); assert.deepEqual(room.classic.draft, expectedDraft); }
    play(room, id, 'classic.wall', { to: turn.to }, now += 100); oracle = applyTurn(oracle, turn);
    for (const client of ids) { const state = publicRoom(room, client, now); assert.deepEqual(state.classic.game, oracle); assert.deepEqual(state.classic.territory, territory(oracle)); }
  }
  assert.equal(used.size, 4); assert.equal(routes.size, 3); assert.equal(room.status, 'finished');
  const outcome = structuredClone(room.outcome), scope = matchId(room);
  play(room, ids[0], 'rematch.propose', {}, now += 100);
  for (const id of ids.slice(1)) play(room, id, 'rematch.respond', { proposalId: room.rematch.id, accept: true }, now += 100);
  assert.equal(room.rematch.status, 'countdown'); advanceRoom(room, room.rematch.startsAt);
  assert.equal(room.matchNumber, 2); assert.equal(matchId(room), scope.replace(':1', ':2'));
  assert.deepEqual(room.classic.game, initialState({ turnMode: policy })); assert.deepEqual(room.clock.remainingMs, { A: 480000, B: 480000 });
  assert.deepEqual(room.previousResults[0].outcome, outcome); assert.deepEqual(Object.keys(room.participants), ids);
});

test('Dos personas/equipo: elegir y cambiar antes del primer paso; después queda irreversible', () => {
  const { room, ids } = setup(2, 'team'); const decision = publicRoom(room, ids[0], 3000).decisionId, activity = room.lastActivityAt;
  play(room, ids[0], 'classic.select', { actor: 'A2' }, 3100);
  play(room, ids[0], 'classic.select', { actor: 'A1' }, 3200);
  assert.equal(room.lastActivityAt, activity);
  play(room, ids[0], 'classic.step', { to: 9 }, 3300);
  assert.throws(() => play(room, ids[0], 'classic.select', { actor: 'A2' }, 3400), { code: 'ILLEGAL_ACTION' });
  assert.throws(() => play(room, ids[0], 'classic.select', { actor: 'B1' }, 3500), { code: 'DECISION' });
  assert.throws(() => play(room, ids[1], 'classic.wall', { to: 10 }, 3600), { code: 'DECISION' });
  assert.equal(publicRoom(room, ids[0], 3600).decisionId, decision); assert.deepEqual(room.classic.draft.path, [8, 9]);
});

test('Cuatro personas/equipo: primera selección reserva el turno, también sin dar pasos', () => {
  const { room, ids } = setup(4, 'team'); assert.equal(canDecide(room, ids[0]), true); assert.equal(canDecide(room, ids[2]), true);
  play(room, ids[2], 'classic.select', { actor: 'A2' }, 3100);
  assert.equal(canDecide(room, ids[0]), false); assert.equal(canDecide(room, ids[2]), true);
  assert.throws(() => play(room, ids[0], 'classic.select', { actor: 'A1' }, 3200), { code: 'DECISION' });
  assert.throws(() => play(room, ids[2], 'classic.select', { actor: 'A1' }, 3200), { code: 'DECISION' });
  presence(room, ids[2], false, 3300); assert.ok(room.clock.grace); assert.equal(canDecide(room, ids[0]), false);
  const restored = JSON.parse(JSON.stringify(room)); advanceRoom(restored, 4300); presence(restored, ids[2], true, 4300);
  assert.equal(restored.classic.draft.actor, 'A2'); assert.equal(restored.clock.grace, null);
  assert.ok(restored.clock.remainingMs.A <= room.clock.remainingMs.A);
});

test('Configuración avanzada exige cliente nuevo; sala antigua de cuatro conserva su configuración', () => {
  const { room, ids } = setup(2, 'piece'); clientFeatures(room, ids[0], ['rematch-v1'], 3100);
  assert.throws(() => play(room, ids[0], 'classic.step', { to: 9 }, 3200), { code: 'UPDATE_REQUIRED' });
  const old = setup(4, 'piece'); delete old.room.config.playerCount;
  const view = publicRoom(old.room, old.ids[0], 3300); assert.equal(view.self.controlledPieces[0], 'A1');
  play(old.room, old.ids[0], 'classic.step', { to: 9 }, 3400); assert.deepEqual(old.room.classic.draft.path, [8, 9]);
});

test('Ocho minutos autoritativos y final por tiempo en las cuatro configuraciones', () => {
  for (const players of [2, 4]) for (const policy of ['piece', 'team']) {
    const { room } = setup(players, policy); advanceRoom(room, 482999); assert.equal(room.status, 'active');
    advanceRoom(room, 483000); assert.equal(room.status, 'finished'); assert.equal(room.outcome.reason, 'timeout'); assert.deepEqual(room.outcome.winners, ['B']);
  }
});
