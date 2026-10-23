import {CELL_COUNT,adjacent,wallKey,wallSet,territory,availableMoves} from './engine.mjs';

// Pesos heurísticos iniciales, no óptimos. Todos los términos se normalizan.
export const CPU_WEIGHTS=Object.freeze({secured:90,potential:42,mobility:10,connections:20});
export const CPU_TERMINAL=1000000;
const CPU_NEIGHBORS=Array.from({length:CELL_COUNT},(_,i)=>adjacent(i));
export function cpuOpenGraph(game){
  const closed=wallSet(game);
  return CPU_NEIGHBORS.map((neighbors,a)=>neighbors.filter(b=>!closed.has(wallKey(a,b))));
}
export function cpuDistances(graph,sources){
  const distance=Array(CELL_COUNT).fill(Infinity),queue=[...sources];
  for(const source of sources)distance[source]=0;
  for(let i=0;i<queue.length;i++)for(const b of graph[queue[i]])if(distance[b]===Infinity){distance[b]=distance[queue[i]]+1;queue.push(b);}
  return distance;
}
// Puentes del grafo abierto, solo para estimar oportunidades. No asigna puntos.
export function cpuBridges(graph){
  const entry=Array(CELL_COUNT).fill(-1),low=Array(CELL_COUNT).fill(0),output=[];let clock=0;
  const visit=(a,parent)=>{
    entry[a]=low[a]=clock++;const descendants=[a];
    for(const b of graph[a]){
      if(b===parent)continue;
      if(entry[b]<0){const below=visit(b,a);descendants.push(...below);low[a]=Math.min(low[a],low[b]);if(low[b]>entry[a])output.push({edge:[a,b],side:below});}
      else low[a]=Math.min(low[a],entry[b]);
    }
    return descendants;
  };
  for(let a=0;a<CELL_COUNT;a++)if(entry[a]<0)visit(a,-1);
  return output;
}
export function evaluateCpuState(game,perspective){
  if(!['A','B'].includes(perspective))throw new Error('Perspectiva CPU no válida.');
  const opponent=perspective==='A'?'B':'A',{score,components}=territory(game),difference=score[perspective]-score[opponent];
  if(game.over){
    const value=game.winner==='Empate'?0:game.winner===perspective?CPU_TERMINAL+difference:-CPU_TERMINAL+difference;
    return {value,terminal:true,winner:game.winner,score,terms:{secured:difference/CELL_COUNT,potential:0,mobility:0,connections:0}};
  }
  const graph=cpuOpenGraph(game),active=new Set(components.filter(c=>c.type==='mixed').flatMap(c=>c.ids));
  const pieces={A:game.pieces.filter(p=>p.team==='A'&&active.has(p.id)),B:game.pieces.filter(p=>p.team==='B'&&active.has(p.id))};
  const distance={A:cpuDistances(graph,pieces.A.map(p=>p.pos)),B:cpuDistances(graph,pieces.B.map(p=>p.pos))};
  let potential=0;const reach={A:new Set(),B:new Set()};
  for(const region of components)if(region.type==='mixed')for(const cell of region.cells){
    const own=distance[perspective][cell],rival=distance[opponent][cell];
    // Influencia gradual por caminos reales; nunca adjudica toda la región.
    potential+=(rival-own)/(rival+own+2);
  }
  for(const team of ['A','B'])for(const p of pieces[team]){
    reach[team].add(p.pos);
    for(const first of availableMoves(game,p.id)){reach[team].add(first);for(const second of availableMoves(game,p.id,first))reach[team].add(second);}
  }
  const opportunity={A:0,B:0};
  for(const bridge of cpuBridges(graph)){
    const region=components.find(c=>c.cells.includes(bridge.edge[0]));if(region.type!=='mixed')continue;
    const side=new Set(bridge.side),sizes={A:0,B:0};
    for(const part of [region.cells.filter(c=>side.has(c)),region.cells.filter(c=>!side.has(c))]){
      const teams=new Set(game.pieces.filter(p=>part.includes(p.pos)).map(p=>p.team));
      if(teams.size===1)sizes[[...teams][0]]+=part.length;
    }
    const benefit=sizes.A-sizes.B;
    // Un puente puede favorecer al rival: no se premia simplemente cerrarlo.
    if(benefit>0&&bridge.edge.some(c=>reach.A.has(c)))opportunity.A=Math.max(opportunity.A,benefit);
    if(benefit<0&&bridge.edge.some(c=>reach.B.has(c)))opportunity.B=Math.max(opportunity.B,-benefit);
  }
  const terms={secured:difference/CELL_COUNT,potential:potential/CELL_COUNT,mobility:(reach[perspective].size-reach[opponent].size)/CELL_COUNT,connections:(opportunity[perspective]-opportunity[opponent])/CELL_COUNT};
  const value=Object.entries(CPU_WEIGHTS).reduce((sum,[key,weight])=>sum+terms[key]*weight,0);
  return {value,terminal:false,score,terms,diagnostics:{components:components.length,bridgeOpportunities:opportunity,reachable:{A:reach.A.size,B:reach.B.size}}};
}
