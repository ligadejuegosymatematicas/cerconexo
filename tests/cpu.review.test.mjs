import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,applyTurn,validateTurn,verifyState,territory,PLAYERS,wallKey} from '../src/engine.mjs';
import {cpuLegalTurns} from '../src/cpuMoves.mjs';
import {CPU_WEIGHTS,evaluateCpuState} from '../src/cpuEvaluate.mjs';
import {chooseCpuTurn,cpuTieBreak,CPU_LEVELS} from '../src/cpuSearch.mjs';
import {cpuFollowsPrefix,makeCpuPlan} from '../src/cpuSession.mjs';
import {createCpuPlanner} from '../src/cpuPlanner.mjs';
import {createCpuController} from '../src/cpuController.mjs';
import {beginDraft,advanceDraft} from '../src/turnDraft.mjs';
import {encodeGameSave,decodeGameSave} from '../src/gameSave.mjs';
import {TACTICAL_FIXTURES} from './cpu-fixtures.mjs';

test('Revisión M2: Principiante y los pesos compartidos no se degradan para diferenciar niveles',()=>{
 assert.deepEqual(CPU_WEIGHTS,{secured:90,potential:42,mobility:10,connections:20});
 assert.deepEqual(CPU_LEVELS.beginner,{label:'Principiante',budgetMs:120,nodeBudget:200,beam:0});
 assert.ok(CPU_LEVELS.advanced.beam>CPU_LEVELS.intermediate.beam);assert.ok(CPU_LEVELS.advanced.nodeBudget>CPU_LEVELS.intermediate.nodeBudget);
});
for(const mode of ['piece','team'])test(`Revisión M2 ${mode}: Intermedio maximiza la valoración completa de la peor respuesta en su frente`,()=>{
 const game=initialState({turnMode:mode}),seed=71,snapshot=JSON.stringify(game),roots=cpuLegalTurns(game,{deduplicate:true}).map(turn=>{const state=applyTurn(game,turn);return {turn,state,value:evaluateCpuState(state,'A').value,tie:cpuTieBreak(turn,'A',seed)};});
 roots.sort((a,b)=>Math.abs(b.value-a.value)>1e-8?b.value-a.value:b.tie-a.tie);
 const values=roots.slice(0,CPU_LEVELS.intermediate.beam).map(root=>({turn:root.turn,value:Math.min(...cpuLegalTurns(root.state,{deduplicate:true}).map(reply=>evaluateCpuState(applyTurn(root.state,reply),'A').value))}));
 const result=chooseCpuTurn(game,{level:'intermediate',seed,budgetMs:Infinity});
 assert.ok(Math.abs(values.find(v=>JSON.stringify(v.turn)===JSON.stringify(result.turn)).value-Math.max(...values.map(v=>v.value)))<1e-8);assert.equal(result.stats.depth,2);assert.equal(JSON.stringify(game),snapshot);
});
test('Revisión M2: Avanzado completa una tercera media jugada sin cambiar los puntos oficiales',()=>{
 const game=initialState(),snapshot=JSON.stringify(game),result=chooseCpuTurn(game,{level:'advanced',seed:71,budgetMs:Infinity,nodeBudget:20000});
 assert.equal(result.stats.depth,3);assert.equal(result.stats.completedRoots,CPU_LEVELS.advanced.beam);validateTurn(game,result.turn);assert.deepEqual(result.stats.evaluation,evaluateCpuState(applyTurn(game,result.turn),'A'));assert.ok(result.stats.evaluations<=result.stats.nodes);assert.equal(JSON.stringify(game),snapshot);
});
test('Revisión M2: un refinamiento incompleto conserva el respaldo de dos medias jugadas',()=>{
 const game=initialState(),options={level:'advanced',seed:71,budgetMs:Infinity},full=chooseCpuTurn(game,{...options,nodeBudget:20000}),limited=chooseCpuTurn(game,{...options,nodeBudget:Math.floor(full.stats.nodes*.75)});
 assert.equal(limited.stats.budgetExhausted,true);assert.ok(limited.stats.depth<=2);validateTurn(game,limited.turn);assert.equal(game.moves,0);
});
function reflected(game){
 const cell=i=>Math.floor(i/7)*7+6-i%7,team=t=>t==='A'?'B':t==='B'?'A':t,id=i=>i?team(i[0])+i[1]:null,swapped=game.pieces.map(p=>({...p,id:id(p.id),team:team(p.team),pos:cell(p.pos),start:cell(p.start)}));
 return {...game,pieces:PLAYERS.map(p=>swapped.find(q=>p.id===q.id)),walls:game.walls.map(w=>wallKey(...w.split('-').map(Number).map(cell))),turnTeam:team(game.turnTeam),currentActor:id(game.currentActor),lastActed:{A:id(game.lastActed.B),B:id(game.lastActed.A)},winner:team(game.winner),lastMove:game.lastMove?{actor:id(game.lastMove.actor),path:game.lastMove.path.map(cell),wall:game.lastMove.wall.map(cell)}:null};
}
test('Revisión M2: reflexión e intercambio de colores conservan la evaluación; no hay bonificación para A',()=>{
 for(const game of [initialState(),initialState({turnMode:'team'}),...TACTICAL_FIXTURES.map(f=>f.game)]){
  const mirror=reflected(game);assert.ok(verifyState(mirror));assert.ok(Math.abs(evaluateCpuState(game,'A').value-evaluateCpuState(mirror,'B').value)<1e-8);assert.deepEqual(territory(game).score.A,territory(mirror).score.B);
 }
});
test('Revisión M2: búsqueda con semilla y presupuesto de nodos produce tableros reflejados, sin sesgo de enumeración',()=>{
 for(const mode of ['piece','team'])for(const level of ['beginner','intermediate','advanced']){
  const game=initialState({turnMode:mode}),mirror=reflected(game),options={level,seed:71,budgetMs:Infinity},a=chooseCpuTurn(game,options),b=chooseCpuTurn(mirror,options),expected=reflected(applyTurn(game,a.turn)),actual=applyTurn(mirror,b.turn);
  assert.deepEqual(actual.pieces,expected.pieces,`${mode}/${level}`);assert.deepEqual([...actual.walls].sort(),[...expected.walls].sort(),`${mode}/${level}`);assert.equal(actual.currentActor,expected.currentActor);assert.equal(a.stats.nodes,b.stats.nodes);
 }
});
test('Revisión M2: prefijos comprometidos no pueden cambiar actor, acortarse ni reordenarse',()=>{
 const turn={actor:'A1',path:[8,9,8],to:15};assert.ok(cpuFollowsPrefix(turn));assert.ok(cpuFollowsPrefix(turn,{actor:'A2',path:[40]}));assert.ok(cpuFollowsPrefix(turn,{actor:'A1',path:[8,9]}));
 for(const prefix of [{actor:'A2',path:[40,39]},{actor:'A1',path:[8,15]},{actor:'A1',path:[8,9,16]},{path:'dañado'}])assert.equal(cpuFollowsPrefix(turn,prefix),false);
});
test('Revisión M2: respuesta Worker legal pero incompatible con el paso guardado usa respaldo compatible',async()=>{
 class Worker{postMessage(message){queueMicrotask(()=>this.onmessage({data:{id:message.id,result:{turn:{actor:'A1',path:[8,15],to:22}}}}));}terminate(){}}
 const game=initialState(),prefix={actor:'A1',path:[8,9]},planner=createCpuPlanner({WorkerClass:Worker,address:()=>new URL('http://localhost/worker')}),result=await planner.find(game,{level:'beginner',prefix});validateTurn(game,result.turn);assert.deepEqual(result.turn.path.slice(0,2),prefix.path);assert.equal(game.moves,0);planner.cancel();
});
test('Revisión M2: mensajes sin identificador y de otra búsqueda no resuelven ni dañan la actual',async()=>{
 class Worker{postMessage(message){queueMicrotask(()=>{this.onmessage({data:null});this.onmessage({data:{id:message.id-1,result:{turn:{actor:'B1',path:[12],to:5}}}});this.onmessage({data:{id:message.id,result:{turn:{actor:'A1',path:[8],to:1}}}});});}terminate(){}}
 const game=initialState(),planner=createCpuPlanner({WorkerClass:Worker,address:()=>new URL('http://localhost/worker')}),result=await planner.find(game,{level:'beginner'});assert.deepEqual(result.turn,{actor:'A1',path:[8],to:1});planner.cancel();
});
test('Revisión M2: controlador vuelve a validar el prefijo antes de persistir, sin aceptar datos obsoletos',async()=>{
 const game=initialState(),draft=advanceDraft(game,beginDraft(game),9),control={version:1,type:'cpu',humanTeam:'B',difficulty:'intermediate',seed:7},errors=[];let writes=0;
 const controller=createCpuController({read:()=>({game,draft,control,visible:true,blocked:false}),planner:{cancel(){},async find(){return {turn:{actor:'A1',path:[8,15],to:22}};}},savePlan(){writes++;return true;},select(){assert.fail('No debe seleccionar');},step(){assert.fail('No debe mover');},build(){assert.fail('No debe construir');},status(){},onError:e=>errors.push(e.message)});
 await controller.resume();assert.equal(writes,0);assert.equal(errors.length,1);assert.match(errors[0],/avance guardado/);assert.equal(game.moves,0);assert.deepEqual(draft.path,[8,9]);
});
test('Revisión M2: planes M2 existentes conservan exactamente configuración, prefijo y esquema',()=>{
 const game=initialState(),draft=advanceDraft(game,beginDraft(game),9),control={version:1,type:'cpu',humanTeam:'B',difficulty:'advanced',seed:7},plan=makeCpuPlan(game,{actor:'A1',path:[8,9,8],to:15}),raw=encodeGameSave(game,draft,{control,cpuPlan:plan}),loaded=decodeGameSave(raw);
 assert.equal(loaded.recovered,false);assert.deepEqual(loaded.cpuPlan,plan);assert.deepEqual(loaded.draft,draft);assert.equal(encodeGameSave(loaded.game,loaded.draft,{control:loaded.control,cpuPlan:loaded.cpuPlan}),raw);assert.equal(loaded.game.version,2);
});
