// Estado de presentación, independiente del motor y del formato de guardado.
export const MOTION_MS=Object.freeze({step:180,wall:280,turn:320});

export class InteractionGate{
  #generation=0;
  #busy=false;
  get busy(){return this.#busy;}
  begin(){if(this.#busy)return null;this.#busy=true;return ++this.#generation;}
  current(ticket){return this.#busy&&ticket===this.#generation;}
  finish(ticket){if(!this.current(ticket))return false;this.#busy=false;return true;}
  reset(){this.#generation++;this.#busy=false;}
}

export function createFeedback({board,banner,prompt,reduced=matchMedia('(prefers-reduced-motion: reduce)')}){
  const animations=new Set();
  let noticeTimer,baseMessage='';
  function play(node,frames,duration){
    if(!node||reduced.matches||!node.animate)return Promise.resolve();
    const animation=node.animate(frames,{duration,easing:'ease-out'});
    animations.add(animation);
    return animation.finished.catch(()=>{}).finally(()=>{animations.delete(animation);});
  }
  function stopAnimations(){for(const animation of animations)animation.cancel();animations.clear();}
  // Cambiar la preferencia durante una transición también debe terminarla.
  reduced.addEventListener('change',()=>{if(reduced.matches)stopAnimations();});
  return {
    reset(){clearTimeout(noticeTimer);stopAnimations();baseMessage='';},
    message(text){clearTimeout(noticeTimer);baseMessage=text;prompt.textContent=text;},
    notice(text){clearTimeout(noticeTimer);prompt.textContent=text;noticeTimer=setTimeout(()=>{prompt.textContent=baseMessage;},2400);},
    move(node,from,to){
      const at=cell=>`translate(${100+(cell%7)*80}px, ${100+Math.floor(cell/7)*80}px)`;
      // El atributo contiene el destino definitivo; la animación solo lo presenta.
      node.setAttribute('transform',at(to).replaceAll('px','').replace(',',''));
      return play(node,[{transform:at(from)},{transform:at(to)}],MOTION_MS.step);
    },
    async wall(line){
      const length=line.getTotalLength();
      const flash=line.cloneNode();flash.removeAttribute('data-edge');flash.setAttribute('class','wall-confirmation');
      board.querySelector('#effectsLayer').append(flash);
      await Promise.all([
        play(line,[{strokeDasharray:`${length}`,strokeDashoffset:`${length}`,stroke:'#f2b83d'},{strokeDasharray:`${length}`,strokeDashoffset:'0',stroke:'#14344f'}],MOTION_MS.wall),
        play(flash,[{opacity:.45,strokeWidth:18},{opacity:0,strokeWidth:12}],MOTION_MS.wall)
      ]);
      flash.remove();
    },
    // Punto único para presentar el inicio del turno; adaptable a otro tipo de partida.
    turnStarted({actor,team}){
      if(!actor)return;
      const aura=board.querySelector(`[data-piece="${actor}"] .token-aura`);
      if(aura){aura.style.stroke=team==='A'?'#f79c38':'#34bceb';void play(aura,[{opacity:0,strokeWidth:3},{opacity:.65,strokeWidth:9,offset:.35},{opacity:0,strokeWidth:3}],MOTION_MS.turn);}
      void play(banner,[{opacity:.65},{opacity:1}],MOTION_MS.turn);
    }
  };
}
