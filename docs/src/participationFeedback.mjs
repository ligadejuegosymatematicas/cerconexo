import {recentParticipationMessage} from './matchup.mjs';

export const PARTICIPATION_MS=Object.freeze({confirmation:350});
export function createParticipationFeedback({view,banner,notice,prompt,announcement,reduced=matchMedia('(prefers-reduced-motion: reduce)')}){
  let generation=0;
  const animations=new Set(),waits=new Set();
  function stopAnimations(){for(const a of animations)a.cancel();animations.clear();}
  function dismiss(){
    notice.hidden=true;notice.textContent='';announcement.textContent='';
    banner.classList.remove('has-recent-event');
    prompt.setAttribute('aria-live','polite');
  }
  function reset(){generation++;dismiss();stopAnimations();for(const release of [...waits])release();}
  function wait(ms){return new Promise(resolve=>{
    const done=()=>{clearTimeout(timer);waits.delete(done);resolve();};
    const timer=setTimeout(done,ms);waits.add(done);
  });}
  async function pulse(node){
    if(!node||reduced.matches||!node.animate)return;
    const a=node.animate([{opacity:0,strokeWidth:2},{opacity:.5,strokeWidth:5,offset:.4},{opacity:0,strokeWidth:2}],{duration:PARTICIPATION_MS.confirmation,easing:'ease-out'});
    animations.add(a);await a.finished.catch(()=>{});animations.delete(a);
  }
  reduced.addEventListener('change',()=>{if(reduced.matches){stopAnimations();for(const release of [...waits])release();}});
  async function confirm(event,{delay=0,onConfirmed=()=>{}}={}){
    if(!event.secured.length)return;
    const ticket=generation;
    if(delay&&!reduced.matches)await wait(delay);
    if(ticket!==generation)return;
    view.markSecured(event.secured.map(p=>p.id));onConfirmed();
    await Promise.all(event.secured.map(p=>pulse(view.token(p.id)?.querySelector('.secured-aura'))));
  }
  function announce(event){
    const message=recentParticipationMessage(event);if(!message)return;
    if(notice.textContent===message&&!notice.hidden)return;
    notice.textContent=message;notice.hidden=false;banner.classList.add('has-recent-event');
    // Estado visible persistente y anuncio vivo separado: mover o cambiar de turno
    // no repite la explicación. Solo otro acontecimiento, el final o reinicio la sustituye.
    prompt.setAttribute('aria-live','off');announcement.textContent=message;
    if(event.matchup==='last')for(const id of [...event.after.A,...event.after.B])void pulse(view.token(id)?.querySelector('.duel-aura'));
  }
  return {confirm,announce,dismiss,reset};
}
