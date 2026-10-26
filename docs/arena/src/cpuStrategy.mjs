import {legalArenaActions,applyArena,arenaPiece} from './engine.mjs';
import {analyzeArena,arenaNeighbors,arenaWall,arenaDistances} from './geometry.mjs';

export const ARENA_CPU_BUDGET=Object.freeze({nodes:160,milliseconds:90,depth:6,beam:6});
export function arenaDecisionTeam(s){return s.over?null:s.pending?.team??s.turn.team;}
export function arenaCpuActions(s){
  if(s.over)return [];
  if(s.pending)return s.inventories[s.pending.owner].map(p=>({type:'discard',owner:s.pending.owner,power:p.id}));
  // Una elección ya hecha se conserva; no oscilar entre select sin ejecutar acciones.
  return legalArenaActions(s).filter(a=>a.type!=='select'||!s.turn.actor);
}
export const sameArenaAction=(a,b)=>a?.type===b?.type&&a?.to===b?.to&&a?.actor===b?.actor&&a?.power===b?.power&&a?.owner===b?.owner;
const powerValue={demolition:4,jump:3,extraWall:5};
export function evaluateArenaCpu(s,team){
  const v=analyzeArena(s),enemy=team==='A'?'B':'A';
  if(s.over)return (v.score[team]===v.score[enemy]?0:v.score[team]>v.score[enemy]?100000:-100000)+(v.score[team]-v.score[enemy])*100;
  let score=(v.score[team]-v.score[enemy])*45;
  const closed=new Set(s.walls),occupied=new Set(s.pieces.map(p=>p.pos));
  for(const p of s.pieces){
    const sign=p.team===team?1:-1;
    if(!v.active.includes(p.id))continue;
    const mobility=arenaNeighbors(p.pos).filter(c=>!closed.has(arenaWall(p.pos,c))&&!occupied.has(c)).length;
    score+=sign*mobility*.7;
    const distances=arenaDistances(s,p.pos);
    const nearest=s.drops.map(d=>distances[d.cell]===null?0:powerValue[d.type]*4/(1+distances[d.cell]));
    score+=sign*(nearest.length?Math.max(...nearest):0);
  }
  for(const [owner,items] of Object.entries(s.inventories)){
    const ownerTeam=s.policy==='team'?owner:arenaPiece(s,owner).team;
    score+=(ownerTeam===team?1:-1)*items.reduce((n,p)=>n+powerValue[p.type],0);
  }
  return score;
}
/** Búsqueda por acciones oficiales, con frontera acotada y cesión periódica al hilo. */
export async function chooseArenaCpu(s,{team=arenaDecisionTeam(s),budget={},yieldControl=()=>Promise.resolve(),now=()=>performance.now()}={}){
  const limits={...ARENA_CPU_BUDGET,...budget},start=now(),legal=arenaCpuActions(s);
  if(s.mode!=='duo'||!legal.length||arenaDecisionTeam(s)!==team)return {action:null,nodes:0,milliseconds:now()-start};
  let nodes=0,best=null,frontier=[{state:s,first:null,cost:0}],done=[];
  const rank=n=>n.value;
  outer:for(let depth=0;depth<limits.depth;depth++){
    const next=[];
    for(const node of frontier){
      for(const action of arenaCpuActions(node.state)){
        if(nodes>=limits.nodes||nodes>0&&now()-start>=limits.milliseconds)break outer;
        const state=applyArena(node.state,action);nodes++;
        const child={state,first:node.first??action,cost:node.cost+.12+(action.type==='select'?.03:0)};
        child.value=evaluateArenaCpu(state,team)-child.cost+((state.completedTurns>s.completedTurns||state.pending&&state.pending.team!==team)?1:0);
        if(state.over||state.completedTurns!==s.completedTurns||arenaDecisionTeam(state)!==team)done.push(child);
        else next.push(child);
        if(!best||rank(child)>rank(best))best=child;
        if(nodes%12===0)await yieldControl();
      }
    }
    next.sort((a,b)=>rank(b)-rank(a));frontier=next.slice(0,limits.beam);
    if(!frontier.length)break;
  }
  // Preferir un turno completo; un resultado terminal favorable siempre prevalece.
  done.sort((a,b)=>rank(b)-rank(a));
  const chosen=best?.state.over&&rank(best)>0?best:done[0]??best;
  return {action:chosen?.first??legal[0],nodes,milliseconds:now()-start};
}
