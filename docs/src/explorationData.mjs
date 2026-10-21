import {territory,SIZE,CELL_COUNT,adjacent,wallSet,wallKey} from './engine.mjs';

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

// Geometría de la unión de casillas recibida; no descubre ni reclasifica regiones.
// Los lados se orientan dejando la casilla a la derecha: exterior y agujeros
// tienen orientaciones opuestas. En un vértice de contacto se sigue el giro
// más a la derecha para no unir artificialmente bordes que solo se tocan.
export function componentBoundary(cells){
  const inside=new Set(cells),segments=[];
  const add=(x,y,dx,dy,direction)=>segments.push({from:[x,y],to:[x+dx,y+dy],direction});
  for(const cell of inside){
    const x=cell%SIZE,y=Math.floor(cell/SIZE);
    if(y===0||!inside.has(cell-SIZE))add(x,y,1,0,0);
    if(x===SIZE-1||!inside.has(cell+1))add(x+1,y,0,1,1);
    if(y===SIZE-1||!inside.has(cell+SIZE))add(x+1,y+1,-1,0,2);
    if(x===0||!inside.has(cell-1))add(x,y+1,0,-1,3);
  }
  const key=point=>point.join(','),outgoing=new Map(),unused=new Set(segments);
  for(const segment of segments){const k=key(segment.from);if(!outgoing.has(k))outgoing.set(k,[]);outgoing.get(k).push(segment);}
  const loops=[];
  while(unused.size){
    let edge=unused.values().next().value;const first=edge.from,loop=[first];
    do{
      unused.delete(edge);loop.push(edge.to);
      if(key(edge.to)===key(first))break;
      const candidates=(outgoing.get(key(edge.to))||[]).filter(next=>unused.has(next));
      const rank=next=>[1,0,3,2].indexOf((next.direction-edge.direction+4)%4);
      candidates.sort((a,b)=>rank(a)-rank(b));edge=candidates[0];
      if(!edge)throw new Error('Frontera abierta de componente');
    }while(true);
    loops.push(loop);
  }
  const point=([x,y])=>`${60+x*80} ${60+y*80}`;
  const path=loops.map(loop=>'M'+point(loop[0])+loop.slice(1,-1).map(p=>'L'+point(p)).join('')+'Z').join('');
  return {segments,loops,path};
}
