import {RegionInspection,regionDescription,regionAnnotation,regionBoundary} from './regionInspection.mjs';
import {powerIcon} from './powerIcons.mjs';
import {arenaCoords,arenaWall,analyzeArena} from './geometry.mjs';
import {ARENA_MODES,DEFAULT_EXPERIMENT,POWER_LABELS} from './config.mjs';
import {createArena,legalArenaActions,arenaPiece,inventoryOwner,inventoryCapacity,eligibleActors} from './engine.mjs';
import {ArenaSession,ARENA_SAVE_KEY} from './session.mjs';

const $=id=>document.getElementById(id),board=$('arenaBoard');
const TEAM_COLORS={A:'#F59E0B',B:'#38BDF8',C:'#B79AFF',D:'#59D6A4'};
const inspection=new RegionInspection();
let session=null,selectedPower=null,boardActions=new Map(),busy=false,dialogOpener=null,hasSaved=false,loadBlocked=false,newConfirmed=false;
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
    const marker=action.type==='move'?`<circle class="move-dot" cx="${p.x}" cy="${p.y}" r="12"/>`:action.type==='jump'?`<circle class="power-preview" cx="${p.x}" cy="${p.y}" r="29"/>${powerIcon('jump',{x:p.x-21,y:p.y-21,size:42})}`:'';
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
  for(const drop of s.drops){const p=point(drop.cell);markup+=`<g class="drop-token" role="img" aria-label="${POWER_LABELS[drop.type]}"><rect class="drop" x="${p.x-24}" y="${p.y-24}" width="48" height="48" rx="8"/>${powerIcon(drop.type,{x:p.x-20,y:p.y-20,size:40})}</g>`;}
  if(inspection.enabled&&inspection.selected){
    const component=inspection.selected,set=new Set(component.cells);
    markup+=Array.from({length:81},(_,c)=>{const p=point(c);return `<rect class="${set.has(c)?'region-highlight':'region-muted'}" x="${p.x-50}" y="${p.y-50}" width="100" height="100"/>`;}).join('');
    const d=regionBoundary(component.cells,9).map(([x,y,u,v])=>`M${x*100} ${y*100}L${u*100} ${v*100}`).join('');
    markup+=`<path class="region-boundary" d="${d}"/>`;
  }
  for(const wall of s.walls){const [a,b]=wall.split('-').map(Number),e=edgePoints(a,b),vertical=e.x1===e.x2;markup+=`<line class="wall" data-wall="${wall}" x1="${e.x1-9*(!vertical)}" y1="${e.y1-9*vertical}" x2="${e.x2+9*(!vertical)}" y2="${e.y2+9*vertical}"/>`;}
  for(const p of s.pieces){
    const pos=point(p.pos),secured=!active.has(p.id),isSelected=p.id===s.turn.actor&&!s.over&&!s.pending;
    markup+=`<g class="piece-token" data-piece="${p.id}" data-position="${p.pos}" data-secured="${secured}" style="--team:${TEAM_COLORS[p.team]}" aria-label="${p.id}, ${secured?'asegurada':'en juego'}">
      ${isSelected?`<circle class="selected-ring" cx="${pos.x}" cy="${pos.y}" r="40"/>`:candidates.includes(p.id)&&s.policy==='team'&&!s.turn.committed&&!s.pending?`<circle class="active-ring" cx="${pos.x}" cy="${pos.y}" r="40"/>`:''}
      <circle class="piece" cx="${pos.x}" cy="${pos.y}" r="32"/><text class="piece-label" x="${pos.x}" y="${pos.y}">${p.id}</text>
      ${secured?`<circle class="secured-mark" cx="${pos.x+27}" cy="${pos.y-26}" r="14"/><text class="secured-text" x="${pos.x+27}" y="${pos.y-26}">✓</text>`:''}</g>`;
  }
  const actions=selectedPower?legal.filter(a=>a.power===selectedPower):legal.filter(a=>!a.power);
  if(inspection.enabled){
    if(inspection.selected){
      const a=regionAnnotation(inspection.selected,9,{occupied:[...s.pieces.map(p=>p.pos),...s.drops.map(p=>p.cell)]}),w=a.compact?52:70,h=a.compact?34:48;
      markup+=`<g class="region-count" data-anchor="${a.cell}" aria-hidden="true"><rect x="${a.x*100-w/2}" y="${a.y*100-h/2}" width="${w}" height="${h}" rx="10"/><text x="${a.x*100}" y="${a.y*100}" class="${a.compact?'compact':''}">${a.count}</text></g>`;
    }
    for(let c=0;c<81;c++){
      const p=point(c),coords=arenaCoords(c),component=view.components[view.byCell[c]],selected=inspection.selected===component;
      markup+=`<g class="inspect-cell" role="button" tabindex="${c===inspection.focusCell?0:-1}" data-inspect="${c}" aria-pressed="${selected}" aria-label="Fila ${coords.row}, columna ${coords.col}. ${escapeHtml(regionDescription(component))}"><rect class="hit" x="${p.x-50}" y="${p.y-50}" width="100" height="100"/><rect class="focus-ring" x="${p.x-44}" y="${p.y-44}" width="88" height="88" rx="8"/></g>`;
    }
  }else actions.forEach((a,i)=>markup+=actionSvg(a,s,i));
  board.innerHTML=markup;board.setAttribute('aria-busy','false');
}
function publicItems(items){return items.map(item=>`<span class="public-power" role="img" aria-label="${POWER_LABELS[item.type]}" title="${POWER_LABELS[item.type]}">${powerIcon(item.type)}</span>`).join('');}
function renderScores(s,view){
  $('scores').innerHTML=s.teams.map(t=>`<div class="score" style="--team:${TEAM_COLORS[t]}"><div class="score-top"><span>Equipo ${t}</span><strong data-score="${t}">${view.score[t]}</strong></div><div class="roster" role="list" aria-label="Fichas del equipo ${t}">${s.pieces.filter(p=>p.team===t).map(p=>{
    const active=view.active.includes(p.id),current=s.turn.actor===p.id&&!s.over;
    const items=s.inventories[inventoryOwner(s,p.id)],status=active?(current?'En turno':'En juego'):'Asegurada';
    const label=`${p.id}: ${status}. ${items.length?items.map(i=>POWER_LABELS[i.type]).join(', '):'Sin poderes'}`;
    return `<span role="listitem" tabindex="0" title="${label}" aria-label="${label}" class="roster-piece ${current?'current':''}">${p.id} ${active?'●':'✓'}${s.policy!=='team'?publicItems(items):''}</span>`;
  }).join('')}${s.policy==='team'?`<span class="public-inventory" aria-label="Inventario compartido del equipo ${t}">${s.inventories[t].length}${s.over?'':`/${inventoryCapacity(s,t,view)}`} ${publicItems(s.inventories[t])}</span>`:''}</div></div>`).join('');
  $('distribution').textContent=`${view.score.shared} en disputa · ${view.score.empty} vacías · 81 casillas`;
}
function renderTurn(s,view){
  $('turnBanner').classList.toggle('wide-title',s.over||!!s.pending);
  $('turnBanner').style.setProperty('--team',s.over?'#ffd166':TEAM_COLORS[s.pending?.team??s.turn.team]);
  $('turnKicker').textContent=s.over?'Resultado definitivo':s.pending?'Turno en pausa · el dueño decide':`${ARENA_MODES[s.mode].label} · Turno ${s.completedTurns+1} · ${s.policy==='team'?'Por equipo':'Por ficha'}`;
  if(s.over){
    $('turnTitle').textContent=s.winners.length===1?`¡Victoria del equipo ${s.winners[0]}!`:`¡Empate entre ${s.winners.join(', ')}!`;
    $('turnHint').textContent=`No quedan regiones compartidas. ${s.teams.map(t=>`${t}: ${view.score[t]}`).join(' · ')} · Vacías: ${view.score.empty}.`;
  }else if(s.pending){
    $('turnTitle').textContent=`Equipo ${s.pending.team}: elige qué descartar`;
    $('turnHint').textContent=`${s.pending.owner} puede conservar ${s.pending.capacity} ${s.pending.capacity===1?'poder':'poderes'}. Después continúa ${s.turn.actor}.`;
  }else{
    $('turnTitle').textContent=`Equipo ${s.turn.team}${s.turn.actor&&s.turn.actor!==s.turn.team?` · ${s.turn.actor}`:''}`;
    $('turnHint').textContent=!s.turn.actor?`Elige ${eligibleActors(s,view).join(' o ')} en el tablero.`:selectedPower?`${POWER_LABELS[s.inventories[inventoryOwner(s,s.turn.actor)].find(p=>p.id===selectedPower)?.type]}: elige su objetivo.`:
      s.turn.steps===2?'2 pasos · Construye tu muro final.':`${s.turn.steps} ${s.turn.steps===1?'paso':'pasos'} · ${s.turn.steps===0?'Mueve o construye':'Continúa o construye'}.`;
  }
}
function renderInventory(s,view,legal){
  const actor=s.turn.actor,owner=actor?inventoryOwner(s,actor):null,items=owner?s.inventories[owner]:[];
  $('inventoryTitle').textContent=s.over?'Partida terminada':owner?`${owner} · ${items.length}/${inventoryCapacity(s,owner,view)} poderes`:'Elige una ficha';
  const options=$('powerOptions');options.replaceChildren();
  if(!items.length||s.over){const p=document.createElement('p');p.className='muted';p.textContent=s.over?'Resultado definitivo':owner?'Sin poderes':'Selecciona una ficha';options.append(p);}
  else for(const item of items){
    const btn=document.createElement('button');btn.type='button';btn.className='power-button';btn.dataset.power=item.id;
    btn.setAttribute('aria-pressed',String(selectedPower===item.id));btn.disabled=inspection.enabled||!!s.pending||!legal.some(a=>a.power===item.id);
    btn.innerHTML=`<span class="power-symbol" aria-hidden="true">${powerIcon(item.type)}</span><span>${POWER_LABELS[item.type]}${btn.disabled&&!s.pending?' · Sin objetivo':''}</span>`;
    btn.addEventListener('click',()=>{selectedPower=selectedPower===item.id?null:item.id;render();});options.append(btn);
  }
  $('toolHelp').textContent=s.over?'No se admiten más acciones. Puedes examinar el tablero final o comenzar otra partida.':s.pending?'El tablero está en pausa hasta resolver el descarte.':selectedPower?'El poder se consume solo al elegir un objetivo válido.':'Toca casillas con punto turquesa para moverte o un borde dorado para terminar construyendo.';
  $('cancelTool').hidden=!selectedPower;
  $('toolHelp').hidden=true;
  document.querySelector('.powers').hidden=s.over||!!s.pending;
  $('decisionPanel').hidden=!s.pending;const discards=$('discardOptions');discards.replaceChildren();
  if(s.pending){
    $('decisionTitle').textContent=`Decide ${s.pending.owner}`;
    $('decisionDescription').textContent=s.pending.reason==='pickup'?'Puedes rechazar el poder recién recogido.':`Conserva ${s.pending.capacity} ${s.pending.capacity===1?'poder':'poderes'}.`;
    for(const item of s.inventories[s.pending.owner]){const btn=document.createElement('button');btn.textContent=`Descartar ${POWER_LABELS[item.type]}`;btn.dataset.discard=item.id;btn.disabled=inspection.enabled;btn.addEventListener('click',()=>dispatch({type:'discard',owner:s.pending.owner,power:item.id}));discards.append(btn);}
  }

}
function render(){
  if(!session)return;const s=session.game,view=analyzeArena(s),legal=loadBlocked?[]:legalArenaActions(s);
  inspection.update(view.components,9);
  if(selectedPower&&!legal.some(a=>a.power===selectedPower))selectedPower=null;
  renderScores(s,view);renderTurn(s,view);renderInventory(s,view,legal);renderBoard(s,view,legal);
  $('arenaReplayActions').hidden=!s.over||loadBlocked;
  $('inspectToggle').disabled=loadBlocked;
  $('inspectToggle').setAttribute('aria-pressed',String(inspection.enabled));
  $('inspectToggle').textContent=inspection.enabled?'Salir de inspección':'Inspeccionar regiones';
  $('inspectionInfo').hidden=!inspection.enabled;$('eventNotice').hidden=inspection.enabled;
  const description=regionDescription(inspection.selected);if($('inspectionInfo').textContent!==description)$('inspectionInfo').textContent=description;
  board.setAttribute('aria-label',inspection.enabled?'Inspección de regiones. Flechas para recorrer casillas; Enter o Espacio para seleccionar.': 'Tablero Arena de 9 por 9. Toca casillas para mover y bordes para construir.');
  if(loadBlocked){$('turnKicker').textContent='Recuperación segura';$('turnTitle').textContent='Guardado de Arena no válido';$('turnHint').textContent='Se conserva sin sobrescribir. Usa Nueva partida si decides reemplazarlo.';}
}
function eventText(s){
  if(s.over)return `Partida finalizada. ${s.winners.length===1?`Gana el equipo ${s.winners[0]}`:`Empate entre ${s.winners.join(', ')}`}.`;
  const out=[];
  const secured=s.lastEvents.filter(e=>e.type==='secured').map(e=>e.actor);if(secured.length)out.push(`${secured.join(' y ')} ${secured.length===1?'aseguró su territorio':'aseguraron sus territorios'}.`);
  const reactivated=s.lastEvents.filter(e=>e.type==='reactivated').map(e=>e.actor);if(reactivated.length)out.push(`${reactivated.join(' y ')} ${reactivated.length===1?'vuelve':'vuelven'} a participar.`);
  for(const e of s.lastEvents.filter(e=>e.type==='territory'))out.push(`Equipo ${e.team}: ${e.delta>0?'+':''}${e.delta} ${Math.abs(e.delta)===1?'casilla':'casillas'}.`);
  for(const e of s.lastEvents.filter(e=>e.type==='action'&&POWER_LABELS[e.action]))out.push(`${e.actor} usó ${POWER_LABELS[e.action]}.`);
  for(const e of s.lastEvents.filter(e=>e.type==='pickup'))out.push(`${e.actor} recogió ${POWER_LABELS[e.power]}.`);
  if(s.pending)out.push(`El equipo ${s.pending.team} debe elegir un descarte.`);
  else if(s.lastEvents.some(e=>e.type==='discard'))out.push(`Inventario resuelto. ${s.turn.actor?`Continúa ${s.turn.actor}`:`Elige una ficha del equipo ${s.turn.team}`}.`);
  return out.join(' ');
}
function dispatch(action,keyboard=false){
  if(busy||!session||loadBlocked||inspection.enabled||document.querySelector('dialog[open]'))return;
  busy=true;
  try{
    session.dispatch(action);hasSaved=true;selectedPower=null;setProblem('');render();
    const message=eventText(session.game);if(message)$('eventNotice').textContent=message;
    if(keyboard){const target=session.game.pending?$('discardOptions').querySelector('button'):board.querySelector('[data-action]');target?.focus();}
  }catch(e){setProblem(`No se aplicó la acción. ${e.message}`);}finally{busy=false;}
}
$('inspectToggle').addEventListener('click',()=>{inspection.toggle();selectedPower=null;render();});
function selectInspection(cell,keyboard=false){
  if(document.querySelector('dialog[open]')||!inspection.select(cell))return;
  render();if(keyboard)board.querySelector(`[data-inspect="${cell}"]`)?.focus();
}
board.addEventListener('click',e=>{const inspect=e.target.closest('[data-inspect]');if(inspect){selectInspection(+inspect.dataset.inspect);return;}const node=e.target.closest('[data-action]');if(node&&boardActions.has(node.dataset.action))dispatch(boardActions.get(node.dataset.action));});
board.addEventListener('keydown',e=>{
  const inspect=e.target.closest('[data-inspect]');
  if(inspect){
    if(e.key==='Enter'||e.key===' '){e.preventDefault();selectInspection(+inspect.dataset.inspect,true);}
    else if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key)){
      e.preventDefault();inspection.focusCell=+inspect.dataset.inspect;const next=inspection.moveFocus(e.key);
      for(const node of board.querySelectorAll('[data-inspect]'))node.setAttribute('tabindex',Number(node.dataset.inspect)===next?'0':'-1');
      board.querySelector(`[data-inspect="${next}"]`)?.focus();
    }return;
  }
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
  dialog.addEventListener('close',()=>{if(dialog.id==='newDialog'&&!newConfirmed)location.assign($('arenaHome').href);else dialogOpener?.focus();});
}
function resetExperiment(){const mode=new FormData($('newForm')).get('mode');$('experimentJson').value=JSON.stringify(DEFAULT_EXPERIMENT[mode],null,2);}
function showNew(opener){
  newConfirmed=false;
  if(session){$('newForm').elements.mode.value=session.game.mode;$('newForm').elements.policy.value=session.game.policy;}
  $('policyField').hidden=$('newForm').elements.mode.value==='ffa';
  if(session)$('experimentJson').value=JSON.stringify(session.game.experiment,null,2);else resetExperiment();
  const replacing=hasSaved&&(loadBlocked||!session.game.over);
  $('replaceWarning').hidden=!replacing;$('startArena').textContent=replacing?'Reemplazar y comenzar':'Comenzar partida';$('setupError').hidden=true;
  openDialog('newDialog',opener);
}
$('newForm').addEventListener('change',e=>{if(e.target.name==='mode'){$('policyField').hidden=e.target.value==='ffa';resetExperiment();}});
$('restorePreset').addEventListener('click',resetExperiment);
$('newOpen').addEventListener('click',()=>showNew($('newOpen')));
$('guideOpen').addEventListener('click',()=>openDialog('guideDialog',$('guideOpen')));
for(const node of document.querySelectorAll('[data-guide-icon]'))node.innerHTML=powerIcon(node.dataset.guideIcon);
$('arenaFullRules').innerHTML=$('rulesDialog').querySelector('.rules-content').innerHTML;
$('experimentDetails').hidden=new URL(location.href).searchParams.get('diagnostico')!=='1';
function startArena(setup){
  // Guardar primero: si falla el almacenamiento, la partida anterior sigue intacta.
  const next=new ArenaSession(storage,setup);next.save();
  session=next;inspection.reset();selectedPower=null;hasSaved=true;loadBlocked=false;
  setProblem('');$('eventNotice').textContent='';render();
}
$('arenaReplay').addEventListener('click',()=>{
  if(!session?.game.over||loadBlocked)return;
  try{startArena(session.setup);$('turnBanner').focus({preventScroll:true});}
  catch(error){setProblem(`No se reemplazó la partida. ${error.message}`);}
});
$('newForm').addEventListener('submit',e=>{
  e.preventDefault();
  try{
    const data=new FormData($('newForm')),mode=data.get('mode'),policy=mode==='ffa'?'piece':data.get('policy');
    startArena({mode,policy,experiment:JSON.parse($('experimentJson').value)});
    newConfirmed=true;$('newDialog').close();
  }catch(error){$('setupError').textContent=error.message;$('setupError').hidden=false;}
});
try{
  const raw=localStorage.getItem(ARENA_SAVE_KEY);
  if(raw){
    hasSaved=true;const restored=ArenaSession.restore(storage,raw);
    if(restored.ok){session=restored.session;$('eventNotice').textContent='';}
    else {loadBlocked=true;setProblem(`${restored.error} El guardado se conserva sin sobrescribirlo. Puedes reemplazarlo desde Nueva partida.`);}
  }
}catch(e){setProblem(`No se puede acceder al guardado de Arena: ${e.message}`);}
if(!session)session=new ArenaSession(storage);
render();
const entryURL=new URL(location.href),freshEntry=entryURL.searchParams.get('new')==='1';
if(entryURL.searchParams.has('new')||entryURL.searchParams.has('continue')){
  entryURL.searchParams.delete('new');entryURL.searchParams.delete('continue');history.replaceState(null,'',entryURL);
}
if(!hasSaved||freshEntry)showNew($('newOpen'));
