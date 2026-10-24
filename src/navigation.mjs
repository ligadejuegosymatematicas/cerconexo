import {bindDialog} from './dialogs.mjs';
import {turnMode} from './turnPolicies.mjs';

export function createNavigation({read,start,pause,resume,feedback=()=>{}}){
  const get=id=>document.getElementById(id),home=get('homeScreen'),app=document.querySelector('.app'),dialog=get('newDialog');
  let playing=false,controlType='local';
  const difficultyDescriptions={beginner:'Decisiones sencillas y variedad para aprender.',intermediate:'Equilibrio entre territorio y anticipación.',advanced:'Más anticipación y análisis de respuestas rivales.'};
  function describeDifficulty(){get('difficultyDescription').textContent=difficultyDescriptions[dialog.querySelector('input[name="difficulty"]:checked').value];}
  function describeTeam(){get('humanTeamDescription').textContent=dialog.querySelector('[name="humanTeam"]:checked').value==='A'?'Tú juegas con A (naranja) y comienzas. La CPU controla B (celeste)':'Tú juegas con B (celeste). La CPU controla A (naranja) y comienza';}
  function scrollHint(){const n=dialog.querySelector('.selector-content');dialog.querySelector('.selector-scroll-hint').hidden=n.scrollHeight<=n.clientHeight+2||n.scrollTop+n.clientHeight>=n.scrollHeight-2;}
  new ResizeObserver(scrollHint).observe(dialog.querySelector('.selector-content'));
  dialog.querySelector('.selector-content').addEventListener('scroll',scrollHint);
  function setControl(type){
    controlType=type;dialog.dataset.selectorControl=type;queueMicrotask(scrollHint);
    for(const button of dialog.querySelectorAll('[data-control]'))button.setAttribute('aria-pressed',String(button.dataset.control===type));
    get('cpuOptions').hidden=type!=='cpu';
    get('localDescription').textContent=type==='cpu'?'Tú controlas un equipo. La CPU controla el rival.':'Dos equipos, cuatro fichas y un dispositivo compartido.';
  }
  function showHome({focus=true}={}){
    const wasPlaying=playing;
    playing=false;app.hidden=true;home.hidden=false;
    // La primera portada no tiene acciones en curso que cancelar. Solo pausar
    // al abandonar una partida evita reiniciar efectos o vibración al cargar.
    if(wasPlaying)pause();
    get('continueGame').hidden=!read().saved;
    get('continueGame').textContent=read().game.over?'Ver resultado':'Continuar partida';
    get('homeStatus').textContent=read().notice??'';
    if(focus)get(read().saved?'continueGame':'play').focus({preventScroll:true});
  }
  function showGame(){
    playing=true;home.hidden=true;app.hidden=false;resume();
    get('home').focus({preventScroll:true});
  }
  bindDialog(dialog,get('new'),{extraOpeners:[get('play')],fallback:get('play'),onOpen:opener=>{
    pause();const s=read(),fromGame=opener.id==='new';
    setControl(fromGame&&s.control?'cpu':'local');
    dialog.querySelector(`input[name="turnMode"][value="${fromGame?turnMode(s.game):'piece'}"]`).checked=true;
    dialog.querySelector(`input[name="difficulty"][value="${fromGame&&s.control?s.control.difficulty:'intermediate'}"]`).checked=true;
    dialog.querySelector(`input[name="humanTeam"][value="${fromGame&&s.control?s.control.humanTeam:'A'}"]`).checked=true;
    describeDifficulty();describeTeam();
    dialog.querySelector('.selector-content').scrollTop=0;
    // showModal restaura el foco y puede restaurar el desplazamiento anterior.
    // Restablecerlo con el diálogo visible, antes del siguiente pintado.
    queueMicrotask(()=>{if(dialog.open)dialog.querySelector('.selector-content').scrollTop=0;});
    get('configurationStatus').textContent='';
    const replacing=(s.stored??s.saved)&&!s.game.over;
    get('replaceWarning').hidden=!replacing;
    get('startLocal').textContent=replacing?'Reemplazar y comenzar':'Comenzar partida';
  }});
  for(const button of dialog.querySelectorAll('[data-control]'))button.addEventListener('click',()=>{feedback();setControl(button.dataset.control);});
  dialog.addEventListener('change',event=>{if(event.target.matches('input[type="radio"]')){feedback();describeDifficulty();describeTeam();}});
  get('startLocal').addEventListener('click',()=>{
    feedback();
    const mode=dialog.querySelector('input[name="turnMode"]:checked').value;
    let control=null;
    if(controlType==='cpu'){
      const seed=new Uint32Array(1);crypto.getRandomValues(seed);
      control={version:1,type:'cpu',humanTeam:dialog.querySelector('input[name="humanTeam"]:checked').value,difficulty:dialog.querySelector('input[name="difficulty"]:checked').value,seed:seed[0]};
    }
    if(!start(mode,control)){get('configurationStatus').textContent='No se pudo guardar. No se reemplazó la partida. Vuelve a intentarlo.';return;}
    get('configurationStatus').textContent='';dialog.close();showGame();
  });
  dialog.addEventListener('close',()=>{if(playing)resume();});
  get('continueGame').addEventListener('click',()=>showGame());
  get('home').addEventListener('click',()=>{
    // Los pasos y los planes CPU ya están guardados por el controlador normal.
    // Cancelar antes de navegar impide que una respuesta atrasada actúe al salir.
    playing=false;pause();location.assign(get('home').dataset.home);
  });
  get('replay').addEventListener('click',()=>{
    const s=read();
    if(!s.game.over)return; // Nunca reemplazar una partida pendiente sin confirmarla.
    feedback();
    let control=s.control?{...s.control}:null;
    if(control){const seed=new Uint32Array(1);crypto.getRandomValues(seed);control.seed=seed[0];}
    if(start(turnMode(s.game),control))showGame();
    else{get('new').click();get('configurationStatus').textContent='No se pudo guardar. No se reemplazó la partida. Vuelve a intentarlo.';}
  });
  function enter(){
    showHome({focus:false});
    const url=new URL(location.href),fresh=url.searchParams.get('new')==='1',direct=url.searchParams.get('continue')==='1';
    if(!fresh&&!direct)return;
    url.searchParams.delete('new');url.searchParams.delete('continue');history.replaceState(null,'',url);
    if(read().saved)showGame();
    if(fresh||!read().saved)get(read().saved?'new':'play').click();
  }
  return {showHome,showGame,enter,get playing(){return playing;}};
}
