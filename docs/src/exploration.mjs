import {SIZE,CELL_COUNT,coords} from './engine.mjs';
import {finalRegions,explorationLayers,regionDescription,componentBoundary,componentSummary} from './explorationData.mjs';

export const EXPLORATION_MS=320;

// Consulta directa del estado final: sin funciones de jugada, guardado o háptica.
export function createExploration({board,panel,clearButton,announcement,
  reduced=matchMedia('(prefers-reduced-motion: reduce)')}){
  const ns='http://www.w3.org/2000/svg',animations=new Set();
  const make=(name,attrs)=>{const n=document.createElementNS(ns,name);for(const [key,value] of Object.entries(attrs))n.setAttribute(key,value);return n;};
  const highlight=make('g',{'aria-hidden':'true',class:'exploration-highlight'});
  board.insertBefore(highlight,board.querySelector('.wall-dash'));
  const targets=make('g',{'aria-label':'Casillas del tablero final',class:'exploration-targets'});board.append(targets);
  const general=panel.querySelector('[data-component-general]'),detail=panel.querySelector('[data-component-selection]');
  const title=panel.querySelector('[data-region-title]'),size=panel.querySelector('[data-region-size]'),pieces=panel.querySelector('[data-region-pieces]');
  let gameRef=null,snapshot=null,enabled=false,selected=null,focusCell=0,backgroundStart=false;
  function stop(){for(const animation of animations)animation.cancel();animations.clear();}
  function pressed(){for(const node of targets.children)node.setAttribute('aria-pressed',String(snapshot?.byCell[Number(node.dataset.exploreCell)]===selected));}
  function focusAt(cell){
    focusCell=cell;
    for(const node of targets.children)node.setAttribute('tabindex',Number(node.dataset.exploreCell)===cell?'0':'-1');
    targets.querySelector(`[data-explore-cell="${cell}"]`)?.focus({preventScroll:true});
  }
  function deselect({focus=false,announce=true}={}){
    const hadSelection=!!selected;stop();selected=null;highlight.replaceChildren();pressed();
    board.classList.remove('has-component-selection');general.hidden=false;detail.hidden=true;delete panel.dataset.owner;
    announcement.textContent=hadSelection&&announce?'Selección quitada.':'';
    if(focus&&enabled)focusAt(focusCell);
  }
  function select(cell){
    if(!enabled||!snapshot?.byCell[cell])return;
    const region=snapshot.byCell[cell];if(selected===region){deselect();return;}
    stop();selected=region;highlight.replaceChildren();pressed();
    const data=regionDescription(region);
    title.textContent=data.title;size.textContent=data.size;pieces.textContent=data.pieces;
    panel.querySelector('[data-region-explanation]').textContent=data.explanation;
    panel.dataset.owner=region.type;general.hidden=true;detail.hidden=false;board.classList.add('has-component-selection');
    announcement.textContent=`${data.title}. ${data.size}. ${data.pieces}. ${data.explanation}`;
    const boundary=componentBoundary(region.cells),clip=make('clipPath',{id:'exploration-clip',clipPathUnits:'userSpaceOnUse'});
    clip.append(make('path',{d:boundary.path,'clip-rule':'evenodd'}));highlight.append(clip);
    // Trazo sobre la frontera exacta, recortado hacia el interior de la región.
    // El grupo está debajo de muros/perímetro/fichas: nunca los tapa.
    highlight.append(make('path',{d:boundary.path,class:'region-shade','fill-rule':'evenodd'}));
    highlight.append(make('path',{d:boundary.path,class:'region-halo'}));
    highlight.append(make('path',{d:boundary.path,class:'region-boundary','data-region-boundary':'','clip-path':'url(#exploration-clip)'}));
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
      // Misma BFS y tiempos; luz suave sin dibujar bordes entre casillas aliadas.
      const animation=node.animate([{opacity:0},{opacity:.28,offset:.45},{opacity:0}],
        {duration:120,delay:layers.length<2?0:index*spread/(layers.length-1),easing:'ease-out'});
      animations.add(animation);void animation.finished.catch(()=>{}).finally(()=>animations.delete(animation));
    }));
  }  function mount(){
    for(let cell=0;cell<CELL_COUNT;cell++){
      const {row,col}=coords(cell);
      targets.append(make('rect',{x:60+(cell%SIZE)*80,y:60+Math.floor(cell/SIZE)*80,width:80,height:80,fill:'transparent',role:'button',tabindex:cell===focusCell?'0':'-1','data-explore-cell':cell,'aria-pressed':'false','aria-label':`Fila ${row}, columna ${col}. ${regionDescription(snapshot.byCell[cell]).title.toLowerCase()}. Seleccionar o quitar selección.`}));
    }
  }
  clearButton.addEventListener('click',()=>deselect({focus:true}));
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
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&enabled&&selected&&!document.querySelector('dialog[open]')){
      event.preventDefault();deselect({focus:panel.contains(document.activeElement)});
    }
  });
  const freeBackground=event=>{
    const target=event.target;
    if(target===document.body||target.matches?.('.app,.layout,.arena,.board-wrap,.board-topline,.turn-panel'))return true;
    // El margen dibujado dentro del SVG también es fondo libre, nunca una casilla.
    if(!board.contains(target)||target.closest?.('[data-explore-cell]'))return false;
    const matrix=board.getScreenCTM();if(!matrix)return false;
    const point=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse());
    return point.x<60||point.x>620||point.y<60||point.y>620;
  };
  document.addEventListener('pointerdown',event=>{backgroundStart=freeBackground(event);});
  document.addEventListener('pointercancel',()=>{backgroundStart=false;});
  document.addEventListener('click',event=>{
    if(enabled&&selected&&!document.querySelector('dialog[open]')&&freeBackground(event)&&(event.detail===0||backgroundStart))deselect();
    backgroundStart=false;
  });
  reduced.addEventListener('change',()=>{if(reduced.matches)stop();});
  return {
    update(game,ready){
      if(gameRef!==game){deselect({announce:false});targets.replaceChildren();gameRef=game;snapshot=null;focusCell=0;}
      enabled=!!ready;panel.hidden=!ready;
      if(!ready){deselect({announce:false});targets.replaceChildren();return;}
      if(!snapshot){
        snapshot=finalRegions(game);if(!snapshot){panel.hidden=true;enabled=false;return;}
        panel.querySelector('[data-region-summary]').textContent=componentSummary(snapshot);
        mount();
      }
      board.setAttribute('aria-label','Tablero final. Flechas para recorrer casillas; Enter o Espacio para seleccionar o quitar una componente conexa.');
    },
    reset(){deselect({announce:false});enabled=false;gameRef=null;snapshot=null;focusCell=0;targets.replaceChildren();panel.hidden=true;board.setAttribute('aria-label','Tablero Cerconexo de siete por siete casillas');},
    get active(){return enabled;}
  };
}
