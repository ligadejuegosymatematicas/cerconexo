import {writeFile,mkdir} from 'node:fs/promises';
import {initialState,applyTurn,verifyState,territory,legalActors} from '../src/engine.mjs';
import {cpuLegalTurns} from '../src/cpuMoves.mjs';
import {chooseCpuTurn,cpuSeededRandom,CPU_LEVELS} from '../src/cpuSearch.mjs';
import assert from 'node:assert/strict';
import {beginDraft,selectDraft,advanceDraft} from '../src/turnDraft.mjs';
import {encodeGameSave,decodeGameSave} from '../src/gameSave.mjs';
import {makeCpuPlan} from '../src/cpuSession.mjs';

const pairs=[['beginner','random'],['intermediate','beginner'],['advanced','intermediate'],['advanced','random'],['beginner','beginner'],['intermediate','intermediate'],['advanced','advanced']];
const games=[],decisions=[];let index=0,persistenceChecks=0;
for(const mode of ['piece','team'])for(const pair of pairs)for(const swap of [false,true])for(const seed of [11,29,47,83,101,173,311,541]){
 const players={A:pair[swap?1:0],B:pair[swap?0:1]},agentSeeds={A:swap?seed+9001:seed,B:swap?seed:seed+9001},random={A:cpuSeededRandom(agentSeeds.A),B:cpuSeededRandom(agentSeeds.B)},usage={A1:0,A2:0,B1:0,B2:0},last={A:null,B:null},repeatsWithChoice={A:0,B:0};let repeats=0,game=initialState({turnMode:mode});
 while(!game.over){
  assert.ok(game.moves<84);const level=players[game.turnTeam],before=JSON.stringify(game);let turn;
  if(level==='random'){const legal=cpuLegalTurns(game);turn=legal[Math.floor(random[game.turnTeam]()*legal.length)];}
  else{
   const result=chooseCpuTurn(game,{level,seed:(agentSeeds[game.turnTeam]^Math.imul(game.moves+1,2654435761))>>>0,budgetMs:Infinity});turn=result.turn;
   decisions.push({mode,level,ms:result.stats.calculationMs,nodes:result.stats.nodes,exhausted:result.stats.budgetExhausted,roots:result.stats.rootCandidates,completedRoots:result.stats.completedRoots});
  }
  assert.equal(JSON.stringify(game),before);usage[turn.actor]++;if(last[game.turnTeam]===turn.actor){repeats++;if(mode==='team'&&legalActors(game).length===2)repeatsWithChoice[game.turnTeam]++;}last[game.turnTeam]=turn.actor;
  if(level!=='random'){
   const control={version:1,type:'cpu',humanTeam:game.turnTeam==='A'?'B':'A',difficulty:level,seed:agentSeeds[game.turnTeam]},plan=makeCpuPlan(game,turn);let draft=selectDraft(game,beginDraft(game),turn.actor);
   for(let progress=0;progress<turn.path.length;progress++){
    if(progress)draft=advanceDraft(game,draft,turn.path[progress]);
    const restored=decodeGameSave(encodeGameSave(game,draft,{control,cpuPlan:plan}));assert.deepEqual(restored.game,game);assert.deepEqual(restored.cpuPlan,plan);assert.deepEqual(restored.control,control);if(progress)assert.deepEqual(restored.draft,draft);persistenceChecks++;
   }
  }
  const next=applyTurn(game,turn);assert.equal(next.moves,game.moves+1);assert.ok(verifyState(next));game=next;
  const score=territory(game).score;assert.equal(score.A+score.B+score.empty+score.mixed,49);
 }
 const score=territory(game).score;assert.equal(score.mixed,0);assert.equal(score.A+score.B+score.empty,49);
 games.push({mode,pair,swap,seed,cohort:seed<100?'base':'holdout',players,agentSeeds,winner:game.winner,turns:game.moves,usage,repeats,repeatsWithChoice,score,components:territory(game).components.length});
 if(++index%8===0)console.log(`Partidas completas ${index}`,new Date().toISOString());
}
const percentile=(a,p)=>[...a].sort((x,y)=>x-y)[Math.min(a.length-1,Math.floor(a.length*p))];
const performance=Object.fromEntries(Object.keys(CPU_LEVELS).map(level=>{const records=decisions.filter(d=>d.level===level),times=records.map(d=>d.ms);return [level,{decisions:records.length,p50:percentile(times,.5),p95:percentile(times,.95),p99:percentile(times,.99),max:Math.max(...times),average:times.reduce((a,b)=>a+b,0)/times.length,exhausted:records.filter(d=>d.exhausted).length}];}));
const outcomes=pairs.map(pair=>({pair,...Object.fromEntries(['piece','team'].map(mode=>{const rows=games.filter(g=>g.mode===mode&&g.pair.join('/')===pair.join('/'));return [mode,{games:rows.length,firstWins:rows.filter(g=>g.winner!=='Empate'&&g.players[g.winner]===pair[0]).length,secondWins:rows.filter(g=>g.winner!=='Empate'&&g.players[g.winner]===pair[1]).length,draws:rows.filter(g=>g.winner==='Empate').length,averageTurns:rows.reduce((s,g)=>s+g.turns,0)/rows.length}];}))}));
// En autoenfrentamientos se informa A/B por separado; no se duplica una victoria.
for(const row of outcomes)if(row.pair[0]===row.pair[1])for(const mode of ['piece','team']){
 const sample=games.filter(g=>g.mode===mode&&g.pair.join('/')===row.pair.join('/'));row[mode].firstWins=sample.filter(g=>g.winner==='A').length;row[mode].secondWins=sample.filter(g=>g.winner==='B').length;
}
const report={configuration:CPU_LEVELS,environment:{node:process.version,platform:process.platform},deterministicNodeBudgets:true,timeBudgetForSimulation:'Infinity; se aplica el presupuesto de nodos de cada nivel',totalGames:games.length,completed:games.length,persistenceChecks,errors:[],performance,outcomes,games,decisions};
await mkdir(new URL('../validation/m2/',import.meta.url),{recursive:true});
await writeFile(new URL('../validation/m2/simulations.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify({totalGames:games.length,performance,outcomes},null,2));
