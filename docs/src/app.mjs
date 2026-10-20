import {initialState,territory,activeIds,availableMoves,wallOptions,applyTurn,verifyState,pieceById} from './engine.mjs';
import {createBoardView} from './boardView.mjs';
import {InteractionGate,createFeedback} from './feedback.mjs';
import {createHaptics} from './haptics.mjs';
import {deriveTerritoryEvents} from './territoryEvents.mjs';
import {createTerritoryFeedback,TERRITORY_MS} from './territoryFeedback.mjs';
import {createParticipationFeedback} from './participationFeedback.mjs';
import {finalPresentation} from './resultEvents.mjs';
import {createResultFeedback} from './resultFeedback.mjs';

const $=id=>document.getElementById(id);
const SAVE_KEY='wallgo-league-v2';
const TEAM_NAME={A:'Equipo A',B:'Equipo B'};
const gate=new InteractionGate();
const boardView=createBoardView($('board'));
const feedback=createFeedback({board:$('board'),banner:$('turnBanner'),prompt:$('prompt')});
const haptics=createHaptics();
const territorialFeedback=createTerritoryFeedback({view:boardView,banner:$('turnBanner'),notice:$('territoryNotice'),scores:{A:$('scoreA'),B:$('scoreB')}});
const participationFeedback=createParticipationFeedback({view:boardView,banner:$('turnBanner'),notice:$('territoryNotice'),prompt:$('prompt')});
const resultFeedback=createResultFeedback({banner:$('turnBanner'),result:$('endScreen'),title:$('winnerTitle'),subtitle:$('winnerDetails'),detail:$('winnerDifference'),announcement:$('resultAnnouncement'),scores:{A:$('scoreA'),B:$('scoreB')}});
let game=initialState(),draft={path:[8]};
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
  gate.reset();feedback.reset();participationFeedback.reset();territorialFeedback.reset();haptics.stop();
  resultFeedback.reset();$('prompt').setAttribute('aria-live','polite');
  game=initialState();
  draft={path:[piece(game.currentActor).pos]};
  safeStore();render();announceTurn();haptics.pulse('turn');
}
function announceTurn(){
  feedback.turnStarted({actor:game.currentActor,team:game.turnTeam});
}
function setBusy(){
  boardView.setBusy(gate.busy);
  $('cancel').disabled=gate.busy;
}
async function step(to){
  if(gate.busy||game.over||draft.path.length>=3)return;
  const from=draft.path.at(-1);
  if(!availableMoves(game,game.currentActor,from).includes(to))return;
  const ticket=gate.begin(),actor=game.currentActor;
  draft.path.push(to);render();
  await feedback.move(boardView.token(actor),from,to);
  if(!gate.finish(ticket))return;
  setBusy();
}
async function build(to){
  if(gate.busy||game.over||!wallOptions(game,draft.path.at(-1)).includes(to))return;
  let next;
  try{next=applyTurn(game,{actor:game.currentActor,path:draft.path,to});}
  catch(error){feedback.notice(error.message);return;}
  const events=deriveTerritoryEvents(game,next),ticket=gate.begin();
  participationFeedback.dismiss();
  game=next;
  if(game.over)$('prompt').setAttribute('aria-live','off');
  $('turnBanner').querySelector('h2').textContent='RESOLVIENDO';
  // Confirmar y guardar una sola vez, ANTES del efecto: recargar es seguro.
  safeStore();setBusy();
  haptics.committed({secured:events.participation.secured.length>0});
  await feedback.wall(boardView.revealWall(game.lastMove.wall));
  if(!gate.current(ticket))return;
  if(events.conquests.length)feedback.message(events.gameEnded?'Resolviendo la partida':'Preparando el siguiente turno');
  renderDistribution(events.after);
  await Promise.all([
    territorialFeedback.present(events,game),
    participationFeedback.confirm(events.participation,{delay:events.conquests.length?TERRITORY_MS.spread:0,
      onConfirmed:()=>renderRoster(null,new Set([...events.participation.after.A,...events.participation.after.B]))})
  ]);
  if(!gate.finish(ticket))return;
  draft={path:game.over?[]:[piece(game.currentActor).pos]};
  render();
  if(game.over)resultFeedback.enter();
  else{announceTurn();participationFeedback.announce(events.participation);}
}
async function cancel(){
  if(gate.busy||game.over||draft.path.length<2)return;
  const ticket=gate.begin(),actor=game.currentActor;
  setBusy();
  for(let i=draft.path.length-1;i>0;i--){
    await feedback.move(boardView.token(actor),draft.path[i],draft.path[i-1]);
    if(!gate.current(ticket))return;
  }
  if(!gate.finish(ticket))return;
  draft={path:[piece(game.currentActor).pos]};render();
}
function render(){
  const actor=game.currentActor;
  const {score}=territory(game),active=activeIds(game);
  boardView.render(game,draft,{busy:gate.busy});
  setBusy();
  $('scoreA').textContent=score.A;
  $('scoreB').textContent=score.B;
  for(const team of ['A','B'])$(`score${team}`).setAttribute('aria-label',`${score[team]} casillas aseguradas`);
  renderDistribution(score);
  renderPlayers(actor,active,score);
}
function renderDistribution(score){
  $('mixedCount').textContent=score.mixed;
  $('emptyCount').textContent=score.empty;
  const final=game.over&&!gate.busy;
  $('distributionLabel').textContent=final?'A + B + Vacías = 49':'En disputa';
  $('mixedCount').hidden=final;
  $('distributionSwatch').hidden=final;
  $('scoreHeading').textContent=final?'CASILLAS DEFINITIVAS':'CASILLAS ASEGURADAS';
  $('scoreTotal').textContent=final?'49 distribuidas':'49 en total';
  $('meter').innerHTML=['A','mixed','empty','B'].flatMap(type=>Array.from({length:score[type]},()=>`<span class="territory-unit unit-${type}" aria-hidden="true"></span>`)).join('');
  $('meter').setAttribute('aria-label',`Casillas: equipo A ${score.A}, equipo B ${score.B}, en disputa ${score.mixed}, vacías ${score.empty}`);
}
function renderRoster(actor,active){
  for(const team of ['A','B']){
    $(`active${team}`).innerHTML=['1','2'].map(n=>{
      const id=`${team}${n}`,isolated=!active.has(id),current=id===actor&&!game.over;
      const status=isolated?'Asegurado':current?'Turno':'En juego';
      return `<div title="${id} · ${status}" aria-label="${id}, ${status}" class="player ${isolated?'is-isolated':''} ${current?'is-current':''}" id="player-${id}" ${current?'aria-current="true"':''}><span class="player-id">${id}</span><span class="player-state"><span class="state-full">${status}</span><span class="state-short" aria-hidden="true">${isolated?'✓':current?'Turno':'·'}</span></span></div>`;
    }).join('');
  }
}
function renderPlayers(actor,active,score){
  // La retícula conserva la misma altura bajo el resultado integrado.
  $('turnBanner').querySelector('h2').textContent='AHORA JUEGA';
  renderRoster(actor,active);
  $('moveCount').textContent=`${game.moves} ${game.moves===1?'muro construido':'muros construidos'}`;
  $('cancel').hidden=game.over || draft.path.length===1;
  if(game.over){
    $('turnDisc').textContent='✓';$('turnName').textContent='Equipo A · Jugador\u00a01';
    $('turnBanner').classList.remove('team-b');$('stepsPill').textContent='Territorios cerrados';
    $('prompt').setAttribute('aria-live','off');
    feedback.message('Partida finalizada');
    resultFeedback.show(finalPresentation(game,score));
  }else{
    const {team}=piece(actor),steps=draft.path.length-1;
    $('turnBanner').classList.toggle('team-b',team==='B');
    $('turnDisc').textContent=actor;
    $('turnName').textContent=`${TEAM_NAME[team]} · Jugador\u00a0${actor[1]}`;
    $('stepsPill').textContent=steps===0?'Elige casilla o borde':`${steps} ${steps===1?'paso':'pasos'}`;
    feedback.message(steps===0?`Turno de ${actor} · Mueve o construye`:steps===1?'1 paso · Puedes continuar o construir':'2 pasos · Construye tu muro');
  }
}
function activateBoard(target){
  const obj=target.closest?.('[data-to],[data-wall]');
  if(!obj||gate.busy)return;
  if(obj.hasAttribute('data-wall'))build(Number(obj.dataset.wall));
  else if(obj.hasAttribute('data-to'))step(Number(obj.dataset.to));
}
let pointerOrigin=null;
$('board').addEventListener('pointerdown',event=>{
  pointerOrigin={x:event.clientX,y:event.clientY,blocked:gate.busy};
  const preview=event.target.closest?.('.wall-pick');
  if(!gate.busy&&preview)preview.classList.add('is-pressed');
});
function clearPreview(){document.querySelectorAll('.wall-pick.is-pressed').forEach(node=>node.classList.remove('is-pressed'));}
$('board').addEventListener('pointercancel',()=>{pointerOrigin=null;clearPreview();});
$('board').addEventListener('pointerup',clearPreview);
$('board').addEventListener('pointerleave',clearPreview);
$('board').addEventListener('click',event=>{
  const origin=pointerOrigin;
  pointerOrigin=null;
  if(gate.busy||origin?.blocked)return;
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
  if(event.key==='Enter'||event.key===' '){event.preventDefault();pointerOrigin=null;if(!event.repeat)activateBoard(event.target);}
});
$('cancel').addEventListener('click',cancel);
$('new').addEventListener('click',()=>{if(game.moves&&!game.over&&!confirm('¿Comenzar una nueva partida? Se perderá la posición actual.'))return;newGame();});
$('help').addEventListener('click',()=>$('helpDialog').showModal());
function updateHapticOption(){
  $('vibration').checked=haptics.enabled;
  $('vibration').disabled=!haptics.supported;
  $('vibrationStatus').textContent=!haptics.supported?'Este navegador no ofrece vibración.':haptics.paused?'En pausa por la preferencia de movimiento reducido.':'Pulsos breves, si el dispositivo lo permite.';
}
$('vibration').addEventListener('change',()=>{haptics.setEnabled($('vibration').checked);updateHapticOption();});
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',()=>{haptics.stop();updateHapticOption();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)haptics.stop();});
window.addEventListener('pagehide',()=>haptics.stop());
updateHapticOption();
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
// visualViewport incluye la altura realmente visible al cambiar las barras del navegador.
function fitViewport(){
  document.documentElement.style.setProperty('--viewport-height',`${window.visualViewport?.height??window.innerHeight}px`);
}
window.visualViewport?.addEventListener('resize',fitViewport);
window.addEventListener('resize',fitViewport);
fitViewport();
loadGame();render();announceTurn();
