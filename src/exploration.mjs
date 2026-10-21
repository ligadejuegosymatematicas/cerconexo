import {SIZE,CELL_COUNT,coords} from './engine.mjs';
import {finalRegions,explorationLayers,regionDescription} from './explorationData.mjs';

export const EXPLORATION_MS=320;

// Solo DOM y efectos cancelables; este módulo no recibe ninguna función de jugada o guardado.
export function createExploration({board,banner,button,panel,announcement,
  reduced=matchMedia('(prefers-reduced-motion: reduce)')}){
  const ns='http://www.w3.org/2000/svg',animations=new Set();
  const make=(name,attrs)=>{const n=document.createElementNS(ns,name);for(const [key,value] of Object.entries(attrs))n.setAttribute(key,value);return n;};
  const highlight=make('g',{'aria-hidden':'true',class:'exploration-highlight'});
  board.insertBefore(highlight,board.querySelector('.wall-dash'));
  const targets=make('g',{'aria-label':'Casillas para explorar regiones',class:'exploration-targets'});
  board.append(targets);
  let gameRef=null,snapshot=null,enabled=false,selected=null,focusCell=0;
  const title=panel.querySelector('[data-region-title]'),size=panel.querySelector('[data-region-size]'),pieces=panel.querySelector('[data-region-pieces]');
  const explanation=panel.querySelector('[data-region-explanation]');
  const buttons=[...panel.querySelectorAll('[data-exploration-tab]')];
  function stop(){for(const animation of animations)animation.cancel();animations.clear();}
  function page(name){
    for(const b of buttons)b.setAttribute('aria-pressed',String(b.dataset.explorationTab===name));
    for(const n of panel.querySelectorAll('[data-exploration-page]')){n.hidden=n.dataset.explorationPage!==name;n.scrollTop=0;}
  }
  for(const b of buttons)b.addEventListener('click',()=>page(b.dataset.explorationTab));
  function focusAt(cell){
    focusCell=cell;
    for(const node of targets.children)node.setAttribute('tabindex',Number(node.dataset.exploreCell)===cell?'0':'-1');
    targets.querySelector(`[data-explore-cell="${cell}"]`)?.focus({preventScroll:true});
  }
  function select(cell){
    if(!enabled||!snapshot?.byCell[cell])return;
    const region=snapshot.byCell[cell];
    page('region');
    if(selected===region)return;
    stop();selected=region;highlight.replaceChildren();
    const data=regionDescription(region);
    title.textContent=data.title;size.textContent=data.size;pieces.textContent=data.pieces;explanation.textContent='Estas casillas se comunican por caminos que no cruzan muros.';
    panel.dataset.owner=region.type;
    announcement.textContent=`${data.title}. ${data.size}. ${data.pieces}.`;
    const nodes=new Map();
    for(const id of region.cells){
      const rect=make('rect',{x:64+(id%SIZE)*80,y:64+Math.floor(id/SIZE)*80,width:72,height:72,rx:7,class:'region-outline','data-region-cell':id});
      highlight.append(rect);nodes.set(id,rect);
    }
    if(reduced.matches)return;
    const layers=explorationLayers(snapshot,cell),spread=EXPLORATION_MS-120;
    layers.forEach((layer,index)=>layer.forEach(id=>{
      const node=nodes.get(id);
      if(!node.animate)return;
      const animation=node.animate([{strokeWidth:3,strokeOpacity:.65},{strokeWidth:9,strokeOpacity:1,offset:.45},{strokeWidth:3,strokeOpacity:.65}],
        {duration:120,delay:layers.length<2?0:index*spread/(layers.length-1),easing:'ease-out'});
      animations.add(animation);void animation.finished.catch(()=>{}).finally(()=>animations.delete(animation));
    }));
  }
  function exit({focus=false}={}){
    stop();enabled=false;selected=null;highlight.replaceChildren();targets.replaceChildren();
    board.classList.remove('is-exploring');banner.classList.remove('is-exploring');
    panel.hidden=true;announcement.textContent='';button.textContent='Explorar las regiones';button.setAttribute('aria-expanded','false');
    if(gameRef?.over)banner.setAttribute('aria-label','Resultado de la partida');
    board.setAttribute('aria-label','Tablero Cerconexo de siete por siete casillas');
    if(focus)button.focus({preventScroll:true});
  }
  function enter(){
    if(!snapshot)return;
    enabled=true;selected=null;page('region');
    title.textContent='EXPLORACIÓN · SOLO CONSULTA';size.textContent='Selecciona cualquier casilla';pieces.textContent='Las cuatro fichas y los muros se conservan.';
    explanation.textContent='Dos casillas están conectadas si existe un camino entre ellas que no cruza muros. Las casillas de una misma región pueden comunicarse entre sí.';
    delete panel.dataset.owner;panel.hidden=false;banner.classList.add('is-exploring');board.classList.add('is-exploring');
    banner.setAttribute('aria-label','La matemática de tu partida · Solo consulta');
    board.setAttribute('aria-label','Exploración de regiones. Flechas para recorrer casillas; Enter o Espacio para seleccionar.');
    button.textContent='Volver al resultado';button.setAttribute('aria-expanded','true');
    const summary=panel.querySelector('[data-region-summary]');
    const regionCount=n=>`${n} ${n===1?'región':'regiones'}`;
    summary.textContent=`${regionCount(snapshot.total)} en total. Equipo A: ${regionCount(snapshot.counts.A)}. Equipo B: ${regionCount(snapshot.counts.B)}. Vacías: ${regionCount(snapshot.counts.empty)}.`;
    panel.querySelector('[data-region-scores]').textContent=`Casillas: A ${snapshot.score.A} + B ${snapshot.score.B} + vacías ${snapshot.score.empty} = ${CELL_COUNT}.`;
    for(let cell=0;cell<CELL_COUNT;cell++){
      const {row,col}=coords(cell);
      targets.append(make('rect',{x:60+(cell%SIZE)*80,y:60+Math.floor(cell/SIZE)*80,width:80,height:80,fill:'transparent',role:'button',tabindex:cell===focusCell?'0':'-1','data-explore-cell':cell,'aria-label':`Fila ${row}, columna ${col}. ${regionDescription(snapshot.byCell[cell]).title.toLowerCase()}. Seleccionar región.`}));
    }
    focusAt(focusCell);
  }
  button.setAttribute('aria-controls',panel.id);button.setAttribute('aria-expanded','false');
  button.addEventListener('click',()=>enabled?exit({focus:true}):enter());
  targets.addEventListener('click',event=>{
    if(document.querySelector('dialog[open]'))return;
    const cell=event.target.dataset.exploreCell;if(cell===undefined)return;
    focusAt(Number(cell));select(Number(cell));
  });
  targets.addEventListener('keydown',event=>{
    if(!enabled||document.querySelector('dialog[open]'))return;
    const cell=Number(event.target.dataset.exploreCell);if(!Number.isInteger(cell))return;
    const row=Math.floor(cell/SIZE),col=cell%SIZE;
    const destination={ArrowLeft:row*SIZE+Math.max(0,col-1),ArrowRight:row*SIZE+Math.min(SIZE-1,col+1),ArrowUp:Math.max(0,row-1)*SIZE+col,ArrowDown:Math.min(SIZE-1,row+1)*SIZE+col,Home:row*SIZE,End:row*SIZE+SIZE-1}[event.key];
    if(destination!==undefined){event.preventDefault();focusAt(destination);}
    if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();if(!event.repeat)select(cell);}
    if(event.key==='Escape'){event.preventDefault();exit({focus:true});}
  });
  reduced.addEventListener('change',()=>{if(reduced.matches)stop();});
  return {
    update(game,ready){
      if(gameRef!==game){exit();gameRef=game;snapshot=ready?finalRegions(game):null;focusCell=0;}
      else if(ready&&!snapshot)snapshot=finalRegions(game);
      if(!ready&&enabled)exit();
      button.hidden=!ready||!snapshot;
    },
    reset(){exit();gameRef=null;snapshot=null;focusCell=0;button.hidden=true;},
    get active(){return enabled;}
  };
}
