export function mountRematch({ container, propose, status, session }) {
  const panel = document.createElement('section'); panel.className = 'online-rematch'; panel.hidden = true;
  panel.setAttribute('aria-label', 'Solicitud de revancha');
  panel.innerHTML = '<strong>¿Jugamos la revancha?</strong><p data-rematch-caption role="status" aria-live="polite"></p><ul data-rematch-votes></ul><div class="online-rematch-actions"><button data-rematch-accept>Aceptar</button><button data-rematch-reject>Rechazar</button></div>';
  container.append(panel);
  const $ = name => panel.querySelector(`[data-rematch-${name}]`), rows = new Map();
  let state;
  function send(type, params) { try { session.command(type, params); } catch (error) { status.textContent = error.message; } }
  const offer = () => send('rematch.propose', { matchId: state.matchId });
  const respond = accept => send('rematch.respond', { matchId: state.matchId, proposalId: state.rematch.id, accept });
  propose.addEventListener('click', offer); $('accept').addEventListener('click', () => respond(true)); $('reject').addEventListener('click', () => respond(false));
  function tick(now) {
    if (panel.hidden || !state?.rematch) return;
    const proposal = state.rematch, votes = state.participants.filter(p => proposal.votes[p.id] === true).length;
    const count = state.config.playerCount ?? state.config.seats.length, configClient = count === 2 || state.config.policy === 'team';
    const outdated = state.participants.filter(p => p.rematchCapable === false || state.arena&&!p.arenaCapable || configClient && !p.classicConfigCapable);
    const text = proposal.status === 'countdown' ? `Comenzamos en ${Math.max(1, Math.ceil((proposal.startsAt - now) / 1000))}…`
      : outdated.length ? `${votes} de ${count} aceptaron · ${outdated.map(p => p.seat).join(', ')} debe actualizar la página.`
      : votes === count ? 'Todos aceptaron. Esperando a los participantes desconectados.' : `${votes} de ${count} aceptaron · Esperando respuesta.`;
    if ($('caption').textContent !== text) $('caption').textContent = text;
  }
  return { update(next, now) {
    state = next; const proposal = state.rematch, available = state.features?.rematch && state.status === 'finished';
    const pending = available && ['pending', 'countdown'].includes(proposal?.status);
    const enabled = session.phase === 'connected' && !session.pending;
    propose.hidden = !available || !state.self.host;
    propose.disabled = !enabled || pending || state.matchNumber >= 20;
    panel.hidden = !pending;
    status.textContent = proposal?.status === 'rejected' ? `Revancha rechazada por ${state.participants.find(p => p.id === proposal.rejectedBy)?.name ?? 'un participante'}. Se conserva el resultado.`
      : proposal?.status === 'expired' ? 'La propuesta caducó. Se conserva el resultado; puede proponerse otra revancha.' : '';
    status.hidden = !status.textContent;
    if (!pending) return;
    for (const p of state.participants) {
      if (!rows.has(p.id)) { const row = document.createElement('li'); row.dataset.rematchPlayer = p.seat; rows.set(p.id, row); $('votes').append(row); }
      const vote = proposal.votes[p.id]; rows.get(p.id).textContent = `${p.seat} · ${p.name}: ${vote === true ? 'Aceptó' : 'Pendiente'}${p.online ? '' : ' · Sin conexión'}${p.rematchCapable === false ? ' · Actualizar página' : ''}`;
    }
    $('accept').hidden = proposal.votes[state.self.id] === true; $('accept').disabled = !enabled;
    $('reject').textContent = state.self.host ? 'Cancelar propuesta' : proposal.votes[state.self.id] ? 'Retirar aceptación' : 'Rechazar'; $('reject').disabled = !enabled;
    tick(now);
  }, tick, destroy() { propose.removeEventListener('click', offer); panel.remove(); } };
}
