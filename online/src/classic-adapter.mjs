import { initialState, applyTurn, territory, activeIds, legalActors } from '../../src/engine.mjs';
import { beginDraft, advanceDraft, selectDraft } from '../../src/turnDraft.mjs';
import { Fault, requireThat, participantCount } from './protocol.mjs';

export const CLASSIC_RULESET = 'classic-online-v1';
export const isClassicRoom = room => room.config.ruleset === CLASSIC_RULESET;
export function controlledPieces(config, seat) {
  return participantCount(config) === 2 ? ['A1', 'A2', 'B1', 'B2'].filter(id => id[0] === seat) : seat ? [seat] : [];
}
export function createClassic(config = { policy: 'piece' }) {
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
    territory: territory(room.classic.game), activeIds: [...activeIds(room.classic.game)] };
}
export function applyClassic(room, seat, type, params) {
  requireThat(isClassicRoom(room) && room.classic && room.status === 'active', 'CLASSIC', 'La partida de Clásico no está activa.', 409);
  const { game, draft } = room.classic;
  const owned = controlledPieces(room.config, seat);
  try {
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
  const { score } = territory(room.classic.game);
  if (timedOutTeam) return { reason: 'timeout', timedOutTeam, losers: [timedOutTeam], winners: room.config.teams.filter(team => team !== timedOutTeam), score };
  requireThat(room.classic.game.over, 'RESULT', 'Todavía no existe un resultado territorial.', 409);
  const winners = score.A === score.B ? ['A', 'B'] : [score.A > score.B ? 'A' : 'B'];
  return { reason: 'territory', winners, score };
}
