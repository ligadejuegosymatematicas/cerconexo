import { requireThat, randomId, participantCount, needsConfigClient, CONFIG_UPDATE_MESSAGE } from './protocol.mjs';
import { retiredClassicConfiguration, RETIRED_MESSAGE } from '../configuration-rules.mjs';
import {isArenaRoom,ARENA_UPDATE} from './arena-adapter.mjs';
import {classicFfaCompatible} from '../classic-ffa.mjs';

export const REMATCH_MS = 120000;
export const MAX_MATCHES = 20;
export const UPDATE_MESSAGE = 'Actualiza esta página para jugar la revancha. Se conservarán tu sesión y tu ficha.';
export const matchId = room => `${room.code}:${room.matchNumber ?? 1}`;
export function normalizeMatch(room) {
  room.matchNumber ??= 1;
  room.previousResults ??= [];
  room.rematch ??= null;
  room.decisionSerial ??= (room.classic?.game.moves ?? room.probe?.completed ?? 0) + (room.decision ? 1 : 0);
  if (room.decisionFingerprint === undefined) room.decisionFingerprint = decisionFingerprint(room.decision);
  return room;
}
export function decisionFingerprint(decision) {
  return decision ? JSON.stringify([decision.kind, decision.team, decision.actor, decision.eligible,...(decision.key?[decision.key]:[])]) : null;
}
export function checkMatch(room, supplied, { legacy = false } = {}) {
  requireThat(supplied === matchId(room) || legacy && supplied === undefined && (room.matchNumber ?? 1) === 1,
    'MATCH', 'La acción corresponde a otra partida. Actualiza el estado antes de actuar.', 409);
}
export function rematchCommand(room, player, command, now, participants) {
  normalizeMatch(room); const args = command.params ?? {};
  checkMatch(room, args.matchId);
  requireThat(classicFfaCompatible(room,player),'UPDATE_REQUIRED',CONFIG_UPDATE_MESSAGE,409);
  requireThat(player.rematchCapable === true, 'UPDATE_REQUIRED', UPDATE_MESSAGE, 409);
  requireThat(!needsConfigClient(room.config) || player.classicConfigCapable, 'UPDATE_REQUIRED', CONFIG_UPDATE_MESSAGE, 409);
  requireThat(room.status === 'finished' && (room.classic||room.arena) && player.admitted && player.seat, 'REMATCH', 'La revancha solo se propone al finalizar la partida.', 409);
  requireThat(!isArenaRoom(room)||player.arenaCapable,'UPDATE_REQUIRED',ARENA_UPDATE,409);
  requireThat(!retiredClassicConfiguration(room.config), 'CONFIG_RETIRED', RETIRED_MESSAGE, 409);
  if (command.type === 'rematch.propose') {
    requireThat(player.id === room.hostId, 'PERMISSION', 'Solo el anfitrión puede proponer la revancha.', 403);
    requireThat(room.matchNumber < MAX_MATCHES, 'MATCH_LIMIT', 'La sala llegó a su límite de veinte partidas. Conserva los resultados y crea otra sala.', 409);
    requireThat(!['pending', 'countdown'].includes(room.rematch?.status), 'REMATCH_PENDING', 'Ya hay una propuesta pendiente.', 409);
    requireThat(participants.length === participantCount(room.config), 'PARTICIPANTS', 'La revancha necesita todas las posiciones de la sala.', 409);
    room.rematch = { id: randomId(), matchId: matchId(room), status: 'pending', votes: { [player.id]: true },
      proposedAt: now, expiresAt: now + REMATCH_MS, startsAt: null };
  } else {
    const proposal = room.rematch;
    requireThat(proposal && proposal.id === args.proposalId && proposal.matchId === args.matchId && ['pending', 'countdown'].includes(proposal.status)
      && now < proposal.expiresAt, 'PROPOSAL', 'La propuesta ya cambió o terminó.', 409);
    requireThat(typeof args.accept === 'boolean', 'PARAMS', 'Indica si aceptas la revancha.');
    requireThat(!args.accept || proposal.votes[player.id] === undefined, 'VOTED', 'Tu aceptación ya está registrada.', 409);
    proposal.votes[player.id] = args.accept;
    if (!args.accept) { proposal.status = 'rejected'; proposal.rejectedBy = player.id; proposal.startsAt = null; }
  }
}

// Returns transitions; room-model owns the actual board/clock initialization.
export function rematchProgress(room, participants, now, countdownMs) {
  const proposal = room.rematch;
  if (room.status !== 'finished' || !proposal || !['pending', 'countdown'].includes(proposal.status)) return null;
  if (retiredClassicConfiguration(room.config)) { proposal.status='retired';proposal.startsAt=null;return 'rematch-retired'; }
  if (now >= proposal.expiresAt) { proposal.status = 'expired'; proposal.startsAt = null; return 'rematch-expired'; }
  const consent = participants.length === participantCount(room.config) && participants.every(p => proposal.votes[p.id] === true);
  const connected = participants.every(p => p.online);
  const compatible = participants.every(p => classicFfaCompatible(room,p) && p.rematchCapable === true && (!isArenaRoom(room)||p.arenaCapable) && (!needsConfigClient(room.config) || p.classicConfigCapable));
  if ((!connected || !compatible) && proposal.status === 'countdown') { proposal.status = 'pending'; proposal.startsAt = null; return 'rematch-paused'; }
  if (consent && connected && compatible && proposal.status === 'pending') {
    proposal.status = 'countdown'; proposal.startsAt = now + countdownMs; return 'rematch-countdown';
  }
  return proposal.status === 'countdown' && consent && connected && now >= proposal.startsAt ? 'rematch-started' : null;
}
