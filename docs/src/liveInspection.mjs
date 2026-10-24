import {RegionInspection as InspectionModel,regionDescription as inspectionDescription,regionAnnotation as inspectionAnnotation,regionBoundary as inspectionBoundary} from '../arena/src/regionInspection.mjs';

// Adaptador visual: recibe componentes oficiales, nunca importa acciones o guardado.
export function createLiveInspection({board,info,columns=7}){
  const model=new InspectionModel(),ns='http://www.w3.org/2000/svg';
  const layer=document.createElementNS(ns,'g');layer.classList.add('live-inspection');
  const overlay=document.createElementNS(ns,'g');overlay.classList.add('live-targets');
  board.insertBefore(layer,board.querySelector('.wall-dash'));board.append(overlay);
  const counter=document.createElementNS(ns,'g');counter.classList.add('live-inspection');counter.setAttribute('aria-hidden','true');board.append(counter);
  const node=(tag,attrs)=>{const n=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);return n;};
  let pieces=[],enabled=false;
  const finalCount=node('g',{class:'live-inspection final-region-count','aria-hidden':'true'});board.append(finalCount);
  new MutationObserver(()=>{
    finalCount.replaceChildren();
    const first=board.querySelector('[data-region-cell]');if(!first)return;
    const c=model.components[model.byCell.get(+first.dataset.regionCell)];if(!c)return;
    const a=inspectionAnnotation(c,columns,{occupied:pieces.map(p=>p.pos)}),x=60+a.x*80,y=60+a.y*80;
    const g=node('g',{class:'region-count','data-anchor':a.cell});g.append(node('rect',{x:x-23,y:y-15,width:46,height:30,rx:7}));
    const text=node('text',{x,y});text.textContent=a.count;g.append(text);finalCount.append(g);
  }).observe(board.querySelector('.exploration-highlight'),{childList:true});
  function paint(){
    layer.replaceChildren();counter.replaceChildren();overlay.replaceChildren();info.hidden=!enabled;
    if(!enabled)return;
    board.setAttribute('aria-label','Inspección de regiones. Flechas para recorrer; Enter o Espacio para seleccionar.');
    info.textContent=inspectionDescription(model.selected);
    if(model.selected){
      const c=model.selected,d=inspectionBoundary(c.cells,columns).map(([x,y,u,v])=>`M${60+x*80} ${60+y*80}L${60+u*80} ${60+v*80}`).join('');
      for(const cell of c.cells)layer.append(node('rect',{x:60+cell%columns*80,y:60+Math.floor(cell/columns)*80,width:80,height:80,class:'region-shade'}));
      layer.append(node('path',{d,class:'region-boundary','data-live-boundary':''}));
      const a=inspectionAnnotation(c,columns,{occupied:pieces.map(p=>p.pos)});
      const g=node('g',{class:'region-count','data-anchor':a.cell}),x=60+a.x*80,y=60+a.y*80;
      g.append(node('rect',{x:x-23,y:y-15,width:46,height:30,rx:7}));
      const text=node('text',{x,y});text.textContent=a.count;g.append(text);counter.append(g);
    }
    for(let cell=0;cell<columns*columns;cell++)overlay.append(node('rect',{x:60+cell%columns*80,y:60+Math.floor(cell/columns)*80,width:80,height:80,fill:'transparent',role:'button',tabindex:cell===model.focusCell?0:-1,'data-inspect':cell,'aria-pressed':String(model.selected===model.components[model.byCell.get(cell)]),'aria-label':`Fila ${Math.floor(cell/columns)+1}, columna ${cell%columns+1}. ${inspectionDescription(model.components[model.byCell.get(cell)])}`}));
  }
  overlay.addEventListener('click',e=>{if(document.querySelector('dialog[open]'))return;const cell=e.target.dataset.inspect;if(cell===undefined)return;model.select(+cell);paint();});
  overlay.addEventListener('keydown',e=>{
    if(document.querySelector('dialog[open]'))return;
    if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key)){e.preventDefault();model.moveFocus(e.key);paint();overlay.querySelector(`[data-inspect="${model.focusCell}"]`)?.focus();}
    else if((e.key==='Enter'||e.key===' ')&&!e.repeat){e.preventDefault();e.stopPropagation();model.select(+e.target.dataset.inspect);paint();overlay.querySelector(`[data-inspect="${model.focusCell}"]`)?.focus();}
  });
  return {update(components,nextPieces,on){pieces=nextPieces;model.update(components.map(c=>({...c,type:c.type==='mixed'?'shared':c.type})),columns);enabled=!!on;model.enabled=enabled;if(!enabled)model.selectedCell=null;paint();},reset(){model.reset();enabled=false;paint();}};
}
