import {CELL_COUNT,SIZE,adjacent,wallKey,wallSet,regions,activeIds,availableMoves,wallOptions,coords,legalActors} from './engine.mjs';
import {TEAM_TURNS,turnMode} from './turnPolicies.mjs';
import {committedDraft} from './turnDraft.mjs';
import {moveHitBox,wallHitPolygon} from './boardTargets.mjs';

const TOKEN_FILL={A:'var(--a)',B:'var(--b)'};
export function wallCoord(a,b){
  const x=60+(a%SIZE)*80,y=60+Math.floor(a/SIZE)*80;
  if(b===a+1)return [x+80,y,x+80,y+80];
  if(b===a-1)return [x,y,x,y+80];
  if(b===a+7)return [x,y+80,x+80,y+80];
  if(b===a-7)return [x,y,x+80,y];
  throw new Error('No son casillas adyacentes');
}
function edgeSVG(cls,a,b,extras=''){
  const [x1,y1,x2,y2]=wallCoord(a,b);
  return `<line class="${cls}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${extras}/>`;
}

export function createBoardView(board){
  // Montar una sola vez. Fichas, casillas y muros mantienen identidad y foco.
  let base='<defs><pattern id="empty-region" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="12" height="12" fill="#e7e1d5"/><path d="M0 12L12 0" stroke="#c4bfb4" stroke-width="2"/></pattern></defs><rect x="37" y="37" width="606" height="606" rx="15" fill="var(--panel)"/><rect x="56" y="56" width="568" height="568" rx="5" fill="var(--board)"/>';
  for(let a=0;a<CELL_COUNT;a++)base+=`<rect class="board-cell" data-cell="${a}" x="${60+(a%SIZE)*80}" y="${60+Math.floor(a/SIZE)*80}" width="80" height="80"/>`;
  for(let a=0;a<CELL_COUNT;a++)for(const b of adjacent(a))if(b>a)base+=edgeSVG('wall-dash',a,b,`data-edge="${wallKey(a,b)}"`);
  base+='<rect class="wall-perimeter" x="60" y="60" width="560" height="560"/>';
  for(let c=0;c<SIZE;c++)base+=`<text x="${100+c*80}" y="41" text-anchor="middle" font-size="23" font-weight="750" fill="#b4c4d5">${c+1}</text>`;
  for(let r=0;r<SIZE;r++)base+=`<text x="43" y="${105+r*80}" text-anchor="middle" font-size="23" font-weight="750" fill="#b4c4d5">${r+1}</text>`;
  board.innerHTML=base+'<g id="interactionLayer"></g><g id="piecesLayer"></g><g id="effectsLayer" aria-hidden="true"></g>';
  const layer=board.querySelector('#interactionLayer');
  const pieces=board.querySelector('#piecesLayer');
  const fills={A:'var(--territory-a)',B:'var(--territory-b)',mixed:'var(--neutral)',empty:'url(#empty-region)'};
  const cellNodes=Array.from({length:CELL_COUNT},(_,cell)=>board.querySelector(`[data-cell="${cell}"]`));
  function paintTerritory(game){
    for(const region of regions(game))for(const cell of region.cells){
      cellNodes[cell].setAttribute('fill',fills[region.type]);
      cellNodes[cell].dataset.territory=region.type;
    }
  }
  let renderedGame=null;
  function render(game,draft,{busy=false,interactive=true}={}){
    const active=activeIds(game),actor=draft.actor??game.currentActor;
    const choices=interactive&&turnMode(game)===TEAM_TURNS&&!committedDraft(draft)?legalActors(game):[];
    if(renderedGame!==game){
      paintTerritory(game);
      const walls=wallSet(game);
      for(const edge of board.querySelectorAll('[data-edge]'))edge.setAttribute('class',walls.has(edge.dataset.edge)?'wall-built':'wall-dash');
      renderedGame=game;
    }
    for(const p of game.pieces){
      let node=pieces.querySelector(`[data-piece="${p.id}"]`);
      if(!node){
        pieces.insertAdjacentHTML('beforeend',`<g class="piece-token" data-piece="${p.id}" style="--piece-glow:var(--${p.team.toLowerCase()}-glow)"><circle class="candidate-aura" r="30" aria-hidden="true"/><circle class="secured-aura" r="29" aria-hidden="true"/><circle class="duel-aura" r="31" aria-hidden="true"/><circle class="token-aura" r="30"/><circle cy="3" r="25" fill="#111c21" opacity=".32"/><circle class="token-body" r="24" fill="${TOKEN_FILL[p.team]}"/><text class="token-label" y="5" text-anchor="middle">${p.id}</text><g class="marker-check" aria-hidden="true" transform="translate(22 -19)"><circle r="11"/><text y="5" text-anchor="middle">✓</text></g></g>`);
        node=pieces.lastElementChild;
      }
      const current=p.id===actor&&!game.over,isolated=!active.has(p.id);
      const at=current&&draft.path.length?draft.path.at(-1):p.pos;
      node.setAttribute('transform',`translate(${100+(at%SIZE)*80} ${100+Math.floor(at/SIZE)*80})`);
      node.classList.toggle('token-isolated',isolated);
      node.classList.toggle('token-candidate',choices.includes(p.id)&&!current);
      node.setAttribute('aria-label',`${p.id}${isolated?', territorio asegurado':current?', su turno':''}`);
      node.querySelector('.token-body').setAttribute('class',`token-body ${current?'token-active':'token-outer'}`);
      node.querySelector('.marker-check').style.display=isolated?'':'none';
    }
    // Solo se reemplazan los objetivos efímeros; nunca los nodos animados.
    const focused=document.activeElement;
    const focusKey=layer.contains(focused)&&focused.matches(':focus-visible')?focused.dataset:null;
    let targets='';
    for(const id of choices){
      const p=game.pieces.find(p=>p.id===id),at=id===actor?draft.path.at(-1):p.pos;
      const x=60+(at%SIZE)*80,y=60+Math.floor(at/SIZE)*80,from=draft.path.at(-1);
      const hit=id===actor?{x:x+22,y:y+22,width:36,height:36}:from===undefined?{x:x+6,y:y+6,width:68,height:68}:moveHitBox(x,y,60+(from%SIZE)*80,60+Math.floor(from/SIZE)*80);
      targets+=`<g role="button" tabindex="0" class="actor-pick" data-actor="${id}" aria-pressed="${id===actor}" aria-label="Elegir ficha ${id} del equipo ${p.team}"><rect class="actor-hit" x="${hit.x}" y="${hit.y}" width="${hit.width}" height="${hit.height}"/><circle class="actor-focus" cx="${x+40}" cy="${y+40}" r="34" aria-hidden="true"/></g>`;
    }
    if(!game.over&&actor&&interactive){
      const from=draft.path.at(-1);
      if(draft.path.length<3)for(const a of availableMoves(game,actor,from)){
        const x=100+(a%SIZE)*80,y=100+Math.floor(a/SIZE)*80;
        const hit=moveHitBox(x-40,y-40,60+(from%SIZE)*80,60+Math.floor(from/SIZE)*80);
        targets+=`<g role="button" tabindex="0" class="possible-cell" data-to="${a}" aria-label="Mover a fila ${coords(a).row}, columna ${coords(a).col}"><circle class="move-halo" cx="${x}" cy="${y}" r="21"/><circle class="move-target" cx="${x}" cy="${y}" r="12"/><rect class="move-hit" x="${hit.x}" y="${hit.y}" width="${hit.width}" height="${hit.height}"/></g>`;
      }
      for(const to of wallOptions(game,from)){
        const side=to===from-7?'arriba':to===from+7?'abajo':to===from+1?'a la derecha':'a la izquierda';
        const hit=wallHitPolygon(...wallCoord(from,to)).map(p=>p.join(',')).join(' ');
        targets+=`<g role="button" tabindex="0" class="wall-pick" data-wall="${to}" aria-label="Construir muro ${side} de fila ${coords(from).row}, columna ${coords(from).col}">${edgeSVG('wall-glow',from,to)}<polygon class="wall-hit" points="${hit}"/></g>`;
      }
    }
    layer.innerHTML=targets;
    if(focusKey){
      const selector=focusKey.actor!==undefined?`[data-actor="${focusKey.actor}"]`:focusKey.wall!==undefined?`[data-wall="${focusKey.wall}"]`:`[data-to="${focusKey.to}"]`;
      (layer.querySelector(selector)||layer.querySelector('[role="button"]'))?.focus({preventScroll:true});
    }
    setBusy(busy);
  }
  function setBusy(busy){
    board.setAttribute('aria-busy',String(busy));
    for(const node of layer.children)node.setAttribute('aria-disabled',String(busy));
  }
  function markSecured(ids){
    for(const id of ids){
      const node=pieces.querySelector(`[data-piece="${id}"]`);if(!node)continue;
      node.classList.add('token-isolated');node.setAttribute('aria-label',`${id}, territorio asegurado`);
      node.classList.remove('token-candidate');
      node.querySelector('.token-body').setAttribute('class','token-body token-outer');
      node.querySelector('.marker-check').style.display='';
    }
  }
  return {render,setBusy,paintTerritory,markSecured,setTerritoryPresentation:on=>board.classList.toggle('is-presenting-territory',on),cell:id=>cellNodes[id],token:id=>pieces.querySelector(`[data-piece="${id}"]`),
    revealWall([from,to]){const line=board.querySelector(`[data-edge="${wallKey(from,to)}"]`);line.setAttribute('class','wall-built');return line;}};
}
