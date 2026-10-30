/** Comparación nodal controlada M5-A/M5-B. No publica ni accede a guardados personales. */
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createArena,applyArena} from '../src/engine.mjs';
import {analyzeArena} from '../src/geometry.mjs';
import {chooseArenaCpu,arenaCpuActions,arenaDecisionTeam,sameArenaAction} from '../src/cpuStrategy.mjs';
import {m5aReference,ownTurn,immediateWinningReplies,winningTurnReply,M5A_SOURCE_SHA256} from '../tests/cpu-strategy-tools.mjs';
import {strategicPositions} from '../tests/cpu-strategy-fixtures.mjs';
const old=await m5aReference(),out=new URL('../../validation/m5b/',import.meta.url);await mkdir(out,{recursive:true});
const digest=data=>createHash('sha256').update(data).digest('hex');
const mode=process.env.M5B_CLOCK==='real'?'wall-clock':'fixed-nodes';
const report={reference:{commit:'0ce64e92c744e75cdcd9383b7ddb00270cd64df8',sha256:M5A_SOURCE_SHA256},candidate:{strategy:digest(await readFile(new URL('../src/cpuStrategy.mjs',import.meta.url))),evaluation:digest(await readFile(new URL('../src/cpuEvaluation.mjs',import.meta.url)))},environment:{platform:process.platform,node:process.version},mode,budget:{nodes:160,milliseconds:90,depth:6,beam:6},positions:[],games:[],illegal:0,slowSamples:{old:[],next:[]}};
if(!process.argv.includes('--games-only'))for(const fixture of strategicPositions()){
 const record={name:fixture.name,fixture:fixture.state,variants:[]},team=arenaDecisionTeam(fixture.state);
 for(const [name,choose] of [['M5-A',old.chooseArenaCpu],['M5-B',chooseArenaCpu]]){
  const before=JSON.stringify(fixture.state),turn=await ownTurn(fixture.state,choose,{budget:report.budget});
  if(JSON.stringify(fixture.state)!==before)throw Error('Fixture alterado');
  await choose(fixture.state,{budget:report.budget});
  const measured=[];for(let i=0;i<8;i++){
   const start=performance.now(),result=await choose(fixture.state,{budget:report.budget});
   measured.push({milliseconds:performance.now()-start,...result});
  }
  record.variants.push({name,sequence:turn.sequence,measure:turn.measure,score:analyzeArena(turn.state).score,over:turn.state.over,winners:turn.state.winners,immediateLosses:immediateWinningReplies(turn.state,team),winningReply:winningTurnReply(turn.state,team),measured});
 }
 report.positions.push(record);console.log(fixture.name+': '+record.variants.map(v=>`${v.name} ${v.sequence.map(a=>a.type).join('→')} pérdidaInmediata=${!!v.winningReply.sequence}`).join(' | '));
}
await writeFile(new URL('positions-'+mode+'.json',out),JSON.stringify(report,null,2));
if(process.argv.includes('--positions-only'))process.exit(0);
const seeds=Number(process.env.M5B_SEEDS||6),times={old:[],next:[]};
for(const policy of ['piece','team'])for(let seed=1;seed<=seeds;seed++){
 let rng=seed,start=createArena({policy});const random=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;};
 while(start.completedTurns<4&&!start.over){const legal=arenaCpuActions(start);start=applyArena(start,legal[Math.floor(random()*legal.length)]);}
 for(const nextTeam of ['A','B']){
  let s=start,actions=0;const counts={old:{},next:{}};
  try{
   while(!s.over&&actions<1600){
    const version=arenaDecisionTeam(s)===nextTeam?'next':'old',choose=version==='next'?chooseArenaCpu:old.chooseArenaCpu;
    const began=performance.now(),cpu=process.cpuUsage(),result=await choose(s,{budget:report.budget,...(mode==='fixed-nodes'?{now:()=>0}:{})}),elapsed=performance.now()-began,usage=process.cpuUsage(cpu);times[version].push(elapsed);
    if(result.nodes>report.budget.nodes)throw Error('Presupuesto nodal excedido');
    const samples=report.slowSamples[version];
    if(samples.length<5||elapsed>samples.at(-1).milliseconds){samples.push({policy,seed,nextTeam,state:s,result,milliseconds:elapsed,cpuMilliseconds:(usage.user+usage.system)/1000});samples.sort((a,b)=>b.milliseconds-a.milliseconds);samples.length=Math.min(5,samples.length);}
    if(!arenaCpuActions(s).some(a=>sameArenaAction(a,result.action))){report.illegal++;throw Error('Acción ilegal');}
    counts[version][result.action.type]=(counts[version][result.action.type]??0)+1;s=applyArena(s,result.action);actions++;
   }
   if(!s.over)throw Error('Partida sin terminar');
   const score=analyzeArena(s).score;report.games.push({policy,seed,startHash:digest(JSON.stringify(start)),nextTeam,completed:true,actions,turns:s.completedTurns,score,winners:s.winners,margin:score[nextTeam]-score[nextTeam==='A'?'B':'A'],counts});
  }catch(e){report.games.push({policy,seed,nextTeam,completed:false,actions,error:e.stack,state:s});}
  console.log(`${policy}/${seed}/M5-B ${nextTeam}: ${report.games.at(-1).completed?'completa '+report.games.at(-1).margin:'ERROR'}`);
 }
}
const stats=a=>{a.sort((x,y)=>x-y);return {count:a.length,p50:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)],p99:a[Math.floor(a.length*.99)],max:a.at(-1)};};
report.performance=Object.fromEntries(Object.entries(times).map(([k,v])=>[k,stats(v)]));
report.summary={completed:report.games.filter(g=>g.completed).length,errors:report.games.filter(g=>!g.completed).length,wins:report.games.filter(g=>g.margin>0).length,draws:report.games.filter(g=>g.margin===0).length,losses:report.games.filter(g=>g.margin<0).length,uniqueStarts:new Set(report.games.map(g=>g.startHash)).size,meanMargin:report.games.reduce((n,g)=>n+(g.margin??0),0)/report.games.length};
await writeFile(new URL('comparison-'+mode+'.json',out),JSON.stringify(report,null,2));console.log(JSON.stringify({summary:report.summary,performance:report.performance},null,2));
if(report.summary.errors)process.exitCode=1;
