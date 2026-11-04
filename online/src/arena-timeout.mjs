import {createArena} from '../../arena/src/engine.mjs';
import {analyzeArena} from '../../arena/src/geometry.mjs';
import {requireThat} from './protocol.mjs';

export const ARENA_FFA_RULESET = 'arena-ffa-online-v1';
export const isArenaFfaRoom = room => room.config.ruleset === ARENA_FFA_RULESET;

// These transitions apply only to the online time rule. Territorial ownership,
// activity and normal actions continue to use the official engine and geometry.
export function eliminateByTime(room, team, now) {
  requireThat(isArenaFfaRoom(room), 'ARENA', 'Esta sala no admite eliminación por tiempo.');
  const previous = room.arena.eliminations.find(entry => entry.team === team);
  if (previous) return {duplicate: true, finished: room.arena.game.over};
  const before = room.arena.game;
  const piece = before.pieces.find(p => p.team === team);
  requireThat(room.status === 'active' && piece && room.clock.remainingMs[team] === 0,
    'ARENA_STATE', 'La eliminación necesita un vencimiento autoritativo.', 409);
  // In the official FFA piece policy, capacity is one per piece. A pending
  // discard belongs to the acting piece's pickup, never to a rival inventory.
  requireThat(before.policy === 'piece' && before.turn.team === team &&
    (!before.pending || before.pending.team === team),
    'ARENA_STATE', 'La decisión pendiente no corresponde al reloj vencido.', 409);
  const viewBefore = analyzeArena(before);
  const game = structuredClone(before);
  game.pieces = game.pieces.filter(p => p.team !== team);
  delete game.inventories[piece.id];
  game.pending = null;
  game.resolution = null;
  game.revision++;
  const view = analyzeArena(game);
  const survivors = game.teams.filter(t => game.pieces.some(p => p.team === t));
  const reason = survivors.length === 1 ? 'last-survivor' : view.over ? 'territory' : null;
  game.lastEvents = [{type: 'eliminated', actor: piece.id, team}];
  for (const p of game.pieces) {
    if (viewBefore.active.includes(p.id) && !view.active.includes(p.id)) {
      game.lastEvents.push({type: 'secured', actor: p.id, team: p.team});
    }
  }
  if (reason) {
    game.over = true;
    game.winners = survivors.length === 1 ? survivors : view.winners.filter(t => survivors.includes(t));
    game.turn.actor = null;
    game.lastEvents.push({type: 'finished', winners: [...game.winners]});
  } else {
    const offset = game.teams.indexOf(team);
    const nextTeam = Array.from({length: game.teams.length}, (_,i) => game.teams[(offset+i+1)%game.teams.length])
      .find(t => game.pieces.some(p => p.team === t && view.active.includes(p.id)));
    const next = game.pieces.find(p => p.team === nextTeam && view.active.includes(p.id));
    requireThat(next, 'ARENA_STATE', 'No existe una ficha activa para continuar.', 409);
    game.turn = {...createArena({mode:'ffa'}).turn, team: next.team, actor: next.id, path:[next.pos]};
  }
  room.arena = {game, eliminations: [...room.arena.eliminations, {
    team, at: now, score: viewBefore.score[team], cell: piece.pos, completedTurns: before.completedTurns,
  }]};
  return {finished: game.over, reason};
}

export function ffaOutcome(room, reason = 'territory') {
  const game = room.arena.game, score = analyzeArena(game).score;
  requireThat(game.over, 'RESULT', 'La partida continúa.', 409);
  const eliminated = new Set(room.arena.eliminations.map(entry => entry.team));
  const survivors = game.teams.filter(team => !eliminated.has(team)).sort((a,b) => score[b]-score[a]);
  const ranking = survivors.map(team => ({
    team, rank: survivors.findIndex(other => score[other] === score[team])+1, score: score[team], eliminated: false,
  }));
  for (const entry of [...room.arena.eliminations].reverse()) {
    ranking.push({team: entry.team, rank: ranking.length+1, score: score[entry.team], eliminated: true,
      eliminatedAt: entry.at, scoreAtElimination: entry.score});
  }
  return {reason, winners: [...game.winners], score, ranking, eliminations: structuredClone(room.arena.eliminations)};
}
