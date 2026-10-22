import {bindDialog} from './dialogs.mjs';
import {turnMode} from './turnPolicies.mjs';

export function createNavigation({read,start,pause,resume}){
  const get=id=>document.getElementById(id),home=get('homeScreen'),app=document.querySelector('.app'),dialog=get('newDialog');
  let playing=false,controlType='local';
  function setControl(type){
    controlType=type;
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
    const replacing=s.saved&&!s.game.over;
    get('replaceWarning').hidden=!replacing;
    get('startLocal').textContent=replacing?'Reemplazar y comenzar':'Comenzar partida';
  }});
  for(const button of dialog.querySelectorAll('[data-control]'))button.addEventListener('click',()=>setControl(button.dataset.control));
  get('startLocal').addEventListener('click',()=>{
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
  get('home').addEventListener('click',()=>showHome());
  return {showHome,showGame,get playing(){return playing;}};
}
