import {recentParticipationPresentation} from './matchup.mjs';

export const PARTICIPATION_MS=Object.freeze({confirmation:350});
export function createParticipationFeedback({view,banner,notice,prompt,announcement,reduced=matchMedia('(prefers-reduced-motion: reduce)')}){
  let generation=0,lastMessage=null;
  const animations=new Set(),attention=new Set(),waits=new Set();
  function stopAttention(){for(const a of attention)a.cancel();attention.clear();}
  function stopAnimations(){for(const a of animations)a.cancel();animations.clear();}
  function dismiss(){
    stopAttention();lastMessage=null;
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
  reduced.addEventListener('change',()=>{if(reduced.matches){stopAnimations();stopAttention();for(const release of [...waits])release();}});
  async function confirm(event,{delay=0,onConfirmed=()=>{}}={}){
    if(!event.secured.length)return;
    const ticket=generation;
    if(delay&&!reduced.matches)await wait(delay);
    if(ticket!==generation)return;
    view.markSecured(event.secured.map(p=>p.id));onConfirmed();
    await Promise.all(event.secured.map(p=>pulse(view.token(p.id)?.querySelector('.secured-aura'))));
  }
  function announce(event,options){
    const data=recentParticipationPresentation(event,options);if(!data)return;
    if(lastMessage===data.announcement&&!notice.hidden)return;
    stopAttention();lastMessage=data.announcement;
    const heading=notice.ownerDocument.createElement('strong'),detail=notice.ownerDocument.createElement('span');
    heading.className='recent-heading';detail.className='recent-detail';heading.textContent=data.heading;detail.textContent=data.detail;
    notice.replaceChildren(heading,detail);notice.dataset.team=data.team;notice.hidden=false;banner.classList.add('has-recent-event');
    // Estado visible persistente y anuncio vivo separado: mover o cambiar de turno
    // no repite la explicación. Solo otro acontecimiento, el final o reinicio la sustituye.
    prompt.setAttribute('aria-live','off');announcement.textContent=data.announcement;
    if(!reduced.matches&&notice.animate){
      const color=getComputedStyle(notice).getPropertyValue('--event-color').trim();
      for(const [node,frames] of [[notice,[{boxShadow:'inset 0 0 0 1px transparent'},{boxShadow:`inset 0 0 0 1px ${color}`,offset:.35},{boxShadow:'inset 0 0 0 1px transparent'}]],
        [heading,[{opacity:.55,transform:'translateY(2px)'},{opacity:1,transform:'translateY(0)'}]]]){
        const a=node.animate(frames,{duration:280,easing:'ease-out'});attention.add(a);void a.finished.catch(()=>{}).finally(()=>attention.delete(a));
      }
    }
    if(event.matchup==='last')for(const id of [...event.after.A,...event.after.B])void pulse(view.token(id)?.querySelector('.duel-aura'));
  }
  return {confirm,announce,dismiss,reset};
}
