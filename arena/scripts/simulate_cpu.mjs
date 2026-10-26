/** Ensayo reproducible: CPU vs rival legal por semillas y autojuego. No usa datos personales. */
import {mkdir,writeFile} from 'node:fs/promises';
import {createArena,applyArena} from '../src/engine.mjs';
import {analyzeArena} from '../src/geometry.mjs';
import {chooseArenaCpu,arenaCpuActions,arenaDecisionTeam,sameArenaAction} from '../src/cpuStrategy.mjs';
const out=new URL('../../validation/m5a/',import.meta.url);await mkdir(out,{recursive:true});
const games=[],times=[],types={},cpuTypes={};let errors=0,illegal=0;
for(const policy of ['piece','team'])for(const cpuTeam of ['A','B'])for(let seed=1;seed<=8;seed++){
 let rng=seed,game=createArena({policy}),actions=0,maxMs=0;const counts={};
 const random=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;};
 const selfPlay=seed>=7;
 try{
  while(!game.over&&actions<1600){
   const legal=arenaCpuActions(game);if(!legal.length)throw Error('Sin acciones legales');
   let action;const automated=selfPlay||arenaDecisionTeam(game)===cpuTeam;
   if(automated){
    const r=await chooseArenaCpu(game);action=r.action;times.push(r.milliseconds);maxMs=Math.max(maxMs,r.milliseconds);
   }else{
    // Rival experimental: sorteo reproducible, con oportunidad de usar poderes y moverse.
    const powers=legal.filter(a=>['jump','demolition','extraWall'].includes(a.type));
    const pool=powers.length&&random()<.5?powers:legal;action=pool[Math.floor(random()*pool.length)];
   }
   if(!legal.some(a=>sameArenaAction(a,action))){illegal++;throw Error('Acción fuera del contrato legal');}
   counts[action.type]=(counts[action.type]??0)+1;types[action.type]=(types[action.type]??0)+1;
   if(automated)cpuTypes[action.type]=(cpuTypes[action.type]??0)+1;
   game=applyArena(game,action);actions++;
  }
  if(!game.over)throw Error('Límite de acciones sin terminar');
  games.push({policy,cpuTeam,seed,selfPlay,completed:true,actions,turns:game.completedTurns,score:analyzeArena(game).score,winners:game.winners,maxMs,counts});
 }catch(e){errors++;games.push({policy,cpuTeam,seed,selfPlay,completed:false,actions,error:e.stack,state:game});}
 console.log(`${policy} CPU ${cpuTeam} semilla ${seed}: ${games.at(-1).completed?'completa':'FALLO'} · ${actions} acciones`);
}
times.sort((a,b)=>a-b);const percentile=p=>times[Math.min(times.length-1,Math.floor(times.length*p))];
const report={environment:{platform:process.platform,node:process.version},completed:games.filter(g=>g.completed).length,errors,illegal,types,cpuTypes,
 performance:{decisions:times.length,p50:percentile(.5),p95:percentile(.95),p99:percentile(.99),max:times.at(-1)},games};
await writeFile(new URL('simulations.json',out),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,games:undefined},null,2));
if(errors||illegal)process.exitCode=1;
