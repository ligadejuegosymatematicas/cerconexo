import { API_BASE } from './config.mjs';
import { OnlineSession, apiRequest, newCredential, newCode, loadSession, storageKey } from './session.mjs';
import { mountClassic } from './classic.mjs';

const $ = id => document.getElementById(id), url = new URL(location.href);
const entryPath = new URL('./', import.meta.url).pathname;
const profile = /^[1-4]$/.test(url.searchParams.get('profile')) ? url.searchParams.get('profile') : '1';
const labels = { classic: 'Clásico · 2 vs. 2', 'arena-duo': 'Arena · 2 vs. 2', 'arena-ffa': 'Arena · cuatro equipos' };
const phases = { idle: 'Sin conexión', connecting: 'Conectando', connected: 'Conectado', reconnecting: 'Recuperando sesión',
  disconnected: 'Desconectado', replaced: 'Sesión abierta en otra ventana', rejected: 'Sesión no admitida', expired: 'Sala expirada' };
let session = null, state = null, busy = false, classic = null;
const seatChoices = new Map();
function problem(text = '') { $('problem').textContent = text; $('problem').hidden = !text; }
function el(tag, text, className) { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; }
function saveInitial(code, credential, registration = null) {
  localStorage.setItem(storageKey(code, profile), JSON.stringify({ code, credential, pending: null, registration }));
}
function rememberRoom(code) {
  url.searchParams.set('room', code); url.searchParams.set('profile', profile); history.replaceState(null, '', url);
}
function codeOf(value) { const code = value.trim().toUpperCase(); if (!/^[A-HJ-NP-Z2-9]{10}$/.test(code)) throw new Error('El código debe tener diez caracteres válidos.'); return code; }
function attach(code, credential) {
  classic?.destroy(); classic = null;
  session?.disconnect(); state = null;
  document.body.classList.add('in-room');
  session = new OnlineSession({ base: API_BASE, code, credential, profile });
  session.addEventListener('state', event => { state = event.detail; render(); });
  session.addEventListener('phase', render); session.addEventListener('pending', render);
  session.addEventListener('problem', event => problem(event.detail.message));
  rememberRoom(code);
  $('entry').hidden = true; $('roomPanel').hidden = false;
  updateProfileLinks(code); session.connect(); render();
}
async function submit(form, action) {
  if (busy) return; busy = true; problem(); form.querySelector('button[type=submit]').disabled = true;
  try { await action(new FormData(form)); } catch (error) { problem(error.message); }
  finally { busy = false; form.querySelector('button[type=submit]').disabled = false; }
}
$('createForm').addEventListener('submit', event => { event.preventDefault(); submit(event.currentTarget, async data => {
  let code; do { code = newCode(); } while (loadSession(localStorage, code, profile));
  const credential = newCredential(), registration = { type: 'create', name: data.get('name'), mode: data.get('mode'), policy: data.get('policy') };
  saveInitial(code, credential, registration); rememberRoom(code);
  await apiRequest(API_BASE, '/api/rooms', { code, credential, ...registration }); attach(code, credential);
}); });
$('joinForm').addEventListener('submit', event => { event.preventDefault(); submit(event.currentTarget, async data => {
  const code = codeOf(data.get('code')), previous = loadSession(localStorage, code, profile), credential = previous?.credential ?? newCredential();
  if (!previous) saveInitial(code, credential, { type: 'join', name: data.get('name') });
  rememberRoom(code);
  await apiRequest(API_BASE, `/api/rooms/${code}/join`, { name: data.get('name'), credential }); attach(code, credential);
}); });
$('recoverForm').addEventListener('submit', event => { event.preventDefault(); submit(event.currentTarget, async data => {
  const code = codeOf(data.get('code')), credential = data.get('credential').trim();
  await apiRequest(API_BASE, `/api/rooms/${code}/resume`, {}, credential);
  saveInitial(code, credential); event.target.reset(); attach(code, credential);
}); });
function act(type, params = {}) { try { problem(); session.command(type, params); } catch (error) { problem(error.message); } }
$('readyButton').addEventListener('click', () => act('ready', { ready: !state.participants.find(p => p.id === state.self.id)?.ready }));
$('startButton').addEventListener('click', () => act('start'));
$('completeButton').addEventListener('click', () => act('probe.complete'));
$('discardButton').addEventListener('click', () => act('probe.discard'));
$('resolveButton').addEventListener('click', () => act('probe.resolve'));
$('disconnectButton').addEventListener('click', () => session?.disconnect());
$('reconnectButton').addEventListener('click', () => { problem(); session?.connect(); });
async function copy(value, message) { try { await navigator.clipboard.writeText(value); problem(message); } catch { problem('El navegador no permite copiar desde esta ventana.'); } }
$('copyInvite').addEventListener('click', () => { const invite = new URL(entryPath, location.origin); invite.searchParams.set('room', state.code); copy(invite.href, 'Invitación copiada. Contiene solo el código público de sala.'); });
$('copyCredential').addEventListener('click', () => copy(session.credential, 'Credencial personal copiada. Permite recuperar exclusivamente tu sesión.'));
function updateProfileLinks(code) {
  for (const link of document.querySelectorAll('[data-profile]')) {
    const target = new URL(entryPath, location.origin); target.searchParams.set('profile', link.dataset.profile); if (code) target.searchParams.set('room', code);
    link.href = target.href; if (link.dataset.profile === profile) link.setAttribute('aria-current', 'page');
  }
}
function render() {
  $('connection').textContent = phases[session?.phase] ?? 'Sin conexión'; $('connection').dataset.phase = session?.phase ?? 'idle';
  if (!state) return;
  $('publicState').textContent = JSON.stringify(state, null, 2);
  const playingClassic = !!state.classic && ['active', 'finished'].includes(state.status) && state.self.admitted;
  document.body.classList.toggle('playing-classic', playingClassic);
  $('classicPanel').hidden = !playingClassic;
  if (playingClassic) {
    classic ??= mountClassic($('classicPanel'), session);
    classic.update(state); updateProfileLinks(state.code); return;
  }
  const enabled = session.phase === 'connected' && !session.pending;
  $('modeLabel').textContent = `${labels[state.config.mode]} · ${state.config.policy === 'team' ? 'por equipo' : 'por ficha'}`;
  $('roomCode').textContent = state.code; $('selfLabel').textContent = `${state.self.name} · ${state.self.seat ?? 'Solicitud pendiente'}${state.self.host ? ' · Anfitrión' : ''} · Perfil local ${profile}`;
  $('seatCount').textContent = `${state.participants.length} / 4`;
  $('seats').replaceChildren(...state.config.seats.map(seat => {
    const p = state.participants.find(p => p.seat === seat), node = el('div', undefined, 'seat'); node.dataset.team = seat[0]; node.dataset.self = String(p?.id === state.self.id);
    node.append(el('div', seat, 'seat-token')); const detail = el('div'); detail.append(el('div', p?.name ?? 'Posición disponible', 'seat-name'));
    detail.append(el('div', p ? `${p.online ? 'Conectado' : 'Sin conexión'} · ${p.ready ? 'Listo' : 'Preparando'}` : 'Esperando admisión', 'seat-status')); node.append(detail); return node;
  }));
  $('requests').replaceChildren();
  for (const request of state.requests) {
    const row = el('div', undefined, 'request'), select = el('select'); select.setAttribute('aria-label', `Posición para ${request.name}`);
    for (const seat of state.config.seats.filter(seat => !state.participants.some(p => p.seat === seat))) {
      const option = el('option', seat); option.value = seat; select.append(option);
    }
    if ([...select.options].some(o => o.value === seatChoices.get(request.id))) select.value = seatChoices.get(request.id);
    select.addEventListener('change', () => seatChoices.set(request.id, select.value));
    const admit = el('button', 'Admitir', 'primary'); admit.disabled = !enabled || !select.options.length;
    admit.addEventListener('click', () => act('admit', { playerId: request.id, seat: select.value }));
    const reject = el('button', 'Rechazar', 'small'); reject.disabled = !enabled; reject.addEventListener('click', () => act('reject', { playerId: request.id }));
    row.append(el('span', `${request.name} solicita entrar`), select, admit, reject); $('requests').append(row);
  }
  const self = state.participants.find(p => p.id === state.self.id);
  $('readyButton').hidden = !state.self.admitted || state.status !== 'lobby'; $('readyButton').textContent = self?.ready ? 'Ya estoy listo ✓' : 'Estoy listo'; $('readyButton').disabled = !enabled;
  $('startButton').textContent = state.classic ? 'Comenzar partida' : 'Iniciar prueba';
  $('startButton').hidden = !state.self.host || state.status !== 'lobby'; $('startButton').disabled = !enabled || state.participants.length !== 4 || state.participants.some(p => !p.online || !p.ready);
  $('lobbyHint').textContent = !state.self.admitted ? 'Espera a que el anfitrión admita tu solicitud y te asigne una posición.' : state.status === 'lobby' ? 'Cada persona confirma su preparación. El anfitrión inicia cuando las cuatro están conectadas y listas.' : 'La asignación de posiciones queda fija durante la partida.';
  const isProbe = state.decision?.kind === 'probe', isDiscard = state.decision?.kind === 'discard-probe';
  $('completeButton').hidden = state.status !== 'active' || !isProbe; $('completeButton').disabled = !enabled || !state.canDecide;
  $('discardButton').hidden = state.config.mode !== 'arena-duo' || state.config.policy !== 'team' || state.status !== 'active' || !isProbe;
  $('discardButton').disabled = !enabled || !state.canDecide;
  $('resolveButton').hidden = !isDiscard || state.status !== 'active'; $('resolveButton').disabled = !enabled || !state.canDecide;
  $('completed').textContent = String(state.probe.completed).padStart(2, '0');
  $('decisionTitle').textContent = state.status === 'finished' ? 'Prueba de reloj finalizada' : state.decision ? `${isDiscard ? 'Descarta' : 'Decide'} el equipo ${state.decision.team}` : 'Esperando participantes';
  $('decisionHint').textContent = state.status === 'finished' ? `Resultado de la sonda: ${state.outcome.winners.join(', ')}. Todavía no es una partida territorial.`
    : state.decision ? `${state.canDecide ? 'Puedes actuar.' : 'Observa la decisión compartida.'} ${isDiscard ? 'Cualquiera de los dos compañeros puede resolver; después vuelve el equipo original.' : state.decision.actor ? `Corresponde a ${state.decision.actor}.` : 'Cualquiera del equipo puede completar esta sonda.'}`
    : 'El anfitrión asignará las cuatro posiciones.';
  $('clocks').replaceChildren(...state.config.teams.map(team => {
    const node = el('div', undefined, 'clock-row'); node.dataset.team = team;
    const top = el('div', undefined, 'clock-top'); top.append(el('span', `EQUIPO ${team}`), el('span', '', 'clock-status'));
    node.append(top, el('div', '', 'clock-value')); return node;
  }));
  $('history').replaceChildren(...state.probe.decisions.slice(-4).reverse().map(item => { const row = el('li'); row.append(el('span', `Decisión ${String(item.index).padStart(2, '0')} · ${item.seat}`), el('span', 'Confirmada')); return row; }));
  $('revision').textContent = `REVISIÓN ${state.revision} · PRESENCIA ${state.presenceRevision}${session.pending ? ' · CONFIRMACIÓN PENDIENTE' : ''}`;
  $('sessionHint').textContent = session.phase === 'replaced' ? 'Otra ventana tiene el control. Puedes recuperar esta sesión con Reconectar.' : 'La credencial queda guardada en este navegador. La invitación no permite ocupar tu posición.';
  $('disconnectButton').disabled = !['connected', 'connecting', 'reconnecting'].includes(session.phase);
  $('reconnectButton').disabled = session.phase === 'connected';
  $('publicState').textContent = JSON.stringify(state, null, 2);
  updateProfileLinks(state.code); paintTime();
}
function format(ms) { const seconds = Math.max(0, Math.ceil(ms / 1000)); return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; }
function paintTime() {
  if (!state || !session || document.body.classList.contains('playing-classic')) return;
  const now = state.serverNow + performance.now() - session.receivedAt;
  const pausedUntil = state.clock.graceUntil ?? state.serverNow;
  for (const row of $('clocks').children) {
    const team = row.dataset.team, running = state.status === 'active' && state.clock.owner === team;
    const elapsed = running ? Math.max(0, now - Math.max(state.serverNow, pausedUntil)) : 0;
    const remaining = Math.max(0, state.clock.remainingMs[team] - elapsed), eliminated = state.probe.eliminatedTeams.includes(team);
    row.dataset.running = String(running); row.dataset.low = String(remaining < 60000);
    row.querySelector('.clock-value').textContent = format(remaining);
    row.querySelector('.clock-status').textContent = eliminated ? 'Sin tiempo' : running ? now < pausedUntil ? 'Gracia' : 'En curso' : 'En espera';
  }
  const grace = state.status === 'active' && now < pausedUntil;
  $('graceNotice').hidden = !grace;
  if (grace) $('graceNotice').textContent = `Pausa por desconexión · ${Math.max(0, Math.ceil((pausedUntil - now) / 1000))} s de esta ventana. Máximo 60 s acumulados por persona.`;
  if (state.status === 'countdown') { $('decisionTitle').textContent = `Comenzamos en ${Math.max(0, Math.ceil((state.startsAt - now) / 1000))}…`; $('decisionHint').textContent = 'Cuenta atrás común. Los relojes aún están detenidos.'; }
  if (state.status === 'active' && now - state.lastActivityAt >= 60000 && !grace) $('decisionHint').textContent = 'Hace más de 60 segundos que no se confirma una decisión. El reloj del equipo sigue corriendo.';
}
setInterval(paintTime, 200);
document.addEventListener('visibilitychange', () => { if (!document.hidden) session?.sync(); });
updateProfileLinks(url.searchParams.get('room'));
if (url.searchParams.has('room')) {
  try {
    const code = codeOf(url.searchParams.get('room')); $('joinForm').elements.code.value = code; $('recoverForm').elements.code.value = code;
    const saved = loadSession(localStorage, code, profile);
    if (saved) {
      const resume = async () => {
        if (saved.registration) await apiRequest(API_BASE, saved.registration.type === 'create' ? '/api/rooms' : `/api/rooms/${code}/join`, { code, credential: saved.credential, ...saved.registration });
        attach(code, saved.credential);
      };
      resume().catch(error => problem(error.message));
    }
  } catch (error) { problem(error.message); }
}
