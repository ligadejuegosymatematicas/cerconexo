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
import {setupContextHelp} from './contextHelp.mjs';
import {mountIllustratedManual} from './illustratedManual.mjs';
import {matchupPresentation} from './matchup.mjs';
import {createExploration} from './exploration.mjs';
import {createLiveInspection} from './liveInspection.mjs';
import {CPU_LEVELS} from './cpuSearch.mjs';
import {createCpuPlanner} from './cpuPlanner.mjs';
import {createCpuController} from './cpuController.mjs';
import {isCpuTurn,validCpuPlan} from './cpuSession.mjs';
import {createNavigation} from './navigation.mjs';

const $=id=>document.getElementById(id);
const TEAM_NAME={A:'Equipo A',B:'Equipo B'};
const gate=new InteractionGate();
const boardView=createBoardView($('board'));
const exploration=createExploration({board:$('board'),panel:$('componentInfo'),clearButton:$('clearSelection'),announcement:$('explorationAnnouncement')});
const liveInspection=createLiveInspection({board:$('board'),info:$('classicInspectionInfo')});
let inspecting=false,finalInspect=true;
const feedback=createFeedback({board:$('board'),banner:$('turnBanner'),prompt:$('prompt')});
const haptics=createHaptics();
const territorialFeedback=createTerritoryFeedback({view:boardView,banner:$('turnBanner'),notice:$('territoryNotice'),scores:{A:$('scoreA'),B:$('scoreB')}});
const participationFeedback=createParticipationFeedback({view:boardView,banner:$('turnBanner'),notice:$('recentEvent'),prompt:$('prompt'),announcement:$('participationAnnouncement')});
const resultFeedback=createResultFeedback({banner:$('turnBanner'),result:$('endScreen'),title:$('winnerTitle'),subtitle:$('winnerDetails'),detail:$('winnerDifference'),announcement:$('resultAnnouncement'),scores:{A:$('scoreA'),B:$('scoreB')}});
let game=initialState(),draft=beginDraft(game),control=null,cpuPlan=null,saved=false,stored=false,cpuPhase='idle',pausing=false,boardKeyboard=false,recoveryMessage='';
function safeStore(nextGame=game,nextDraft=draft,session={control,cpuPlan}){
  try{writeGameSave(localStorage,nextGame,nextDraft,session);saved=true;stored=true;return true;}
  catch{
    if(isCpuTurn(game,control)){cpuPhase='blocked';feedback.message('No se pudo guardar. Vuelve a Inicio y continúa para reintentar.');}
    else feedback.notice('No se pudo guardar. La acción no se realizó; vuelve a intentarlo.');
    return false;
  }
}

function loadGame(){
  try{
    const raw=localStorage.getItem(GAME_SAVE_KEY);stored=raw!==null;
    const restored=decodeGameSave(raw);
    if(restored.game){
      game=restored.game;draft=restored.draft;control=restored.control??null;cpuPlan=restored.cpuPlan??null;saved=true;
      if(cpuPlan&&!committedDraft(draft))draft=selectDraft(game,draft,cpuPlan.turn.actor);
      if(restored.recovered){
        safeStore();
        recoveryMessage='El turno guardado estaba dañado. Se recuperó la última posición confirmada.';
        return recoveryMessage;
      }
    }else if(stored)recoveryMessage='No se pudo validar la partida de Clásico. Se conserva sin sobrescribir. Puedes reemplazarla desde Nueva partida.';
  }catch{}
  return '';
}
function newGame(mode=PIECE_TURNS,nextControl=null){
  const next=initialState({turnMode:mode}),nextDraft=beginDraft(next);
  if(!safeStore(next,nextDraft,{control:nextControl,cpuPlan:null}))return false;
  cpu.cancel();
  exploration.reset();liveInspection.reset();inspecting=false;finalInspect=true;
  gate.reset();feedback.reset();participationFeedback.reset();territorialFeedback.reset();haptics.stop();
  resultFeedback.reset();$('prompt').setAttribute('aria-live','polite');
  game=next;draft=nextDraft;control=nextControl;cpuPlan=null;cpuPhase='idle';boardKeyboard=false;recoveryMessage='';$('homeStatus').textContent='';
  render();announceTurn();haptics.pulse('turn');
  return true;
}
function announceTurn(){
  feedback.turnStarted({actor:draft.actor,team:game.turnTeam});
}
function setBusy(){
  boardView.setBusy(gate.busy||!inspecting&&isCpuTurn(game,control));
  $('classicInspect').disabled=gate.busy;
}
async function step(to,automatic=false){
  if(gate.busy||game.over||!draft.actor||draft.path.length>=3||isCpuTurn(game,control)&&!automatic)return false;
  const from=draft.path.at(-1);
  if(!availableMoves(game,draft.actor,from).includes(to))return;
  const nextDraft=advanceDraft(game,draft,to);
  // El paso debe quedar persistido antes de presentar su animación.
  if(!safeStore(game,nextDraft))return;
  const ticket=gate.begin(),actor=draft.actor;
  draft=nextDraft;render();
  await feedback.move(boardView.token(actor),from,to);
  if(!gate.finish(ticket))return false;
  setBusy();
  queueMicrotask(()=>cpu.resume());
  return true;
}
async function build(to,automatic=false){
  if(gate.busy||game.over||!draft.actor||!wallOptions(game,draft.path.at(-1)).includes(to)||isCpuTurn(game,control)&&!automatic)return false;
  let next;
  try{next=applyTurn(game,{actor:draft.actor,path:draft.path,to});}
  catch(error){feedback.notice(error.message);return;}
  const nextDraft=beginDraft(next);
  if(!safeStore(next,nextDraft,{control,cpuPlan:null}))return false;
  const events=deriveTerritoryEvents(game,next),ticket=gate.begin();
  if(next.over)participationFeedback.dismiss();
  game=next;cpuPlan=null;
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
  if(!gate.finish(ticket))return false;
  draft=nextDraft;
  render();
  if(game.over)resultFeedback.enter();
  else{announceTurn();participationFeedback.announce(events.participation,{mode:turnMode(game)});}
  if(automatic&&!game.over&&boardKeyboard&&document.activeElement===document.body&&!document.querySelector('dialog[open]'))$('interactionLayer').querySelector('[role="button"]')?.focus({preventScroll:true});
  queueMicrotask(()=>cpu.resume());
  return true;
}
function selectActor(id,automatic=false){
  if(gate.busy||game.over||committedDraft(draft)||turnMode(game)!==TEAM_TURNS||draft.actor===id||isCpuTurn(game,control)&&!automatic)return;
  try{draft=selectDraft(game,draft,id);}catch{return;}
  render();announceTurn();
}
function render(){
  const actor=draft.actor;
  const {score,components}=territory(game),active=activeIds(game);
  boardView.render(game,draft,{busy:gate.busy,interactive:!isCpuTurn(game,control)&&!inspecting});
  setBusy();
  $('scoreA').textContent=score.A;
  $('scoreB').textContent=score.B;
  for(const team of ['A','B'])$(`score${team}`).setAttribute('aria-label',`${score[team]} casillas aseguradas`);
  renderDistribution(score);
  renderPlayers(actor,active,score);
  renderCpuIdentity();
  exploration.update(game,game.over&&finalInspect&&!gate.busy&&navigation.playing);
  liveInspection.update(components,game.pieces.map(p=>({...p,pos:p.id===draft.actor&&draft.path.length?draft.path.at(-1):p.pos})),inspecting&&!game.over&&!gate.busy&&navigation.playing);
  document.querySelector('.app').classList.toggle('is-inspecting',inspecting&&!game.over);
  $('classicInspect').disabled=gate.busy;
  $('classicInspect').setAttribute('aria-pressed',String(game.over?finalInspect:inspecting));
  $('classicInspect').textContent=(game.over?finalInspect:inspecting)?'Salir de inspección':'Inspeccionar';
}
function renderCpuIdentity(){
  $('boardMeta').textContent=control&&game.over?`Tú ${control.humanTeam} · CPU ${control.humanTeam==='A'?'B':'A'}`:'7 × 7';
  $('cpuIdentity').hidden=!control||game.over;
  if(!control||game.over)return;
  const cpuTeam=control.humanTeam==='A'?'B':'A';
  $('cpuIdentity').textContent=`Tú: ${control.humanTeam} · CPU: ${cpuTeam} · ${CPU_LEVELS[control.difficulty].label}`;
  if(draft.path.length===3)$('turnBanner').querySelector('h2').textContent='2 PASOS';
  if(isCpuTurn(game,control)){
    $('turnName').textContent=`${draft.actor?`Turno de ${draft.actor}`:`Equipo ${game.turnTeam}`} · CPU`;
    if(!committedDraft(draft))$('turnBanner').querySelector('h2').textContent='TURNO CPU';
    if(cpuPhase==='thinking')feedback.message('Preparando su jugada…');
  }
}
const cpu=createCpuController({
  planner:createCpuPlanner(),
  read:()=>({game,draft,control,plan:cpuPlan,visible:navigation.playing,blocked:gate.busy||inspecting||!!document.querySelector('dialog[open]')||document.hidden}),
  savePlan:(plan)=>{
    if(!validCpuPlan(game,draft,control,plan)||!safeStore(game,draft,{control,cpuPlan:plan}))return false;
    cpuPlan=plan;return true;
  },
  select:actor=>selectActor(actor,true),step:to=>step(to,true),build:to=>build(to,true),
  status:phase=>{if(phase==='idle'&&cpuPhase==='blocked')return;cpuPhase=phase;if(phase==='idle'&&isCpuTurn(game,control))return;if(phase==='acting'&&draft.path.length<=1)feedback.message('Mueve o construye');renderCpuIdentity();},
  onError:()=>{cpuPhase='blocked';feedback.message('La CPU no pudo completar la acción. Vuelve a Inicio y continúa para reintentar.');}
});
function pauseGame(){
  pausing=true;cpu.cancel();cpuPhase='idle';
  gate.reset();feedback.reset();participationFeedback.reset();territorialFeedback.reset();resultFeedback.reset();haptics.stop();
  loadGame();render();pausing=false;
}
function resumeGame(){
  render();if(!committedDraft(draft))announceTurn();
  if(recoveryMessage){feedback.notice(recoveryMessage);recoveryMessage='';$('homeStatus').textContent='';}
  queueMicrotask(()=>cpu.resume());
}
const navigation=createNavigation({read:()=>({game,control,saved,stored,notice:recoveryMessage}),start:newGame,pause:pauseGame,resume:resumeGame,feedback:()=>haptics.pulse('turn')});
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
  $('replay').hidden=!game.over||gate.busy;
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
    if(navigation.playing&&!pausing)resultFeedback.show(finalPresentation(game,score));
  }else{
    const team=game.turnTeam,steps=Math.max(0,draft.path.length-1),byTeam=turnMode(game)===TEAM_TURNS;
    if(steps)$('turnBanner').querySelector('h2').textContent=steps===1?'1 PASO':'2 PASOS · CONSTRUYE';
    $('prompt').setAttribute('aria-live','polite');
    $('turnBanner').classList.toggle('team-b',team==='B');
    $('turnDisc').textContent=actor??team;
    $('turnName').textContent=actor?`Turno de ${actor}`:`${TEAM_NAME[team]} · Elige ficha`;
    if(byTeam&&steps===0)$('turnBanner').querySelector('h2').textContent=actor?`FICHA ${actor}`:'AHORA JUEGA';
    $('stepsPill').textContent=steps===0?'Elige casilla o borde':`${steps} ${steps===1?'paso':'pasos'}`;
    feedback.message(!actor?`Elige ${legalActors(game).join(' o ')}`:steps===0?'Mueve o construye':steps===1?'1 paso · Mueve o construye':'2 pasos · Construye tu muro');
  }
}
function activateBoard(target){
  const obj=target.closest?.('[data-to],[data-wall],[data-actor]');
  if(!obj||inspecting||gate.busy||isCpuTurn(game,control)||!navigation.playing||document.querySelector('dialog[open]'))return;
  if(obj.hasAttribute('data-actor'))selectActor(obj.dataset.actor);
  else if(obj.hasAttribute('data-wall'))build(Number(obj.dataset.wall));
  else if(obj.hasAttribute('data-to'))step(Number(obj.dataset.to));
}
let pointerOrigin=null;
$('board').addEventListener('pointerdown',event=>{
  boardKeyboard=false;
  pointerOrigin={x:event.clientX,y:event.clientY,blocked:gate.busy||isCpuTurn(game,control)||!navigation.playing};
  const preview=event.target.closest?.('.wall-pick');
  if(!gate.busy&&preview)preview.classList.add('is-pressed');
});
$('classicInspect').addEventListener('click',()=>{if(gate.busy)return;cpu.cancel();if(game.over){finalInspect=!finalInspect;if(!finalInspect)exploration.reset();}else inspecting=!inspecting;render();if(!inspecting)queueMicrotask(()=>cpu.resume());});
function clearPreview(){document.querySelectorAll('.wall-pick.is-pressed').forEach(node=>node.classList.remove('is-pressed'));}
$('board').addEventListener('pointercancel',()=>{pointerOrigin=null;clearPreview();});
$('board').addEventListener('pointerup',clearPreview);
$('board').addEventListener('pointerleave',clearPreview);
$('board').addEventListener('click',event=>{
  // Un clic incompatible no debe consumir la protección de un gesto iniciado
  // durante la CPU: podría terminar después, cuando vuelva el turno humano.
  if(gate.busy||isCpuTurn(game,control)||!navigation.playing)return;
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
  if(event.key==='Enter'||event.key===' '){event.preventDefault();pointerOrigin=null;boardKeyboard=true;if(!event.repeat)activateBoard(event.target);}
});
bindDialog($('helpDialog'),$('help'),{extraOpeners:[$('homeRules')],fallback:$('homeRules'),onOpen:()=>{cpu.cancel();}});
bindDialog($('optionsDialog'),$('options'),{extraOpeners:[$('homeOptions')],fallback:$('help'),onOpen:()=>{cpu.cancel();if($('helpDialog').open)$('helpDialog').close();}});
bindDialog($('guideDialog'),$('guide'),{fallback:$('help'),onOpen:()=>{cpu.cancel();document.querySelector('.legend-panel').open=true;}});
for(const dialog of document.querySelectorAll('dialog'))dialog.addEventListener('close',()=>{if(navigation.playing)queueMicrotask(()=>cpu.resume());});
function updateHapticOption(){
  $('vibration').checked=haptics.enabled;
  $('vibration').disabled=!haptics.supported;
  $('vibrationStatus').textContent=!haptics.supported?'Este navegador no ofrece vibración.':haptics.paused?'En pausa por la preferencia de movimiento reducido.':'Pulsos breves, si el dispositivo lo permite.';
}
$('vibration').addEventListener('change',()=>{haptics.setEnabled($('vibration').checked);updateHapticOption();});
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',()=>{haptics.stop();updateHapticOption();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){haptics.stop();cpu.cancel();}else if(navigation.playing)cpu.resume();});
window.addEventListener('focus',()=>{if(navigation.playing)cpu.resume();});
window.addEventListener('pagehide',()=>{haptics.stop();cpu.cancel();});
updateHapticOption();
// Una sola guía; en ventanas compactas se consulta sin cambiar la retícula del juego.
const compactLayout=matchMedia('(max-width:1199px), (max-height:650px)');
const legendPanel=document.querySelector('.legend-panel');
function placeLegend(){
  $('helpDialog').querySelector('[data-guide-pane="board"]').append(legendPanel);
  legendPanel.open=true;$('guide').hidden=true;
}
compactLayout.addEventListener('change',placeLegend);
placeLegend();
mountIllustratedManual();
setupContextHelp();
// visualViewport incluye la altura realmente visible al cambiar las barras del navegador.
function fitViewport(){
  document.documentElement.style.setProperty('--viewport-height',`${window.visualViewport?.height??window.innerHeight}px`);
}
window.visualViewport?.addEventListener('resize',fitViewport);
window.addEventListener('resize',fitViewport);
fitViewport();
loadGame();render();navigation.enter();
