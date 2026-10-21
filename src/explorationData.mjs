import {territory,CELL_COUNT,adjacent,wallSet,wallKey} from './engine.mjs';

// Instantánea de consulta. El motor sigue siendo la única fuente de regiones y puntos.
export function finalRegions(game){
  if(!game.over)return null;
  const {components,score}=territory(game);
  if(components.some(c=>c.type==='mixed'))return null;
  const byCell=Array(CELL_COUNT),counts={A:0,B:0,empty:0},closed=wallSet(game);
  const connections=Array.from({length:CELL_COUNT},(_,cell)=>adjacent(cell).filter(to=>!closed.has(wallKey(cell,to))));
  const regions=components.map((c,index)=>{
    const region={index,type:c.type,cells:[...c.cells],ids:[...c.ids].sort()};
    counts[c.type]++;
    for(const cell of c.cells)byCell[cell]=region;
    return region;
  });
  return {regions,byCell,counts,score:{...score},connections,total:regions.length};
}

// Distancias educativas desde una casilla, nunca cálculo de puntuación.
export function explorationLayers(snapshot,cell){
  const region=snapshot?.byCell[cell];if(!region)return [];
  const seen=new Set([cell]),queue=[cell],distances=new Map([[cell,0]]),layers=[];
  for(let i=0;i<queue.length;i++){
    const from=queue[i],depth=distances.get(from);(layers[depth]??=[]).push(from);
    for(const to of snapshot.connections[from])if(!seen.has(to)&&snapshot.byCell[to]===region){
      seen.add(to);distances.set(to,depth+1);queue.push(to);
    }
  }
  return layers;
}

export function regionDescription(region){
  const size=region.cells.length,empty=region.type==='empty';
  return {title:empty?'REGIÓN VACÍA':`REGIÓN DEL EQUIPO ${region.type}`,
    size:`${size} ${size===1?'casilla conectada':'casillas conectadas'}`,
    pieces:empty?'Sin fichas · No otorga puntos':`${region.ids.length===1?'Ficha presente':'Fichas presentes'}: ${region.ids.join(' y ')}`,
    explanation:'Estas casillas están conectadas porque podemos desplazarnos entre ellas sin cruzar muros.'};
}
