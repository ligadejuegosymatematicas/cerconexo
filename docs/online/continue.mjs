import { API_BASE } from './config.mjs';
import { apiRequest } from './session.mjs';
import { recoverableOnline, dismissOnline, rememberOnline } from './session-index.mjs';
const portal=document.getElementById('homeScreen')??document.querySelector('main.portal');
if(portal){
  let storage;try{storage=localStorage;}catch{}
  const mount=async()=>{
    if(!storage)return;const ref=recoverableOnline(storage);if(!ref)return;
    let card=document.getElementById('onlineContinue');
    if(!card){
      const css=document.createElement('link');css.rel='stylesheet';css.href=new URL('./continue.css',import.meta.url).href;document.head.append(css);
      card=document.createElement('section');card.id='onlineContinue';card.className='online-continue';card.setAttribute('aria-label','Tu partida online');
      const text=document.createElement('p');text.textContent='Tu acceso online está guardado.';text.dataset.onlineResumeStatus='';
      const link=document.createElement('a');link.dataset.onlineContinue='';link.textContent='Continuar partida online';card.append(text,link);portal.querySelector('.mode-grid').before(card);
    }
    const link=card.querySelector('a'),text=card.querySelector('p'),target=new URL('./',import.meta.url);target.searchParams.set('room',ref.code);if(ref.profile!=='1')target.searchParams.set('profile',ref.profile);link.href=target.href;
    // A pending registration is retried only after the player chooses Continue.
    if(ref.saved.registration){text.textContent='Puedes terminar de entrar a tu sala.';return;}
    try{
      const {state}=await apiRequest(API_BASE,`/api/rooms/${ref.code}/resume`,{},ref.saved.credential);
      rememberOnline(storage,ref);text.textContent=state.status==='finished'?'Tu partida ha terminado. Puedes consultar el resultado.':state.status==='lobby'?'Tu sala te está esperando.':'Tu partida sigue en curso.';
      link.textContent=state.status==='finished'?'Ver partida online':'Continuar partida online';
    }catch(error){
      if(['AUTH','NOT_FOUND','EXPIRED','REJECTED'].includes(error.code)){dismissOnline(storage,ref);card.remove();await mount();}
      else text.textContent='No se pudo conectar. Tu acceso sigue guardado.';
    }
  };
  void mount();window.addEventListener('pageshow',event=>{if(event.persisted){document.getElementById('onlineContinue')?.remove();void mount();}});
}
