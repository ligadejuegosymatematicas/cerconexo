export function decisionNoticeKey(state) {
  const decision = state?.decision, id = state?.self?.id;
  if (state?.status !== 'active' || !state.canDecide || !decision?.eligible?.includes(id)) return null;
  const match = state.matchId ?? `${state.code}:1`;
  return `${match}:${state.decisionId ?? decision.id ?? JSON.stringify([state.classic?.game.moves, decision.kind, decision.actor, decision.team])}`;
}
export function createDecisionNotice({ show, pulse = () => {}, visible = () => !document.hidden, storage } = {}) {
  if (storage === undefined) { try { storage = globalThis.sessionStorage; } catch {} }
  const seen = new Set();
  return { update(state, connected = true) {
    const key = decisionNoticeKey(state);
    if (!key || !connected || !visible()) return false;
    const scope = `cerconexo-online-notice-v1:${state.code}:${state.self.id}`;
    let stored = [];
    try { stored = JSON.parse(storage?.getItem(scope) ?? '[]'); } catch {}
    if (seen.has(key) || Array.isArray(stored) && stored.includes(key)) return false;
    seen.add(key);
    try { storage?.setItem(scope, JSON.stringify([...(Array.isArray(stored) ? stored : []), key].slice(-32))); } catch {}
    const discard = /discard|descarte/.test(state.decision.kind);
    const actor = state.decision.actor ?? (state.decision.selecting ? `equipo ${state.decision.team}` : state.self.seat);
    show(discard ? `¡Tu descarte, ${state.self.seat ?? `equipo ${state.decision.team}`}!` : `¡Tu turno, ${actor}!`, state);
    pulse('turn'); return true;
  } };
}
