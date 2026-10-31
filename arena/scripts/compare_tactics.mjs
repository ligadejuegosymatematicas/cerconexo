// Comparación reproducible: posiciones idénticas, pesos y presupuesto iguales.
// No es un torneo contra adversarios aleatorios ni se importa desde el juego.
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {chooseArenaCpu,arenaCpuActions,sameArenaAction,ARENA_CPU_BUDGET} from '../src/cpuStrategy.mjs';
import {applyArena} from '../src/engine.mjs';
import {analyzeArena} from '../src/geometry.mjs';
import {fixtures,harmfulSmallClosure,enemyGainClosure} from '../tests/cpu-tactics-fixtures.mjs';
import {m5cReference,completeTurns} from '../tests/cpu-tactics-tools.mjs';
import {ownTurn,winningTurnReply} from '../tests/cpu-strategy-tools.mjs';

const out=new URL('../../validation/m5d/',import.meta.url);await mkdir(out,{recursive:true});
const old=await m5cReference(),cases=[...fixtures(),harmfulSmallClosure(),enemyGainClosure()];
const versions=[['M5-C',old.chooseArenaCpu],['M5-D',chooseArenaCpu]],quality=[];
const snap=s=>({score:analyzeArena(s).score,active:analyzeArena(s).active,over:s.over,winners:s.winners});
for(const f of cases){
 const before=JSON.stringify(f.state),row={name:f.name,fixture:f.state,witness:{actions:f.witness,after:snap(f.witness.reduce(applyArena,f.state))},versions:[]};
 for(const [version,choose] of versions){
  const turn=await ownTurn(f.state,choose);
  row.versions.push({version,actions:turn.sequence,after:snap(turn.state),decisions:turn.measure,reply:winningTurnReply(turn.state,'A')});
  if(f.name==='cierre-9-dos-muros'){
   const replies=completeTurns(turn.state);assert.ok(replies.complete);
   row.versions.at(-1).allReplies={nodes:replies.nodes,sequences:replies.ends.length,margin:[Math.min(...replies.ends.map(r=>analyzeArena(r.state).score.A-analyzeArena(r.state).score.B)),Math.max(...replies.ends.map(r=>analyzeArena(r.state).score.A-analyzeArena(r.state).score.B))]};
  }
 }
 assert.equal(JSON.stringify(f.state),before);quality.push(row);
 console.log(JSON.stringify({case:f.name,versions:row.versions.map(v=>({version:v.version,actions:v.actions,after:v.after,nodes:v.decisions.map(d=>d.nodes)}))}));
}
// JIT caliente, ejecución secuencial y orden alternado de versiones, sin animar.
for(const f of cases)for(const [,choose] of versions)await choose(f.state);
const samples=[];
for(let repeat=0;repeat<8;repeat++)for(const f of cases){
 for(const [version,choose] of repeat%2?[...versions].reverse():versions){
  const started=performance.now(),r=await choose(f.state),elapsed=performance.now()-started;
  assert.ok(r.nodes<=ARENA_CPU_BUDGET.nodes);assert.ok(arenaCpuActions(f.state).some(a=>sameArenaAction(a,r.action)));
  samples.push({version,case:f.name,repeat,milliseconds:elapsed,reportedMilliseconds:r.milliseconds,nodes:r.nodes,ownNodes:r.ownNodes,replyNodes:r.replyNodes,tacticalNodes:r.tacticalNodes??0,action:r.action});
 }
}
const summary=rows=>{const x=rows.map(r=>r.milliseconds).sort((a,b)=>a-b),ns=rows.map(r=>r.nodes).sort((a,b)=>a-b);return {count:x.length,median:x[Math.ceil(x.length*.5)-1],p95:x[Math.ceil(x.length*.95)-1],max:x.at(-1),medianNodes:ns[Math.ceil(ns.length*.5)-1],maxNodes:ns.at(-1),slowest:rows.reduce((a,b)=>a.milliseconds>b.milliseconds?a:b)};};
const performanceReport={environment:{node:process.version,platform:process.platform,arch:process.arch},clock:'performance.now real; mismo presupuesto 90 ms / 160 nodos; no animaciones ni inicio de Worker',warmup:'Una decisión por posición y versión antes de medir; 8 repeticiones con orden alternado',budget:ARENA_CPU_BUDGET,summary:Object.fromEntries(versions.map(([v])=>[v,summary(samples.filter(s=>s.version===v))])),byCase:cases.map(f=>({name:f.name,...Object.fromEntries(versions.map(([v])=>[v,summary(samples.filter(s=>s.version===v&&s.case===f.name))]))})),samples};
await writeFile(new URL('comparison.json',out),JSON.stringify({base:'67b07908c486ab72d5ef3e85f53659f0b881fac2',qualityClock:'now=0: mismo límite de nodos, sin interferencia del reloj',quality,performance:performanceReport},null,2));
console.log(JSON.stringify({performance:performanceReport.summary}));
