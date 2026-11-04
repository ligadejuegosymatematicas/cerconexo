import test from 'node:test';
import assert from 'node:assert/strict';
import { arenaFeedback } from '../arena-feedback.mjs';
import { reviewTraces } from '../scripts/arena-trace.mjs';
import { createArena } from '../../arena/src/engine.mjs';
import { analyzeArena } from '../../arena/src/geometry.mjs';

function snapshot(game) {
  return { matchId: 'm1', status: game.over ? 'finished' : 'active',
    arena: { game, territory: analyzeArena(game) } };
}

test('Arena presenta poderes, muros y territorios del motor una vez por jugada en directo', () => {
  const changes = reviewTraces().flatMap(trace => {
    const games = [createArena({ mode: 'duo', policy: 'piece' }), ...trace.states];
    return games.slice(1).map((game, index) => {
      const previous = snapshot(games[index]);
      const current = snapshot(game);
      const change = arenaFeedback(previous, current, true);
      assert.ok(change);
      assert.equal(arenaFeedback(current, current, true), null);
      assert.equal(arenaFeedback(previous, current, false), null);
      assert.equal(arenaFeedback(previous, { ...current, matchId: 'm2' }, true), null);
      return change;
    });
  });
  for (const type of ['wall', 'extraWall', 'demolition']) {
    assert.ok(changes.some(change => change.action === type && Number.isInteger(change.destination)));
  }
  assert.ok(changes.some(change => change.power === 'jump'));
  assert.ok(changes.some(change => change.pieces.some(piece => piece.type === 'reactivated')));
  assert.ok(changes.some(change => change.pieces.some(piece => piece.type === 'secured')));
  assert.ok(changes.some(change => change.territory.length && change.text.includes('casilla')));
  const trace = reviewTraces()[0];
  assert.equal(arenaFeedback(snapshot(trace.states[0]), snapshot(trace.states[2]), true), null);
});
