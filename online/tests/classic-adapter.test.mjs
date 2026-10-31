import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, joinRoom, presence, publicRoom, applyCommand, advanceRoom, seated } from '../src/room-model.mjs';
import { configuration } from '../src/protocol.mjs';
import { initialState, applyTurn, availableMoves, wallOptions, territory, activeIds, verifyState } from '../../src/engine.mjs';
import { beginDraft, advanceDraft } from '../../src/turnDraft.mjs';

// New M6.2 rooms deliberately bypass the legacy probe-only fixtures.
function fixture(mode = 'classic', policy = 'piece') {
  const room = createRoom({ code: 'ABCDEFGH23', name: 'Ana', mode, policy, tokenHash: 'hash-0' }, 0);
  presence(room, room.hostId, true, 0);
  for (let i = 1; i < 4; i++) {
    const id = joinRoom(room, { name: ['Ana', 'Beto', 'Carla', 'Diego'][i], tokenHash: `hash-${i}` }, 0);
    presence(room, id, true, 0); applyCommand(room, room.hostId, { type: 'admit', params: { playerId: id, seat: room.config.seats[i] } }, 0);
  }
  for (const player of seated(room)) applyCommand(room, player.id, { type: 'ready', params: { ready: true } }, 0);
  return room;
}
function active(mode = 'classic', policy = 'piece') { const room = fixture(mode, policy); applyCommand(room, room.hostId, { type: 'start' }, 0); advanceRoom(room, 3000); return room; }
function command(room, id, type, now, params = {}) { advanceRoom(room, now); return applyCommand(room, id, { type, params }, now); }
function offline(room, id, now) { advanceRoom(room, now); presence(room, id, false, now); }
function online(room, id, now) { advanceRoom(room, now); presence(room, id, true, now); }

function actor(room) { return seated(room).find(p => p.seat === room.classic.game.currentActor); }
function assertOfficial(room, game, draft = beginDraft(game), now = 3000) {
  assert.deepEqual(room.classic.game, game); assert.deepEqual(room.classic.draft, draft);
  for (const player of seated(room)) {
    const view = publicRoom(room, player.id, now);
    assert.equal(view.stage, 'M6.2'); assert.deepEqual(view.classic.game, game); assert.deepEqual(view.classic.draft, draft);
    assert.deepEqual(view.classic.territory, territory(game)); assert.deepEqual([...view.classic.activeIds].sort(), [...activeIds(game)].sort());
    if (!game.over && room.status === 'active') {
      assert.equal(view.decision.kind, 'classic'); assert.equal(view.decision.actor, game.currentActor); assert.equal(view.decision.team, game.turnTeam);
      assert.deepEqual(view.decision.eligible, [actor(room).id]); assert.equal(view.canDecide, player.seat === game.currentActor); assert.equal(view.clock.owner, game.turnTeam);
    }
  }
}

test('M6.2: Clásico usa classic-online-v1; Arena conserva su sonda M6.1', () => {
  assert.equal(configuration('classic', 'piece').ruleset, 'classic-online-v1');
  for (const [mode, policy] of [['arena-duo', 'piece'], ['arena-duo', 'team'], ['arena-ffa', 'piece']]) {
    assert.equal(configuration(mode, policy).ruleset, 'm6.1-connection-probe-v1');
    const room = active(mode, policy); assert.equal(room.decision.kind, 'probe');
    const before = structuredClone(room); assert.throws(() => command(room, room.hostId, 'classic.step', 3000, { to: 9 }));
    assert.deepEqual(room, before);
  }
});

test('M6.2: tres segundos de cuenta atrás crean initialState y beginDraft oficiales con ocho minutos por equipo', () => {
  const room = fixture(); applyCommand(room, room.hostId, { type: 'start' }, 1000);
  advanceRoom(room, 3999); assert.equal(room.status, 'countdown'); assert.equal(room.clock.owner, null);
  assert.deepEqual(room.clock.remainingMs, { A: 480000, B: 480000 });
  advanceRoom(room, 4000); assert.equal(room.status, 'active'); assertOfficial(room, initialState(), beginDraft(initialState()), 4000);
});

test('M6.2: cada paso es definitivo y solo el muro aplica applyTurn; el reloj sigue corriendo para el mismo equipo', () => {
  const room = active(), game = initialState(), first = advanceDraft(game, beginDraft(game), 9), second = advanceDraft(game, first, 16);
  command(room, room.hostId, 'classic.step', 4000, { to: 9 }); assertOfficial(room, game, first, 4000);
  assert.deepEqual(room.clock.remainingMs, { A: 479000, B: 480000 });
  command(room, room.hostId, 'classic.step', 6500, { to: 16 }); assertOfficial(room, game, second, 6500);
  assert.deepEqual(room.clock.remainingMs, { A: 476500, B: 480000 });
  command(room, room.hostId, 'classic.wall', 8000, { to: 23 });
  const next = applyTurn(game, { actor: 'A1', path: [8, 9, 16], to: 23 }); assertOfficial(room, next, beginDraft(next), 8000);
  assert.deepEqual(room.clock.remainingMs, { A: 475000, B: 480000 }); assert.equal(room.clock.owner, 'B');
});

test('M6.2: actor ajeno, destinos ilegales, tercer paso, reinicio y sonda no alteran el tablero comprometido', () => {
  const room = active(), rival = seated(room).find(p => p.seat === 'B1');
  const expectFailure = (id, type, params) => {
    const before = structuredClone(room.classic), revision = room.revision;
    assert.throws(() => command(room, id, type, 3000, params)); assert.deepEqual(room.classic, before); assert.equal(room.revision, revision);
  };
  expectFailure(rival.id, 'classic.step', { to: 9 }); expectFailure(rival.id, 'classic.wall', { to: 1 });
  for (const to of [-1, 49, 48, 1.5, '9', null]) expectFailure(room.hostId, 'classic.step', { to });
  for (const to of [-1, 49, 48, '1', null]) expectFailure(room.hostId, 'classic.wall', { to });
  command(room, room.hostId, 'classic.step', 3000, { to: 9 }); command(room, room.hostId, 'classic.step', 3000, { to: 8 });
  expectFailure(room.hostId, 'classic.step', { to: 15 }); expectFailure(room.hostId, 'classic.reset', {}); expectFailure(room.hostId, 'probe.complete', {});
  assert.deepEqual(room.classic.draft.path, [8, 9, 8]);
  command(room, room.hostId, 'classic.wall', 3000, { to: 15 });
  assert.deepEqual(room.classic.game.lastMove.path, [8, 9, 8]);
});

test('M6.2: un muro existente impide atravesarlo o duplicarlo; una ficha ocupada impide el paso', () => {
  for (const occupied of [false, true]) {
    const room = active();
    const turns = occupied ? [
      { path: [8, 9, 10], to: 3 }, { path: [12, 11], to: 4 }, { path: [40], to: 33 }, { path: [36], to: 29 }
    ] : [{ path: [8], to: 1 }, { path: [12], to: 5 }, { path: [40], to: 33 }, { path: [36], to: 29 }];
    for (const turn of turns) {
      const p = actor(room); for (const to of turn.path.slice(1)) command(room, p.id, 'classic.step', 3000, { to });
      command(room, p.id, 'classic.wall', 3000, { to: turn.to });
    }
    assert.equal(room.classic.game.currentActor, 'A1'); const before = structuredClone(room.classic);
    assert.throws(() => command(room, room.hostId, 'classic.step', 3000, { to: occupied ? 11 : 1 }));
    if (!occupied) assert.throws(() => command(room, room.hostId, 'classic.wall', 3000, { to: 1 }));
    assert.deepEqual(room.classic, before);
  }
});

test('M6.2: JSON persistido y gracia recuperan el draft, dos muros y tiempo sin devolver pasos ni minutos', () => {
  let room = active(), oracle = initialState();
  for (const [turn, now] of [[{ actor: 'A1', path: [8], to: 1 }, 4000], [{ actor: 'B1', path: [12, 11], to: 4 }, 6000]]) {
    const p = actor(room); for (const to of turn.path.slice(1)) command(room, p.id, 'classic.step', now - 500, { to });
    command(room, p.id, 'classic.wall', now, { to: turn.to }); oracle = applyTurn(oracle, turn);
  }
  const id = actor(room).id; command(room, id, 'classic.step', 7000, { to: 41 });
  const expectedDraft = advanceDraft(oracle, beginDraft(oracle), 41), before = structuredClone(room.classic);
  room = JSON.parse(JSON.stringify(room)); offline(room, id, 8000); assert.equal(room.clock.grace.until, 38000);
  advanceRoom(room, 18000); online(room, id, 18000);
  assert.deepEqual(room.classic, before); assertOfficial(room, oracle, expectedDraft, 18000);
  assert.equal(room.clock.players[id].usedMs, 10000); assert.deepEqual(room.clock.remainingMs, { A: 477000, B: 478000 });
  command(room, id, 'classic.step', 19000, { to: 34 }); command(room, id, 'classic.wall', 20000, { to: 27 });
  oracle = applyTurn(oracle, { actor: 'A2', path: [40, 41, 34], to: 27 }); assertOfficial(room, oracle, beginDraft(oracle), 20000);
  assert.deepEqual(room.clock.remainingMs, { A: 475000, B: 478000 });
});

test('M6.2: timeout con reloj falso gana el rival y conserva score oficial y draft pendiente', () => {
  const room = active(); command(room, room.hostId, 'classic.step', 4000, { to: 9 });
  const game = structuredClone(room.classic.game), draft = structuredClone(room.classic.draft);
  advanceRoom(room, 482999); assert.equal(room.status, 'active'); assert.equal(room.clock.remainingMs.A, 1);
  advanceRoom(room, 483000); assert.equal(room.status, 'finished'); assert.equal(room.clock.owner, null); assert.equal(room.decision, null);
  assert.equal(room.outcome.reason, 'timeout'); assert.deepEqual(room.outcome.winners, ['B']); assert.deepEqual(room.outcome.score, territory(game).score);
  assert.deepEqual(room.classic.game, game); assert.deepEqual(room.classic.draft, draft);
  assert.throws(() => command(room, room.hostId, 'classic.wall', 483000, { to: 16 }));
});

test('M6.2: gracia de 30 segundos precede al timeout sin modificar la ruta', () => {
  const room = active(); command(room, room.hostId, 'classic.step', 4000, { to: 9 }); offline(room, room.hostId, 4000);
  assert.equal(room.clock.grace.until, 34000); advanceRoom(room, 34000);
  assert.equal(room.clock.remainingMs.A, 479000); assert.equal(room.clock.grace, null);
  advanceRoom(room, 512999); assert.equal(room.status, 'active'); advanceRoom(room, 513000);
  assert.equal(room.status, 'finished'); assert.equal(room.outcome.reason, 'timeout'); assert.deepEqual(room.outcome.winners, ['B']);
  assert.deepEqual(room.classic.draft.path, [8, 9]); assert.equal(room.clock.players[room.hostId].usedMs, 30000);
});

test('M6.2: partida completa coincide comando por comando con el motor y termina 46–3 tras 16 muros', () => {
  const room = active(), counts = [0, 0, 0]; let oracle = initialState(), seed = 0x6c2, now = 3000;
  const first = [{ path: [8], to: 1 }, { path: [12, 11], to: 4 }, { path: [40, 41, 34], to: 27 }];
  while (!oracle.over) {
    let turn = first[oracle.moves];
    if (!turn) {
      const start = oracle.pieces.find(p => p.id === oracle.currentActor).pos; let paths = [[start]];
      for (let n = 0; n < oracle.moves % 3; n++) paths = paths.flatMap(p => availableMoves(oracle, oracle.currentActor, p.at(-1)).map(to => [...p, to]));
      let options = paths.flatMap(path => wallOptions(oracle, path.at(-1)).map(to => ({ path, to })));
      if (!options.length) options = wallOptions(oracle, start).map(to => ({ path: [start], to }));
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; turn = options[seed % options.length];
    }
    turn = { actor: oracle.currentActor, ...turn }; const p = actor(room); let draft = beginDraft(oracle);
    for (const to of turn.path.slice(1)) { command(room, p.id, 'classic.step', ++now, { to }); draft = advanceDraft(oracle, draft, to); assertOfficial(room, oracle, draft, now); }
    command(room, p.id, 'classic.wall', ++now, { to: turn.to }); oracle = applyTurn(oracle, turn); counts[turn.path.length - 1]++;
    assert.ok(verifyState(oracle)); assertOfficial(room, oracle, beginDraft(oracle), now);
  }
  assert.equal(oracle.moves, 16); assert.deepEqual(counts, [6, 5, 5]); assert.equal(room.status, 'finished'); assert.equal(room.clock.owner, null);
  assert.equal(room.outcome.reason, 'territory'); assert.deepEqual(room.outcome.winners, ['A']); assert.deepEqual(room.outcome.score, { A: 46, B: 3, empty: 0, mixed: 0 });
  for (const p of seated(room)) assert.equal(publicRoom(room, p.id, now).canDecide, false);
});
