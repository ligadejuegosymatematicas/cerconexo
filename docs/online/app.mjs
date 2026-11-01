import { API_BASE } from './config.mjs';
import { OnlineSession, apiRequest, newCredential, newCode, loadSession, storageKey } from './session.mjs';
import { mountClassic } from './classic.mjs';
import { rememberOnline, dismissOnline } from './session-index.mjs';
import { bindOnlineHome } from './navigation.mjs';

const $ = id => document.getElementById(id), url = new URL(location.href), entryPath = new URL('./',import.meta.url).pathname;
const profile = /^[1-4]$/.test(url.searchParams.get('profile')) ? url.searchParams.get('profile') : '1';
const phases = {idle:'Sin conexión',connecting:'Conectando…',connected:'Conectado',reconnecting:'Reconectando…',disconnected:'Desconectado',replaced:'Abierta en otra pestaña',rejected:'Acceso no disponible',expired:'Sala finalizada'};
let session = null, state = null, classic = null, busy = false, problemCode = null;
const seatChoices = new Map(), create = $('createForm');
function problem(text = '', code = null) { problemCode=code; $('problem').textContent=text; $('problem').hidden=!text; }
function el(tag,text,className) { const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n; }
function chooseEntry(kind) {
  create.hidden=kind!=='create';$('joinForm').hidden=kind!=='join';
  for(const b of document.querySelectorAll('[data-entry]'))b.setAttribute('aria-pressed',String(b.dataset.entry===kind));
}
for(const b of document.querySelectorAll('[data-entry]')){b.addEventListener('click',()=>chooseEntry(b.dataset.entry));b.disabled=false;}
function configurationForm() { const two=create.elements.players.value==='2';$('policyField').hidden=!two;if(!two)create.elements.policy.value='piece'; }
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
  configurationForm();let code;do{code=newCode();}while(loadSession(localStorage,code,profile));
  const credential=newCredential(),registration={type:'create',name:data.get('name'),mode:'classic',policy:create.elements.policy.value,players:Number(data.get('players'))};
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
$('copyInvite').addEventListener('click',()=>{const invite=new URL(entryPath,location.origin);invite.searchParams.set('room',state.code);copy(invite.href,'Invitación copiada');});
$('copyCredential').addEventListener('click',()=>copy(session.credential,'Acceso privado copiado. Consérvalo solo para recuperar tu posición.'));
function render() {
  $('connection').textContent=phases[session?.phase]??'Sin conexión';$('connection').dataset.phase=session?.phase??'idle';
  if(!state)return;$('publicState').textContent=JSON.stringify(state,null,2);
  const playing=!!state.classic&&['active','finished'].includes(state.status)&&state.self.admitted;
  document.body.classList.toggle('playing-classic',playing);$('classicPanel').hidden=!playing;$('lobbyPanel').hidden=playing;
  if(playing){classic??=mountClassic($('classicPanel'),session);classic.update(state);return;}
  const enabled=session.phase==='connected'&&!session.pending,count=state.config.playerCount??state.config.seats.length;
  $('modeLabel').textContent=`Clásico · ${count===2?'1 vs. 1':'2 vs. 2'}${count===2?' · '+(state.config.policy==='team'?'Por equipo':'Por ficha'):''}`;
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
  const self=state.participants.find(p=>p.id===state.self.id),lobby=state.status==='lobby';
  $('readyButton').hidden=!state.self.admitted||!lobby;$('readyButton').textContent=self?.ready?'Listo ✓':'Estoy listo';$('readyButton').disabled=!enabled;
  $('startButton').hidden=!state.self.host||!lobby;
  $('startButton').disabled=!enabled||state.participants.length!==count||state.participants.some(p=>!p.online||!p.ready||((count===2||state.config.policy==='team')&&!p.classicConfigCapable));
  $('copyInvite').hidden=!lobby;
  $('lobbyHint').textContent=!state.self.admitted?'Esperando la aprobación del anfitrión.':lobby?(state.participants.length<count?'Comparte la invitación para completar la sala.':state.participants.some(p=>!p.ready)?'Falta que todos estén listos.':state.self.host?'Todo listo para comenzar.':'Esperando al anfitrión.') : '';
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
