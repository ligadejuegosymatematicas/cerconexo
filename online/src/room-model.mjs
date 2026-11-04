import { configuration, nameOf, requireThat, randomId, participantCount, needsConfigClient, CONFIG_UPDATE_MESSAGE, SCHEMA_VERSION, PROTOCOL_VERSION, BASE_SHA, RETENTION_MS, COUNTDOWN_MS } from './protocol.mjs';
import { createClock, registerClockPlayer, beginDisconnect, settleClock, chooseDecision, publicClock, clockDeadline } from './clocks.mjs';
import { isClassicRoom, createClassic, classicDecision, classicView, applyClassic, classicOutcome, controlledPieces } from './classic-adapter.mjs';
import { normalizeMatch, matchId, checkMatch, decisionFingerprint, rematchCommand, rematchProgress, UPDATE_MESSAGE } from './rematch.mjs';
import { retiredClassicConfiguration, RETIRED_MESSAGE } from '../configuration-rules.mjs';
import {isArenaFfaRoom,eliminateByTime,ffaOutcome} from './arena-timeout.mjs';
import {isArenaRoom,arenaConfiguration,arenaOneVsOne,arenaControlledPieces,createOnlineArena,arenaDecision,arenaView,applyOnlineArena,arenaOutcome,ARENA_UPDATE} from './arena-adapter.mjs';
import {isClassicFfaRoom, classicFfaCompatible, eliminateClassicFfa, ffaDraft} from '../classic-ffa.mjs';

export function createRoom({ code, name, mode, policy, players, tokenHash, probeOnly = false, arenaOnline = false }, now) {
  let config = configuration(mode, policy, players); const id = randomId();
  if(arenaOnline)config=arenaConfiguration(config);
  else requireThat(!arenaOneVsOne(config), 'CONFIG', 'Arena Online 1 vs. 1 no está habilitada.');
  // Existing M6.1 rooms keep their persisted ruleset. Only the unit fixtures
  // construct new legacy probes; the HTTP API never forwards this flag.
  if (probeOnly && config.mode === 'classic') config.ruleset = 'm6.1-connection-probe-v1';
  const room = { schemaVersion: SCHEMA_VERSION, protocolVersion: PROTOCOL_VERSION, code, config, baseSha: BASE_SHA,
    status: 'lobby', revision: 1, presenceRevision: 0, hostId: id, createdAt: now, lastActivityAt: now,
    expiresAt: now + RETENTION_MS, startsAt: null, participants: {}, clock: createClock(config.teams, config.clockMs),
    decision: null, probe: { completed: 0, actorIndex: 0, eliminatedTeams: [], decisions: [] }, outcome: null };
  room.participants[id] = participant(id, name, tokenHash, now, true, config.seats[0]);
  if (isClassicRoom(room)) room.classic = createClassic(config);
  if (isArenaRoom(room)) room.arena=createOnlineArena(room.config);
  registerClockPlayer(room.clock, id);
  return normalizeMatch(room);
}
function participant(id, name, tokenHash, now, admitted = false, seat = null) {
  return { id, name: nameOf(name), tokenHash, admitted, seat, ready: false, online: false,
    generation: 0, joinedAt: now, lastSeenAt: null, rejected: false };
}
export function joinRoom(room, { name, tokenHash }, now) {
  const existing = Object.values(room.participants).find(p => p.tokenHash === tokenHash);
  if (existing) { requireThat(!existing.rejected, 'REJECTED', 'Esta solicitud fue rechazada.', 403); return existing.id; }
  requireThat(room.status === 'lobby', 'STARTED', 'La sala ya comenzó o no admite participantes.', 409);
  requireThat(Object.values(room.participants).filter(p => !p.rejected).length < 12, 'CAPACITY', 'La sala no admite más solicitudes.', 409);
  const id = randomId(); room.participants[id] = participant(id, name, tokenHash, now);
  registerClockPlayer(room.clock, id); touch(room, now); return id;
}
export function findPlayer(room, tokenHash) {
  const player = Object.values(room.participants).find(p => p.tokenHash === tokenHash);
  requireThat(player && !player.rejected, 'AUTH', 'Sesión no reconocida.', 401);
  return player;
}
function touch(room, now) { room.revision++; room.lastActivityAt = now; if (room.status === 'lobby') room.expiresAt = now + RETENTION_MS; }
export function seated(room) { return Object.values(room.participants).filter(p => p.admitted && p.seat && !p.rejected); }
export function teamOf(seat) { return seat?.[0] ?? null; }
export function canDecide(room, id) { return room.status === 'active' && room.decision?.eligible.includes(id) && classicFfaCompatible(room, room.participants[id]); }
function normalDecision(room) {
  if (isClassicRoom(room)) return classicDecision(room);
  if (isArenaRoom(room)) return arenaDecision(room);
  const seat = room.config.seats[room.probe.actorIndex], team = teamOf(seat);
  const eligible = seated(room).filter(p => room.config.policy === 'team' ? teamOf(p.seat) === team : p.seat === seat).map(p => p.id);
  return { kind: 'probe', team, actor: room.config.policy === 'team' ? null : seat, eligible };
}
function syncDecision(room, now) {
  const fingerprint = decisionFingerprint(room.decision);
  if (room.decisionFingerprint !== fingerprint) { room.decisionSerial = (room.decisionSerial ?? 0) + 1; room.decisionFingerprint = fingerprint; }
  chooseDecision(room.clock, room.decision, room.participants, now);
}
function progressRematch(room, now) {
  const event = rematchProgress(room, seated(room), now, COUNTDOWN_MS);
  if (!event) return null;
  if (event === 'rematch-started') {
    room.previousResults.push({ matchId: matchId(room), number: room.matchNumber, outcome: structuredClone(room.outcome),
      finishedAt: room.finishedAt ?? room.expiresAt - RETENTION_MS, turns: room.classic?.game.moves ?? room.arena.game.completedTurns });
    room.matchNumber++; if(isArenaRoom(room))room.arena=createOnlineArena(room.config);else room.classic = createClassic(room.config); room.outcome = null; room.finishedAt = null;
    room.clock = createClock(room.config.teams, room.config.clockMs);
    for (const p of seated(room)) { p.ready = true; registerClockPlayer(room.clock, p.id); }
    room.status = 'active'; room.startsAt = null; room.decisionSerial = 0; room.decisionFingerprint = null;
    room.decision = normalDecision(room); room.rematch.status = 'started'; syncDecision(room, now);
  }
  touch(room, now); return { type: event };
}
function nextProbe(room) {
  const order = room.config.policy === 'team' ? [0, 1] : [0, 1, 2, 3];
  let position = order.indexOf(room.probe.actorIndex);
  for (let n = 0; n < order.length; n++) {
    position = (position + 1) % order.length;
    const index = order[position];
    if (!room.probe.eliminatedTeams.includes(teamOf(room.config.seats[index]))) { room.probe.actorIndex = index; return; }
  }
}
function finish(room, now, outcome) {
  room.finishedAt = now;
  room.status = 'finished'; room.outcome = outcome; room.decision = null; room.startsAt = null;
  chooseDecision(room.clock, null, room.participants, now); room.expiresAt = now + RETENTION_MS;
}
export function advanceRoom(room, now) {
  normalizeMatch(room);
  const events = [];
  if (retiredClassicConfiguration(room.config) && room.status === 'countdown') {
    room.status='lobby';room.startsAt=null;touch(room,now);events.push({type:'configuration-retired'});
  }
  if ((room.status === 'lobby' || room.status === 'finished') && now >= room.expiresAt) {
    room.status = 'expired'; room.decision = null; chooseDecision(room.clock, null, room.participants, now);
    touch(room, now); events.push({ type: 'expired' }); return events;
  }
  const rematchEvent = progressRematch(room, now); if (rematchEvent) events.push(rematchEvent);
  if (room.status === 'countdown' && now >= room.startsAt) {
    if (seated(room).length !== participantCount(room.config) || seated(room).some(p => !p.online || !p.ready || !classicFfaCompatible(room,p) || isArenaRoom(room)&&!p.arenaCapable || needsConfigClient(room.config) && !p.classicConfigCapable)) {
      room.status = 'lobby'; room.startsAt = null; room.expiresAt = now + RETENTION_MS; events.push({ type: 'countdown-cancelled' });
    } else {
      room.status = 'active'; room.startsAt = null; room.decision = normalDecision(room); syncDecision(room, now); events.push({ type: isClassicRoom(room)||isArenaRoom(room) ? 'game-started' : 'probe-started' });
    }
    touch(room, now);
  }
  if (room.status === 'active') {
    const hadGrace = !!room.clock.grace, expired = settleClock(room.clock, now);
    if (hadGrace && !room.clock.grace) { room.revision++; events.push({ type: 'grace-ended' }); }
    if (expired) {
      events.push({ type: 'clock-expired', team: expired.team, deadline: expired.at });
      if (isClassicFfaRoom(room)) {
        const game=eliminateClassicFfa(room.classic.game,room.classic.draft,expired.team,now);
        room.classic={game,draft:ffaDraft(game)};
        events.push({type:'classic-eliminated',team:expired.team,at:now});
        if(game.over)finish(room,now,classicOutcome(room));
        else {room.decision=classicDecision(room);syncDecision(room,now);}
      }
      else if (isClassicRoom(room)) finish(room, now, classicOutcome(room, expired.team));
      else if (isArenaFfaRoom(room)) {
        const result = eliminateByTime(room, expired.team, now);
        events.push({type:'arena-eliminated', team:expired.team, at:now});
        if (result.finished) finish(room, now, ffaOutcome(room, result.reason));
        else {room.decision = arenaDecision(room); syncDecision(room, now);}
      }
      else if(isArenaRoom(room))finish(room,now,arenaOutcome(room,expired.team));
      else if (room.config.mode === 'arena-ffa') {
        room.probe.eliminatedTeams.push(expired.team);
        const survivors = room.config.teams.filter(t => !room.probe.eliminatedTeams.includes(t));
        if (survivors.length === 1) finish(room, now, { reason: 'probe-last-clock-standing', winners: survivors, eliminatedTeams: [...room.probe.eliminatedTeams] });
        else { nextProbe(room); room.decision = normalDecision(room); syncDecision(room, now); }
      } else finish(room, now, { reason: 'probe-timeout', losers: [expired.team], winners: room.config.teams.filter(t => t !== expired.team) });
      touch(room, now);
    }
  }
  return events;
}
export function presence(room, id, online, now, { voluntary = false } = {}) {
  normalizeMatch(room);
  const player = room.participants[id];
  if (!player || player.rejected || player.online === online) return false;
  player.online = online; player.lastSeenAt = now; room.presenceRevision++;
  if (!online) {
    beginDisconnect(room.clock, id);
    // Leaving the view is not a network incident and cannot request a pause.
    // Keep the existing incident/budget representation and all normal grace rules.
    if (voluntary) room.clock.players[id].until = now;
  }
  if (!online && room.status === 'countdown' && player.admitted) { room.status = 'lobby'; room.startsAt = null; room.expiresAt = now + RETENTION_MS; room.revision++; }
  if (room.status === 'active') {
    const previous = JSON.stringify(room.clock.grace);
    syncDecision(room, now);
    if (previous !== JSON.stringify(room.clock.grace)) room.revision++;
  }
  if (room.status === 'finished') progressRematch(room, now);
  return true;
}
export function leaveView(room, id, now) {
  advanceRoom(room, now);
  return presence(room, id, false, now, { voluntary: true });
}
export function clientFeatures(room, id, features, now) {
  const ffaCapable=Array.isArray(features)&&features.includes('classic-ffa-v1');
  const classicFfaChanged=isClassicFfaRoom(room)&&room.participants[id].classicFfaCapable!==ffaCapable;
  if(classicFfaChanged){
    room.participants[id].classicFfaCapable=ffaCapable;room.presenceRevision++;
    if(room.status==='countdown'&&!ffaCapable){room.status='lobby';room.startsAt=null;touch(room,now);}
  }
  const arenaCapable=Array.isArray(features)&&features.includes(isArenaFfaRoom(room)?'arena-ffa-v1':arenaOneVsOne(room.config)?'arena-1v1-v1':'arena-duo-v1');
  const arenaChanged=isArenaRoom(room)&&room.participants[id].arenaCapable!==arenaCapable;
  if(arenaChanged){room.participants[id].arenaCapable=arenaCapable;if(room.status==='countdown'&&!arenaCapable){room.status='lobby';room.startsAt=null;touch(room,now);}}
  const player = room.participants[id], capable = Array.isArray(features) && features.includes('rematch-v1'), configured = Array.isArray(features) && features.includes('classic-config-v2');
  if (player.rematchCapable === capable && player.classicConfigCapable === configured&&!arenaChanged&&!classicFfaChanged) return;
  player.rematchCapable = capable; player.classicConfigCapable = configured; room.presenceRevision++;
  if (room.status === 'countdown' && needsConfigClient(room.config) && !configured) { room.status = 'lobby'; room.startsAt = null; touch(room, now); }
  if (room.status === 'finished') progressRematch(room, now);
}
export function reconcileRoom(room, offlineIds, now) {
  const events = [], wasCountdown = room.status === 'countdown' || room.status === 'finished' && room.rematch?.status === 'countdown';
  const disconnect = () => {
    for (const id of offlineIds) if (presence(room, id, false, now)) events.push({ type: 'disconnected', playerId: id, at: now });
  };
  // A delayed presence alarm must cancel a countdown before it starts a game.
  // During active play, first settle elapsed time, then grant any new grace.
  if (wasCountdown) disconnect();
  events.push(...advanceRoom(room, now));
  if (!wasCountdown) disconnect();
  return events;
}
export function applyCommand(room, playerId, command, now) {
  normalizeMatch(room);
  const p = room.participants[playerId], args = command.params ?? {};
  requireThat(p && !p.rejected && p.online, 'AUTH', 'Conecta tu sesión para actuar.', 403);
  requireThat(room.status !== 'expired', 'EXPIRED', 'La sala expiró.', 410);
  const host = p.id === room.hostId;
  if (command.type === 'rematch.propose' || command.type === 'rematch.respond') {
    rematchCommand(room, p, command, now, seated(room)); progressRematch(room, now);
  } else if (command.type === 'admit' || command.type === 'reject') {
    requireThat(host && room.status === 'lobby', 'PERMISSION', 'Solo el anfitrión administra el lobby.', 403);
    const target = room.participants[args.playerId];
    requireThat(target && !target.admitted && !target.rejected, 'PARTICIPANT', 'Solicitud no disponible.', 409);
    if (command.type === 'reject') target.rejected = true;
    else {
      requireThat(room.config.seats.includes(args.seat) && !seated(room).some(q => q.seat === args.seat), 'SEAT', 'Posición no disponible.', 409);
      target.admitted = true; target.seat = args.seat; target.ready = false;
    }
  } else if (command.type === 'ready') {
    requireThat(classicFfaCompatible(room,p),'UPDATE_REQUIRED',CONFIG_UPDATE_MESSAGE,409);
    requireThat(!isArenaRoom(room)||p.arenaCapable,'UPDATE_REQUIRED',ARENA_UPDATE,409);
    requireThat(!needsConfigClient(room.config) || p.classicConfigCapable, 'UPDATE_REQUIRED', CONFIG_UPDATE_MESSAGE, 409);
    requireThat(room.status === 'lobby' && p.admitted && typeof args.ready === 'boolean', 'READY', 'No puedes cambiar la preparación ahora.', 409);
    p.ready = args.ready;
  } else if (command.type === 'start') {
    requireThat(seated(room).every(q=>classicFfaCompatible(room,q)),'UPDATE_REQUIRED',CONFIG_UPDATE_MESSAGE,409);
    requireThat(!isArenaRoom(room)||seated(room).every(q=>q.arenaCapable),'UPDATE_REQUIRED',ARENA_UPDATE,409);
    requireThat(host && room.status === 'lobby', 'PERMISSION', 'Solo el anfitrión puede iniciar la partida.', 403);
    requireThat(!retiredClassicConfiguration(room.config), 'CONFIG_RETIRED', RETIRED_MESSAGE, 409);
    requireThat(seated(room).length === participantCount(room.config) && seated(room).every(q => q.online && q.ready), 'NOT_READY', `Se necesitan ${participantCount(room.config)} personas conectadas y listas.`, 409);
    requireThat(!needsConfigClient(room.config) || seated(room).every(q => q.classicConfigCapable), 'UPDATE_REQUIRED', CONFIG_UPDATE_MESSAGE, 409);
    room.status = 'countdown'; room.startsAt = now + COUNTDOWN_MS;
  } else if(command.type==='arena.action'){
    requireThat(isArenaRoom(room)&&p.arenaCapable,'UPDATE_REQUIRED',ARENA_UPDATE,409);
    requireThat(Object.keys(args).length===2&&Object.keys(args).every(k=>['action','matchId'].includes(k)),'PARAMS','Parámetros no admitidos.');
    checkMatch(room,args.matchId);requireThat(canDecide(room,playerId),'DECISION','Espera tu decisión para actuar.',403);
    const result=applyOnlineArena(room,p.seat,args.action);
    if(result.finished)finish(room,now,arenaOutcome(room));else{room.decision=arenaDecision(room);syncDecision(room,now);}
  } else if (['classic.step', 'classic.wall', 'classic.select'].includes(command.type)) {
    requireThat(!needsConfigClient(room.config) || p.classicConfigCapable, 'UPDATE_REQUIRED', CONFIG_UPDATE_MESSAGE, 409);
    requireThat(room.matchNumber === 1 || p.rematchCapable === true, 'UPDATE_REQUIRED', UPDATE_MESSAGE, 409);
    requireThat(Object.keys(args).every(key => [command.type === 'classic.select' ? 'actor' : 'to', 'matchId'].includes(key)), 'PARAMS', 'Parámetros de jugada no admitidos.');
    checkMatch(room, args.matchId, { legacy: true });
    requireThat(canDecide(room, playerId), 'DECISION', 'No te corresponde actuar con esta ficha.', 403);
    const result = applyClassic(room, p.seat, command.type, command.type === 'classic.select' ? { actor: args.actor } : { to: args.to });
    if (result.finished) finish(room, now, classicOutcome(room));
    else if (result.completedTurn) { room.decision = classicDecision(room); syncDecision(room, now); }
    else if (result.selected) { room.decision = classicDecision(room); room.decisionFingerprint = decisionFingerprint(room.decision); syncDecision(room, now); }
  } else if (command.type === 'probe.complete') {
    requireThat(canDecide(room, playerId) && room.decision.kind === 'probe', 'DECISION', 'No te corresponde completar esta decisión.', 403);
    room.probe.completed++; room.probe.decisions.push({ index: room.probe.completed, seat: p.seat, team: teamOf(p.seat), at: now });
    room.probe.decisions = room.probe.decisions.slice(-16);
    nextProbe(room); room.decision = normalDecision(room); syncDecision(room, now);
  } else if (command.type === 'probe.discard') {
    requireThat(room.config.mode === 'arena-duo' && room.config.policy === 'team' && canDecide(room, playerId) && room.decision.kind === 'probe', 'DECISION', 'Esta sonda necesita Arena por equipo y una decisión propia.', 403);
    const other = room.config.teams.find(t => t !== room.decision.team);
    room.decision = { kind: 'discard-probe', team: other, actor: null,
      eligible: seated(room).filter(q => teamOf(q.seat) === other).map(q => q.id), resume: room.decision };
    syncDecision(room, now);
  } else if (command.type === 'probe.resolve') {
    requireThat(canDecide(room, playerId) && room.decision.kind === 'discard-probe', 'DECISION', 'No te corresponde resolver esta decisión.', 403);
    room.decision = room.decision.resume; syncDecision(room, now);
  } else requireThat(false, 'COMMAND', 'Comando no disponible en M6.1.');
  if (command.type === 'classic.select') room.revision++; else touch(room, now);
  return { type: command.type, playerId, revision: room.revision, at: now };
}
export function publicRoom(room, playerId, now) {
  normalizeMatch(room);
  const self = room.participants[playerId];
  requireThat(self && !self.rejected, 'AUTH', 'Sesión no reconocida.', 401);
  const visible = seated(room).map(p => ({ id: p.id, name: p.name, seat: p.seat, team: teamOf(p.seat), ready: p.ready, online: p.online, rematchCapable: p.rematchCapable === true,
    classicConfigCapable: p.classicConfigCapable === true, ...(isClassicFfaRoom(room)?{classicFfaCapable:p.classicFfaCapable===true,eliminated:room.classic.game.eliminations.some(e=>e.team===p.seat),secured:!!room.classic.game.secured[p.seat]}:{}), ...(isArenaRoom(room)?{arenaCapable:p.arenaCapable===true,controlledPieces:arenaControlledPieces(room,p.seat),...(isArenaFfaRoom(room)?{eliminated:room.arena.eliminations.some(e=>e.team===p.seat)}:{})}:{}), ...(isClassicRoom(room) ? { controlledPieces: controlledPieces(room.config, p.seat) } : {}) }));
  const visibleIds = new Set(visible.map(p => p.id)), clock = publicClock(room.clock, now);
  clock.graceUsedMs = Object.fromEntries(Object.entries(clock.graceUsedMs).filter(([id]) => visibleIds.has(id)));
  clock.gracePlayers = clock.gracePlayers.filter(id => visibleIds.has(id));
  return { protocolVersion: room.protocolVersion, stage: isArenaRoom(room)?'M6.4':isClassicRoom(room) ? 'M6.2' : 'M6.1', code: room.code, config: room.config, status: room.status,
    revision: room.revision, presenceRevision: room.presenceRevision, serverNow: now, startsAt: room.startsAt, expiresAt: room.expiresAt,
    matchId: matchId(room), matchNumber: room.matchNumber, decisionId: room.decision ? `${matchId(room)}:${room.decisionSerial}` : null,
    rematch: room.rematch, previousResults: room.previousResults, configurationRetired: retiredClassicConfiguration(room.config),
    features: { rematch: (isClassicRoom(room)||isArenaRoom(room)) && !retiredClassicConfiguration(room.config), scopedMatches: true, viewAway: true },
    self: { id: self.id, name: self.name, admitted: self.admitted, seat: self.seat, host: self.id === room.hostId, generation: self.generation, ...(isClassicFfaRoom(room)?{eliminated:room.classic.game.eliminations.some(e=>e.team===self.seat),secured:!!room.classic.game.secured[self.seat]}:{}),
      ...(isArenaRoom(room)?{controlledPieces:arenaControlledPieces(room,self.seat),...(isArenaFfaRoom(room)?{eliminated:room.arena.eliminations.some(e=>e.team===self.seat)}:{})}:{}),
      ...(isClassicRoom(room) ? { controlledPieces: controlledPieces(room.config, self.seat) } : {}) },
    participants: visible, requests: self.id === room.hostId ? Object.values(room.participants).filter(p => !p.admitted && !p.rejected).map(p => ({ id: p.id, name: p.name, online: p.online })) : [],
    clock, lastActivityAt: room.lastActivityAt, decision: room.decision, probe: room.probe, outcome: room.outcome,
    canDecide: !!canDecide(room, playerId) && (!(arenaOneVsOne(room.config)||isArenaFfaRoom(room)) || self.arenaCapable === true), ...(isClassicRoom(room) ? { classic: classicView(room) } : {}), ...(isArenaRoom(room)?{arena:arenaView(room)}:{}) };
}
export function nextWake(room, now) {
  const candidates = [room.status === 'countdown' ? room.startsAt : null,
    room.status === 'active' ? room.clock.grace?.until : null, clockDeadline(room.clock),
    ['lobby', 'finished'].includes(room.status) ? room.expiresAt : null,
    room.status === 'finished' && ['pending', 'countdown'].includes(room.rematch?.status) ? room.rematch.expiresAt : null,
    room.status === 'finished' && room.rematch?.status === 'countdown' ? room.rematch.startsAt : null].filter(n => typeof n === 'number');
  return candidates.length ? Math.max(now + 1, Math.min(...candidates)) : null;
}
