import {territory,adjacent,wallSet,wallKey,pieceById} from './engine.mjs';
import {activeFromComponents,deriveParticipationEvents} from './participationEvents.mjs';

// Eventos de presentación: las componentes y la puntuación oficial vienen del motor.
// El único recorrido adicional calcula distancias visuales, nunca puntos.
export function deriveTerritoryEvents(before,after){
  const previous=territory(before),current=territory(after),oldType=new Map();
  for(const component of previous.components)for(const cell of component.cells)oldType.set(cell,component.type);
  const walls=wallSet(after),conquests=[],newlyEmpty=[];
  for(const component of current.components){
    if(component.type==='empty'){
      newlyEmpty.push(...component.cells.filter(cell=>oldType.get(cell)!=='empty'));
      continue;
    }
    if(component.type!=='A'&&component.type!=='B')continue;
    const cells=component.cells.filter(cell=>oldType.get(cell)==='mixed');
    if(!cells.length)continue;
    const inside=new Set(component.cells),fresh=new Set(cells);
    const seeds=component.ids.map(id=>pieceById(after,id).pos);
    const distance=new Map(seeds.map(cell=>[cell,0])),queue=[...seeds],layers=[];
    for(let i=0;i<queue.length;i++){
      const cell=queue[i],depth=distance.get(cell);
      if(fresh.has(cell))(layers[depth]??=[]).push(cell);
      for(const neighbor of adjacent(cell)){
        if(inside.has(neighbor)&&!distance.has(neighbor)&&!walls.has(wallKey(cell,neighbor))){
          distance.set(neighbor,depth+1);queue.push(neighbor);
        }
      }
    }
    conquests.push({team:component.type,cells,component:component.cells,players:component.ids,seeds,layers,increment:cells.length});
  }
  return {before:previous.score,after:current.score,conquests,newlyEmpty,gameEnded:after.over,
    participation:deriveParticipationEvents(before,after,{beforeActive:activeFromComponents(previous.components),afterActive:activeFromComponents(current.components)}),
    gains:{A:conquests.filter(event=>event.team==='A').reduce((n,event)=>n+event.increment,0),
      B:conquests.filter(event=>event.team==='B').reduce((n,event)=>n+event.increment,0)}};
}
