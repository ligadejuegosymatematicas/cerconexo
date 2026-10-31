import { initialState, applyTurn, territory, activeIds } from '../../src/engine.mjs';
import { beginDraft, advanceDraft } from '../../src/turnDraft.mjs';
import { Fault, requireThat } from './protocol.mjs';

export const CLASSIC_RULESET = 'classic-online-v1';
export const isClassicRoom = room => room.config.ruleset === CLASSIC_RULESET;
export function createClassic() {
  const game = initialState();
  return { game, draft: beginDraft(game) };
}
export function classicDecision(room) {
  const game = room.classic.game;
  if (game.over) return null;
  return { kind: 'classic', team: game.turnTeam, actor: game.currentActor,
    eligible: Object.values(room.participants).filter(p => p.admitted && !p.rejected && p.seat === game.currentActor).map(p => p.id) };
}
export function classicView(room) {
  return { game: room.classic.game, draft: room.classic.draft,
    territory: territory(room.classic.game), activeIds: [...activeIds(room.classic.game)] };
}
export function applyClassic(room, seat, type, params) {
  requireThat(isClassicRoom(room) && room.classic && room.status === 'active', 'CLASSIC', 'La partida de Clásico no está activa.', 409);
  const { game, draft } = room.classic;
  requireThat(seat === game.currentActor && seat === draft.actor, 'DECISION', 'Solo puede actuar la persona que controla la ficha del turno.', 403);
  requireThat(Object.keys(params).length === 1 && Object.hasOwn(params, 'to') && Number.isInteger(params.to), 'PARAMS', 'Indica únicamente una casilla de destino válida.');
  try {
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
