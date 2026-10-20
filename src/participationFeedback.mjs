import {participationMessage} from './participationEvents.mjs';

export const PARTICIPATION_MS=Object.freeze({confirmation:350,notice:1400});
export function createParticipationFeedback({view,banner,notice,prompt,reduced=matchMedia('(prefers-reduced-motion: reduce)')}){
  let generation=0,noticeTimer=null,promptBefore='',detail='';
  const animations=new Set(),waits=new Set();
  function stopAnimations(){for(const a of animations)a.cancel();animations.clear();}
  function dismiss(){
    clearTimeout(noticeTimer);noticeTimer=null;
    if(notice.dataset.kind==='participation'){
      notice.hidden=true;notice.replaceChildren();delete notice.dataset.kind;notice.removeAttribute('aria-label');
    }
    banner.classList.remove('has-participation-notice');
    if(detail&&prompt.textContent===detail)prompt.textContent=promptBefore;
    prompt.setAttribute('aria-live','polite');detail='';
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
    const message=participationMessage(event);if(!message)return;
    dismiss();notice.dataset.kind='participation';notice.setAttribute('aria-label',message.announcement);
    const title=document.createElement('span');title.className='conquest-heading';title.textContent=message.title;
    const body=document.createElement('strong');body.className='participation-pair';body.textContent=message.body;
    const summary=document.createElement('span');summary.className='participation-summary';summary.textContent=message.detail;
    notice.replaceChildren(title,body,summary);notice.hidden=false;banner.classList.add('has-participation-notice');
    // Una sola región viva anuncia toda la información. El contexto ordinario puede
    // actualizarse al mover sin repetir este aviso ni impedir la interacción.
    promptBefore=prompt.textContent;detail=message.detail;prompt.setAttribute('aria-live','off');prompt.textContent=detail;
    noticeTimer=setTimeout(dismiss,PARTICIPATION_MS.notice);
    if(event.matchup==='last')for(const id of [...event.after.A,...event.after.B])void pulse(view.token(id)?.querySelector('.duel-aura'));
  }
  return {confirm,announce,dismiss,reset};
}
