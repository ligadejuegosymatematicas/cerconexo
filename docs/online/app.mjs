import { API_BASE, ARENA_DUO_ENABLED, ARENA_1V1_ENABLED, ARENA_FFA_ENABLED, CLASSIC_FFA_ENABLED } from './config.mjs';
import { OnlineSession, apiRequest, newCredential, newCode, loadSession, storageKey } from './session.mjs';
import { mountClassic } from './classic.mjs';
import {mountArena} from './arena.mjs';
import { rememberOnline, dismissOnline } from './session-index.mjs';
import { bindOnlineHome } from './navigation.mjs';
import { retiredClassicConfiguration, RETIRED_MESSAGE } from './configuration-rules.mjs';

const $ = id => document.getElementById(id), url = new URL(location.href), entryPath = new URL('./',import.meta.url).pathname;
const profile = /^[1-4]$/.test(url.searchParams.get('profile')) ? url.searchParams.get('profile') : '1';
const phases = {idle:'Sin conexión',connecting:'Conectando…',connected:'Conectado',reconnecting:'Reconectando…',disconnected:'Desconectado',replaced:'Abierta en otra pestaña',rejected:'Acceso no disponible',expired:'Sala finalizada'};
let session = null, state = null, classic = null, busy = false, problemCode = null;
const seatChoices = new Map(), create = $('createForm');
const ffaRequested = url.searchParams.get('mode') === 'arena-ffa' && ARENA_FFA_ENABLED;
const arenaRequested = url.searchParams.get('mode') === 'arena-duo' && ARENA_DUO_ENABLED || ffaRequested;
if (arenaRequested && ARENA_FFA_ENABLED || !arenaRequested && CLASSIC_FFA_ENABLED) {
  const option = document.createElement('option');
  option.value = 'ffa';
  option.textContent = '1 vs. 1 vs. 1 vs. 1 · cuatro equipos';
  create.elements.players.append(option);
}
function arenaText(){
  document.querySelector('.intro h1').textContent='Arena online';document.title='CERCONEXO · Arena Online';
  const ffa = state?.config.mode === 'arena-ffa' || !state && create.elements.players.value === 'ffa';
  document.querySelectorAll('.lobby-time,#createForm>.hint').forEach(n => n.textContent = ffa ? '5 minutos por jugador' : '10 minutos por equipo');
  const help=document.querySelector('.online-help');help.querySelector('summary').setAttribute('aria-label','Ayuda de Arena online');help.querySelector('strong').textContent='Arena online';
  help.querySelector('p').textContent=ffa ? 'Cuatro equipos independientes. Al agotar el tiempo, tu ficha se retira y los muros permanecen.' : ARENA_1V1_ENABLED
    ? '1 vs. 1: dos fichas por persona. 2 vs. 2: una ficha por persona. Diez minutos por equipo.'
    : 'Cuatro personas, una ficha por persona y diez minutos por equipo. Los movimientos y poderes aceptados no pueden deshacerse.';
  const rules=help.querySelector('a');rules.href='../arena/';rules.textContent='Consultar las reglas de Arena';
}
if(!arenaRequested&&CLASSIC_FFA_ENABLED&&url.searchParams.get('mode')==='classic-ffa')create.elements.players.value='ffa';
if(arenaRequested){create.elements.mode.value=ffaRequested?'arena-ffa':'arena-duo';create.elements.players.value=ffaRequested?'ffa':'4';create.elements.players.closest('label').hidden=!(ARENA_1V1_ENABLED||ARENA_FFA_ENABLED);document.querySelector('.choice-help').hidden=true;arenaText();}
function classicText(){
  const ffa=state?.config.mode==='classic-ffa'||!state&&create.elements.players.value==='ffa';
  document.querySelectorAll('.lobby-time,#createForm>.hint').forEach(n=>n.textContent=ffa?'5 minutos por jugador':'8 minutos por equipo');
  document.querySelector('.online-help p').textContent=ffa?'Cuatro equipos independientes. Asegurar tu territorio detiene tu reloj; agotar el tiempo elimina tu ficha. Gana la mayor puntuación entre los equipos no eliminados.':'Cuatro fichas y ocho minutos por equipo. Cada paso cuenta; no puede deshacerse.';
  document.querySelector('.choice-help p').textContent=ffa?'A, B, C y D juegan en ese orden. Se omiten las fichas aseguradas y eliminadas.':'Por ficha: A1, B1, A2 y B2, saltando las fichas aseguradas. Por equipo: eliges una de tus fichas activas.';
}
function problem(text = '', code = null) { problemCode=code; $('problem').textContent=text; $('problem').hidden=!text; }
function el(tag,text,className) { const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n; }
function chooseEntry(kind) {
  create.hidden=kind!=='create';$('joinForm').hidden=kind!=='join';
  for(const b of document.querySelectorAll('[data-entry]'))b.setAttribute('aria-pressed',String(b.dataset.entry===kind));
}
for(const b of document.querySelectorAll('[data-entry]')){b.addEventListener('click',()=>chooseEntry(b.dataset.entry));b.disabled=false;}
function configurationForm() { const two=create.elements.players.value==='2';$('policyField').hidden=!two;if(!two)create.elements.policy.value='piece';if(arenaRequested)arenaText(); else classicText(); }
create.addEventListener('change',configurationForm);configurationForm();
function codeOf(value) { const code=value.trim().toUpperCase();if(!/^[A-HJ-NP-Z2-9]{10}$/.test(code))throw new Error('Revisa el código de sala.');return code; }
function saveInitial(code,credential,registration=null) { localStorage.setItem(storageKey(code,profile),JSON.stringify({code,credential,pending:null,registration})); }
function rememberRoom(code) { url.searchParams.set('room',code);url.searchParams.delete('action');history.replaceState(null,'',url); }
function attach(code,credential) {
  classic?.destroy();classic=null;session?.disconnect();state=null;
  document.body.classList.add('in-room');session=new OnlineSession({base:API_BASE,code,credential,profile});
  rememberOnline(localStorage,{code,profile});
  session.addEventListener('state',e=>{state=e.detail;render();});
  session.addEventListener('phase',()=>{if(['expired','rejected'].includes(session.phase))dismissOnline(localStorage,{code,profile});render();});session.addEventListener('pending',render);
  session.addEventListener('problem',e=>problem(e.detail.message,e.detail.code));
  session.addEventListener('recovered',()=>{if(['NETWORK','UNAVAILABLE'].includes(problemCode))problem();});
  rememberRoom(code);$('entry').hidden=true;$('roomPanel').hidden=false;session.connect();render();
}
async function submit(form,action) {
  if(busy)return;busy=true;problem();const b=form.querySelector('button[type=submit]');b.disabled=true;
  try{await action(new FormData(form));}catch(e){problem(e.message,e.code);}finally{busy=false;b.disabled=false;}
}
create.addEventListener('submit',e=>{e.preventDefault();submit(create,async data=>{
  if(url.searchParams.get('mode')==='arena-duo'&&!ARENA_DUO_ENABLED)throw new Error('Arena Online todavía no está habilitada en este entorno.');
  configurationForm();let code;do{code=newCode();}while(loadSession(localStorage,code,profile));
  const credential=newCredential(),registration={type:'create',name:data.get('name'),mode:arenaRequested?(create.elements.players.value==='ffa'?'arena-ffa':'arena-duo'):(create.elements.players.value==='ffa'?'classic-ffa':'classic'),policy:create.elements.policy.value,players:create.elements.players.value==='ffa'?4:arenaRequested&&!ARENA_1V1_ENABLED?4:Number(data.get('players'))};
  saveInitial(code,credential,registration);rememberRoom(code);await apiRequest(API_BASE,'/api/rooms',{code,credential,...registration});attach(code,credential);
});});
$('joinForm').addEventListener('submit',e=>{e.preventDefault();submit(e.currentTarget,async data=>{
  const code=codeOf(data.get('code')),saved=loadSession(localStorage,code,profile);
  if(saved){attach(code,saved.credential);return;}
  const credential=newCredential();saveInitial(code,credential,{type:'join',name:data.get('name')});rememberRoom(code);
  await apiRequest(API_BASE,`/api/rooms/${code}/join`,{name:data.get('name'),credential});attach(code,credential);
});});
$('recoverForm').addEventListener('submit',e=>{e.preventDefault();submit(e.currentTarget,async data=>{
  const code=codeOf(data.get('code')),credential=data.get('credential').trim();await apiRequest(API_BASE,`/api/rooms/${code}/resume`,{},credential);
  saveInitial(code,credential);e.target.reset();attach(code,credential);
});});
function act(type,params={}) { try{problem();session.command(type,params);}catch(e){problem(e.message,e.code);} }
$('readyButton').addEventListener('click',()=>act('ready',{ready:!state.participants.find(p=>p.id===state.self.id)?.ready}));
$('startButton').addEventListener('click',()=>act('start'));
$('disconnectButton').addEventListener('click',()=>session?.disconnect());
$('reconnectButton').addEventListener('click',()=>{problem();session?.connect();});
async function copy(value,text) { try{await navigator.clipboard.writeText(value);problem(text);}catch{problem('No se pudo copiar. Inténtalo de nuevo.');} }
$('copyInvite').addEventListener('click',()=>{const invite=new URL(entryPath,location.origin);invite.searchParams.set('room',state.code);if(state.arena||state.config.mode==='classic-ffa')invite.searchParams.set('mode',state.config.mode);copy(invite.href,'Invitación copiada');});
$('copyCredential').addEventListener('click',()=>copy(session.credential,'Acceso privado copiado. Consérvalo solo para recuperar tu posición.'));
function render() {
  $('connection').textContent=phases[session?.phase]??'Sin conexión';$('connection').dataset.phase=session?.phase??'idle';
  if(!state)return;$('publicState').textContent=JSON.stringify(state,null,2);if(state.arena)arenaText();else classicText();
  const playing=!!(state.classic||state.arena)&&['active','finished'].includes(state.status)&&state.self.admitted;
  document.body.classList.toggle('playing-classic',playing);$('classicPanel').hidden=!playing;$('lobbyPanel').hidden=playing;
  if(playing){classic??=(state.arena?mountArena:mountClassic)($('classicPanel'),session);classic.update(state);return;}
  const enabled=session.phase==='connected'&&!session.pending,count=state.config.playerCount??state.config.seats.length;
  $('modeLabel').textContent=`${state.arena?'Arena':'Clásico'} · ${['arena-ffa','classic-ffa'].includes(state.config.mode)?'1 vs. 1 vs. 1 vs. 1':count===2?'1 vs. 1':'2 vs. 2'}${count===2?' · '+(state.config.policy==='team'?'Por equipo':'Por ficha'):''}`;
  $('roomCode').textContent=state.code;$('selfLabel').textContent=`${state.self.name} · ${state.self.seat??'Esperando aprobación'}${state.self.host?' · Anfitrión':''}`;
  $('seatCount').textContent=`${state.participants.length}/${count}`;
  $('seats').replaceChildren(...state.config.seats.map(seat=>{
    const p=state.participants.find(p=>p.seat===seat),row=el('div',undefined,'seat');row.dataset.team=seat[0];row.dataset.self=String(p?.id===state.self.id);
    row.append(el('div',seat,'seat-token'));const info=el('div');info.append(el('div',p?.name??'Disponible','seat-name'));
    info.append(el('div',p?`${p.online?'Conectado':'Sin conexión'} · ${p.ready?'Listo':'Preparando'}`:'Esperando participante','seat-status'));row.append(info);return row;
  }));
  $('requests').replaceChildren();for(const request of state.requests){
    const row=el('div',undefined,'request'),select=el('select');select.setAttribute('aria-label',`Posición para ${request.name}`);
    for(const seat of state.config.seats.filter(s=>!state.participants.some(p=>p.seat===s))){const option=el('option',seat);option.value=seat;select.append(option);}
    if([...select.options].some(o=>o.value===seatChoices.get(request.id)))select.value=seatChoices.get(request.id);
    select.addEventListener('change',()=>seatChoices.set(request.id,select.value));
    const admit=el('button','Admitir','primary'),reject=el('button','Rechazar','small');admit.disabled=!enabled||!select.options.length;reject.disabled=!enabled;
    admit.addEventListener('click',()=>act('admit',{playerId:request.id,seat:select.value}));reject.addEventListener('click',()=>act('reject',{playerId:request.id}));
    row.append(el('span',request.name+' solicita entrar'),select,admit,reject);$('requests').append(row);
  }
  const self=state.participants.find(p=>p.id===state.self.id),lobby=state.status==='lobby',retired=retiredClassicConfiguration(state.config);
  $('readyButton').hidden=!state.self.admitted||!lobby||retired;$('readyButton').textContent=self?.ready?'Listo ✓':'Estoy listo';$('readyButton').disabled=!enabled;
  $('startButton').hidden=!state.self.host||!lobby||retired;
  $('startButton').disabled=!enabled||state.participants.length!==count||state.participants.some(p=>!p.online||!p.ready||(state.arena&&!p.arenaCapable)||(state.config.mode==='classic-ffa'&&!p.classicFfaCapable)||(state.classic&&(count===2||state.config.policy==='team')&&!p.classicConfigCapable));
  $('copyInvite').hidden=!lobby||retired;$('requests').hidden=retired;
  $('retiredNotice').hidden=!retired;$('retiredNotice').textContent=retired?RETIRED_MESSAGE:'';document.querySelector('.new-room-link').hidden=!retired;
  $('lobbyHint').textContent=!state.self.admitted?'Esperando la aprobación del anfitrión.':lobby?(state.participants.length<count?'Comparte la invitación para completar la sala.':state.participants.some(p=>!p.ready)?'Falta que todos estén listos.':state.self.host?'Todo listo para comenzar.':'Esperando al anfitrión.') : '';
  if(retired)$('lobbyHint').textContent='';
  $('sessionHint').textContent=session.phase==='replaced'?'La partida está abierta en otra pestaña. Puedes continuar aquí.':'Tu acceso está guardado en este navegador.';
  $('reconnectButton').hidden=session.phase==='connected';$('reconnectButton').textContent=session.phase==='replaced'?'Continuar aquí':'Reconectar';$('reconnectButton').disabled=['connecting','reconnecting'].includes(session.phase);
  $('disconnectButton').hidden=!['connected','connecting','reconnecting'].includes(session.phase);
  paintTime();
}
function paintTime(){if(!state)return;$('countdown').hidden=state.status!=='countdown';if(state.status==='countdown')$('countdown').textContent=`Comenzamos en ${Math.max(0,Math.ceil((state.startsAt-state.serverNow-performance.now()+session.receivedAt)/1000))}…`;}
setInterval(paintTime,200);document.addEventListener('visibilitychange',()=>{if(!document.hidden)session?.sync();});
bindOnlineHome(document.querySelector('.online-home'),()=>session,text=>problem(text));
window.addEventListener('pagehide',()=>session?.disconnect());
window.addEventListener('pageshow',event=>{if(event.persisted&&session&&session.phase!=='replaced')session.connect();});
if(url.searchParams.get('action')==='create')chooseEntry('create');
if(url.searchParams.has('room')){
  try{const code=codeOf(url.searchParams.get('room'));chooseEntry('join');$('joinForm').elements.code.value=code;$('recoverForm').elements.code.value=code;$('joinCodeField').hidden=true;$('inviteCode').hidden=false;$('inviteCode').textContent=`Sala ${code}`;
    const saved=loadSession(localStorage,code,profile);if(saved){(async()=>{if(saved.registration)await apiRequest(API_BASE,saved.registration.type==='create'?'/api/rooms':`/api/rooms/${code}/join`,{code,credential:saved.credential,...saved.registration});attach(code,saved.credential);})().catch(e=>problem(e.message,e.code));}
  }catch(e){problem(e.message);}
}
