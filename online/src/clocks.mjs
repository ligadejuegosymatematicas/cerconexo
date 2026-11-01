import { GRACE_INCIDENT_MS, GRACE_TOTAL_MS } from './protocol.mjs';

// Pure clock component. No board, browser timers, storage or client timestamps.
export function createClock(teams, clockMs) {
  return { remainingMs: Object.fromEntries(teams.map(team => [team, clockMs])), owner: null,
    anchoredAt: null, grace: null, players: {} };
}
export function registerClockPlayer(clock, id) {
  clock.players[id] ??= { usedMs: 0, incident: 0, until: null };
}
export function beginDisconnect(clock, id) {
  registerClockPlayer(clock, id);
  clock.players[id].incident++;
  clock.players[id].until = null;
}
export function settleClock(clock, now) {
  if (clock.owner === null || clock.anchoredAt === null) return null;
  // A backwards wall-clock adjustment cannot refund time.
  now = Math.max(now, clock.anchoredAt);
  const from = clock.anchoredAt;
  let paused = 0;
  if (clock.grace) {
    paused = Math.max(0, Math.min(now, clock.grace.until) - from);
    for (const id of clock.grace.players) {
      const entry = clock.players[id];
      const debit = Math.max(0, Math.min(now, clock.grace.until, entry.until) - from);
      entry.usedMs = Math.min(GRACE_TOTAL_MS, entry.usedMs + debit);
    }
  }
  const elapsed = now - from - paused;
  const before = clock.remainingMs[clock.owner];
  clock.remainingMs[clock.owner] = Math.max(0, before - elapsed);
  clock.anchoredAt = now;
  if (clock.grace && now >= clock.grace.until) clock.grace = null;
  return elapsed >= before ? { team: clock.owner, at: from + paused + before } : null;
}
export function chooseDecision(clock, decision, participants, now) {
  clock.owner = decision?.team ?? null;
  clock.anchoredAt = decision ? now : null;
  clock.grace = null;
  if (!decision || decision.eligible.some(id => participants[id]?.online)) return;
  const candidates = [];
  for (const id of decision.eligible) {
    registerClockPlayer(clock, id);
    const entry = clock.players[id];
    if (entry.usedMs >= GRACE_TOTAL_MS) continue;
    // One wall-clock window per actual disconnect incident, also across decisions.
    entry.until ??= now + Math.min(GRACE_INCIDENT_MS, GRACE_TOTAL_MS - entry.usedMs);
    const until = Math.min(entry.until, now + GRACE_TOTAL_MS - entry.usedMs);
    if (until > now) candidates.push({ id, until });
  }
  if (candidates.length) clock.grace = { players: candidates.map(p => p.id), until: Math.max(...candidates.map(p => p.until)) };
}
export function clockDeadline(clock) {
  if (clock.owner === null || clock.anchoredAt === null) return null;
  const resumeAt = Math.max(clock.anchoredAt, clock.grace?.until ?? clock.anchoredAt);
  return resumeAt + clock.remainingMs[clock.owner];
}
export function publicClock(clock, now) {
  const view = structuredClone(clock);
  settleClock(view, now);
  return { remainingMs: view.remainingMs, owner: view.owner, anchoredAt: now,
    graceUntil: view.grace?.until ?? null, gracePlayers: view.grace?.players ?? [], deadline: clockDeadline(view),
    graceUsedMs: Object.fromEntries(Object.entries(view.players).map(([id, player]) => [id, player.usedMs])) };
}
