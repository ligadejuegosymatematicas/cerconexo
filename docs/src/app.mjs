import {initialState,territory,activeIds,availableMoves,wallOptions,applyTurn,legalActors} from './engine.mjs';
import {PIECE_TURNS,TEAM_TURNS,turnMode} from './turnPolicies.mjs';
import {beginDraft,selectDraft,committedDraft,advanceDraft} from './turnDraft.mjs';
import {GAME_SAVE_KEY,decodeGameSave,writeGameSave} from './gameSave.mjs';
import {createBoardView} from './boardView.mjs';
import {InteractionGate,createFeedback} from './feedback.mjs';
import {createHaptics} from './haptics.mjs';
import {deriveTerritoryEvents} from './territoryEvents.mjs';
import {createTerritoryFeedback,TERRITORY_MS} from './territoryFeedback.mjs';
import {createParticipationFeedback} from './participationFeedback.mjs';
import {finalPresentation} from './resultEvents.mjs';
import {createResultFeedback} from './resultFeedback.mjs';
import {bindDialog} from './dialogs.mjs';
import {matchupPresentation} from './matchup.mjs';
import {createExploration} from './exploration.mjs';

const $=id=>document.getElementById(id);
const TEAM_NAME={A:'Equipo A',B:'Equipo B'};
const gate=new InteractionGate();
const boardView=createBoardView($('board'));
const exploration=createExploration({board:$('board'),panel:$('componentInfo'),clearButton:$('clearSelection'),announcement:$('explorationAnnouncement')});
const feedback=createFeedback({board:$('board'),banner:$('turnBanner'),prompt:$('prompt')});
const haptics=createHaptics();
const territorialFeedback=createTerritoryFeedback({view:boardView,banner:$('turnBanner'),notice:$('territoryNotice'),scores:{A:$('scoreA'),B:$('scoreB')}});
const participationFeedback=createParticipationFeedback({view:boardView,banner:$('turnBanner'),notice:$('recentEvent'),prompt:$('prompt'),announcement:$('participationAnnouncement')});
const resultFeedback=createResultFeedback({banner:$('turnBanner'),result:$('endScreen'),title:$('winnerTitle'),subtitle:$('winnerDetails'),detail:$('winnerDifference'),announcement:$('resultAnnouncement'),scores:{A:$('scoreA'),B:$('scoreB')}});
let game=initialState(),draft=beginDraft(game);
function safeStore(nextGame=game,nextDraft=draft){
  try{writeGameSave(localStorage,nextGame,nextDraft);return true;}
  catch{feedback.notice('No se pudo guardar. La acción no se realizó; vuelve a intentarlo.');return false;}
}

function loadGame(){
  try{
    const restored=decodeGameSave(localStorage.getItem(GAME_SAVE_KEY));
    if(restored.game){
      game=restored.game;draft=restored.draft;
      if(restored.recovered){
        safeStore();
        return 'El turno guardado estaba dañado. Se recuperó la última posición confirmada.';
      }
    }
  }catch{}
  return '';
}
function newGame(mode=PIECE_TURNS){
  const next=initialState({turnMode:mode}),nextDraft=beginDraft(next);
  if(!safeStore(next,nextDraft))return;
  exploration.reset();
  gate.reset();feedback.reset();participationFeedback.reset();territorialFeedback.reset();haptics.stop();
  resultFeedback.reset();$('prompt').setAttribute('aria-live','polite');
  game=next;draft=nextDraft;
  render();announceTurn();haptics.pulse('turn');
}
function announceTurn(){
  feedback.turnStarted({actor:draft.actor,team:game.turnTeam});
}
function setBusy(){
  boardView.setBusy(gate.busy);
}
async function step(to){
  if(gate.busy||game.over||!draft.actor||draft.path.length>=3)return;
  const from=draft.path.at(-1);
  if(!availableMoves(game,draft.actor,from).includes(to))return;
  const nextDraft=advanceDraft(game,draft,to);
  // El paso debe quedar persistido antes de presentar su animación.
  if(!safeStore(game,nextDraft))return;
  const ticket=gate.begin(),actor=draft.actor;
  draft=nextDraft;render();
  await feedback.move(boardView.token(actor),from,to);
  if(!gate.finish(ticket))return;
  setBusy();
}
async function build(to){
  if(gate.busy||game.over||!draft.actor||!wallOptions(game,draft.path.at(-1)).includes(to))return;
  let next;
  try{next=applyTurn(game,{actor:draft.actor,path:draft.path,to});}
  catch(error){feedback.notice(error.message);return;}
  const nextDraft=beginDraft(next);
  if(!safeStore(next,nextDraft))return;
  const events=deriveTerritoryEvents(game,next),ticket=gate.begin();
  if(next.over)participationFeedback.dismiss();
  game=next;
  if(game.over)$('prompt').setAttribute('aria-live','off');
  $('turnBanner').querySelector('h2').textContent='RESOLVIENDO';
  // Confirmar y guardar una sola vez, ANTES del efecto: recargar es seguro.
  setBusy();
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
  draft=nextDraft;
  render();
  if(game.over)resultFeedback.enter();
  else{announceTurn();participationFeedback.announce(events.participation,{mode:turnMode(game)});}
}
function selectActor(id){
  if(gate.busy||game.over||committedDraft(draft)||turnMode(game)!==TEAM_TURNS||draft.actor===id)return;
  try{draft=selectDraft(game,draft,id);}catch{return;}
  render();announceTurn();
}
function render(){
  const actor=draft.actor;
  const {score}=territory(game),active=activeIds(game);
  boardView.render(game,draft,{busy:gate.busy});
  setBusy();
  $('scoreA').textContent=score.A;
  $('scoreB').textContent=score.B;
  for(const team of ['A','B'])$(`score${team}`).setAttribute('aria-label',`${score[team]} casillas aseguradas`);
  renderDistribution(score);
  renderPlayers(actor,active,score);
  exploration.update(game,game.over&&!gate.busy);
}
function renderDistribution(score){
  $('mixedCount').textContent=score.mixed;
  $('emptyCount').textContent=score.empty;
  const final=game.over&&!gate.busy;
  document.querySelector('.app').classList.toggle('has-final-board',final);
  $('distributionLabel').textContent=final?'49 casillas':'En disputa';
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
  for(const row of document.querySelectorAll('[data-team-guide]'))row.hidden=turnMode(game)!==TEAM_TURNS;
  const matchup=matchupPresentation(game,active);
  $('matchup').style.visibility=matchup?'visible':'hidden';
  $('matchup').setAttribute('aria-hidden',String(!matchup));
  if(matchup){$('matchupLabel').textContent=matchup.label;$('matchupPlayers').textContent=matchup.players;}
  if(game.over){
    $('turnDisc').textContent='✓';$('turnName').textContent='Equipo A · Jugador\u00a01';
    $('turnBanner').classList.remove('team-b');$('stepsPill').textContent='Territorios cerrados';
    $('prompt').setAttribute('aria-live','off');
    feedback.message('Partida finalizada');
    resultFeedback.show(finalPresentation(game,score));
  }else{
    const team=game.turnTeam,steps=Math.max(0,draft.path.length-1),byTeam=turnMode(game)===TEAM_TURNS;
    if(steps)$('turnBanner').querySelector('h2').textContent=steps===1?'1 PASO':'2 PASOS · CONSTRUYE';
    $('prompt').setAttribute('aria-live','polite');
    $('turnBanner').classList.toggle('team-b',team==='B');
    $('turnDisc').textContent=actor??team;
    $('turnName').textContent=byTeam?actor?`${TEAM_NAME[team]} · Ficha ${actor}`:`${TEAM_NAME[team]} · Elige ficha`:`${TEAM_NAME[team]} · Jugador\u00a0${actor[1]}`;
    if(byTeam&&steps===0)$('turnBanner').querySelector('h2').textContent=actor?`FICHA ${actor}`:'AHORA JUEGA';
    $('stepsPill').textContent=steps===0?'Elige casilla o borde':`${steps} ${steps===1?'paso':'pasos'}`;
    feedback.message(!actor?`Elige ${legalActors(game).join(' o ')} · Toca una ficha`:steps===0?`Turno de ${actor} · Mueve o construye`:steps===1?'1 paso · Puedes continuar o construir':'2 pasos · Construye tu muro');
  }
}
function activateBoard(target){
  const obj=target.closest?.('[data-to],[data-wall],[data-actor]');
  if(!obj||gate.busy||document.querySelector('dialog[open]'))return;
  if(obj.hasAttribute('data-actor'))selectActor(obj.dataset.actor);
  else if(obj.hasAttribute('data-wall'))build(Number(obj.dataset.wall));
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
    const action=event.target.closest?.('[data-to],[data-wall],[data-actor]');
    const hit=action?.querySelector('.move-hit,.wall-hit,.actor-hit');
    if(!hit)return;
    const point=new DOMPoint(origin?.x??event.clientX,origin?.y??event.clientY);
    if(!hit.isPointInFill(point.matrixTransform(hit.getScreenCTM().inverse())))return;
  }
  activateBoard(event.target);
});
$('board').addEventListener('keydown',event=>{
  if(event.key==='Enter'||event.key===' '){event.preventDefault();pointerOrigin=null;if(!event.repeat)activateBoard(event.target);}
});
bindDialog($('newDialog'),$('new'),{onOpen:()=>{
  if((game.moves||committedDraft(draft))&&!game.over&&!confirm('¿Comenzar una nueva partida? Se perderá la posición actual.'))return false;
  document.querySelector(`input[name="turnMode"][value="${turnMode(game)}"]`).checked=true;
}});
$('startLocal').addEventListener('click',()=>{
  if(!$('newDialog').open)return;
  const mode=document.querySelector('input[name="turnMode"]:checked').value;
  $('newDialog').close();newGame(mode);
});
bindDialog($('helpDialog'),$('help'));
bindDialog($('optionsDialog'),$('options'));
bindDialog($('guideDialog'),$('guide'),{fallback:$('help'),onOpen:()=>{document.querySelector('.legend-panel').open=true;}});
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
// Una sola guía; en ventanas compactas se consulta sin cambiar la retícula del juego.
const compactLayout=matchMedia('(max-width:1199px), (max-height:650px)');
const legendPanel=document.querySelector('.legend-panel');
function placeLegend(){
  const compact=compactLayout.matches;
  if(!compact&&$('guideDialog').open)$('guideDialog').close();
  const parent=compact?$('guideDialog'):document.querySelector('.turn-panel');
  parent.append(legendPanel);legendPanel.open=true;
  $('guide').hidden=!compact;
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
const recoveryNotice=loadGame();render();if(!committedDraft(draft))announceTurn();
if(recoveryNotice)feedback.notice(recoveryNotice);
