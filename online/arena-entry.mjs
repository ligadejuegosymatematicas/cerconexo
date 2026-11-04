import {ARENA_DUO_ENABLED, ARENA_1V1_ENABLED, ARENA_FFA_ENABLED} from './config.mjs';
// Capture navigation only. The official Local/CPU form handlers stay untouched.
const dialog=document.querySelector('#newDialog'),radio=dialog?.querySelector('[name=opponent][value=online]');
if(ARENA_DUO_ENABLED&&radio){
  radio.disabled=false;const label=radio.closest('label');label.classList.remove('online-pending');label.querySelector('small').textContent=ARENA_FFA_ENABLED?'1 vs. 1 · 2 vs. 2 · 4 equipos':ARENA_1V1_ENABLED?'1 vs. 1 o 2 vs. 2':'2 vs. 2';document.querySelector('#arenaOnlinePending').textContent=ARENA_FFA_ENABLED?'Dos equipos o cuatro equipos independientes.':ARENA_1V1_ENABLED?'Dos o cuatro personas · diez minutos por equipo.':'Cuatro personas · por ficha · diez minutos por equipo.';
  let selected=false,concealed=[];const fieldsets=[...dialog.querySelectorAll('fieldset')].filter(f=>!f.contains(radio)),advanced=dialog.querySelector('details'),button=dialog.querySelector('#startArena');let originalLabel=button.textContent;
  const layout=()=>{const next=radio.checked;if(next&&!selected){concealed=[...fieldsets,...(advanced?[advanced]:[])].map(node=>[node,node.hidden]);originalLabel=button.textContent;for(const[node]of concealed)node.hidden=true;button.textContent='Continuar';}else if(!next&&selected){for(const[node,hidden]of concealed)node.hidden=hidden;button.textContent=originalLabel;}selected=next;};
  document.addEventListener('change',event=>{if(!event.target.matches('[name=opponent]')||!dialog.contains(event.target))return;layout();if(selected)event.stopImmediatePropagation();},true);
  new MutationObserver(()=>{if(dialog.open&&radio.checked)layout();}).observe(dialog,{attributes:true,attributeFilter:['open']});
  document.addEventListener('submit',event=>{if(!dialog.contains(event.target)||!radio.checked)return;event.preventDefault();event.stopImmediatePropagation();const url=new URL('./',import.meta.url);url.searchParams.set('mode','arena-duo');location.assign(url);},true);
}
