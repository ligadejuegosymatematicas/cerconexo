import {legalArenaActions,applyArena} from './engine.mjs';
import {analyzeArena,arenaDistances} from './geometry.mjs';
import {evaluateArenaCpu} from './cpuEvaluation.mjs';
export {evaluateArenaCpu} from './cpuEvaluation.mjs';

export const ARENA_CPU_BUDGET=Object.freeze({nodes:160,milliseconds:90,depth:6,beam:6});
export function arenaDecisionTeam(s){return s.over?null:s.pending?.team??s.turn.team;}
export function arenaCpuActions(s){
  if(s.over)return [];
  if(s.pending)return s.inventories[s.pending.owner].map(p=>({type:'discard',owner:s.pending.owner,power:p.id}));
  // Una elección ya hecha se conserva; no oscilar entre select sin ejecutar acciones.
  return legalArenaActions(s).filter(a=>a.type!=='select'||!s.turn.actor);
}
export const sameArenaAction=(a,b)=>a?.type===b?.type&&a?.to===b?.to&&a?.actor===b?.actor&&a?.power===b?.power&&a?.owner===b?.owner;
const actionOrder={wall:0,extraWall:1,demolition:2,jump:3,discard:4,move:5,select:6};
function ordered(s,reply=false){
  const actions=arenaCpuActions(s);
  const distances=reply&&actions.some(a=>a.type==='wall')?s.pieces.filter(p=>p.team!==arenaDecisionTeam(s)).map(p=>arenaDistances(s,p.pos)):[];
  const toward=a=>Math.min(999,...distances.map(d=>d[a.to]??999));
  return actions.sort((a,b)=>actionOrder[a.type]-actionOrder[b.type]||(distances.length&&a.type==='wall'?toward(a)-toward(b):0));
}
const key=a=>JSON.stringify(a);
const isPower=a=>['demolition','jump','extraWall'].includes(a.type);
function diverse(nodes,limit){
  const chosen=[],add=n=>{if(n&&!chosen.includes(n)&&chosen.length<limit)chosen.push(n);};
  add(nodes.find(n=>n.invaded));
  // Reservar exploración para planes que pagan un poder antes de obtener su beneficio.
  for(const type of ['demolition','jump','extraWall'])add(nodes.find(n=>n.usedPower===type));
  const firsts=new Set();for(const n of nodes)if(!firsts.has(key(n.first))){add(n);firsts.add(key(n.first));}
  for(const n of nodes)add(n);return chosen;
}
/** Haz propio seguido de respuestas minimax acotadas. Todo sucesor pasa por applyArena. */
export async function chooseArenaCpu(s,{team=arenaDecisionTeam(s),budget={},yieldControl=()=>Promise.resolve(),now=()=>performance.now()}={}){
  const limits={...ARENA_CPU_BUDGET,...budget},start=now(),legal=arenaCpuActions(s);
  if(s.mode!=='duo'||!legal.length||arenaDecisionTeam(s)!==team)return {action:null,nodes:0,milliseconds:now()-start};
  let nodes=0,ownNodes=0,replyNodes=0,best=null,frontier=[{state:s,first:null,cost:0}],done=[];
  const cache=new WeakMap(),value=state=>{if(!cache.has(state))cache.set(state,evaluateArenaCpu(state,team));return cache.get(state);};
  const enemyCells=new Set(analyzeArena(s).components.filter(c=>c.type!==team&&['A','B'].includes(c.type)).flatMap(c=>c.cells));
  const exhausted=()=>nodes>=limits.nodes||now()-start>=limits.milliseconds;
  const apply=async(state,action)=>{const next=applyArena(state,action);nodes++;if(nodes%12===0)await yieldControl();return next;};
  const ownLimit=Math.min(limits.nodes,Math.max(legal.length,Math.floor(limits.nodes*.45)));
  outer:for(let depth=0;depth<limits.depth;depth++){
    const next=[];
    for(const node of frontier){
      for(const action of ordered(node.state)){
        if(ownNodes>=ownLimit||exhausted())break outer;
        const completesPower=node.usedPower&&action.type==='wall'&&!done.some(n=>key(n.first)===key(node.first)&&n.usedPower===node.usedPower);
        // Extensión táctica mínima: una pared legal completa el poder ya explorado,
        // incluso si vence la cuota blanda propia; respeta los límites globales.
        if(now()-start>=limits.milliseconds*.45&&!completesPower)break outer;
        const state=await apply(node.state,action);ownNodes++;
        const child={state,first:node.first??action,cost:node.cost+.12+(action.type==='select'?.03:0),usedPower:isPower(action)?action.type:node.usedPower};
        child.invaded=state.pieces.some(p=>p.team===team&&enemyCells.has(p.pos));
        child.value=value(state)-child.cost;
        if(state.over||state.completedTurns!==s.completedTurns||arenaDecisionTeam(state)!==team)done.push(child);
        else next.push(child);
        if(!best||child.value>best.value)best=child;
      }
    }
    next.sort((a,b)=>b.value-a.value);frontier=diverse(next,limits.beam);
    if(!frontier.length)break;
  }
  const win=done.filter(n=>n.state.over&&n.state.winners.length===1&&n.state.winners[0]===team).sort((a,b)=>b.value-a.value)[0];
  if(win)return {action:win.first,nodes,ownNodes,replyNodes,milliseconds:now()-start,winningTurn:true};
  // Conservar alternativas de primera acción y de poder, aunque paguen un coste estático.
  const byFirst=new Map();for(const n of done.sort((a,b)=>b.value-a.value)){
    const group=key(n.first)+':'+(n.usedPower??'')+':'+!!n.invaded;if(!byFirst.has(group))byFirst.set(group,n);
  }
  const pool=[...byFirst.values()],candidates=[],types=new Set();
  const candidateLimit=Math.max(2,Math.min(6,limits.beam));
  const add=n=>{if(n&&candidates.length<candidateLimit&&!candidates.includes(n))candidates.push(n);};
  for(const n of pool)if(!types.has(n.first.type)){add(n);types.add(n.first.type);}
  add(pool.find(n=>n.invaded));
  for(const type of ['demolition','jump','extraWall'])add(pool.find(n=>n.usedPower===type));
  for(const n of pool)add(n);
  candidates.sort((a,b)=>b.value-a.value);
  const targetTurns=s.completedTurns+(s.turn.team===team?2:1);
  let checked=0;
  for(const candidate of candidates){
    const allowance=Math.floor((limits.nodes-nodes)/Math.max(1,candidates.length-checked)),end=nodes+allowance;
    const began=nodes,until=now()+Math.max(0,(limits.milliseconds-(now()-start))/Math.max(1,candidates.length-checked));
    const root={state:candidate.state,value:value(candidate.state),children:[]};let layer=[root];
    response:for(let depth=0;depth<limits.depth;depth++){
      const next=[];
      for(const node of layer){
        if(node.state.over||node.state.completedTurns>=targetTurns)continue;
        for(const action of ordered(node.state,true)){
          if(nodes>=end||now()>=until||exhausted())break response;
          const state=await apply(node.state,action);replyNodes++;
          const child={state,value:value(state),children:[]};node.children.push(child);
          if(!state.over&&state.completedTurns<targetTurns)next.push(child);
        }
      }
      // Orden táctico; la elección se respalda según el dueño real de cada decisión.
      next.sort((a,b)=>{const priority=n=>arenaDecisionTeam(n.state)===team?-n.value:n.value;return priority(a)-priority(b);});
      layer=next.slice(0,Math.max(1,Math.min(3,limits.beam)));if(!layer.length)break;
    }
    const backed=node=>!node.children.length?node.value:(arenaDecisionTeam(node.state)===team?Math.max:Math.min)(...node.children.map(backed));
    candidate.responseValue=backed(root)-candidate.cost;candidate.replyEdges=nodes-began;checked++;
  }
  candidates.sort((a,b)=>(b.responseValue??b.value)-(a.responseValue??a.value));
  const chosen=candidates[0]??best;
  return {action:chosen?.first??legal[0],nodes,ownNodes,replyNodes,checkedCandidates:checked,milliseconds:now()-start};
}
