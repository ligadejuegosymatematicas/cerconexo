// Four-team Classic variant. The official 7×7 graph, move and wall validators
// remain the source of truth; only team classification/rotation are generalized.
import {regions, validateTurn, wallOptions, wallKey} from '../src/engine.mjs';

export const CLASSIC_FFA_RULESET = 'classic-ffa-online-v1';
export const CLASSIC_FFA_TEAMS = Object.freeze(['A', 'B', 'C', 'D']);
export const isClassicFfa = game => game?.variant === CLASSIC_FFA_RULESET;
export const isClassicFfaRoom = room => room.config.ruleset === CLASSIC_FFA_RULESET;
export const classicFfaCompatible = (room, player) => !isClassicFfaRoom(room) || player.classicFfaCapable === true;

export function ffaTerritory(game) {
  const components = regions(game).map(region => ({...region,
    type: region.teams.length === 0 ? 'empty' : region.teams.length === 1 ? region.teams[0] : 'mixed'}));
  const score = {A:0, B:0, C:0, D:0, mixed:0, empty:0};
  for (const region of components) score[region.type] += region.cells.length;
  return {components, score, finished: score.mixed === 0};
}
export const ffaActiveIds = game => ffaTerritory(game).components.filter(r => r.type === 'mixed').flatMap(r => r.ids);
export const ffaDraft = game => ({actor: game.over ? null : game.currentActor,
  path: game.over ? [] : [game.pieces.find(p => p.id === game.currentActor).pos]});
export function initialClassicFfa() {
  return {variant:CLASSIC_FFA_RULESET, teams:[...CLASSIC_FFA_TEAMS], turnMode:'piece',
    pieces:CLASSIC_FFA_TEAMS.map((team,i) => ({id:team, team, pos:[8,12,40,36][i]})),
    walls:[], moves:0, turnTeam:'A', currentActor:'A', over:false, winners:[],
    secured:{}, eliminations:[], lastMove:null, finishReason:null};
}

// A secured component cannot change: walls are only added, and its pawn never
// acts again. Keep its original cells as a durable, inspectable invariant.
export function resolveClassicFfa(game, after = game.currentActor) {
  const view = ffaTerritory(game);
  for (const region of view.components) if (region.teams.length === 1) {
    game.secured[region.type] ??= {cells:[...region.cells], score:region.cells.length};
  }
  const eliminated = new Set(game.eliminations.map(e => e.team));
  const survivors = game.teams.filter(team => !eliminated.has(team));
  const active = ffaActiveIds(game);
  const blocked = !game.pieces.some(p => active.includes(p.id) && wallOptions(game, p.pos).length);
  game.finishReason = survivors.length <= 1 ? 'last-survivor' : view.finished ? 'territory' : blocked ? 'blocked' : null;
  game.over = !!game.finishReason;
  if (game.over) {
    const maximum = Math.max(...survivors.map(team => view.score[team]));
    game.winners = survivors.filter(team => view.score[team] === maximum);
    game.currentActor = null;
    game.turnTeam = null;
  } else {
    const offset = game.teams.indexOf(after);
    game.currentActor = Array.from({length:4}, (_,i) => game.teams[(offset+i+1)%4]).find(team => active.includes(team));
    game.turnTeam = game.currentActor;
  }
  return game;
}
export function stepClassicFfa(game, draft, to) {
  const path = [...draft.path, to];
  // Validate the entire irreversible prefix with an available mandatory wall.
  // Any legal arriving step leaves at least its incoming edge open.
  validateTurn(game, {actor:draft.actor, path, to:wallOptions(game, to)[0]});
  return {actor:draft.actor, path};
}
export function wallClassicFfa(game, draft, to) {
  const landing = validateTurn(game, {actor:draft.actor, path:draft.path, to});
  const next = structuredClone(game);
  next.pieces.find(p => p.id === draft.actor).pos = landing;
  next.walls.push(wallKey(landing, to));
  next.moves++;
  next.lastMove = {actor:draft.actor, path:[...draft.path], wall:[landing,to]};
  return resolveClassicFfa(next, draft.actor);
}
export function eliminateClassicFfa(game, draft, team, now) {
  if (game.over || game.currentActor !== team || !ffaActiveIds(game).includes(team) || game.secured[team]) {
    throw new Error('Solo puede eliminarse por tiempo el equipo activo.');
  }
  const next = structuredClone(game), score = ffaTerritory(game).score[team];
  next.pieces = next.pieces.filter(p => p.team !== team);
  next.eliminations.push({team, at:now, score, cell:draft.path.at(-1), completedTurns:game.moves});
  return resolveClassicFfa(next, team);
}
