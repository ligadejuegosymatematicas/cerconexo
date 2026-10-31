import {RegionInspection,regionDescription,regionAnnotation,regionBoundary} from './regionInspection.mjs';
import {powerIcon} from './powerIcons.mjs';
import {arenaCoords,arenaWall,analyzeArena} from './geometry.mjs';
import {ARENA_MODES,DEFAULT_EXPERIMENT,POWER_LABELS} from './config.mjs';
import {createArena,legalArenaActions,arenaPiece,inventoryOwner,inventoryCapacity,eligibleActors} from './engine.mjs';
import {ArenaSession,ARENA_SAVE_KEY} from './session.mjs';
import {setupContextHelp} from '../../src/contextHelp.mjs';
import {mountIllustratedManual} from '../../src/illustratedManual.mjs';
import {createHaptics} from '../../src/haptics.mjs';
import {arenaControl,restoreArenaControl,saveArenaControl,LOCAL_ARENA_CONTROL} from './cpuConfig.mjs';
import {createArenaCpuController} from './cpuController.mjs';
import {arenaCpuPresentation,createCpuPresentation} from './cpuPresentation.mjs';

const $=id=>document.getElementById(id),board=$('arenaBoard');
const TEAM_COLORS={A:'#F59E0B',B:'#38BDF8',C:'#B79AFF',D:'#59D6A4'};
const inspection=new RegionInspection();
// Preferencia compartida con Clásico, independiente del guardado de Arena.
const haptics=createHaptics();
let session=null,selectedPower=null,boardActions=new Map(),busy=false,dialogOpener=null,hasSaved=false,loadBlocked=false,newConfirmed=false;
let control={...LOCAL_ARENA_CONTROL},cpuFault=false;
let presentationEffects=[],presentationContext=null;
let discardFocusKey=null;
const presentation=createCpuPresentation({show:showCpuStep,clear:clearCpuEffects,onFinish:()=>{presentationContext=null;render();}});
const storage={setItem(key,value){saveArenaControl(localStorage,key,value,control);}};
const cpu=createArenaCpuController({getSession:()=>session,getControl:()=>control,
  isPaused:()=>busy||presentation.active||loadBlocked||cpuFault||inspection.enabled||document.hidden||document.querySelector('.arena-app').hidden||!!document.querySelector('dialog[open]'),
  dispatch:action=>dispatch(action,false,true),
  onThinking:thinking=>{board.dataset.cpuThinking=String(thinking);if(thinking&&!session.game.pending)$('turnHint').textContent='CPU pensando…';},
  onError:error=>{cpuFault=true;setProblem(`La CPU está en pausa. Recarga para recuperar el turno guardado. ${error.message}`);}
});
const escapeHtml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const point=cell=>({x:(cell%9)*100+50,y:Math.floor(cell/9)*100+50});
function edgePoints(cell,to){
  const a=point(cell),b=point(to),vertical=a.x!==b.x;
  const x=(a.x+b.x)/2,y=(a.y+b.y)/2;
  return vertical?{x1:x,y1:y-39,x2:x,y2:y+39,x:x-14,y:y-34,width:28,height:68}:{x1:x-39,y1:y,x2:x+39,y2:y,x:x-34,y:y-14,width:68,height:28};
}
function setProblem(text){$('problem').textContent=text;$('problem').hidden=!text;$('portalNotice').textContent=text;$('portalNotice').hidden=!text;}
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
  $('distribution').textContent=`${view.score.shared} en disputa · ${view.score.empty} vacías`;
}
function renderTurn(s,view){
  $('turnBanner').classList.toggle('wide-title',s.over||!!s.pending);
  $('turnBanner').style.setProperty('--team',s.over?'#ffd166':TEAM_COLORS[s.pending?.team??s.turn.team]);
  $('turnKicker').textContent=s.over?'Resultado definitivo':s.pending?'Turno en pausa · el dueño decide':`Turno ${s.completedTurns+1}`;
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
    if(cpu.owns(s))$('turnHint').textContent='CPU pensando…';
  }
}
function renderInventory(s,view,legal){
  const actor=s.turn.actor,owner=actor?inventoryOwner(s,actor):null,items=owner?s.inventories[owner]:[];
  $('inventoryTitle').textContent=s.over?'Partida terminada':owner?`${owner} · ${items.length}/${inventoryCapacity(s,owner,view)} poderes`:'Elige una ficha';
  const options=$('powerOptions');options.replaceChildren();
  if(!items.length||s.over){const p=document.createElement('p');p.className='muted';p.textContent=s.over?'Resultado definitivo':owner?'Sin poderes':'Selecciona una ficha';options.append(p);}
  else for(const item of items){
    const btn=document.createElement('button');btn.type='button';btn.className='power-button';btn.dataset.power=item.id;
    btn.setAttribute('aria-pressed',String(selectedPower===item.id));btn.disabled=presentation.active||cpu.owns(s)||inspection.enabled||!!s.pending||!legal.some(a=>a.power===item.id);
    const hasTarget=legalArenaActions(s).some(a=>a.power===item.id);
    btn.innerHTML=`<span class="power-symbol" aria-hidden="true">${powerIcon(item.type)}</span><span>${POWER_LABELS[item.type]}${!hasTarget&&!s.pending?' · Sin objetivo':''}</span>`;
    btn.addEventListener('click',()=>{selectedPower=selectedPower===item.id?null:item.id;render();});options.append(btn);
  }
  $('toolHelp').textContent=s.over?'No se admiten más acciones. Puedes examinar el tablero final o comenzar otra partida.':s.pending?'El tablero está en pausa hasta resolver el descarte.':selectedPower?'El poder se consume solo al elegir un objetivo válido.':'Toca casillas con punto turquesa para moverte o un borde dorado para terminar construyendo.';
  $('cancelTool').hidden=!selectedPower;
  $('toolHelp').hidden=true;
  document.querySelector('.powers').hidden=s.over||!!s.pending;
  const manual=!!s.pending&&!cpu.owns(s),ready=manual&&!presentation.active&&!inspection.enabled;
  document.querySelector('.arena-app').classList.toggle('manual-discard',ready);
  const focusedDiscard=document.activeElement?.dataset.discard;
  $('decisionPanel').hidden=!s.pending;const discards=$('discardOptions');discards.replaceChildren();
  if(s.pending){
    const title=manual?'¡Debes descartar un poder!':`Decide ${s.pending.owner}`;
    if($('discardNotice').textContent!==title)$('discardNotice').textContent=title;
    $('decisionTitle').textContent=`Decide ${s.pending.owner}`;
    $('decisionOwner').textContent=`Conserva ${s.pending.capacity} ${s.pending.capacity===1?'poder':'poderes'}`;
    $('decisionDescription').textContent=manual?'Selecciona qué poder deseas descartar para continuar jugando.':s.pending.reason==='pickup'?'Puedes rechazar el poder recién recogido.':`Conserva ${s.pending.capacity} ${s.pending.capacity===1?'poder':'poderes'}.`;
    for(const item of s.inventories[s.pending.owner]){const btn=document.createElement('button');btn.type='button';btn.textContent=`Descartar ${POWER_LABELS[item.type]}`;btn.dataset.discard=item.id;btn.disabled=presentation.active||inspection.enabled||cpu.owns(s);btn.addEventListener('click',event=>dispatch({type:'discard',owner:s.pending.owner,power:item.id},event.detail===0));discards.append(btn);}
    const key=`${s.pending.owner}:${s.pending.capacity}:${s.inventories[s.pending.owner].map(p=>p.id).join(',')}`;
    if(ready&&!document.querySelector('.arena-app').hidden&&!document.querySelector('dialog[open]')){
      const retained=[...discards.children].find(b=>b.dataset.discard===focusedDiscard);
      if(retained)retained.focus({preventScroll:true});
      else if(discardFocusKey!==key)$('discardNotice').focus({preventScroll:true});
      discardFocusKey=key;
    }
  }else discardFocusKey=null;

}
function render(){
  if(!session)return;const s=session.game,view=analyzeArena(s),legal=presentation.active||loadBlocked||cpu.owns(s)?[]:legalArenaActions(s);
  inspection.update(view.components,9);
  if(selectedPower&&!legal.some(a=>a.power===selectedPower))selectedPower=null;
  renderScores(s,view);renderTurn(s,view);renderInventory(s,view,legal);renderBoard(s,view,legal);
  $('arenaReplayActions').hidden=!s.over||loadBlocked;
  $('inspectToggle').disabled=loadBlocked;
  $('inspectToggle').setAttribute('aria-pressed',String(inspection.enabled));
  $('inspectToggle').textContent=inspection.enabled?'Salir de inspección':'Inspeccionar regiones';
  $('inspectionInfo').hidden=!inspection.enabled;$('eventNotice').hidden=inspection.enabled;
  const description=regionDescription(inspection.selected);if($('inspectionInfo').textContent!==description)$('inspectionInfo').textContent=description;
  board.setAttribute('aria-busy',String(presentation.active));
  board.setAttribute('aria-label',inspection.enabled?'Inspección de regiones. Flechas para recorrer casillas; Enter o Espacio para seleccionar.': 'Tablero Arena de 9 por 9. Toca casillas para mover y bordes para construir.');
  if(loadBlocked){$('turnKicker').textContent='Recuperación segura';$('turnTitle').textContent='Guardado de Arena no válido';$('turnHint').textContent='Se conserva sin sobrescribir. Usa Nueva partida si decides reemplazarlo.';}
  cpu.tick();
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
function clearCpuEffects(){
  for(const effect of presentationEffects)effect.cancel?.();presentationEffects=[];
  board.querySelectorAll('[data-cpu-effect]').forEach(node=>node.remove());
  delete board.dataset.presentation;board.setAttribute('aria-busy','false');
}
function cancelCpuPresentation(){const wasActive=presentation.active;presentation.cancel();presentationContext=null;if(wasActive)render();}
function showCpuStep(step){
  clearCpuEffects();render();
  const context=presentationContext;if(!context)return;
  const {before,after,action}=context,actor=before.turn.actor??action.actor;
  board.dataset.presentation=step.kind;board.setAttribute('aria-busy','true');
  if($('eventNotice').textContent!==step.text)$('eventNotice').textContent=step.text;
  if(!after.over&&!after.pending){
    $('turnTitle').textContent=action.type==='discard'?`Equipo ${before.pending.team}`:`Equipo ${before.turn.team} · ${actor}`;
    $('turnKicker').textContent=`Turno ${before.completedTurns+1}`;
    $('turnHint').textContent=action.type==='discard'?'CPU resuelve su descarte…':'CPU jugando…';
  }
  // Conserva visible el símbolo del poder aunque ya se haya consumido/descartado.
  const item=action.type==='discard'?before.inventories[action.owner]?.find(p=>p.id===action.power):null;
  const type=step.kind==='pickup'?after.lastEvents.find(e=>e.type==='pickup')?.power:step.kind==='discard'?item?.type:POWER_LABELS[step.kind]?step.kind:null;
  if(type){
    const anchor=step.kind==='discard'?(before.policy==='team'?before.pieces.find(p=>p.team===action.owner):arenaPiece(before,action.owner)):arenaPiece(after,actor);
    const p=point(anchor.pos),x=Math.max(4,Math.min(842,p.x+34)),y=Math.max(4,Math.min(842,p.y-66));
    const badge=document.createElementNS('http://www.w3.org/2000/svg','g');badge.dataset.cpuEffect='';badge.setAttribute('aria-hidden','true');badge.style.pointerEvents='none';
    badge.innerHTML=`<rect x="${x}" y="${y}" width="54" height="54" rx="10" fill="#102a43" stroke="#ffd166" stroke-width="2"/>${powerIcon(type,{x:x+7,y:y+7,size:40})}`;
    // Los muros y las fichas se dibujan por encima del símbolo decorativo.
    board.insertBefore(badge,board.querySelector('.wall,.piece-token'));
  }
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const animate=(node,frames,duration)=>{if(node?.animate)presentationEffects.push(node.animate(frames,{duration,easing:'ease-out',fill:'none'}));};
  const pulse=node=>animate(node,[{opacity:.45},{opacity:1}],Math.min(step.milliseconds,500));
  const piece=board.querySelector(`[data-piece="${action.actor??actor}"]`);
  if(step.kind==='move'||step.kind==='jump'){
    const from=point(arenaPiece(before,actor).pos),to=point(arenaPiece(after,actor).pos);
    animate(piece,[{transform:`translate(${from.x-to.x}px,${from.y-to.y}px)`},{transform:'translate(0px,0px)'}],step.kind==='jump'?480:260);
  }else if(step.kind==='wall'||step.kind==='extraWall'){
    const wall=arenaWall(arenaPiece(before,actor).pos,action.to);
    const node=board.querySelector(`[data-wall="${wall}"]`);
    const length=node?Math.hypot(+node.getAttribute('x2')- +node.getAttribute('x1'),+node.getAttribute('y2')- +node.getAttribute('y1')):100;
    animate(node,[{strokeDasharray:`${length}`,strokeDashoffset:`${length}`},{strokeDasharray:`${length}`,strokeDashoffset:'0'}],step.kind==='wall'?280:480);
  }else if(step.kind==='demolition'){
    const e=edgePoints(arenaPiece(before,actor).pos,action.to),node=document.createElementNS('http://www.w3.org/2000/svg','line');
    for(const key of ['x1','y1','x2','y2'])node.setAttribute(key,e[key]);
    node.setAttribute('class','wall cpu-demolition');node.setAttribute('opacity','0');node.dataset.cpuEffect='';board.append(node);
    animate(node,[{opacity:1,strokeDasharray:'12 3'},{opacity:0,strokeDasharray:'3 12'}],480);
  }else if(step.kind==='territory'){
    const previous=analyzeArena(before),current=analyzeArena(after);
    for(let cell=0;cell<81;cell++)if(previous.components[previous.byCell[cell]].type!==current.components[current.byCell[cell]].type)
      animate(board.querySelector(`[data-cell-bg="${cell}"]`),[{stroke:'#ffd166',strokeWidth:5},{stroke:'#ffd166',strokeWidth:0}],700);
  }else if(step.kind==='pickup'||step.kind==='discard'){
    const team=step.kind==='discard'?(before.policy==='team'?action.owner:arenaPiece(before,action.owner).team):arenaPiece(before,actor).team;
    pulse(document.querySelector(`[data-score="${team}"]`)?.closest('.score'));pulse($('powerOptions'));pulse(piece);
  }else pulse(piece);
}
function dispatch(action,keyboard=false,automated=false){
  if(busy||presentation.active||!session||loadBlocked||inspection.enabled||document.querySelector('dialog[open]'))return;
  if(cpu.owns(session.game)!==automated)return;
  busy=true;
  try{
    const before=session.game;
    session.dispatch(action);hasSaved=true;selectedPower=null;setProblem('');
    if(automated){
      presentationContext={before,after:session.game,action};
      // Activa la barrera antes del render: tampoco se puede actuar por el humano
      // que recibe el turno hasta que se haya mostrado la última acción.
      const steps=arenaCpuPresentation(before,session.game,action);
      presentation.play(steps);
    }else render();
    if(action.type==='wall')haptics.committed();
    const message=eventText(session.game);if(message&&!automated)$('eventNotice').textContent=message;
    if(keyboard){const target=session.game.pending?$('discardOptions').querySelector('button'):board.querySelector('[data-action]')??$('turnBanner');target?.focus({preventScroll:true});}
  }catch(e){setProblem(`No se aplicó la acción. ${e.message}`);if(automated)throw e;}finally{busy=false;}
}
$('inspectToggle').addEventListener('click',()=>{cpu.cancel();cancelCpuPresentation();inspection.toggle();selectedPower=null;render();});
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

const dialogOpeners=new WeakMap();
function openDialog(id,opener){cpu.cancel();cancelCpuPresentation();dialogOpeners.set($(id),opener);$(id).showModal();$(id).querySelector('[data-close]')?.focus();}
for(const dialog of document.querySelectorAll('dialog')){
  dialog.querySelector('[data-close]').addEventListener('click',()=>dialog.close());
  let startedOutside=false;
  const outside=e=>{const r=dialog.getBoundingClientRect();return e.target===dialog&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom);};
  dialog.addEventListener('pointerdown',e=>{startedOutside=outside(e);});
  dialog.addEventListener('click',e=>{if(startedOutside&&outside(e))dialog.close();startedOutside=false;});
  dialog.addEventListener('close',()=>{
    if(dialog.id==='newDialog'&&!newConfirmed){showArenaPortal();location.assign($('arenaHome').href);}
    else {
      const opener=dialogOpeners.get(dialog),active=document.activeElement;
      // close se entrega después de open=false. Si el jugador ya enfocó
      // otro control, no robarle el foco con una restauración tardía.
      if(!active||active===document.body||dialog.contains(active)||active===opener)opener?.focus({preventScroll:true});
    }
    cpu.tick();
  });
}
function resetExperiment(){const mode=new FormData($('newForm')).get('mode');$('experimentJson').value=JSON.stringify(DEFAULT_EXPERIMENT[mode],null,2);}
function showNew(opener){
  newConfirmed=false;
  if(session){$('newForm').elements.mode.value=session.game.mode;$('newForm').elements.policy.value=session.game.policy;}
  $('newForm').elements.opponent.value=control.opponent;$('newForm').elements.humanTeam.value=control.humanTeam;updateCpuSelector();
  $('policyField').hidden=$('newForm').elements.mode.value==='ffa';
  if(session)$('experimentJson').value=JSON.stringify(session.game.experiment,null,2);else resetExperiment();
  const replacing=hasSaved&&(loadBlocked||!session.game.over);
  $('replaceWarning').hidden=!replacing;$('startArena').textContent=replacing?'Reemplazar y comenzar':'Comenzar partida';$('setupError').textContent=$('problem').textContent;$('setupError').hidden=!$('setupError').textContent;
  openDialog('newDialog',opener);
}
function updateCpuSelector(){
  const form=$('newForm'),cpuMode=form.elements.opponent.value==='cpu';
  if(cpuMode&&form.elements.mode.value==='ffa'){form.elements.mode.value='duo';resetExperiment();}
  form.querySelector('[name=mode][value=ffa]').disabled=cpuMode;
  $('humanTeamField').hidden=!cpuMode;
  $('policyField').hidden=form.elements.mode.value==='ffa';
  $('arenaCpuHint').hidden=!cpuMode;
  $('arenaCpuHint').textContent=form.elements.humanTeam.value==='A'?'Tú comienzas · CPU experimental':'Comienza la CPU · CPU experimental';
}
$('newForm').addEventListener('change',e=>{if(e.target.matches('input[type=radio]'))haptics.pulse('turn');if(e.target.name==='mode')resetExperiment();updateCpuSelector();});
$('restorePreset').addEventListener('click',resetExperiment);
$('newOpen').addEventListener('click',()=>showNew($('newOpen')));
$('guideOpen').addEventListener('click',()=>openDialog('guideDialog',$('guideOpen')));
function updateHapticOption(){
  $('vibration').checked=haptics.enabled;$('vibration').disabled=!haptics.supported;
  $('vibrationStatus').textContent=!haptics.supported?'Este navegador no ofrece vibración.':haptics.paused?'En pausa por la preferencia de movimiento reducido.':'Pulsos breves, si el dispositivo lo permite.';
}
$('options').addEventListener('click',()=>{updateHapticOption();$('guideDialog').close();openDialog('optionsDialog',$('guideOpen'));});
$('vibration').addEventListener('change',()=>{haptics.setEnabled($('vibration').checked);updateHapticOption();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){haptics.stop();cpu.cancel();cancelCpuPresentation();}else {render();cpu.tick();}});
window.addEventListener('pagehide',()=>{haptics.stop();cpu.cancel();cancelCpuPresentation();});
new MutationObserver(()=>{if(document.querySelector('dialog[open]'))cpu.cancel();else cpu.tick();}).observe(document.body,{subtree:true,attributes:true,attributeFilter:['open']});
updateHapticOption();
mountIllustratedManual();
for(const node of document.querySelectorAll('[data-guide-icon]'))node.innerHTML=powerIcon(node.dataset.guideIcon);
setupContextHelp();
$('experimentDetails').hidden=new URL(location.href).searchParams.get('diagnostico')!=='1';
function startArena(setup,nextControl=control){
  // Guardar primero: si falla el almacenamiento, la partida anterior sigue intacta.
  const prior=control;control=arenaControl(nextControl,setup.mode);
  let next;try{next=new ArenaSession(storage,setup);next.save();}catch(error){control=prior;throw error;}
  cpu.cancel();cancelCpuPresentation();cpuFault=false;
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
    startArena({mode,policy,experiment:JSON.parse($('experimentJson').value)},{opponent:data.get('opponent'),humanTeam:data.get('humanTeam')});
    newConfirmed=true;$('newDialog').close();showArenaGame();
    const url=new URL(location.href);url.searchParams.delete('new');url.searchParams.delete('continue');history.replaceState(null,'',url);
  }catch(error){$('setupError').textContent=error.message;$('setupError').hidden=false;}
});
try{
  const raw=localStorage.getItem(ARENA_SAVE_KEY);
  if(raw){
    hasSaved=true;const restored=ArenaSession.restore(storage,raw);
    if(restored.ok){session=restored.session;control=restoreArenaControl(localStorage,raw,session.game.mode);$('eventNotice').textContent='';}
    else {loadBlocked=true;setProblem(`${restored.error} El guardado se conserva sin sobrescribirlo. Puedes reemplazarlo desde Nueva partida.`);}
  }
}catch(e){setProblem(`No se puede acceder al guardado de Arena: ${e.message}`);}
if(!session)session=new ArenaSession(storage);
render();
function showArenaGame(){
  $('homeScreen').hidden=true;document.querySelector('.arena-app').hidden=false;document.documentElement.dataset.entry='game';
  // Una partida recuperada puede entrar directamente con un descarte pendiente.
  // Enfocar su aviso solo después de que la vista sea visible, sin desplazarla.
  if(session?.game.pending)render();
  cpu.tick();
}
function showArenaPortal(){
  cpu.cancel();cancelCpuPresentation();
  $('homeScreen').hidden=false;document.querySelector('.arena-app').hidden=true;document.documentElement.dataset.entry='portal';
}
for(const link of [$('arenaHome'),$('homeLink')])link.addEventListener('click',e=>{if(e.button===0&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey&&!e.altKey)showArenaPortal();});
function enterArena(){
  const freshEntry=new URL(location.href).searchParams.get('new')==='1';
  if(!hasSaved||freshEntry){showArenaPortal();if(!$('newDialog').open)showNew($('newOpen'));}
  else showArenaGame();
}
window.addEventListener('pageshow',event=>{
  if(!event.persisted)return;
  cpu.cancel();cancelCpuPresentation();cpuFault=false;
  try{const raw=localStorage.getItem(ARENA_SAVE_KEY);if(raw){const restored=ArenaSession.restore(storage,raw);if(restored.ok){session=restored.session;control=restoreArenaControl(localStorage,raw,session.game.mode);hasSaved=true;loadBlocked=false;inspection.reset();selectedPower=null;render();}else{loadBlocked=true;setProblem(restored.error);render();}}else{session=new ArenaSession(storage);control={...LOCAL_ARENA_CONTROL};hasSaved=false;loadBlocked=false;inspection.reset();selectedPower=null;render();}}catch(e){setProblem(`No se puede recuperar el guardado: ${e.message}`);}
  enterArena();
});
enterArena();
