import {PIECE_TURNS,TEAM_TURNS,turnMode,validTurnMode,policyActors,policyActor} from './turnPolicies.mjs';
/** Cerconexo — motor puro, sin DOM. Coordenadas internas 0..48. */
export const SIZE = 7;
export const CELL_COUNT = SIZE * SIZE;
export const MAX_INTERIOR_WALLS = 84;
export const PLAYERS = Object.freeze([
  { id: 'A1', team: 'A', start: 8 },  // (2,2)
  { id: 'B1', team: 'B', start: 12 }, // (2,6)
  { id: 'A2', team: 'A', start: 40 }, // (6,6)
  { id: 'B2', team: 'B', start: 36 }, // (6,2)
]);
export const TEAM_IDS = { A: ['A1', 'A2'], B: ['B1', 'B2'] };
export const GAME_VERSION = 2;

export const wallKey = (a,b) => `${Math.min(a,b)}-${Math.max(a,b)}`;
export const coords = (index) => ({ row: Math.floor(index / SIZE) + 1, col: index % SIZE + 1 });
export const cellIndex = (row,col) => (row-1)*SIZE + col-1;
export const adjacent = (cell) => {
  const r=Math.floor(cell/SIZE), c=cell%SIZE, result=[];
  if(r>0) result.push(cell-SIZE);
  if(c<SIZE-1) result.push(cell+1);
  if(r<SIZE-1) result.push(cell+SIZE);
  if(c>0) result.push(cell-1);
  return result;
};
export const isNeighbor = (a,b) => Number.isInteger(a) && Number.isInteger(b) && a>=0 && a<CELL_COUNT && adjacent(a).includes(b);
export const wallSet = state => new Set(state.walls);
export const pieceById = (state,id) => state.pieces.find(p=>p.id===id);

export function regions(state){
  const closed=wallSet(state), seen=new Uint8Array(CELL_COUNT), output=[];
  for(let first=0;first<CELL_COUNT;first++){
    if(seen[first]) continue;
    const cells=[first]; seen[first]=1;
    for(let i=0;i<cells.length;i++){
      const a=cells[i];
      for(const b of adjacent(a)){
        if(!seen[b] && !closed.has(wallKey(a,b))){seen[b]=1;cells.push(b);}
      }
    }
    const ids=state.pieces.filter(p=>cells.includes(p.pos)).map(p=>p.id);
    const teams=[...new Set(ids.map(id=>pieceById(state,id).team))];
    const type=teams.length===0?'empty':teams.length===2?'mixed':teams[0];
    output.push({cells,ids,teams,type});
  }
  return output;
}
export function territory(state){
  const r=regions(state), score={A:0,B:0,empty:0,mixed:0};
  for(const component of r) score[component.type]+=component.cells.length;
  return {score,components:r};
}
export function finished(state){return regions(state).every(c=>c.type!=='mixed');}
export function activeIds(state){
  const current=regions(state), playing=new Set();
  current.filter(c=>c.type==='mixed').forEach(c=>c.ids.forEach(id=>playing.add(id)));
  return playing;
}
export function chooseActor(state,team){
  return policyActor(state,team,TEAM_IDS[team],activeIds(state));
}
export function legalActors(state){return policyActors(state,activeIds(state));}
export function initialState({turnMode:mode=PIECE_TURNS}={}){
  if(!validTurnMode(mode))throw new Error('Modalidad desconocida.');
  const state={version:GAME_VERSION,moves:0,walls:[],pieces:PLAYERS.map(p=>({...p,pos:p.start})),turnTeam:'A',lastActed:{A:null,B:null},currentActor:'A1',over:false,winner:null,lastMove:null};
  // La ausencia del campo sigue representando exactamente el formato clásico v2.
  if(mode===TEAM_TURNS){state.turnMode=mode;state.currentActor=null;}
  return state;
}
export function availableMoves(state,pieceId,position=pieceById(state,pieceId)?.pos){
  if(position===undefined) return [];
  const occupied=new Set(state.pieces.filter(p=>p.id!==pieceId).map(p=>p.pos));
  const closed=wallSet(state);
  return adjacent(position).filter(to=>!occupied.has(to)&&!closed.has(wallKey(position,to)));
}
export function wallOptions(state,cell){
  const closed=wallSet(state);
  return adjacent(cell).filter(to=>!closed.has(wallKey(cell,to)));
}
export function validateTurn(state,{actor,path,to}){
  if(state.over) throw new Error('La partida ya terminó.');
  if(!validTurnMode(turnMode(state)))throw new Error('Modalidad desconocida.');
  if(turnMode(state)===TEAM_TURNS){
    if(!legalActors(state).includes(actor))throw new Error(`Elige una ficha activa del equipo ${state.turnTeam}.`);
  }else if(actor!==state.currentActor) throw new Error(`Debe jugar ${state.currentActor}.`);
  if(!Array.isArray(path)||path.length<1||path.length>3)throw new Error('Solo se permiten 0, 1 o 2 pasos.');
  const p=pieceById(state,actor);
  if(!p||path[0]!==p.pos) throw new Error('El movimiento debe comenzar en la ficha activa.');
  for(let i=1;i<path.length;i++){
    if(!availableMoves(state,actor,path[i-1]).includes(path[i]))throw new Error('Desplazamiento ilegal.');
  }
  const finish=path[path.length-1];
  if(!wallOptions(state,finish).includes(to))throw new Error('El muro debe colocarse en un lado interior libre de la casilla final.');
  return finish;
}
export function applyTurn(state,turn){
  const landing=validateTurn(state,turn);
  const next=structuredClone(state), piece=pieceById(next,turn.actor);
  piece.pos=landing;
  const from=landing;
  next.walls.push(wallKey(from,turn.to));
  next.moves++;
  next.lastActed[piece.team]=piece.id;
  next.lastMove={actor:piece.id,path:[...turn.path],wall:[from,turn.to]};
  next.over=finished(next);
  if(next.over){
    const {score}=territory(next);
    next.winner=score.A===score.B?'Empate':score.A>score.B?'A':'B';
    next.currentActor=null;
  }else{
    next.turnTeam=piece.team==='A'?'B':'A';
    next.currentActor=chooseActor(next,next.turnTeam);
    if(!legalActors(next).length)throw new Error('Inconsistencia: partida activa sin ficha para el equipo siguiente.');
  }
  return next;
}
export function verifyState(state){
  if(!state||!validTurnMode(turnMode(state)))return false;
  if(state.version!==GAME_VERSION||!Array.isArray(state.walls)||!Array.isArray(state.pieces)||state.pieces.length!==4)return false;
  if(new Set(state.pieces.map(p=>p.id)).size!==4)return false;
  if(new Set(state.pieces.map(p=>p.pos)).size!==4)return false;
  if(state.pieces.some(p=>!Number.isInteger(p.pos)||p.pos<0||p.pos>=CELL_COUNT||p.team!==p.id[0]))return false;
  if(new Set(state.walls).size!==state.walls.length||state.walls.length>84)return false;
  for(const w of state.walls){const m=/^(\d+)-(\d+)$/.exec(w);if(!m||!isNeighbor(+m[1],+m[2])||wallKey(+m[1],+m[2])!==w)return false;}
  if(state.walls.length!==state.moves)return false;
  if(state.over!==finished(state))return false;
  if(!['A','B'].includes(state.turnTeam))return false;
  if(!state.over && turnMode(state)===TEAM_TURNS){
    if(!legalActors(state).length||state.currentActor!==chooseActor(state,state.turnTeam))return false;
  }else if(!state.over && (!activeIds(state).has(state.currentActor)||pieceById(state,state.currentActor).team!==state.turnTeam))return false;
  return true;
}
