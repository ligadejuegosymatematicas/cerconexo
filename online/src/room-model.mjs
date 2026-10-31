import { configuration, nameOf, requireThat, randomId, SCHEMA_VERSION, PROTOCOL_VERSION, BASE_SHA, RETENTION_MS, COUNTDOWN_MS } from './protocol.mjs';
import { createClock, registerClockPlayer, beginDisconnect, settleClock, chooseDecision, publicClock, clockDeadline } from './clocks.mjs';
import { isClassicRoom, createClassic, classicDecision, classicView, applyClassic, classicOutcome } from './classic-adapter.mjs';

export function createRoom({ code, name, mode, policy, tokenHash, probeOnly = false }, now) {
  const config = configuration(mode, policy), id = randomId();
  // Existing M6.1 rooms keep their persisted ruleset. Only the unit fixtures
  // construct new legacy probes; the HTTP API never forwards this flag.
  if (probeOnly && config.mode === 'classic') config.ruleset = 'm6.1-connection-probe-v1';
  const room = { schemaVersion: SCHEMA_VERSION, protocolVersion: PROTOCOL_VERSION, code, config, baseSha: BASE_SHA,
    status: 'lobby', revision: 1, presenceRevision: 0, hostId: id, createdAt: now, lastActivityAt: now,
    expiresAt: now + RETENTION_MS, startsAt: null, participants: {}, clock: createClock(config.teams, config.clockMs),
    decision: null, probe: { completed: 0, actorIndex: 0, eliminatedTeams: [], decisions: [] }, outcome: null };
  room.participants[id] = participant(id, name, tokenHash, now, true, config.seats[0]);
  if (isClassicRoom(room)) room.classic = createClassic();
  registerClockPlayer(room.clock, id);
  return room;
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
export function canDecide(room, id) { return room.status === 'active' && room.decision?.eligible.includes(id); }
function normalDecision(room) {
  if (isClassicRoom(room)) return classicDecision(room);
  const seat = room.config.seats[room.probe.actorIndex], team = teamOf(seat);
  const eligible = seated(room).filter(p => room.config.policy === 'team' ? teamOf(p.seat) === team : p.seat === seat).map(p => p.id);
  return { kind: 'probe', team, actor: room.config.policy === 'team' ? null : seat, eligible };
}
function syncDecision(room, now) { chooseDecision(room.clock, room.decision, room.participants, now); }
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
  room.status = 'finished'; room.outcome = outcome; room.decision = null; room.startsAt = null;
  chooseDecision(room.clock, null, room.participants, now); room.expiresAt = now + RETENTION_MS;
}
export function advanceRoom(room, now) {
  const events = [];
  if ((room.status === 'lobby' || room.status === 'finished') && now >= room.expiresAt) {
    room.status = 'expired'; room.decision = null; chooseDecision(room.clock, null, room.participants, now);
    touch(room, now); events.push({ type: 'expired' }); return events;
  }
  if (room.status === 'countdown' && now >= room.startsAt) {
    if (seated(room).length !== 4 || seated(room).some(p => !p.online || !p.ready)) {
      room.status = 'lobby'; room.startsAt = null; room.expiresAt = now + RETENTION_MS; events.push({ type: 'countdown-cancelled' });
    } else {
      room.status = 'active'; room.startsAt = null; room.decision = normalDecision(room); syncDecision(room, now); events.push({ type: isClassicRoom(room) ? 'game-started' : 'probe-started' });
    }
    touch(room, now);
  }
  if (room.status === 'active') {
    const hadGrace = !!room.clock.grace, expired = settleClock(room.clock, now);
    if (hadGrace && !room.clock.grace) { room.revision++; events.push({ type: 'grace-ended' }); }
    if (expired) {
      events.push({ type: 'clock-expired', team: expired.team, deadline: expired.at });
      if (isClassicRoom(room)) finish(room, now, classicOutcome(room, expired.team));
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
export function presence(room, id, online, now) {
  const player = room.participants[id];
  if (!player || player.rejected || player.online === online) return false;
  player.online = online; player.lastSeenAt = now; room.presenceRevision++;
  if (!online) beginDisconnect(room.clock, id);
  if (!online && room.status === 'countdown' && player.admitted) { room.status = 'lobby'; room.startsAt = null; room.expiresAt = now + RETENTION_MS; room.revision++; }
  if (room.status === 'active') {
    const previous = JSON.stringify(room.clock.grace);
    syncDecision(room, now);
    if (previous !== JSON.stringify(room.clock.grace)) room.revision++;
  }
  return true;
}
export function reconcileRoom(room, offlineIds, now) {
  const events = [], wasCountdown = room.status === 'countdown';
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
  const p = room.participants[playerId], args = command.params ?? {};
  requireThat(p && !p.rejected && p.online, 'AUTH', 'Conecta tu sesión para actuar.', 403);
  requireThat(room.status !== 'expired', 'EXPIRED', 'La sala expiró.', 410);
  const host = p.id === room.hostId;
  if (command.type === 'admit' || command.type === 'reject') {
    requireThat(host && room.status === 'lobby', 'PERMISSION', 'Solo el anfitrión administra el lobby.', 403);
    const target = room.participants[args.playerId];
    requireThat(target && !target.admitted && !target.rejected, 'PARTICIPANT', 'Solicitud no disponible.', 409);
    if (command.type === 'reject') target.rejected = true;
    else {
      requireThat(room.config.seats.includes(args.seat) && !seated(room).some(q => q.seat === args.seat), 'SEAT', 'Posición no disponible.', 409);
      target.admitted = true; target.seat = args.seat; target.ready = false;
    }
  } else if (command.type === 'ready') {
    requireThat(room.status === 'lobby' && p.admitted && typeof args.ready === 'boolean', 'READY', 'No puedes cambiar la preparación ahora.', 409);
    p.ready = args.ready;
  } else if (command.type === 'start') {
    requireThat(host && room.status === 'lobby', 'PERMISSION', 'Solo el anfitrión puede iniciar la partida.', 403);
    requireThat(seated(room).length === 4 && seated(room).every(q => q.online && q.ready), 'NOT_READY', 'Se necesitan cuatro personas conectadas y listas.', 409);
    room.status = 'countdown'; room.startsAt = now + COUNTDOWN_MS;
  } else if (command.type === 'classic.step' || command.type === 'classic.wall') {
    requireThat(canDecide(room, playerId), 'DECISION', 'No te corresponde actuar con esta ficha.', 403);
    const result = applyClassic(room, p.seat, command.type, args);
    if (result.finished) finish(room, now, classicOutcome(room));
    else if (result.completedTurn) { room.decision = classicDecision(room); syncDecision(room, now); }
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
  touch(room, now);
  return { type: command.type, playerId, revision: room.revision, at: now };
}
export function publicRoom(room, playerId, now) {
  const self = room.participants[playerId];
  requireThat(self && !self.rejected, 'AUTH', 'Sesión no reconocida.', 401);
  const visible = seated(room).map(p => ({ id: p.id, name: p.name, seat: p.seat, team: teamOf(p.seat), ready: p.ready, online: p.online }));
  const visibleIds = new Set(visible.map(p => p.id)), clock = publicClock(room.clock, now);
  clock.graceUsedMs = Object.fromEntries(Object.entries(clock.graceUsedMs).filter(([id]) => visibleIds.has(id)));
  clock.gracePlayers = clock.gracePlayers.filter(id => visibleIds.has(id));
  return { protocolVersion: room.protocolVersion, stage: isClassicRoom(room) ? 'M6.2' : 'M6.1', code: room.code, config: room.config, status: room.status,
    revision: room.revision, presenceRevision: room.presenceRevision, serverNow: now, startsAt: room.startsAt, expiresAt: room.expiresAt,
    self: { id: self.id, name: self.name, admitted: self.admitted, seat: self.seat, host: self.id === room.hostId, generation: self.generation },
    participants: visible, requests: self.id === room.hostId ? Object.values(room.participants).filter(p => !p.admitted && !p.rejected).map(p => ({ id: p.id, name: p.name, online: p.online })) : [],
    clock, lastActivityAt: room.lastActivityAt, decision: room.decision, probe: room.probe, outcome: room.outcome,
    canDecide: !!canDecide(room, playerId), ...(isClassicRoom(room) ? { classic: classicView(room) } : {}) };
}
export function nextWake(room, now) {
  const candidates = [room.status === 'countdown' ? room.startsAt : null,
    room.status === 'active' ? room.clock.grace?.until : null, clockDeadline(room.clock),
    ['lobby', 'finished'].includes(room.status) ? room.expiresAt : null].filter(n => typeof n === 'number');
  return candidates.length ? Math.max(now + 1, Math.min(...candidates)) : null;
}
