import { initialState, applyTurn, territory, activeIds, legalActors } from '../../src/engine.mjs';
import { beginDraft, advanceDraft, selectDraft } from '../../src/turnDraft.mjs';
import { Fault, requireThat, participantCount } from './protocol.mjs';
import {CLASSIC_FFA_RULESET, isClassicFfaRoom, initialClassicFfa, ffaDraft, ffaTerritory, ffaActiveIds, stepClassicFfa, wallClassicFfa} from '../classic-ffa.mjs';
import {rankFfa} from './ffa-ranking.mjs';

export const CLASSIC_RULESET = 'classic-online-v1';
export const isClassicRoom = room => [CLASSIC_RULESET, CLASSIC_FFA_RULESET].includes(room.config.ruleset);
export function controlledPieces(config, seat) {
  return participantCount(config) === 2 ? ['A1', 'A2', 'B1', 'B2'].filter(id => id[0] === seat) : seat ? [seat] : [];
}
export function createClassic(config = { policy: 'piece' }) {
  if (config.mode === 'classic-ffa') {const game=initialClassicFfa();return {game,draft:ffaDraft(game)};}
  const game = initialState({ turnMode: config.policy });
  return { game, draft: beginDraft(game) };
}
export function classicDecision(room) {
  const game = room.classic.game;
  if (game.over) return null;
  const actor = room.classic.draft.actor ?? game.currentActor, choices = actor ? [actor] : legalActors(game);
  return { kind: 'classic', team: game.turnTeam, actor, selecting: !actor,
    eligible: Object.values(room.participants).filter(p => p.admitted && !p.rejected && controlledPieces(room.config, p.seat).some(id => choices.includes(id))).map(p => p.id) };
}
export function classicView(room) {
  return { game: room.classic.game, draft: room.classic.draft,
    territory: isClassicFfaRoom(room) ? ffaTerritory(room.classic.game) : territory(room.classic.game),
    activeIds: isClassicFfaRoom(room) ? ffaActiveIds(room.classic.game) : [...activeIds(room.classic.game)] };
}
export function applyClassic(room, seat, type, params) {
  requireThat(isClassicRoom(room) && room.classic && room.status === 'active', 'CLASSIC', 'La partida de Clásico no está activa.', 409);
  const { game, draft } = room.classic;
  const owned = controlledPieces(room.config, seat);
  try {
    if (isClassicFfaRoom(room)) {
      requireThat(owned.includes(draft.actor) && ffaActiveIds(game).includes(draft.actor), 'DECISION', 'Solo puede actuar la ficha activa que controlas.', 403);
      requireThat(['classic.step','classic.wall'].includes(type), 'COMMAND', 'Esta modalidad tiene turnos por ficha.');
      requireThat(Object.keys(params).length === 1 && Number.isInteger(params.to), 'PARAMS', 'Indica únicamente una casilla válida.');
      if (type === 'classic.step') {room.classic.draft=stepClassicFfa(game,draft,params.to);return {completedTurn:false,finished:false};}
      const next=wallClassicFfa(game,draft,params.to);
      room.classic={game:next,draft:ffaDraft(next)};
      return {completedTurn:true,finished:next.over};
    }
    if (type === 'classic.select') {
      requireThat(room.config.policy === 'team' && owned.includes(params.actor), 'DECISION', 'Elige exclusivamente una ficha activa que controles.', 403);
      requireThat(Object.keys(params).length === 1 && typeof params.actor === 'string', 'PARAMS', 'Indica únicamente la ficha.');
      requireThat(params.actor !== draft.actor, 'SELECTED', 'La ficha ya está seleccionada.', 409);
      requireThat(participantCount(room.config) === 2 || !draft.actor, 'CLAIMED', 'El turno ya está reservado para una ficha; debe completar su muro.', 409);
      room.classic.draft = selectDraft(game, draft, params.actor);
      return { selected: true, completedTurn: false, finished: false };
    }
    requireThat(owned.includes(draft.actor) && legalActors(game).includes(draft.actor), 'DECISION', 'Solo puede actuar quien controla la ficha elegida para el turno.', 403);
    requireThat(Object.keys(params).length === 1 && Object.hasOwn(params, 'to') && Number.isInteger(params.to), 'PARAMS', 'Indica únicamente una casilla de destino válida.');
    if (type === 'classic.step') {
      // Each accepted prefix is authoritative and durable. The mathematical
      // turn remains the official engine's state until its mandatory wall.
      room.classic.draft = advanceDraft(game, draft, params.to);
      return { completedTurn: false, finished: false };
    }
    requireThat(type === 'classic.wall', 'COMMAND', 'Acción de Clásico no disponible.');
    const next = applyTurn(game, { actor: draft.actor, path: [...draft.path], to: params.to });
    room.classic = { game: next, draft: beginDraft(next) };
    return { completedTurn: true, finished: next.over };
  } catch (error) {
    if (error instanceof Fault) throw error;
    throw new Fault('ILLEGAL_ACTION', error.message);
  }
}
export function classicOutcome(room, timedOutTeam = null) {
  if (isClassicFfaRoom(room)) {
    const game=room.classic.game, {score}=ffaTerritory(game);
    requireThat(game.over, 'RESULT', 'La partida continúa.', 409);
    return {reason:game.finishReason,winners:[...game.winners],score,
      ranking:rankFfa(game.teams,score,game.eliminations),eliminations:structuredClone(game.eliminations)};
  }
  const { score } = territory(room.classic.game);
  if (timedOutTeam) return { reason: 'timeout', timedOutTeam, losers: [timedOutTeam], winners: room.config.teams.filter(team => team !== timedOutTeam), score };
  requireThat(room.classic.game.over, 'RESULT', 'Todavía no existe un resultado territorial.', 409);
  const winners = score.A === score.B ? ['A', 'B'] : [score.A > score.B ? 'A' : 'B'];
  return { reason: 'territory', winners, score };
}
