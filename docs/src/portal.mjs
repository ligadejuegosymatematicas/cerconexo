import {launchState,launchLinks} from './launchData.mjs';

const descriptions={classic:'Juego local o contra CPU',arena:'2 vs. 2 o cuatro equipos'};
function refresh(){
  let storage;
  try{storage=localStorage;}catch{storage={getItem(){throw Error('No disponible');}};}
  const states=launchState(storage);
  for(const [mode,{status}] of Object.entries(states)){
    const card=document.querySelector(`[data-mode="${mode}"]`),links=launchLinks(mode,status),enter=card.querySelector('[data-continue]');
    enter.href=links.enter;
    enter.textContent=links.label+' →';
    const fresh=card.querySelector('[data-new]');fresh.href=links.fresh;fresh.hidden=!links.showNew;
    const label=card.querySelector('[data-save-status]');
    label.textContent=status==='pending'?'Partida pendiente':status==='finished'?'Última partida finalizada':status==='invalid'?'Guardado conservado · requiere revisión':descriptions[mode];
    label.classList.toggle('pending',status==='pending');
  }
  const notice=document.getElementById('portalNotice');
  notice.hidden=!Object.values(states).some(s=>s.status==='unavailable');
  notice.textContent=notice.hidden?'':'El navegador no permite consultar el guardado. Puedes entrar a cada modalidad para revisar las opciones.';
  document.documentElement.dataset.portalReady='true';
}
refresh();
window.addEventListener('pageshow',event=>{if(event.persisted)refresh();});
window.addEventListener('storage',refresh);
