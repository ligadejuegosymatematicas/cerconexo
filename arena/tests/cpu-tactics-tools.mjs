import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {applyArena} from '../src/engine.mjs';
import {arenaCpuActions,arenaDecisionTeam} from '../src/cpuStrategy.mjs';

export async function m5cReference(){
 let source=await readFile(new URL('./reference/cpuStrategy-m5c.mjs.txt',import.meta.url),'utf8');
 assert.equal(createHash('sha256').update(source).digest('hex'),'068a8dd681c560e639db02e58aa0a253bf8089a1162687073a702fbe97d749ad');
 const evaluator=await readFile(new URL('../src/cpuEvaluation.mjs',import.meta.url));
 assert.equal(createHash('sha256').update(evaluator).digest('hex'),'bb84bf3f229a06fb02b4107fa1198307440799b5de56bc14fcafe518cf234afc','Pesos de M5-C intactos');
 for(const name of ['engine','geometry','cpuEvaluation'])source=source.replaceAll(`'./${name}.mjs'`,JSON.stringify(new URL(`../src/${name}.mjs`,import.meta.url).href));
 return import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
}
// Enumeración externa de prueba. Nunca se importa desde el juego o el Worker.
export function completeTurns(start,{limit=10000,depth=8}={}){
 const queue=[{state:start,path:[]}],ends=[];let nodes=0,complete=true;
 for(let i=0;i<queue.length;i++){
  const n=queue[i];
  if(n.state.over||n.state.completedTurns>start.completedTurns){ends.push(n);continue;}
  if(n.path.length>=depth||arenaDecisionTeam(n.state)!==arenaDecisionTeam(start)){complete=false;continue;}
  for(const action of arenaCpuActions(n.state)){
   if(nodes>=limit)return {ends,nodes,complete:false};
   queue.push({state:applyArena(n.state,action),path:[...n.path,action]});nodes++;
  }
 }
 return {ends,nodes,complete};
}
export function flipTeams(state){
 const s=structuredClone(state),flip=t=>t==='A'?'B':'A';
 s.pieces=s.pieces.map(p=>({...p,id:flip(p.team)+p.id.slice(1),team:flip(p.team)}));
 s.inventories=Object.fromEntries(Object.entries(s.inventories).map(([k,v])=>[flip(k[0])+k.slice(1),v]));
 s.lastActed=Object.fromEntries(Object.entries(s.lastActed).map(([k,v])=>[flip(k),v?flip(v[0])+v.slice(1):v]));
 s.turn.team=flip(s.turn.team);if(s.turn.actor)s.turn.actor=flip(s.turn.actor[0])+s.turn.actor.slice(1);
 return s;
}
