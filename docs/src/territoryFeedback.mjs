export const TERRITORY_MS=Object.freeze({spread:500,score:300,message:1200});

// Toda interpolación es efímera. Nunca escribe en el motor ni en localStorage.
export function createTerritoryFeedback({view,banner,notice,scores,reduced=matchMedia('(prefers-reduced-motion: reduce)')}){
  let generation=0,release=null,frame=null;
  const animations=new Set();
  function cancelEffects(){
    for(const animation of animations)animation.cancel();
    animations.clear();cancelAnimationFrame(frame);frame=null;
  }
  function clearNotice(){notice.hidden=true;notice.replaceChildren();delete notice.dataset.kind;banner.classList.remove('has-territory-notice');view.setTerritoryPresentation(false);}
  function reset(){generation++;cancelEffects();release?.();release=null;finalScores=null;clearNotice();}
  let finalScores=null;
  function showScores(score){for(const team of ['A','B'])scores[team].textContent=score[team];}
  reduced.addEventListener('change',()=>{if(reduced.matches){cancelEffects();if(finalScores)showScores(finalScores);}});
  function animate(node,frames,options){
    if(reduced.matches||!node?.animate)return;
    const animation=node.animate(frames,{easing:'ease-out',fill:'both',...options});
    animations.add(animation);
    void animation.finished.catch(()=>{}).finally(()=>{animations.delete(animation);animation.cancel();});
  }
  function message(gains){
    const teams=['A','B'].filter(team=>gains[team]>0),plural=teams.length>1;
    const title=document.createElement('span');title.className='conquest-heading';
    title.textContent=plural?'TERRITORIOS ASEGURADOS':'TERRITORIO ASEGURADO';
    const body=document.createElement('span');body.className='conquest-gains';
    for(const team of teams){
      const item=document.createElement('span');item.className=`conquest-gain gain-${team}`;
      const label=document.createElement('span');label.textContent=`Equipo ${team} · `;
      const amount=document.createElement('strong');amount.textContent=`+${gains[team]}`;
      item.append(label,amount);
      const unit=document.createElement('span');unit.textContent=` ${gains[team]===1?'casilla':'casillas'}`;
      if(plural)unit.className='conquest-unit';
      item.append(unit);body.append(item);
    }
    notice.dataset.kind='territory';notice.replaceChildren(title,body);notice.hidden=false;banner.classList.add('has-territory-notice');
  }
  async function present(events,game){
    const ticket=++generation;finalScores=events.after;
    const oldFill=new Map([...events.conquests.flatMap(event=>event.cells),...events.newlyEmpty].map(cell=>[cell,view.cell(cell).getAttribute('fill')]));
    view.paintTerritory(game);
    for(const cell of events.newlyEmpty){
      // La trama neutra aparece sin destello ni señal de conquista.
      animate(view.cell(cell),[{opacity:.55},{opacity:1}],{duration:220});
    }
    for(const event of events.conquests){
      const last=Math.max(1,event.layers.length-1);
      event.layers.forEach((cells,depth)=>{
        for(const cell of cells){
          const node=view.cell(cell),fill=node.getAttribute('fill');
          const tint=`color-mix(in srgb,var(--${event.team.toLowerCase()}-glow) 30%,var(--territory-${event.team.toLowerCase()}))`;
          animate(node,[{fill:oldFill.get(cell)},{fill:tint,offset:.3},{fill}],
            {duration:200,delay:depth/last*(TERRITORY_MS.spread-200)});
        }
      });
    }
    for(const team of ['A','B'])scores[team].setAttribute('aria-label',`${events.after[team]} casillas aseguradas`);
    if(!events.conquests.length){showScores(events.after);finalScores=null;return;}
    view.setTerritoryPresentation(true);
    message(events.gains);
    if(reduced.matches)showScores(events.after);
    else{
      const start=performance.now();showScores(events.before);
      const tick=now=>{
        if(ticket!==generation)return;
        const progress=Math.min(1,(now-start)/TERRITORY_MS.score);
        for(const team of ['A','B'])scores[team].textContent=Math.round(events.before[team]+(events.after[team]-events.before[team])*progress);
        if(progress<1)frame=requestAnimationFrame(tick);else frame=null;
      };
      frame=requestAnimationFrame(tick);
    }
    // El mensaje y ambas conquistas transcurren en paralelo. Una sola pausa breve.
    await new Promise(resolve=>{
      const timer=setTimeout(()=>{release=null;resolve();},TERRITORY_MS.message);
      release=()=>{clearTimeout(timer);resolve();};
    });
    if(ticket!==generation)return;
    showScores(events.after);cancelEffects();clearNotice();finalScores=null;
  }
  return {present,reset};
}
