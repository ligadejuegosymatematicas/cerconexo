import {writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {initialState,applyTurn,verifyState,territory,validateTurn} from '../src/engine.mjs';
import {cpuLegalTurns} from '../src/cpuMoves.mjs';
import {chooseCpuTurn,cpuSeededRandom} from '../src/cpuSearch.mjs';
import {chooseCpuTurn as original} from './cpu-m2-reference.mjs';
import {makeCpuPlan} from '../src/cpuSession.mjs';
import {beginDraft,selectDraft,advanceDraft} from '../src/turnDraft.mjs';
import {encodeGameSave,decodeGameSave} from '../src/gameSave.mjs';

const quick=process.argv.includes('--quick'),diagnostic=process.argv.includes('--diagnostic'),holdout=process.argv.includes('--holdout');
const seeds=holdout?[70001,80021,101003,131071]:quick?[4001,7013]:[4001,7013,11003,17011,23003,31013,47017,59009];
const pairs=holdout?[['intermediate','beginner'],['advanced','intermediate'],['intermediate','old:intermediate'],['advanced','old:advanced']]:diagnostic?[['random','random'],['old:intermediate','old:intermediate'],['intermediate','intermediate'],['advanced','advanced']]:[['beginner','random'],['intermediate','beginner'],['advanced','intermediate'],['advanced','random'],['intermediate','old:intermediate'],['intermediate','intermediate'],['advanced','advanced']];
const report={quick,diagnostic,holdout,seeds,policy:'Presupuesto de nodos, tiempo infinito para reproducibilidad. No cambia el inicio real A. Diagnóstico: CPU usa primeras4 semillas y aleatorio32 semillas 90001+i×7919.',games:[],decisions:[],persistenceChecks:0,errors:[]};
for(const mode of ['piece','team'])for(const pair of pairs)for(const swap of [false,true])for(const seed of diagnostic?(pair[0]==='random'?Array.from({length:32},(_,i)=>90001+i*7919):seeds.slice(0,4)):seeds){
 const players={A:pair[swap?1:0],B:pair[swap?0:1]},agentSeed={A:swap?seed+9001:seed,B:swap?seed:seed+9001},random={A:cpuSeededRandom(agentSeed.A),B:cpuSeededRandom(agentSeed.B)};
 let game=initialState({turnMode:mode});
 // Ablación solo de prueba: alternar el equipo que comienza; jamás producto.
 const starter=diagnostic&&swap?'B':'A';if(starter==='B'){game.turnTeam='B';game.currentActor=mode==='piece'?'B1':null;}
 assert.ok(verifyState(game));
 while(!game.over){
  assert.ok(game.moves<84);const actorTeam=game.turnTeam,agent=players[actorTeam],before=JSON.stringify(game);let turn;
  if(agent==='random'){const turns=cpuLegalTurns(game,{deduplicate:true});turn=turns[Math.floor(random[actorTeam]()*turns.length)];}
  else{const old=agent.startsWith('old:'),level=agent.replace('old:',''),result=(old?original:chooseCpuTurn)(game,{level,seed:(agentSeed[actorTeam]^Math.imul(game.moves+1,2654435761))>>>0,budgetMs:Infinity});turn=result.turn;report.decisions.push({mode,agent,ms:result.stats.calculationMs,nodes:result.stats.nodes,depth:result.stats.depth,exhausted:result.stats.budgetExhausted});}
  assert.equal(JSON.stringify(game),before);validateTurn(game,turn);
  if(!agent.startsWith('old:')&&agent!=='random'){
   const control={version:1,type:'cpu',humanTeam:actorTeam==='A'?'B':'A',difficulty:agent,seed:agentSeed[actorTeam]},plan=makeCpuPlan(game,turn);let draft=selectDraft(game,beginDraft(game),turn.actor);
   for(let i=0;i<turn.path.length;i++){if(i)draft=advanceDraft(game,draft,turn.path[i]);const loaded=decodeGameSave(encodeGameSave(game,draft,{control,cpuPlan:plan}));assert.deepEqual(loaded.game,game);assert.deepEqual(loaded.cpuPlan,plan);if(i)assert.deepEqual(loaded.draft,draft);report.persistenceChecks++;}
  }
  game=applyTurn(game,turn);assert.ok(verifyState(game));const score=territory(game).score;assert.equal(score.A+score.B+score.empty+score.mixed,49);
 }
 report.games.push({mode,pair,swap,seed,starter,winner:game.winner,players,turns:game.moves,score:territory(game).score});
 if(report.games.length%8===0)console.log('Completadas',report.games.length,new Date().toISOString());
}
report.outcomes=[];
for(const mode of ['piece','team'])for(const pair of pairs){const rows=report.games.filter(g=>g.mode===mode&&g.pair.join('/')===pair.join('/'));report.outcomes.push({mode,pair,games:rows.length,firstWins:rows.filter(g=>g.winner!=='Empate'&&(pair[0]===pair[1]?g.winner==='A':g.players[g.winner]===pair[0])).length,secondWins:rows.filter(g=>g.winner!=='Empate'&&(pair[0]===pair[1]?g.winner==='B':g.players[g.winner]===pair[1])).length,draws:rows.filter(g=>g.winner==='Empate').length,starterWins:rows.filter(g=>g.winner===g.starter).length});}
const path=new URL(`../validation/m2-review/${holdout?'holdout':diagnostic?'diagnostic':quick?'pilot':'comparison'}.json`,import.meta.url);await mkdir(new URL('../validation/m2-review/',import.meta.url),{recursive:true});await writeFile(path,JSON.stringify(report,null,2));console.log(JSON.stringify(report.outcomes,null,2));
