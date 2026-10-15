import {CELL_COUNT,SIZE,PLAYERS,GAME_VERSION,initialState,adjacent,wallKey,wallSet,regions,territory,activeIds,availableMoves,wallOptions,applyTurn,verifyState,pieceById,coords} from './engine.mjs';
import {moveHitBox,wallHitPolygon} from './boardTargets.mjs';

const $=id=>document.getElementById(id);
const SAVE_KEY='wallgo-league-v2';
const TEAM_NAME={A:'Equipo A',B:'Equipo B'};
const TOKEN_FILL={A:'#f79c38',B:'#34bceb'};
let game=initialState(),draft={path:[8]};
let endShown=false;
const piece=(id)=>pieceById(game,id);
const safeStore=()=>{try{localStorage.setItem(SAVE_KEY,JSON.stringify({game}));}catch{}};

function loadGame(){
  try{
    const restored=JSON.parse(localStorage.getItem(SAVE_KEY));
    if(restored&&verifyState(restored.game)){
      game=restored.game;
    }
  }catch{}
  draft={path:game.over?[]:[piece(game.currentActor).pos]};
}
function newGame(){
  game=initialState();endShown=false;
  draft={path:[piece(game.currentActor).pos]};
  $('endScreen').hidden=true;
  safeStore();render();
}
function step(to){
  if(game.over||draft.path.length>=3)return;
  const from=draft.path[draft.path.length-1];
  if(!availableMoves(game,game.currentActor,from).includes(to))return;
  draft.path.push(to);
  render();
}
function build(to){
  if(game.over)return;
  try{
    game=applyTurn(game,{actor:game.currentActor,path:draft.path,to});
    draft={path:game.over?[]:[piece(game.currentActor).pos]};
    safeStore();render();
  }catch(error){
    $('prompt').textContent=error.message;
  }
}
function cancel(){
  if(game.over)return;
  draft={path:[piece(game.currentActor).pos]};render();
}
function wallCoord(a,b){
  const r=Math.floor(a/SIZE), c=a%SIZE, x=60+c*80, y=60+r*80;
  if(b===a+1)return [x+80,y,x+80,y+80];
  if(b===a-1)return [x,y,x,y+80];
  if(b===a+7)return [x,y+80,x+80,y+80];
  if(b===a-7)return [x,y,x+80,y];
  throw new Error('No son casillas adyacentes');
}
function edgeSVG(cls,a,b,extras=''){
  const [x1,y1,x2,y2]=wallCoord(a,b);
  return `<line class="${cls}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${extras}/>`;
}
function svgBoard(){
  const rs=regions(game), rFor=new Array(CELL_COUNT), closed=wallSet(game), isOver=game.over;
  for(const r of rs)for(const c of r.cells)rFor[c]=r.type;
  const base={A:'#f4be83',B:'#a6dcf0',mixed:'#f1e4cc',empty:'url(#empty-region)'};
  let out='<defs><pattern id="empty-region" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="12" height="12" fill="#bac5ca"/><path d="M0 12L12 0" stroke="#8298a6" stroke-width="2"/></pattern></defs><rect x="37" y="37" width="606" height="606" rx="15" fill="#132e45"/><rect x="56" y="56" width="568" height="568" rx="5" fill="#f1e4cc"/>';
  for(let a=0;a<CELL_COUNT;a++){
    const r=Math.floor(a/SIZE),c=a%SIZE, x=60+c*80, y=60+r*80;
    out+=`<rect class="board-cell" x="${x}" y="${y}" width="80" height="80" fill="${base[rFor[a]]}"/>`;
  }
  for(let a=0;a<CELL_COUNT;a++)for(const b of adjacent(a))if(b>a){
    out+=edgeSVG(closed.has(wallKey(a,b))?'wall-built':'wall-dash',a,b);
  }
  out+='<rect class="wall-perimeter" x="60" y="60" width="560" height="560"/>';
  for(let c=0;c<SIZE;c++)out+=`<text x="${100+c*80}" y="41" text-anchor="middle" font-size="23" font-weight="750" fill="#b4c4d5">${c+1}</text>`;
  for(let r=0;r<SIZE;r++)out+=`<text x="43" y="${105+r*80}" text-anchor="middle" font-size="23" font-weight="750" fill="#b4c4d5">${r+1}</text>`;
  const actor=game.currentActor, active=activeIds(game);
  if(!isOver){
    const destinations=availableMoves(game,actor,draft.path[draft.path.length-1]);
    if(draft.path.length<3)for(const a of destinations){
      const x=60+(a%SIZE)*80+40, y=60+Math.floor(a/SIZE)*80+40;
      const from=draft.path[draft.path.length-1];
      const hit=moveHitBox(x-40,y-40,60+(from%SIZE)*80,60+Math.floor(from/SIZE)*80);
      out+=`<g role="button" tabindex="0" class="possible-cell" data-to="${a}" aria-label="Mover a fila ${coords(a).row}, columna ${coords(a).col}"><circle class="move-halo" cx="${x}" cy="${y}" r="21"/><circle class="move-target" cx="${x}" cy="${y}" r="12"/><rect class="move-hit" x="${hit.x}" y="${hit.y}" width="${hit.width}" height="${hit.height}"/></g>`;
    }
  }
  for(const p of game.pieces){
    const current=(p.id===actor&&!isOver), isInactive=!active.has(p.id);
    const at=current&&draft.path.length?draft.path[draft.path.length-1]:p.pos;
    const cx=100+(at%SIZE)*80,cy=100+Math.floor(at/SIZE)*80;
    out+=`<g class="piece-token ${isInactive?'token-isolated':''}" aria-label="${p.id}${isInactive?', territorio asegurado':''}"><circle cx="${cx}" cy="${cy+3}" r="25" fill="#111c21" opacity=".32"/><circle class="${current?'token-active':'token-outer'}" cx="${cx}" cy="${cy}" r="24" fill="${TOKEN_FILL[p.team]}"/><text class="token-label" x="${cx}" y="${cy+5}" text-anchor="middle">${p.id}</text>${isInactive?`<text class="marker-check" x="${cx+23}" y="${cy-15}" text-anchor="middle">✓</text>`:''}</g>`;
  }
  if(!isOver){
    const from=draft.path[draft.path.length-1];
    for(const to of wallOptions(game,from)){
      const [x1,y1,x2,y2]=wallCoord(from,to);
      const side=to===from-7?'arriba':to===from+7?'abajo':to===from+1?'a la derecha':'a la izquierda';
      const hit=wallHitPolygon(x1,y1,x2,y2).map(p=>p.join(',')).join(' ');
      out+=`<g role="button" tabindex="0" class="wall-pick" data-wall="${to}" aria-label="Construir muro ${side} de fila ${coords(from).row}, columna ${coords(from).col}"><line class="wall-glow" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/><polygon class="wall-hit" points="${hit}"/></g>`;
    }
  }
  return out;
}
function render(){
  const actor=game.currentActor;
  const {score}=territory(game),active=activeIds(game);
  $('board').innerHTML=svgBoard();
  $('scoreA').textContent=score.A;
  $('scoreB').textContent=score.B;
  $('mixedCount').textContent=score.mixed;
  $('emptyCount').textContent=score.empty;
  $('meter').innerHTML=['A','mixed','empty','B'].flatMap(type=>Array.from({length:score[type]},()=>`<span class="territory-unit unit-${type}" aria-hidden="true"></span>`)).join('');
  for(const team of ['A','B']){
    $(`active${team}`).innerHTML=['1','2'].map(n=>{
      const id=`${team}${n}`,isolated=!active.has(id),current=id===actor&&!game.over;
      const status=isolated?'Territorio asegurado':current?'Su turno':'En juego';
      return `<div class="player ${isolated?'is-isolated':''} ${current?'is-current':''}" id="player-${id}" ${current?'aria-current="true"':''}><span class="player-id">${id}</span><span class="player-state">${isolated?'✓ ':''}${status}</span></div>`;
    }).join('');
  }
  $('meter').setAttribute('aria-label',`Casillas: equipo A ${score.A}, equipo B ${score.B}, en disputa ${score.mixed}, vacías ${score.empty}`);
  $('moveCount').textContent=`${game.moves} ${game.moves===1?'muro construido':'muros construidos'}`;
  $('cancel').hidden=game.over || draft.path.length===1;
  if(game.over){
    $('turnDisc').textContent='✓';$('turnName').textContent='Partida finalizada';
    $('turnBanner').classList.remove('team-b');$('stepsPill').textContent='Territorios cerrados';
    $('prompt').textContent='Todos los territorios con fichas pertenecen exclusivamente a un equipo.';
    if(!endShown){showEnd(score);endShown=true;}
  }else{
    const {team}=piece(actor),steps=draft.path.length-1;
    $('turnBanner').classList.toggle('team-b',team==='B');
    $('turnDisc').textContent=actor;
    $('turnName').textContent=`${TEAM_NAME[team]} · Jugador\u00a0${actor[1]}`;
    $('stepsPill').textContent=steps===0?'Sin desplazamiento':steps===1?'1 paso dado':'2 pasos dados';
    $('prompt').textContent=steps===0?'Construye un muro o toca un punto azul para dar un paso.':steps===1?'Construye o da un segundo paso: puedes girar o regresar.':'Elige un borde dorado para construir tu muro.';
  }
}
function showEnd(score){
  $('winnerTitle').textContent=game.winner==='Empate'?'¡Empate!':`¡Gana el equipo ${game.winner}!`;
  $('winnerDetails').textContent=game.winner==='Empate'?'Ambos equipos controlan la misma cantidad de casillas.':'Todas las regiones ocupadas quedaron separadas por equipos.';
  $('finalA').textContent=`A · ${score.A} casillas`;
  $('finalB').textContent=`B · ${score.B} casillas`;
  $('endScreen').hidden=false;
}
function activateBoard(target){
  const obj=target.closest?.('[data-to],[data-wall]');
  if(!obj)return;
  if(obj.hasAttribute('data-wall'))build(Number(obj.dataset.wall));
  else if(obj.hasAttribute('data-to'))step(Number(obj.dataset.to));
}
let pointerOrigin=null;
$('board').addEventListener('pointerdown',event=>{
  pointerOrigin={x:event.clientX,y:event.clientY};
});
$('board').addEventListener('pointercancel',()=>{pointerOrigin=null;});
$('board').addEventListener('click',event=>{
  const origin=pointerOrigin;
  pointerOrigin=null;
  // Algunos navegadores móviles redirigen un toque cercano hacia el botón más
  // próximo. Solo aceptar la superficie realmente tocada, incluidas esquinas.
  if(event.detail>0){
    const action=event.target.closest?.('[data-to],[data-wall]');
    const hit=action?.querySelector('.move-hit,.wall-hit');
    if(!hit)return;
    const point=new DOMPoint(origin?.x??event.clientX,origin?.y??event.clientY);
    if(!hit.isPointInFill(point.matrixTransform(hit.getScreenCTM().inverse())))return;
  }
  activateBoard(event.target);
});
$('board').addEventListener('keydown',event=>{
  if(event.key==='Enter'||event.key===' '){event.preventDefault();pointerOrigin=null;activateBoard(event.target);}
});
$('cancel').addEventListener('click',cancel);
$('new').addEventListener('click',()=>{if(game.moves&&!game.over&&!confirm('¿Comenzar una nueva partida? Se perderá la posición actual.'))return;newGame();});
$('playAgain').addEventListener('click',newGame);
$('inspectBoard').addEventListener('click',()=>{$('endScreen').hidden=true;});
$('help').addEventListener('click',()=>$('helpDialog').showModal());
document.addEventListener('keydown',event=>{
  if($('helpDialog').open)return;
  if(event.key==='Escape'&&!game.over)cancel();
});
// Una sola leyenda: junto al turno en escritorio amplio, dentro de Reglas en tablet/móvil.
const compactLayout=matchMedia('(max-width:1199px)');
const legendPanel=document.querySelector('.legend-panel');
function placeLegend(){
  const compact=compactLayout.matches;
  const parent=compact?$('helpDialog'):document.querySelector('.turn-panel');
  const before=compact?parent.lastElementChild:null;
  parent.insertBefore(legendPanel,before);
  legendPanel.open=!compact;
}
compactLayout.addEventListener('change',placeLegend);
placeLegend();
loadGame();render();
