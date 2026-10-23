import {arenaCoords,arenaWall,analyzeArena} from './geometry.mjs';
import {ARENA_MODES,DEFAULT_EXPERIMENT,POWER_LABELS} from './config.mjs';
import {createArena,legalArenaActions,arenaPiece,inventoryOwner,inventoryCapacity,eligibleActors} from './engine.mjs';
import {ArenaSession,ARENA_SAVE_KEY} from './session.mjs';

const $=id=>document.getElementById(id),board=$('arenaBoard');
const TEAM_COLORS={A:'#F59E0B',B:'#38BDF8',C:'#B79AFF',D:'#59D6A4'};
const SYMBOLS={demolition:'D',jump:'S',extraWall:'+'};
let session=null,selectedPower=null,boardActions=new Map(),busy=false,dialogOpener=null,hasSaved=false,loadBlocked=false;
const storage={setItem(key,value){localStorage.setItem(key,value);}};
const escapeHtml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const point=cell=>({x:(cell%9)*100+50,y:Math.floor(cell/9)*100+50});
function edgePoints(cell,to){
  const a=point(cell),b=point(to),vertical=a.x!==b.x;
  const x=(a.x+b.x)/2,y=(a.y+b.y)/2;
  return vertical?{x1:x,y1:y-39,x2:x,y2:y+39,x:x-14,y:y-34,width:28,height:68}:{x1:x-39,y1:y,x2:x+39,y2:y,x:x-34,y:y-14,width:68,height:28};
}
function setProblem(text){$('problem').textContent=text;$('problem').hidden=!text;}
function actionLabel(action,s){
  if(action.type==='select')return `Elegir ${action.actor}`;
  const p=arenaCoords(action.to),location=`fila ${p.row}, columna ${p.col}`;
  return action.type==='move'?`Mover a ${location}`:action.type==='jump'?`Saltar a ${location}`:
    `${action.type==='wall'?'Construir muro final':action.type==='demolition'?'Demoler muro':'Construir muro adicional'} hacia ${location}`;
}
function actionSvg(action,s,index){
  const key=`${s.revision}:${index}`,label=escapeHtml(actionLabel(action,s));boardActions.set(key,action);
  const p=point(action.type==='select'?arenaPiece(s,action.actor).pos:action.to);
  if(['move','jump','select'].includes(action.type)){
    const marker=action.type==='move'?`<circle class="move-dot" cx="${p.x}" cy="${p.y}" r="12"/>`:action.type==='jump'?`<circle class="power-preview" cx="${p.x}" cy="${p.y}" r="29"/><text class="drop-text" x="${p.x}" y="${p.y}" style="fill:#614814">S</text>`:'';
    return `<g class="action cell-action" role="button" tabindex="0" data-action="${key}" data-kind="${action.type}" data-cell="${action.type==='select'?arenaPiece(s,action.actor).pos:action.to}" aria-label="${label}">${marker}<rect class="hit" x="${p.x-31}" y="${p.y-31}" width="62" height="62"/><rect class="focus-ring" x="${p.x-34}" y="${p.y-34}" width="68" height="68" rx="14"/></g>`;
  }
  const e=edgePoints(arenaPiece(s,s.turn.actor).pos,action.to),cls=action.type==='wall'?'wall-preview':'power-preview';
  return `<g class="action edge-action" role="button" tabindex="0" data-action="${key}" data-kind="${action.type}" data-to="${action.to}" aria-label="${label}"><line class="${cls}" x1="${e.x1}" y1="${e.y1}" x2="${e.x2}" y2="${e.y2}"/><rect class="hit" x="${e.x}" y="${e.y}" width="${e.width}" height="${e.height}"/><rect class="focus-ring" x="${e.x}" y="${e.y}" width="${e.width}" height="${e.height}" rx="5"/></g>`;
}
function renderBoard(s,view,legal){
  boardActions=new Map();const active=new Set(view.active),candidates=eligibleActors(s,view);
  let markup='<defs><pattern id="emptyPattern" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="#e5e0d5"/><path d="M0 16L16 0" stroke="#d2cbbd" stroke-width="1"/></pattern></defs>';
  for(let c=0;c<81;c++){
    const p=point(c),type=view.components[view.byCell[c]].type;
    markup+=`<rect class="cell ${type}" data-cell-bg="${c}" x="${p.x-50}" y="${p.y-50}" width="100" height="100"/>`;
  }
  for(const drop of s.drops){const p=point(drop.cell);markup+=`<g aria-hidden="true"><rect class="drop" x="${p.x-19}" y="${p.y-19}" width="38" height="38" rx="8"/><text class="drop-text" x="${p.x}" y="${p.y}">${SYMBOLS[drop.type]}</text></g>`;}
  for(const wall of s.walls){const [a,b]=wall.split('-').map(Number),e=edgePoints(a,b),vertical=e.x1===e.x2;markup+=`<line class="wall" data-wall="${wall}" x1="${e.x1-9*(!vertical)}" y1="${e.y1-9*vertical}" x2="${e.x2+9*(!vertical)}" y2="${e.y2+9*vertical}"/>`;}
  for(const p of s.pieces){
    const pos=point(p.pos),secured=!active.has(p.id),isSelected=p.id===s.turn.actor&&!s.over&&!s.pending;
    markup+=`<g class="piece-token" data-piece="${p.id}" data-position="${p.pos}" data-secured="${secured}" style="--team:${TEAM_COLORS[p.team]}" aria-label="${p.id}, ${secured?'asegurada':'en juego'}">
      ${isSelected?`<circle class="selected-ring" cx="${pos.x}" cy="${pos.y}" r="40"/>`:candidates.includes(p.id)&&s.policy==='team'&&!s.turn.committed&&!s.pending?`<circle class="active-ring" cx="${pos.x}" cy="${pos.y}" r="40"/>`:''}
      <circle class="piece" cx="${pos.x}" cy="${pos.y}" r="32"/><text class="piece-label" x="${pos.x}" y="${pos.y}">${p.id}</text>
      ${secured?`<circle class="secured-mark" cx="${pos.x+27}" cy="${pos.y-26}" r="14"/><text class="secured-text" x="${pos.x+27}" y="${pos.y-26}">✓</text>`:''}</g>`;
  }
  const actions=selectedPower?legal.filter(a=>a.power===selectedPower):legal.filter(a=>!a.power);
  actions.forEach((a,i)=>markup+=actionSvg(a,s,i));
  board.innerHTML=markup;board.setAttribute('aria-busy','false');
}
function renderScores(s,view){
  $('scores').innerHTML=s.teams.map(t=>`<div class="score" style="--team:${TEAM_COLORS[t]}"><span>Equipo ${t}</span><strong data-score="${t}">${view.score[t]}</strong></div>`).join('');
  $('distribution').textContent=`${view.score.shared} en disputa · ${view.score.empty} vacías · 81 casillas`;
}
function renderTurn(s,view){
  $('turnBanner').style.setProperty('--team',s.over?'#ffd166':TEAM_COLORS[s.pending?.team??s.turn.team]);
  $('turnKicker').textContent=s.over?'Resultado definitivo':s.pending?'Turno en pausa · el dueño decide':`${ARENA_MODES[s.mode].label} · Turno ${s.completedTurns+1} · ${s.policy==='team'?'Por equipo':'Por ficha'}`;
  if(s.over){
    $('turnTitle').textContent=s.winners.length===1?`¡Victoria del equipo ${s.winners[0]}!`:`¡Empate entre ${s.winners.join(', ')}!`;
    $('turnHint').textContent=`No quedan regiones compartidas. ${s.teams.map(t=>`${t}: ${view.score[t]}`).join(' · ')} · Vacías: ${view.score.empty}.`;
  }else if(s.pending){
    $('turnTitle').textContent=`Equipo ${s.pending.team}: elige qué descartar`;
    $('turnHint').textContent=`${s.pending.owner} puede conservar ${s.pending.capacity} ${s.pending.capacity===1?'poder':'poderes'}. Después continúa ${s.turn.actor}.`;
  }else{
    $('turnTitle').textContent=`Equipo ${s.turn.team}${s.turn.actor?` · ${s.turn.actor}`:''}`;
    $('turnHint').textContent=!s.turn.actor?`Elige ${eligibleActors(s,view).join(' o ')} en el tablero.`:selectedPower?`${POWER_LABELS[s.inventories[inventoryOwner(s,s.turn.actor)].find(p=>p.id===selectedPower)?.type]}: elige su objetivo.`:
      s.turn.steps===2?'2 pasos consumidos · Construye tu muro final.':`${s.turn.steps} ${s.turn.steps===1?'paso consumido':'pasos consumidos'} · ${s.turn.steps===0?'Mueve o construye':'Puedes continuar o construir'}.`;
  }
}
function renderInventory(s,view,legal){
  const actor=s.turn.actor,owner=actor?inventoryOwner(s,actor):null,items=owner?s.inventories[owner]:[];
  $('inventoryTitle').textContent=s.over?'Partida terminada':owner?`${owner} · ${items.length}/${inventoryCapacity(s,owner,view)} poderes`:'Elige una ficha';
  const options=$('powerOptions');options.replaceChildren();
  if(!items.length||s.over){const p=document.createElement('p');p.className='muted';p.textContent=s.over?'El tablero conserva el resultado final.':owner?'Sin poderes. Recógelos al entrar en sus casillas.':'El inventario aparecerá al elegir.';options.append(p);}
  else for(const item of items){
    const btn=document.createElement('button');btn.type='button';btn.className='power-button';btn.dataset.power=item.id;
    btn.setAttribute('aria-pressed',String(selectedPower===item.id));btn.disabled=!!s.pending||!legal.some(a=>a.power===item.id);
    btn.innerHTML=`<span class="power-symbol" aria-hidden="true">${SYMBOLS[item.type]}</span><span>${POWER_LABELS[item.type]}${btn.disabled&&!s.pending?' · Sin objetivo':''}</span>`;
    btn.addEventListener('click',()=>{selectedPower=selectedPower===item.id?null:item.id;render();});options.append(btn);
  }
  $('toolHelp').textContent=s.over?'No se admiten más acciones. Puedes examinar el tablero final o comenzar otra partida.':s.pending?'El tablero está en pausa hasta resolver el descarte.':selectedPower?'El poder se consume solo al elegir un objetivo válido.':'Toca casillas con punto turquesa para moverte o un borde dorado para terminar construyendo.';
  $('cancelTool').hidden=!selectedPower;
  $('participants').innerHTML=s.pieces.map(p=>{
    const owner=inventoryOwner(s,p.id),inventory=s.inventories[owner],secured=!view.active.includes(p.id);
    return `<li style="--team:${TEAM_COLORS[p.team]}"><strong>${p.id}</strong><span class="participant-state">${secured?'✓ Asegurada':s.turn.actor===p.id&&!s.over?'En turno':'En juego'}<small>${s.policy==='team'?`Equipo ${p.team}`:'Inventario'}: ${inventory.length?inventory.map(i=>POWER_LABELS[i.type]).join(', '):'vacío'}</small></span></li>`;
  }).join('');
  $('decisionPanel').hidden=!s.pending;const discards=$('discardOptions');discards.replaceChildren();
  if(s.pending){
    $('decisionTitle').textContent=`Decide ${s.pending.owner}`;
    $('decisionDescription').textContent=s.pending.reason==='pickup'?'Inventario lleno. Descarta un poder; puedes rechazar el recién recogido.':`La capacidad se redujo a ${s.pending.capacity}. Descarta los poderes que sobren. El turno de ${s.turn.actor} queda en pausa.`;
    for(const item of s.inventories[s.pending.owner]){const btn=document.createElement('button');btn.textContent=`Descartar ${POWER_LABELS[item.type]}`;btn.dataset.discard=item.id;btn.addEventListener('click',()=>dispatch({type:'discard',owner:s.pending.owner,power:item.id}));discards.append(btn);}
  }
  $('waveLog').innerHTML=s.waveLog.length?s.waveLog.map(w=>`<div class="wave-entry"><strong>Turno ${w.turn} · ${POWER_LABELS[w.type]}</strong><p>${w.skipped?escapeHtml(w.skipped):w.placed.map(c=>{const p=arenaCoords(c);return `(${p.row},${p.col})`;}).join(' · ')}</p>${w.access?`<details><summary>Distancias de acceso</summary>${w.access.map(a=>`<p>${a.cell}: ${Object.entries(a.distances).map(([id,d])=>`${id} ${d??'sin camino'}`).join(' · ')}</p>`).join('')}</details>`:''}</div>`).join(''):'<p class="muted">Aún no se ha activado ninguna oleada.</p>';
}
function render(){
  if(!session)return;const s=session.game,view=analyzeArena(s),legal=loadBlocked?[]:legalArenaActions(s);
  if(selectedPower&&!legal.some(a=>a.power===selectedPower))selectedPower=null;
  renderScores(s,view);renderTurn(s,view);renderInventory(s,view,legal);renderBoard(s,view,legal);
  if(loadBlocked){$('turnKicker').textContent='Recuperación segura';$('turnTitle').textContent='Guardado de Arena no válido';$('turnHint').textContent='Se conserva sin sobrescribir. Usa Nueva partida si decides reemplazarlo.';}
}
function eventText(s){
  if(s.over)return `Partida finalizada. ${s.winners.length===1?`Gana el equipo ${s.winners[0]}`:`Empate entre ${s.winners.join(', ')}`}.`;
  const out=[];
  const secured=s.lastEvents.filter(e=>e.type==='secured').map(e=>e.actor);if(secured.length)out.push(`${secured.join(' y ')} ${secured.length===1?'aseguró su territorio':'aseguraron sus territorios'}.`);
  const reactivated=s.lastEvents.filter(e=>e.type==='reactivated').map(e=>e.actor);if(reactivated.length)out.push(`${reactivated.join(' y ')} ${reactivated.length===1?'vuelve':'vuelven'} a participar.`);
  for(const e of s.lastEvents.filter(e=>e.type==='territory'))out.push(`Equipo ${e.team}: ${e.delta>0?'+':''}${e.delta} ${Math.abs(e.delta)===1?'casilla':'casillas'}.`);
  for(const e of s.lastEvents.filter(e=>e.type==='pickup'))out.push(`${e.actor} recogió ${POWER_LABELS[e.power]}.`);
  if(s.pending)out.push(`El equipo ${s.pending.team} debe elegir un descarte.`);
  else if(s.lastEvents.some(e=>e.type==='discard'))out.push(`Inventario resuelto. ${s.turn.actor?`Continúa ${s.turn.actor}`:`Elige una ficha del equipo ${s.turn.team}`}.`);
  return out.join(' ');
}
function dispatch(action,keyboard=false){
  if(busy||!session||loadBlocked||document.querySelector('dialog[open]'))return;
  busy=true;
  try{
    session.dispatch(action);hasSaved=true;selectedPower=null;setProblem('');render();
    const message=eventText(session.game);if(message)$('eventNotice').textContent=message;
    if(keyboard){const target=session.game.pending?$('discardOptions').querySelector('button'):board.querySelector('[data-action]');target?.focus();}
  }catch(e){setProblem(`No se aplicó la acción. ${e.message}`);}finally{busy=false;}
}
board.addEventListener('click',e=>{const node=e.target.closest('[data-action]');if(node&&boardActions.has(node.dataset.action))dispatch(boardActions.get(node.dataset.action));});
board.addEventListener('keydown',e=>{
  const node=e.target.closest('[data-action]');if(!node)return;
  if(e.key==='Enter'||e.key===' '){e.preventDefault();const action=boardActions.get(node.dataset.action);if(action)dispatch(action,true);}
  else if(['ArrowRight','ArrowLeft','ArrowUp','ArrowDown'].includes(e.key)){
    e.preventDefault();const nodes=[...board.querySelectorAll('[data-action]')],index=nodes.indexOf(node),direction=['ArrowRight','ArrowDown'].includes(e.key)?1:-1;nodes[(index+direction+nodes.length)%nodes.length]?.focus();
  }
});
$('cancelTool').addEventListener('click',()=>{selectedPower=null;render();});

function openDialog(id,opener){dialogOpener=opener;$(id).showModal();$(id).querySelector('[data-close]')?.focus();}
for(const dialog of document.querySelectorAll('dialog')){
  dialog.querySelector('[data-close]').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',e=>{if(e.target!==dialog)return;const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();});
  dialog.addEventListener('close',()=>dialogOpener?.focus());
}
function resetExperiment(){const mode=new FormData($('newForm')).get('mode');$('experimentJson').value=JSON.stringify(DEFAULT_EXPERIMENT[mode],null,2);}
function showNew(opener){
  if(session){$('newForm').elements.mode.value=session.game.mode;$('newForm').elements.policy.value=session.game.policy;}
  $('policyField').hidden=$('newForm').elements.mode.value==='ffa';
  if(session)$('experimentJson').value=JSON.stringify(session.game.experiment,null,2);else resetExperiment();
  $('replaceWarning').hidden=!hasSaved;$('startArena').textContent=hasSaved?'Reemplazar y comenzar':'Comenzar partida';$('setupError').hidden=true;
  openDialog('newDialog',opener);
}
$('newForm').addEventListener('change',e=>{if(e.target.name==='mode'){$('policyField').hidden=e.target.value==='ffa';resetExperiment();}});
$('restorePreset').addEventListener('click',resetExperiment);
$('newOpen').addEventListener('click',()=>showNew($('newOpen')));
$('rulesOpen').addEventListener('click',()=>openDialog('rulesDialog',$('rulesOpen')));
$('newForm').addEventListener('submit',e=>{
  e.preventDefault();
  try{
    const data=new FormData($('newForm')),mode=data.get('mode'),policy=mode==='ffa'?'piece':data.get('policy');
    const next=new ArenaSession(storage,{mode,policy,experiment:JSON.parse($('experimentJson').value)});next.save();
    session=next;selectedPower=null;hasSaved=true;loadBlocked=false;setProblem('');$('eventNotice').textContent='Nueva partida. Los pasos y poderes ejecutados se guardan inmediatamente.';
    $('newDialog').close();render();
  }catch(error){$('setupError').textContent=error.message;$('setupError').hidden=false;}
});
try{
  const raw=localStorage.getItem(ARENA_SAVE_KEY);
  if(raw){
    hasSaved=true;const restored=ArenaSession.restore(storage,raw);
    if(restored.ok){session=restored.session;$('eventNotice').textContent='Partida de Arena recuperada. Se conservan las acciones ejecutadas y las decisiones pendientes.';}
    else {loadBlocked=true;setProblem(`${restored.error} El guardado se conserva sin sobrescribirlo. Puedes reemplazarlo desde Nueva partida.`);}
  }
}catch(e){setProblem(`No se puede acceder al guardado de Arena: ${e.message}`);}
if(!session)session=new ArenaSession(storage);
render();
if(!hasSaved)showNew($('newOpen'));
