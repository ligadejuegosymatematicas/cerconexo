import { createBoardView } from '../src/boardView.mjs';
import { createHaptics } from '../src/haptics.mjs';
import { createDecisionNotice, decisionNoticeKey } from './decision-notice.mjs';
import { createFinalInspection } from './final-inspection.mjs';
import { mountRematch } from './rematch-panel.mjs';

const PHASES = {
  idle: 'Sin conexión', connecting: 'Conectando', connected: 'Conectado',
  reconnecting: 'Recuperando sesión', disconnected: 'Desconectado',
  replaced: 'Sesión abierta en otra ventana', rejected: 'Sesión no admitida', expired: 'Sala expirada'
};
const SEATS = ['A1', 'A2', 'B1', 'B2'];
const isActive = state => state?.status === 'active';
const isFinished = state => state?.status === 'finished';
const timeText = ms => {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
};
function write(node, value) {
  const text = String(value ?? '');
  if (node.textContent !== text) node.textContent = text;
}
function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
function loadStyles() {
  if (document.querySelector('link[data-classic-styles]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet'; link.href = new URL('./classic.css', import.meta.url).href; link.dataset.classicStyles = '';
  document.head.append(link);
}

/** Online presentation only. The authoritative game and draft always come from the session. */
export function mountClassic(container, session) {
  loadStyles();
  const root = node('section', 'classic-online');
  root.setAttribute('aria-label', 'Cerconexo Clásico online');
  root.dataset.classicView = '';
  root.innerHTML = `
    <header class="classic-header topbar">
      <div class="classic-brand branding"><img class="official-logo" src="${new URL('../assets/Cerconexo_wordmark_transparente.png', import.meta.url).href}" alt="CERCONEXO"><span>CLÁSICO <small data-classic-format>ONLINE</small></span></div>
      <div class="classic-room-tools">
        <div class="classic-room-meta"><span>Sala <strong data-classic-code></strong></span><span class="classic-connection" data-classic-connection role="status"></span></div>
        <button type="button" data-classic-invite hidden>Invitar</button><details class="classic-actions-menu" data-classic-actions-menu><summary aria-label="Opciones de la partida">⋯</summary><div class="classic-session-actions"><button type="button" data-classic-reconnect>Reconectar</button><details class="classic-access"><summary>Mi acceso</summary><button type="button" data-classic-copy-access>Copiar mi acceso privado</button><button type="button" data-classic-disconnect>Desconectar este navegador</button></details></div></details>
      </div>
    </header>
    <div class="classic-table">
      <section class="classic-arena arena" aria-label="Mesa de juego">
        <div class="classic-board-topline board-topline"><span>Tablero</span><span data-classic-board-meta>7 × 7 · 49 casillas</span></div>
        <div class="classic-board-wrap board-wrap"><svg id="board" data-classic-board viewBox="28 20 624 624" role="group" aria-label="Tablero Cerconexo de siete por siete casillas" aria-describedby="classicBoardHelp"></svg><p class="online-turn-notice" data-classic-turn-notice role="status" aria-live="polite" hidden></p></div>
        <p class="classic-board-help" data-classic-board-help id="classicBoardHelp"></p>
        <p class="online-inspection-info" data-classic-inspection-info role="status" aria-live="polite" hidden></p>
      </section>
      <aside class="classic-sidebar" aria-label="Partida y participantes">
        <section class="classic-turn panel" aria-label="Turno actual">
          <div class="classic-turn-heading"><h2 class="micro" data-classic-turn-heading>AHORA JUEGA</h2><span class="classic-progress" data-classic-progress></span></div>
          <div class="classic-turn-identity"><span class="turn-disc" data-classic-actor></span><div><strong data-classic-turn-name></strong><span data-classic-turn-seat></span></div></div>
          <p class="classic-self" data-classic-self></p>
          <p class="classic-prompt" data-classic-prompt role="status" aria-live="polite" aria-atomic="true"></p>
          <div class="classic-result" data-classic-result role="status" aria-live="polite" aria-atomic="true" hidden><h2 data-classic-result-title></h2><p data-classic-result-detail></p><strong data-classic-result-score></strong><button data-classic-propose-rematch hidden>Proponer revancha</button><p data-classic-rematch-status role="status" hidden></p></div>
        </section>
        <section class="classic-clocks panel" aria-label="Tiempo de los equipos">
          <div class="classic-clock-grid" data-classic-clocks></div>
          <p class="classic-grace" data-classic-grace role="status" aria-live="polite" hidden></p>
          <p class="classic-clock-note" hidden>8 minutos por equipo</p>
          <p class="classic-clock-note" data-classic-idle-warning role="status" hidden>Tu reloj sigue corriendo.</p>
        </section>
        <details class="classic-secondary panel" data-classic-secondary><summary><strong data-classic-summary-score>A 0 · 0 B</strong><span data-classic-summary-presence>Jugadores</span><span>Detalles</span></summary><section class="classic-scores score-panel" aria-label="Marcadores y participantes">
          <div class="classic-score-heading section-heading"><h2 class="micro" data-classic-score-heading>CASILLAS ASEGURADAS</h2><span class="subtle">49 en total</span></div>
          <div class="scores" data-classic-scores></div>
          <div class="territory-meter" data-classic-meter role="img" aria-label="Distribución de las 49 casillas"></div>
          <div class="minor-stats"><span><i class="status-swatch disputed" aria-hidden="true"></i>En disputa <strong data-classic-mixed>49</strong></span><span><i class="status-swatch empty" aria-hidden="true"></i>Vacías <strong data-classic-empty>0</strong></span></div>
          <p class="classic-regions" data-classic-regions></p>
        </section></details>
        <details class="classic-history panel" data-classic-history hidden><summary>Resultados anteriores</summary><ul data-classic-history-list></ul></details>
        <details class="classic-guide legend-panel panel"><summary>Guía del tablero</summary><div class="legend-content board-legend"><div><span class="legend-dot" aria-hidden="true"></span><span>Punto turquesa <b>Dar un paso · máximo dos</b></span></div><div><span class="legend-gold" aria-hidden="true"></span><span>Borde dorado <b>Construir y cerrar el turno</b></span></div><div><span class="legend-solid" aria-hidden="true"></span><span>Muro construido <b>No se puede atravesar</b></span></div><div><span class="classic-secured-symbol" aria-hidden="true">✓</span><span>Ficha asegurada <b>Su región ya es de su equipo</b></span></div></div><p>Los pasos se confirman al instante. Puedes construir sin desplazarte. Cada persona controla solo su ficha.</p></details>
      </aside>
    </div>
    <details class="classic-preferences panel"><summary>Preferencias</summary><label><input type="checkbox" data-classic-vibration> Vibración de turno</label><p data-classic-vibration-info></p></details>
    <p class="classic-message" data-classic-message role="status" aria-live="polite" hidden></p>`;
  container.append(root);
  const $ = name => root.querySelector(`[data-classic-${name}]`);
  const board = $('board'), view = createBoardView(board);
  const inspection = createFinalInspection({ board, info: $('inspection-info') }), haptics = createHaptics();
  const mobile = matchMedia('(max-width:700px)');
  const adapt = () => { $('secondary').open = !mobile.matches; $('actions-menu').open = false; };
  adapt(); mobile.addEventListener('change', adapt);
  let keyboard = !(matchMedia('(pointer:coarse)').matches || navigator.maxTouchPoints > 0);
  const modeKey = event => { if (['Tab', 'Enter', ' '].includes(event.key) || event.key.startsWith('Arrow')) { keyboard = true; help(); } };
  const modePointer = event => { if (['touch', 'pen'].includes(event.pointerType)) { keyboard = false; help(); } };
  document.addEventListener('keydown', modeKey, true); root.addEventListener('pointerdown', modePointer);
  $('vibration').checked = haptics.enabled; $('vibration').disabled = !haptics.supported;
  $('vibration-info').textContent = !haptics.supported ? 'Este navegador no permite vibración.' : haptics.paused ? 'Reducir movimiento está activo: no se vibrará.' : 'Se utiliza solo cuando el navegador lo permite.';
  $('vibration').addEventListener('change', () => haptics.setEnabled($('vibration').checked));
  const scoreNodes = {}, players = {}, clocks = {};
  for (const team of ['A', 'B']) {
    const card = node('section', `team-score team-${team.toLowerCase()}`);
    card.setAttribute('aria-label', `Marcador y participantes del equipo ${team}`);
    const heading = node('div', 'team-heading');
    const value = node('strong', '', '0'); value.dataset.classicScore = team;
    heading.append(node('span', 'team-badge', team), node('h3', '', `Equipo ${team}`), value);
    const roster = node('div', 'team-roster');
    for (const seat of SEATS.filter(id => id[0] === team)) {
      const row = node('div', 'classic-player player'); row.dataset.classicPlayer = seat;
      const info = node('div', 'classic-player-info');
      const name = node('strong', 'classic-player-name');
      const status = node('span', 'player-state');
      info.append(name, status);
      const presence = node('span', 'classic-presence'); presence.setAttribute('aria-hidden', 'true');
      row.append(node('span', 'player-id', seat), info, presence); roster.append(row);
      players[seat] = { row, name, status, presence };
    }
    card.append(heading, roster); $('scores').append(card); scoreNodes[team] = value;
    const clock = node('div', 'classic-clock'); clock.dataset.classicClock = team;
    const top = node('div', 'classic-clock-top');
    const status = node('span', 'classic-clock-status'); top.append(node('span', '', `Equipo ${team}`), status);
    const time = node('strong', 'classic-clock-value', '--:--');
    time.setAttribute('role', 'timer'); time.setAttribute('aria-live', 'off');
    clock.append(top, time); $('clocks').append(clock); clocks[team] = { clock, status, time };
  }
  const units = Array.from({ length: 49 }, () => {
    const unit = node('span', 'territory-unit unit-mixed'); unit.setAttribute('aria-hidden', 'true'); $('meter').append(unit); return unit;
  });
  if (document.body.classList.contains('integrated-online')) {
    const home = node('a', '', 'Inicio'); home.href = new URL('../', import.meta.url).href; home.setAttribute('aria-label', 'Volver al inicio de Cerconexo');
    root.querySelector('.classic-session-actions').prepend(home);
  }
  let state = null, receivedAt = performance.now(), boardKey = '', destroyed = false, lastGrace = false;
  let noticeTimer, historyKey = '';
  const rematch = mountRematch({ container: root.querySelector('.classic-board-wrap'), propose: $('propose-rematch'), status: $('rematch-status'), session });
  const notice = createDecisionNotice({ pulse: event => haptics.pulse(event), show(text, next) {
    clearTimeout(noticeTimer); write($('turn-notice'), text); $('turn-notice').hidden = false;
    for (const target of root.querySelectorAll('[data-turn-notice]')) target.removeAttribute('data-turn-notice');
    for (const id of next.self.controlledPieces ?? [next.self.seat]) if (id[0] === next.decision.team) view.token(id)?.setAttribute('data-turn-notice', 'true');
    clocks[next.decision.team]?.clock.setAttribute('data-turn-notice', 'true');
    noticeTimer = setTimeout(() => { $('turn-notice').hidden = true; for (const target of root.querySelectorAll('[data-turn-notice]')) target.removeAttribute('data-turn-notice'); }, 2200);
  } });
  function help() {
    if (!state) return;
    write($('board-help'), isFinished(state) ? keyboard ? 'Inspección: flechas para recorrer; Enter o Espacio para seleccionar.' : 'Toca una región para consultar sus casillas y puntos.'
      : state.decision?.selecting ? keyboard ? 'Tab para recorrer tus fichas; Enter o Espacio para elegir.' : 'Toca una de tus fichas activas para elegirla.'
      : keyboard ? 'Tab para recorrer; Enter o Espacio para elegir.' : 'Toca puntos turquesa para avanzar o bordes dorados para construir.');
  }

  function message(text = '') { write($('message'), text); $('message').hidden = !text; }
  function actorOf(current = state) { return current?.decision?.actor ?? current?.classic?.draft?.actor ?? current?.classic?.game?.currentActor; }
  function owned(current = state) { return current?.self.controlledPieces ?? (current?.self.seat ? [current.self.seat] : []); }
  function participantFor(actor) { return state.participants.find(p => (p.controlledPieces ?? [p.seat]).includes(actor)); }
  function canControl() { return !!(isActive(state) && state.classic && state.canDecide && session.phase === 'connected' && !session.pending && state.decision?.kind === 'classic'); }
  function canAct() {
    const actor = actorOf(), draftActor = state?.classic?.draft?.actor ?? state?.classic?.game?.currentActor;
    return !!(canControl() && owned().includes(actor) && draftActor === actor);
  }
  function now() {
    return (state?.serverNow ?? Date.now()) + Math.max(0, performance.now() - receivedAt);
  }
  function paintClocks() {
    if (destroyed || !state?.clock) return;
    const current = now(), clock = state.clock;
    if (session.phase === 'connected') write($('connection'), session.recoveredAt !== null && performance.now() - session.recoveredAt < 3000 ? 'Conectado · recuperado' : 'Conectado');
    rematch.tick(current);
    $('idle-warning').hidden = !isActive(state) || current - state.lastActivityAt < 60000;
    const anchor = state.serverNow ?? clock.anchoredAt ?? current;
    const pausedUntil = clock.graceUntil ?? anchor;
    const grace = isActive(state) && current < pausedUntil;
    for (const team of ['A', 'B']) {
      const running = isActive(state) && clock.owner === team;
      const elapsed = running ? Math.max(0, current - Math.max(anchor, pausedUntil)) : 0;
      const remaining = Math.max(0, (clock.remainingMs?.[team] ?? 0) - elapsed);
      const entry = clocks[team];
      entry.clock.dataset.running = String(running && !grace);
      entry.clock.dataset.low = String(remaining < 60000);
      write(entry.time, timeText(remaining));
      entry.time.setAttribute('aria-label', `Tiempo del equipo ${team}: ${timeText(remaining)}`);
      write(entry.status, isFinished(state) ? (state.outcome?.timedOutTeam === team ? 'Sin tiempo' : 'Finalizado') : running ? (grace ? 'Pausa' : 'En curso') : 'En espera');
    }
    $('grace').hidden = !grace;
    // Announce only the change of grace state, not a countdown every 200 ms.
    if (grace !== lastGrace) {
      write($('grace'), grace ? 'Pausa de cortesía por desconexión. El reloj se reanudará automáticamente.' : '');
      lastGrace = grace;
    }
  }
  function paintTurn() {
    const finished = isFinished(state), actor = actorOf();
    const participant = participantFor(actor);
    const steps = Math.max(0, (state.classic?.draft?.path?.length ?? 1) - 1);
    const seat = state.self?.seat, active = new Set(state.classic?.activeIds ?? []);
    root.dataset.finished = String(finished);
    root.dataset.canAct = String(canControl());
    root.dataset.pending = String(!!session.pending);
    root.dataset.team = actor?.[0] ?? '';
    write($('code'), state.code ?? session.code);
    write($('connection'), PHASES[session.phase] ?? 'Sin conexión'); $('connection').dataset.phase = session.phase;
    $('reconnect').hidden = session.phase === 'connected';
    $('reconnect').disabled = ['connecting', 'reconnecting'].includes(session.phase);
    $('disconnect').hidden = !['connected', 'connecting', 'reconnecting'].includes(session.phase);
    $('invite').hidden = true;
    write($('format'), `ONLINE · ${(state.config.playerCount ?? state.config.seats.length) === 2 ? '1 VS. 1' : '2 VS. 2'}${(state.config.playerCount ?? state.config.seats.length) === 2 ? ' · '+(state.config.policy === 'team' ? 'POR EQUIPO' : 'POR FICHA') : ''}`);
    write($('self'), seat ? `Tú: ${state.self.name ?? 'Participante'} · ${owned().join(' y ')} · Equipo ${seat[0]}${owned().every(id => !active.has(id)) ? ' · Fichas aseguradas ✓' : ''}` : 'Observas esta partida');
    write($('turn-heading'), finished ? 'PARTIDA FINALIZADA' : 'AHORA JUEGA');
    write($('progress'), finished ? `${state.classic?.game?.moves ?? 0} muros` : `${steps} / 2 pasos`);
    $('actor').parentElement.hidden = finished;
    write($('actor'), actor ?? state.decision?.team ?? '—'); $('actor').dataset.team = actor?.[0] ?? state.decision?.team ?? '';
    write($('turn-name'), owned().includes(actor) ? 'Tu turno' : participant?.name ?? (state.decision?.selecting ? state.canDecide ? 'Elige tu ficha' : `Equipo ${state.decision.team} elige ficha` : actor ? `Turno de ${actor}` : 'Esperando partida'));
    write($('turn-seat'), actor ? `${actor} · Equipo ${actor[0]}` : 'Selecciona una ficha activa');
    $('result').hidden = !finished;
    $('prompt').hidden = finished;
    if (finished) {
      const outcome = state.outcome ?? {}, winners = outcome.winners ?? [];
      const score = outcome.score ?? state.classic.territory.score;
      write($('result-title'), winners.length === 1 ? `Gana el equipo ${winners[0]}` : 'Empate');
      write($('result-detail'), outcome.reason === 'timeout' ? `El equipo ${outcome.timedOutTeam ?? outcome.losers?.[0] ?? '?'} agotó su tiempo.` : 'Todas las regiones están resueltas.');
      write($('result-score'), `Equipo A ${score.A} · ${score.B} Equipo B`);
      return;
    }
    let prompt;
    if (session.phase !== 'connected') prompt = 'Reconecta para continuar. Tu partida sigue en curso.';
    else if (session.pending) prompt = 'Enviando jugada…';
    else if (canControl() && state.decision.selecting) prompt = 'Selecciona una de tus fichas para jugar.';
    else if (canAct()) prompt = steps === 2 ? 'Construye un muro para terminar tu turno.'
      : steps === 1 ? 'Puedes dar otro paso o construir un muro.'
      : 'Construye un muro dorado o da hasta dos pasos por los puntos turquesa.';
    else if (seat && owned().every(id => !active.has(id))) prompt = 'Tus fichas tienen territorio asegurado. Sigue la partida de tu equipo.';
    else if (state.config.policy === 'team' && actor && actor[0] === seat?.[0]) prompt = `Turno reservado para ${participant?.name ?? actor} · ${actor}. Espera a que complete su muro.`;
    else prompt = actor ? `Turno de ${participant?.name ?? actor} · ${actor}` : 'Esperando para comenzar.';
    write($('prompt'), prompt);
  }
  function paintScores() {
    const classic = state.classic, score = classic.territory?.score ?? state.outcome?.score;
    if (!score) return;
    write($('summary-score'), `A ${score.A} · ${score.B} B`);
    write($('summary-presence'), `${state.participants.filter(p => p.online).length}/${state.config.playerCount ?? state.config.seats.length} conectados`);
    const actor = actorOf(), active = new Set(classic.activeIds ?? []);
    for (const team of ['A', 'B']) {
      write(scoreNodes[team], score[team]);
      scoreNodes[team].setAttribute('aria-label', `${score[team]} casillas aseguradas por el equipo ${team}`);
    }
    write($('score-heading'), isFinished(state) && state.outcome?.reason === 'territory' ? 'CASILLAS DEFINITIVAS' : 'CASILLAS ASEGURADAS');
    write($('mixed'), score.mixed); write($('empty'), score.empty);
    const distribution = ['A', 'mixed', 'empty', 'B'].flatMap(type => Array(Math.max(0, Math.min(49, Number(score[type]) || 0))).fill(type));
    units.forEach((unit, i) => { const type = distribution[i] ?? 'mixed'; if (unit.dataset.type !== type) { unit.className = `territory-unit unit-${type}`; unit.dataset.type = type; } });
    $('meter').setAttribute('aria-label', `Casillas: equipo A ${score.A}, equipo B ${score.B}, en disputa ${score.mixed}, vacías ${score.empty}`);
    const components = classic.territory?.components ?? [];
    write($('regions'), `${components.length} ${components.length === 1 ? 'región' : 'regiones'} · ${classic.game.moves} ${classic.game.moves === 1 ? 'muro construido' : 'muros construidos'}`);
    for (const seat of SEATS) {
      const { row, name, status, presence } = players[seat];
      const participant = participantFor(seat);
      const own = owned().includes(seat), secured = !active.has(seat), current = !isFinished(state) && actor === seat;
      const label = secured ? 'Asegurada ✓' : current ? 'Juega ahora' : 'En juego';
      write(name, `${participant?.name ?? seat}${own ? ' · Tú' : ''}`); write(status, label);
      row.classList.toggle('is-current', current); row.classList.toggle('is-isolated', secured); row.classList.toggle('is-self', own);
      row.dataset.online = String(!!participant?.online);
      if (current) row.setAttribute('aria-current', 'true'); else row.removeAttribute('aria-current');
      row.setAttribute('aria-label', `${seat}, ${participant?.name ?? 'sin participante'}${own ? ', tu ficha' : ''}, ${label}, ${participant?.online ? 'conectado' : 'sin conexión'}`);
      presence.title = participant?.online ? 'Conectado' : 'Sin conexión';
    }
  }
  function paintBoard() {
    const classic = state.classic;
    if (!classic?.game || !classic.draft) return;
    // Pending keeps the same targets and keyboard focus; the shared gate blocks all commands.
    const actor = actorOf(), interactive = isActive(state) && state.canDecide && session.phase === 'connected' && state.decision?.kind === 'classic'
      && (!actor || owned().includes(actor));
    const key = JSON.stringify([classic.game, classic.draft, interactive, isFinished(state)]);
    if (key !== boardKey) {
      view.render(classic.game, classic.draft, { interactive, busy: !!session.pending }); boardKey = key;
      const locked = state.config.policy === 'team' && (state.config.playerCount ?? state.config.seats.length) === 4 && !!classic.draft.actor;
      for (const target of board.querySelectorAll('[data-actor]')) if (locked || !owned().includes(target.dataset.actor)) target.remove();
      for (const seat of SEATS) {
        const token = view.token(seat); if (!token) continue;
        const own = owned().includes(seat);
        if (!interactive || locked || !own) token.classList.remove('token-candidate');
        token.classList.toggle('classic-token-self', own);
        if (own && !token.querySelector('.classic-self-marker')) {
          const marker = document.createElementNS('http://www.w3.org/2000/svg', 'g');
          marker.setAttribute('class', 'classic-self-marker'); marker.setAttribute('aria-hidden', 'true');
          marker.innerHTML = '<rect x="-16" y="30" width="32" height="18" rx="5"/><text x="0" y="43" text-anchor="middle">TÚ</text>';
          token.append(marker);
        }
        if (own) token.setAttribute('aria-label', `${token.getAttribute('aria-label')}, tu ficha`);
        if (isFinished(state)) token.querySelector('.token-body')?.setAttribute('class', 'token-body token-outer');
      }
    }
    view.setBusy(!!session.pending);
  }
  function render() {
    if (destroyed || !state?.classic) return;
    paintTurn(); paintScores(); paintBoard(); paintClocks(); help();
    inspection.update(state.classic, isFinished(state), state.outcome);
    rematch.update(state, now());
    if (!decisionNoticeKey(state) || session.phase !== 'connected' || document.hidden) {
      clearTimeout(noticeTimer); $('turn-notice').hidden = true;
      for (const target of root.querySelectorAll('[data-turn-notice]')) target.removeAttribute('data-turn-notice');
    }
    notice.update(state, session.phase === 'connected');
    const history = JSON.stringify(state.previousResults ?? []);
    if (history !== historyKey) {
      historyKey = history; $('history').hidden = !(state.previousResults?.length);
      $('history-list').replaceChildren(...(state.previousResults ?? []).map(result => node('li', '', `Partida ${result.number}: A ${result.outcome.score.A} · ${result.outcome.score.B} B · ${result.outcome.winners.length === 1 ? `Ganó ${result.outcome.winners[0]}` : 'Empate'}${result.outcome.reason === 'timeout' ? ' por tiempo' : ''}`)));
    }
  }
  function update(nextState) {
    if (destroyed || !nextState) return;
    if (state !== nextState) {
      state = nextState;
      receivedAt = Number.isFinite(session.receivedAt) && session.state === nextState ? session.receivedAt : performance.now();
    }
    render();
  }
  function act(event) {
    const target = event.target.closest?.('[data-to], [data-wall], [data-actor]');
    if (!target || !board.contains(target)) return;
    if (event.type === 'keydown') {
      if (!['Enter', ' '].includes(event.key)) return;
      event.preventDefault(); if (event.repeat) return;
    }
    if (target.dataset.actor !== undefined) {
      if (!canControl() || !owned().includes(target.dataset.actor) || target.dataset.actor === state.classic.draft.actor) return;
      try { message(); session.command('classic.select', { actor: target.dataset.actor }); } catch (error) { message(error.message); }
      render(); return;
    }
    if (!canAct()) return;
    const to = Number(target.dataset.wall ?? target.dataset.to);
    if (!Number.isInteger(to) || to < 0 || to > 48) return;
    try { message(); session.command(target.hasAttribute('data-wall') ? 'classic.wall' : 'classic.step', { to }); }
    catch (error) { message(error.message); }
    render();
  }
  async function invite() {
    const url = new URL('./', import.meta.url); url.searchParams.set('room', state?.code ?? session.code);
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url.href);
      else {
        // Copy also works on an ordinary LAN HTTP origin, without secure-context APIs.
        const previous = document.activeElement, input = node('textarea', 'classic-copy-buffer');
        input.value = url.href; input.setAttribute('aria-label', 'Invitación a la sala'); root.append(input); input.select();
        let copied = false;
        try { copied = document.execCommand('copy'); } finally { input.remove(); previous?.focus({ preventScroll: true }); }
        if (!copied) throw new Error('No se pudo copiar');
      }
      message('Invitación copiada. Comparte este enlace para solicitar entrada a la sala.');
    } catch { message(`Invitación: ${url.href}`); }
  }
  function reconnect() { message(); session.connect(); }
  function disconnect() { session.disconnect(); }
  async function copyAccess() {
    try { await navigator.clipboard.writeText(session.credential); message('Acceso privado copiado. Consérvalo para recuperar tu posición.'); }
    catch { message('No se pudo copiar. Inténtalo de nuevo.'); }
  }
  const onState = event => update(event.detail), onControl = () => render();
  board.addEventListener('click', act); board.addEventListener('keydown', act);
  $('invite').addEventListener('click', invite); $('reconnect').addEventListener('click', reconnect); $('disconnect').addEventListener('click', disconnect);
  root.querySelector('[data-classic-copy-access]').addEventListener('click', copyAccess);
  session.addEventListener('state', onState); session.addEventListener('phase', onControl); session.addEventListener('pending', onControl);
  document.addEventListener('visibilitychange', onControl);
  const timer = setInterval(paintClocks, 200);
  if (session.state) update(session.state);
  return { update, destroy() {
    if (destroyed) return; destroyed = true; clearInterval(timer); clearTimeout(noticeTimer); haptics.stop(); inspection.destroy(); rematch.destroy();
    mobile.removeEventListener('change', adapt); document.removeEventListener('keydown', modeKey, true); root.removeEventListener('pointerdown', modePointer); document.removeEventListener('visibilitychange', onControl);
    session.removeEventListener('state', onState); session.removeEventListener('phase', onControl); session.removeEventListener('pending', onControl);
    board.removeEventListener('click', act); board.removeEventListener('keydown', act);
    root.remove();
  } };
}
