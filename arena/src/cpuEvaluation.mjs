import {arenaPiece,inventoryOwner} from './engine.mjs';
import {analyzeArena,arenaNeighbors,arenaWall,arenaDistances} from './geometry.mjs';

const BASE_POWER={demolition:4,jump:3,extraWall:5};
/** Rasgos heurísticos: no son puntuaciones ni reglas alternativas. */
export function arenaCpuFeatures(s,team){
  const view=analyzeArena(s),enemy=team==='A'?'B':'A',points=view.score[team]-view.score[enemy];
  if(s.over)return {terminal:true,points,value:(points===0?0:points>0?100000:-100000)+points*100};
  const closed=new Set(s.walls),occupied=new Set(s.pieces.map(p=>p.pos)),active=new Set(view.active);
  const distances={A:[],B:[]};let mobility=0,access=0,powers=0,exposure=0,control=0;
  for(const p of s.pieces){
    if(!active.has(p.id))continue;
    const sign=p.team===team?1:-1,d=arenaDistances(s,p.pos);distances[p.team].push(d);
    mobility+=sign*arenaNeighbors(p.pos).filter(c=>!closed.has(arenaWall(p.pos,c))&&!occupied.has(c)).length;
    const nearest=s.drops.map(drop=>d[drop.cell]===null?0:BASE_POWER[drop.type]*4/(1+d[drop.cell]));
    access+=sign*(nearest.length?Math.max(...nearest):0);
  }
  // Potencial de acceso en regiones compartidas; jamás se suma al marcador real.
  const nearest=(side,cell)=>Math.min(999,...distances[side].map(d=>d[cell]??999));
  for(const component of view.components)if(component.type==='shared')for(const cell of component.cells){
    const a=nearest(team,cell),b=nearest(enemy,cell);control+=a<b?1:b<a?-1:0;
  }
  for(const [owner,items] of Object.entries(s.inventories)){
    const members=s.policy==='team'?s.pieces.filter(p=>p.team===owner):[arenaPiece(s,owner)];
    const side=members[0].team,sign=side===team?1:-1,live=members.filter(p=>active.has(p.id)),duplicates={};
    for(const item of items){
      const duplicate=duplicates[item.type]??0;duplicates[item.type]=duplicate+1;
      let opportunity=0;
      for(const p of live)for(const to of arenaNeighbors(p.pos)){
        const wall=closed.has(arenaWall(p.pos,to)),region=view.components[view.byCell[to]];
        if(item.type==='demolition'&&wall&&region.type!==side&&region.type!=='shared'&&region.type!=='empty')opportunity=Math.max(opportunity,Math.min(3,region.cells.length*.15));
        if(item.type==='jump'&&wall&&!occupied.has(to)&&(region.type==='empty'||region.type===side))opportunity=Math.max(opportunity,1.5);
        if(item.type==='extraWall'&&!wall)opportunity=Math.max(opportunity,.4);
      }
      // Una ficha asegurada conserva el poder, pero no puede usarlo ahora.
      powers+=sign*(BASE_POWER[item.type]*(live.length?1:.25)+opportunity)/(1+duplicate*.6);
    }
  }
  // Fragilidad estimada: acceso adyacente con poder, no promesa de reconquista.
  const threatened=new Set();
  for(const p of s.pieces)if(active.has(p.id)){
    const items=s.inventories[inventoryOwner(s,p.id)],demolition=items.some(i=>i.type==='demolition'),jump=items.some(i=>i.type==='jump');
    if(!demolition&&!jump)continue;
    for(const to of arenaNeighbors(p.pos)){
      const region=view.components[view.byCell[to]];
      if(region.type===p.team||!['A','B'].includes(region.type)||!closed.has(arenaWall(p.pos,to))||!demolition&&occupied.has(to)||threatened.has(region.index))continue;
      threatened.add(region.index);exposure+=(region.type===team?-1:1)*Math.min(12,region.cells.length*1.5);
    }
  }
  return {terminal:false,points,mobility,access,powers,control,exposure};
}
export function evaluateArenaCpu(s,team){
  const f=arenaCpuFeatures(s,team);
  return f.terminal?f.value:f.points*45+f.mobility*.7+f.access+f.powers+f.control*.3+f.exposure;
}
