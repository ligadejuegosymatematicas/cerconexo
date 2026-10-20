export const RESULT_MS=450;

// Presentación persistente y cancelable; no escribe estado ni preferencias.
export function createResultFeedback({banner,result,title,subtitle,detail,announcement,scores,
  reduced=matchMedia('(prefers-reduced-motion: reduce)')}){
  let shown=false;
  const animations=new Set();
  function stop(){for(const a of animations)a.cancel();animations.clear();}
  reduced.addEventListener('change',()=>{if(reduced.matches)stop();});
  function play(node,frames){
    if(reduced.matches||!node?.animate)return;
    const a=node.animate(frames,{duration:RESULT_MS,easing:'ease-out'});animations.add(a);
    void a.finished.catch(()=>{}).finally(()=>animations.delete(a));
  }
  return {
    reset(){
      stop();shown=false;result.hidden=true;announcement.textContent='';
      banner.classList.remove('has-result');delete banner.dataset.result;
      for(const node of Object.values(scores))node.classList.remove('final-emphasis');
      banner.setAttribute('aria-label','Turno actual');
    },
    show(data){
      if(shown||!data)return;
      shown=true;title.textContent=data.title;subtitle.textContent=data.subtitle;detail.textContent=data.detail;
      banner.dataset.result=data.draw?'draw':data.winner;banner.classList.add('has-result');
      banner.setAttribute('aria-label','Resultado de la partida');result.hidden=false;
      for(const team of ['A','B'])scores[team].classList.toggle('final-emphasis',data.draw||data.winner===team);
      // Una sola región viva anuncia el resumen, sin los ticks visuales del marcador.
      announcement.textContent=data.announcement;
    },
    enter(){
      if(!shown)return;
      play(result,[{opacity:0},{opacity:1}]);
      for(const node of Object.values(scores))if(node.classList.contains('final-emphasis'))
        play(node,[{filter:'brightness(1)'},{filter:'brightness(1.3)',offset:.4},{filter:'brightness(1)'}]);
    }
  };
}
