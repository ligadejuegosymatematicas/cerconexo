/** Geometría exclusiva de Arena. No importa ni modifica el motor Premium. */
export const ARENA_SIZE=9;
export const ARENA_CELLS=81;
export const arenaCell=(row,col)=>(row-1)*ARENA_SIZE+col-1;
export const arenaCoords=cell=>({row:Math.floor(cell/ARENA_SIZE)+1,col:cell%ARENA_SIZE+1});
export const arenaWall=(a,b)=>`${Math.min(a,b)}-${Math.max(a,b)}`;
export const validCell=cell=>Number.isInteger(cell)&&cell>=0&&cell<ARENA_CELLS;
export function arenaNeighbors(cell){
  if(!validCell(cell))return [];
  const r=Math.floor(cell/ARENA_SIZE),c=cell%ARENA_SIZE,out=[];
  if(r>0)out.push(cell-ARENA_SIZE);
  if(c<ARENA_SIZE-1)out.push(cell+1);
  if(r<ARENA_SIZE-1)out.push(cell+ARENA_SIZE);
  if(c>0)out.push(cell-1);
  return out;
}
export const arenaAdjacent=(a,b)=>arenaNeighbors(a).includes(b);

/** Única clasificación territorial de Arena, válida para cualquier número de equipos. */
export function analyzeArena(state){
  const closed=new Set(state.walls),seen=new Uint8Array(ARENA_CELLS),components=[],byCell=[];
  const score=Object.fromEntries(state.teams.map(t=>[t,0]));score.empty=0;score.shared=0;
  const active=[];
  for(let start=0;start<ARENA_CELLS;start++){
    if(seen[start])continue;
    const cells=[start];seen[start]=1;
    for(let i=0;i<cells.length;i++)for(const to of arenaNeighbors(cells[i])){
      if(!seen[to]&&!closed.has(arenaWall(cells[i],to))){seen[to]=1;cells.push(to);}
    }
    const membership=new Set(cells),pieces=state.pieces.filter(p=>membership.has(p.pos));
    const teams=[...new Set(pieces.map(p=>p.team))];
    const type=teams.length===0?'empty':teams.length>1?'shared':teams[0];
    const component={index:components.length,cells,ids:pieces.map(p=>p.id),teams,type};
    cells.forEach(c=>byCell[c]=component.index);components.push(component);score[type]+=cells.length;
    if(type==='shared')active.push(...component.ids);
  }
  const over=score.shared===0;
  const maximum=Math.max(...state.teams.map(t=>score[t]));
  return {components,byCell,score,active,over,winners:over?state.teams.filter(t=>score[t]===maximum):[]};
}

/** Distancias del grafo abierto. Las fichas no son paredes para la conexidad. */
export function arenaDistances(state,start){
  const d=Array(ARENA_CELLS).fill(null),closed=new Set(state.walls),queue=[start];d[start]=0;
  for(let i=0;i<queue.length;i++)for(const to of arenaNeighbors(queue[i])){
    if(d[to]===null&&!closed.has(arenaWall(queue[i],to))){d[to]=d[queue[i]]+1;queue.push(to);}
  }
  return d;
}
