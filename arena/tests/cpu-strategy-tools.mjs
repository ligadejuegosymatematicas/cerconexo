import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {applyArena} from '../src/engine.mjs';
import {arenaCpuActions,arenaDecisionTeam,sameArenaAction} from '../src/cpuStrategy.mjs';

export const M5A_SOURCE_SHA256='c04f64d358b1c539ff066121a41885ea91022e8a5289254c1eaa40f82419f451';
export async function m5aReference(){
  let source=await readFile(new URL('./reference/cpuStrategy-m5a.mjs.txt',import.meta.url),'utf8');
  assert.equal(createHash('sha256').update(source).digest('hex'),M5A_SOURCE_SHA256,'La referencia M5-A debe ser exacta');
  for(const name of ['engine','geometry'])source=source.replace(`'./${name}.mjs'`,JSON.stringify(new URL(`../src/${name}.mjs`,import.meta.url).href));
  return import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
}
export async function ownTurn(state,choose,options={}){
  const team=arenaDecisionTeam(state),sequence=[],measure=[];let s=state;
  while(!s.over&&arenaDecisionTeam(s)===team&&s.completedTurns===state.completedTurns&&sequence.length<20){
    const result=await choose(s,{...options,team,now:()=>0});
    assert.ok(arenaCpuActions(s).some(a=>sameArenaAction(a,result.action)),'La estrategia debe devolver una acción oficial');
    sequence.push(result.action);measure.push({...result,action:undefined});s=applyArena(s,result.action);
  }
  assert.ok(sequence.length<20,'El turno debe terminar o devolver una decisión ajena');return {state:s,sequence,measure};
}
export function immediateWinningReplies(s,defender){
  if(s.over||arenaDecisionTeam(s)===defender)return [];
  return arenaCpuActions(s).filter(a=>{const n=applyArena(s,a);return n.over&&!n.winners.includes(defender);});
}
/** Enumera respuestas dentro del horizonte; señala cualquier rama no resuelta. */
export function winningTurnReply(s,defender,{nodes=500,depth=6}={}){
  if(s.over||arenaDecisionTeam(s)===defender)return {sequence:null,nodes:0,complete:true};
  const queue=[{state:s,path:[]}];let visited=0,truncated=false;
  for(let i=0;i<queue.length;i++){
    const n=queue[i];if(n.state.completedTurns>s.completedTurns)continue;
    if(n.path.length>=depth||arenaDecisionTeam(n.state)===defender){truncated=true;continue;}
    for(const action of arenaCpuActions(n.state)){
      if(visited>=nodes)return {sequence:null,nodes:visited,complete:false};
      const state=applyArena(n.state,action),path=[...n.path,action];visited++;
      if(state.over&&!state.winners.includes(defender))return {sequence:path,nodes:visited,complete:true};
      if(!state.over)queue.push({state,path});
    }
  }
  return {sequence:null,nodes:visited,complete:!truncated};
}
