import {ARENA_CELLS,arenaCoords,arenaWall,arenaNeighbors,analyzeArena,arenaDistances} from './geometry.mjs';
import {ARENA_MODES,POWER_TYPES,experimentFor} from './config.mjs';

export const arenaPiece=(s,id)=>s.pieces.find(p=>p.id===id);
export const inventoryOwner=(s,id)=>s.policy==='team'?arenaPiece(s,id)?.team:id;
export function inventoryCapacity(s,owner,view=analyzeArena(s)){
  return s.policy==='team'?s.pieces.filter(p=>p.team===owner&&view.active.includes(p.id)).length:1;
}
export function eligibleActors(s,view=analyzeArena(s)){
  if(s.over)return [];
  if(s.policy==='piece')return view.active.includes(s.turn.actor)?[s.turn.actor]:[];
  return s.pieces.filter(p=>p.team===s.turn.team&&view.active.includes(p.id)).map(p=>p.id);
}
function autoActor(s,team,view){
  const ids=s.pieces.filter(p=>p.team===team).map(p=>p.id),live=ids.filter(id=>view.active.includes(id));
  if(s.policy==='team')return live.length===1?live[0]:null;
  const last=ids.indexOf(s.lastActed[team]);
  for(let n=1;n<=ids.length;n++){const id=ids[(last+n)%ids.length];if(live.includes(id))return id;}
  return null;
}
function freshTurn(s,team,view){
  const actor=autoActor(s,team,view);
  return {team,actor,steps:0,path:actor?[arenaPiece(s,actor).pos]:[],committed:false,actions:0};
}
export function createArena({mode='duo',policy='piece',experiment}={}){
  if(!['piece','team'].includes(policy))throw new Error('Política de turnos desconocida.');
  const cfg=experimentFor(mode,experiment),setup=ARENA_MODES[mode];
  if(mode==='ffa'&&policy!=='piece')throw new Error('Cuatro equipos utiliza un turno por ficha.');
  const s={format:'cerconexo-arena',version:1,mode,policy,experiment:cfg,teams:[...setup.teams],
    pieces:structuredClone(setup.pieces),walls:[],inventories:{},drops:[],completedTurns:0,revision:0,
    lastActed:Object.fromEntries(setup.teams.map(t=>[t,null])),turn:null,resolution:null,pending:null,
    over:false,winners:[],waveLog:[],lastEvents:[]};
  const owners=policy==='team'?s.teams:s.pieces.map(p=>p.id);
  owners.forEach(o=>s.inventories[o]=[]);
  s.drops=cfg.initial.map((p,i)=>({...p,id:`initial-${i}`}));
  s.turn=freshTurn(s,s.teams[0],analyzeArena(s));
  return s;
}

/** Todas las acciones que la interfaz puede solicitar pasan por este mismo contrato. */
export function legalArenaActions(s){
  if(s.over||s.pending||s.resolution)return [];
  const view=analyzeArena(s),actors=eligibleActors(s,view),out=[];
  if(s.policy==='team'&&!s.turn.committed)for(const actor of actors){if(actor!==s.turn.actor)out.push({type:'select',actor});}
  const p=arenaPiece(s,s.turn.actor);
  if(!p||!actors.includes(p.id))return out;
  const closed=new Set(s.walls),occupied=new Set(s.pieces.filter(q=>q.id!==p.id).map(q=>q.pos));
  const inventory=s.inventories[inventoryOwner(s,p.id)];
  for(const to of arenaNeighbors(p.pos)){
    const has=closed.has(arenaWall(p.pos,to));
    if(!has){
      out.push({type:'wall',to});
      if(s.turn.steps<2&&!occupied.has(to))out.push({type:'move',to});
    }
    for(const item of inventory){
      if(item.type==='demolition'&&has)out.push({type:'demolition',to,power:item.id});
      if(item.type==='jump'&&has&&s.turn.steps<2&&!occupied.has(to))out.push({type:'jump',to,power:item.id});
      if(item.type==='extraWall'&&!has)out.push({type:'extraWall',to,power:item.id});
    }
  }
  return out;
}
function sameAction(a,b){
  return a.type===b.type&&a.to===b.to&&a.actor===b.actor&&a.power===b.power;
}
function updateEvents(s,before,after,action,actor){
  s.lastEvents=[];
  for(const p of s.pieces){
    const was=before.active.includes(p.id),now=after.active.includes(p.id);
    if(was&&!now)s.lastEvents.push({type:'secured',actor:p.id,team:p.team});
    if(!was&&now)s.lastEvents.push({type:'reactivated',actor:p.id,team:p.team});
  }
  for(const team of s.teams){
    const delta=after.score[team]-before.score[team];
    if(delta)s.lastEvents.push({type:'territory',team,delta});
  }
  s.lastEvents.unshift({type:'action',action:action.type,actor,to:action.to});
}

/** Órbitas geométricas, no reconstruyen ni clasifican territorio. */
export function arenaOrbit(cell,symmetry){
  const r=Math.floor(cell/9),c=cell%9;
  return [...new Set(symmetry==='vertical'?[cell,r*9+8-c]:[cell,c*9+8-r,(8-r)*9+8-c,(8-c)*9+r])].sort((a,b)=>a-b);
}
function spawnWave(s,wave,index,view){
  const occupied=new Set([...s.pieces.map(p=>p.pos),...s.drops.map(p=>p.cell)]);
  const valid=new Set(view.components.filter(c=>c.type==='shared').flatMap(c=>c.cells).filter(c=>!occupied.has(c)));
  const orbitSize=s.experiment.symmetry==='vertical'?2:4,seen=new Set(),orbits=[];
  for(let c=0;c<ARENA_CELLS;c++){
    const orbit=arenaOrbit(c,s.experiment.symmetry),key=orbit.join(',');
    if(seen.has(key))continue;seen.add(key);
    if(orbit.length===orbitSize&&orbit.every(v=>valid.has(v)))orbits.push(orbit);
  }
  const centerCost=orbit=>orbit.reduce((sum,c)=>{const {row,col}=arenaCoords(c);return sum+Math.abs(row-5)+Math.abs(col-5);},0);
  orbits.sort((a,b)=>(s.experiment.placement==='center-first'?centerCost(a)-centerCost(b):0)||a[0]-b[0]);
  const chosen=orbits.slice(0,wave.count/orbitSize).flat();
  if(chosen.length!==wave.count){
    s.waveLog.push({index,turn:s.completedTurns,type:wave.type,placed:[],skipped:'No existe un conjunto simétrico completo en regiones compartidas.'});return;
  }
  const distances=Object.fromEntries(s.pieces.map(p=>[p.id,arenaDistances(s,p.pos)]));
  const access=chosen.map(cell=>({cell,distances:Object.fromEntries(s.pieces.map(p=>[p.id,distances[p.id][cell]]))}));
  s.drops.push(...chosen.map((cell,i)=>({cell,type:wave.type,id:`wave-${index}-${i}`})));
  s.waveLog.push({index,turn:s.completedTurns,type:wave.type,placed:chosen,access});
  s.lastEvents.push({type:'wave',power:wave.type,count:chosen.length});
}
function completeArenaTurn(s,view){
  const actor=s.turn.actor,team=s.turn.team;
  s.lastActed[team]=actor;s.completedTurns++;
  if(view.over){
    s.over=true;s.winners=[...view.winners];s.pending=null;s.resolution=null;s.turn.actor=null;
    s.lastEvents.push({type:'finished',winners:[...view.winners]});return;
  }
  s.experiment.waves.forEach((wave,i)=>{if(wave.afterTurn===s.completedTurns)spawnWave(s,wave,i,view);});
  const start=s.teams.indexOf(team);
  for(let i=1;i<=s.teams.length;i++){
    const next=s.teams[(start+i)%s.teams.length];
    if(s.pieces.some(p=>p.team===next&&view.active.includes(p.id))){s.turn=freshTurn(s,next,view);s.resolution=null;return;}
  }
  throw new Error('Estado inconsistente: no hay equipo activo y existen regiones compartidas.');
}

/** Prioridad: resultado > capacidad > recolección > continuación. Se puede suspender y guardar. */
function settleArena(s){
  const view=analyzeArena(s);
  if(view.over){completeArenaTurn(s,view);return;}
  for(const [owner,items] of Object.entries(s.inventories)){
    const capacity=inventoryCapacity(s,owner,view);
    if(items.length>capacity){
      s.pending={kind:'discard',owner,team:s.policy==='team'?owner:arenaPiece(s,owner).team,capacity,
        reason:s.resolution?.pickupOwner===owner?'pickup':'capacity'};return;
    }
  }
  if(s.resolution?.pickup){
    const item=s.resolution.pickup,owner=inventoryOwner(s,s.resolution.actor);
    s.inventories[owner].push({id:item.id,type:item.type});s.resolution.pickup=null;s.resolution.pickupOwner=owner;
    s.lastEvents.push({type:'pickup',actor:s.resolution.actor,power:item.type});
    const capacity=inventoryCapacity(s,owner,view);
    if(s.inventories[owner].length>capacity){
      s.pending={kind:'discard',owner,team:arenaPiece(s,s.resolution.actor).team,capacity,reason:'pickup'};return;
    }
  }
  if(s.resolution?.finish||!view.active.includes(s.turn.actor))completeArenaTurn(s,view);
  else s.resolution=null;
}

export function applyArena(s,action){
  if(!action||typeof action!=='object')throw new Error('Acción Arena inválida.');
  if(s.over)throw new Error('La partida terminó.');
  if(action.type==='discard'){
    if(!s.pending||action.owner!==s.pending.owner||!s.inventories[action.owner].some(p=>p.id===action.power))throw new Error('Descarte no válido.');
    const n=structuredClone(s);n.revision++;n.lastEvents=[{type:'discard',owner:action.owner,power:action.power}];
    n.inventories[action.owner]=n.inventories[action.owner].filter(p=>p.id!==action.power);n.pending=null;settleArena(n);return n;
  }
  if(!legalArenaActions(s).some(a=>sameAction(a,action)))throw new Error(s.pending?'Debe decidir el descarte el propietario indicado.':'Acción ilegal para este turno.');
  const n=structuredClone(s);n.revision++;
  if(action.type==='select'){
    n.turn.actor=action.actor;n.turn.path=[arenaPiece(n,action.actor).pos];n.lastEvents=[];return n;
  }
  const before=analyzeArena(s),p=arenaPiece(n,n.turn.actor),from=p.pos;
  n.turn.committed=true;n.turn.actions++;
  if(POWER_TYPES.includes(action.type)){
    const owner=inventoryOwner(n,p.id);
    n.inventories[owner]=n.inventories[owner].filter(item=>item.id!==action.power);
  }
  if(action.type==='move'||action.type==='jump'){
    p.pos=action.to;n.turn.steps++;n.turn.path.push(action.to);
  }else if(action.type==='demolition')n.walls=n.walls.filter(w=>w!==arenaWall(from,action.to));
  else n.walls.push(arenaWall(from,action.to));
  const after=analyzeArena(n);updateEvents(n,before,after,action,p.id);
  const drop=(action.type==='move'||action.type==='jump')?n.drops.find(d=>d.cell===p.pos):null;
  if(drop)n.drops=n.drops.filter(d=>d.id!==drop.id);
  n.resolution={actor:p.id,finish:action.type==='wall'||!after.active.includes(p.id),pickup:drop??null};
  settleArena(n);return n;
}
