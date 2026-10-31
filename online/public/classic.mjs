import { createBoardView } from '/official/src/boardView.mjs';

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
      <div class="classic-brand branding"><img class="official-logo" src="/official/assets/Cerconexo_wordmark_transparente.png" alt="CERCONEXO"><span>CLÁSICO <small>ONLINE · 2 VS. 2</small></span></div>
      <div class="classic-room-tools">
        <div class="classic-room-meta"><span>Sala <strong data-classic-code></strong></span><span class="classic-connection" data-classic-connection role="status"></span></div>
        <div class="classic-session-actions"><button type="button" data-classic-invite>Invitar</button><button type="button" data-classic-reconnect>Reconectar</button><button type="button" data-classic-disconnect>Desconectar</button></div>
      </div>
    </header>
    <div class="classic-table">
      <section class="classic-arena arena" aria-label="Mesa de juego">
        <div class="classic-board-topline board-topline"><span>Tablero</span><span data-classic-board-meta>7 × 7 · 49 casillas</span></div>
        <div class="classic-board-wrap board-wrap"><svg id="board" data-classic-board viewBox="28 20 624 624" role="group" aria-label="Tablero Cerconexo de siete por siete casillas" aria-describedby="classicBoardHelp"></svg></div>
        <p class="classic-board-help" id="classicBoardHelp">Usa Tab para recorrer los puntos turquesa y bordes dorados; Enter o Espacio para elegir.</p>
      </section>
      <aside class="classic-sidebar" aria-label="Partida y participantes">
        <section class="classic-turn panel" aria-label="Turno actual">
          <div class="classic-turn-heading"><h2 class="micro" data-classic-turn-heading>AHORA JUEGA</h2><span class="classic-progress" data-classic-progress></span></div>
          <div class="classic-turn-identity"><span class="turn-disc" data-classic-actor></span><div><strong data-classic-turn-name></strong><span data-classic-turn-seat></span></div></div>
          <p class="classic-self" data-classic-self></p>
          <p class="classic-prompt" data-classic-prompt role="status" aria-live="polite" aria-atomic="true"></p>
          <div class="classic-result" data-classic-result role="status" aria-live="polite" aria-atomic="true" hidden><h2 data-classic-result-title></h2><p data-classic-result-detail></p><strong data-classic-result-score></strong></div>
        </section>
        <section class="classic-clocks panel" aria-label="Tiempo de los equipos">
          <div class="classic-clock-grid" data-classic-clocks></div>
          <p class="classic-grace" data-classic-grace role="status" aria-live="polite" hidden></p>
          <p class="classic-clock-note">Tiempo del servidor · sin incremento</p>
          <p class="classic-clock-note" data-classic-idle-warning role="status" hidden>La decisión lleva más de un minuto sin una acción confirmada. El reloj continúa.</p>
        </section>
        <section class="classic-scores score-panel panel" aria-label="Marcadores y participantes">
          <div class="classic-score-heading section-heading"><h2 class="micro" data-classic-score-heading>CASILLAS ASEGURADAS</h2><span class="subtle">49 en total</span></div>
          <div class="scores" data-classic-scores></div>
          <div class="territory-meter" data-classic-meter role="img" aria-label="Distribución de las 49 casillas"></div>
          <div class="minor-stats"><span><i class="status-swatch disputed" aria-hidden="true"></i>En disputa <strong data-classic-mixed>49</strong></span><span><i class="status-swatch empty" aria-hidden="true"></i>Vacías <strong data-classic-empty>0</strong></span></div>
          <p class="classic-regions" data-classic-regions></p>
        </section>
        <details class="classic-guide legend-panel panel"><summary>Guía del tablero</summary><div class="legend-content board-legend"><div><span class="legend-dot" aria-hidden="true"></span><span>Punto turquesa <b>Dar un paso · máximo dos</b></span></div><div><span class="legend-gold" aria-hidden="true"></span><span>Borde dorado <b>Construir y cerrar el turno</b></span></div><div><span class="legend-solid" aria-hidden="true"></span><span>Muro construido <b>No se puede atravesar</b></span></div><div><span class="classic-secured-symbol" aria-hidden="true">✓</span><span>Ficha asegurada <b>Su región ya es de su equipo</b></span></div></div><p>Los pasos se confirman al instante. Puedes construir sin desplazarte. Cada persona controla solo su ficha.</p></details>
      </aside>
    </div>
    <p class="classic-message" data-classic-message role="status" aria-live="polite" hidden></p>`;
  container.append(root);
  const $ = name => root.querySelector(`[data-classic-${name}]`);
  const board = $('board'), view = createBoardView(board);
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
    const home = node('a', '', 'Inicio'); home.href = '/'; home.setAttribute('aria-label', 'Volver al inicio de Cerconexo');
    root.querySelector('.classic-session-actions').prepend(home);
  }
  let state = null, receivedAt = performance.now(), boardKey = '', destroyed = false, lastGrace = false;

  function message(text = '') { write($('message'), text); $('message').hidden = !text; }
  function actorOf(current = state) { return current?.decision?.actor ?? current?.classic?.draft?.actor ?? current?.classic?.game?.currentActor; }
  function canAct() {
    const actor = actorOf(), draftActor = state?.classic?.draft?.actor ?? state?.classic?.game?.currentActor;
    return !!(isActive(state) && state.classic && state.canDecide && session.phase === 'connected' && !session.pending
      && state.self?.seat && actor === state.self.seat && draftActor === state.self.seat && state.decision?.kind === 'classic');
  }
  function now() {
    return (state?.serverNow ?? Date.now()) + Math.max(0, performance.now() - receivedAt);
  }
  function paintClocks() {
    if (destroyed || !state?.clock) return;
    const current = now(), clock = state.clock;
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
    const participant = state.participants?.find(player => player.seat === actor);
    const steps = Math.max(0, (state.classic?.draft?.path?.length ?? 1) - 1);
    const seat = state.self?.seat, active = new Set(state.classic?.activeIds ?? []);
    root.dataset.finished = String(finished);
    root.dataset.canAct = String(canAct());
    root.dataset.pending = String(!!session.pending);
    root.dataset.team = actor?.[0] ?? '';
    write($('code'), state.code ?? session.code);
    write($('connection'), PHASES[session.phase] ?? 'Sin conexión'); $('connection').dataset.phase = session.phase;
    $('reconnect').hidden = session.phase === 'connected';
    $('reconnect').disabled = ['connecting', 'reconnecting'].includes(session.phase);
    $('disconnect').hidden = !['connected', 'connecting', 'reconnecting'].includes(session.phase);
    $('invite').disabled = !(state.code ?? session.code);
    write($('self'), seat ? `Tú: ${state.self.name ?? 'Participante'} · ${seat} · Equipo ${seat[0]}${active.has(seat) ? '' : ' · Ficha asegurada ✓'}` : 'Observas esta partida');
    write($('turn-heading'), finished ? 'PARTIDA FINALIZADA' : 'AHORA JUEGA');
    write($('progress'), finished ? `${state.classic?.game?.moves ?? 0} muros` : `${steps} / 2 pasos`);
    $('actor').parentElement.hidden = finished;
    write($('actor'), actor ?? '—'); $('actor').dataset.team = actor?.[0] ?? '';
    write($('turn-name'), actor === seat ? 'Tu turno' : participant?.name ?? (actor ? `Turno de ${actor}` : 'Esperando partida'));
    write($('turn-seat'), actor ? `${actor} · Equipo ${actor[0]}` : '');
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
    if (session.phase !== 'connected') prompt = 'Espera a recuperar la conexión para actuar. Los relojes siguen el estado del servidor.';
    else if (session.pending) prompt = 'Confirmando tu acción con el servidor…';
    else if (canAct()) prompt = steps === 2 ? 'Dos pasos confirmados. Construye un muro dorado para cerrar tu turno.'
      : steps === 1 ? 'Primer paso confirmado. Da otro paso o construye un muro dorado.'
      : 'Construye un muro dorado o da hasta dos pasos por los puntos turquesa.';
    else if (seat && !active.has(seat)) prompt = 'Tu ficha tiene territorio asegurado. Sigue la partida de tu equipo.';
    else prompt = actor ? `Observa la jugada de ${participant?.name ?? actor}. Sus pasos se confirman para toda la sala.` : 'La partida comenzará cuando estén las cuatro personas listas.';
    write($('prompt'), prompt);
  }
  function paintScores() {
    const classic = state.classic, score = classic.territory?.score ?? state.outcome?.score;
    if (!score) return;
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
      const participant = state.participants?.find(player => player.seat === seat);
      const own = seat === state.self?.seat, secured = !active.has(seat), current = !isFinished(state) && actor === seat;
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
    const actor = actorOf(), interactive = isActive(state) && state.canDecide && session.phase === 'connected'
      && actor === state.self?.seat && (classic.draft.actor ?? classic.game.currentActor) === state.self?.seat && state.decision?.kind === 'classic';
    const key = JSON.stringify([classic.game, classic.draft, interactive, isFinished(state)]);
    if (key !== boardKey) {
      view.render(classic.game, classic.draft, { interactive, busy: !!session.pending }); boardKey = key;
      for (const seat of SEATS) {
        const token = view.token(seat); if (!token) continue;
        const own = seat === state.self?.seat;
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
    paintTurn(); paintScores(); paintBoard(); paintClocks();
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
    const target = event.target.closest?.('[data-to], [data-wall]');
    if (!target || !board.contains(target)) return;
    if (event.type === 'keydown') {
      if (!['Enter', ' '].includes(event.key)) return;
      event.preventDefault(); if (event.repeat) return;
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
  const onState = event => update(event.detail), onControl = () => render();
  board.addEventListener('click', act); board.addEventListener('keydown', act);
  $('invite').addEventListener('click', invite); $('reconnect').addEventListener('click', reconnect); $('disconnect').addEventListener('click', disconnect);
  session.addEventListener('state', onState); session.addEventListener('phase', onControl); session.addEventListener('pending', onControl);
  const timer = setInterval(paintClocks, 200);
  if (session.state) update(session.state);
  return { update, destroy() {
    if (destroyed) return; destroyed = true; clearInterval(timer);
    session.removeEventListener('state', onState); session.removeEventListener('phase', onControl); session.removeEventListener('pending', onControl);
    board.removeEventListener('click', act); board.removeEventListener('keydown', act);
    root.remove();
  } };
}
