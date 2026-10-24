import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {initialState,applyTurn,validateTurn,legalActors,territory,pieceById,availableMoves,wallOptions,regions,verifyState} from '../src/engine.mjs';
import {beginDraft,selectDraft,advanceDraft} from '../src/turnDraft.mjs';
import {encodeGameSave,decodeGameSave,writeGameSave} from '../src/gameSave.mjs';
import {cpuLegalTurns} from '../src/cpuMoves.mjs';
import {evaluateCpuState,cpuOpenGraph,cpuDistances,cpuBridges,CPU_TERMINAL} from '../src/cpuEvaluate.mjs';
import {chooseCpuTurn,chooseCpuTurnAsync,CPU_LEVELS} from '../src/cpuSearch.mjs';
import {makeCpuPlan,validCpuPlan,isCpuTurn,cpuDecisionSeed} from '../src/cpuSession.mjs';
import {createCpuController} from '../src/cpuController.mjs';
import {createCpuPlanner} from '../src/cpuPlanner.mjs';
import {resultFixture} from './result-fixtures.mjs';
import {conquestFixture,finishFixture} from './territory-fixtures.mjs';
import {participationFixture} from './participation-fixtures.mjs';
import {TACTICAL_FIXTURES} from './cpu-fixtures.mjs';

const config=(humanTeam='B',difficulty='intermediate')=>({version:1,type:'cpu',humanTeam,difficulty,seed:6711});
const fixed={budgetMs:Infinity,nodeBudget:2600,seed:4};
for(const mode of ['piece','team'])test(`M2 ${mode}: enumeración completa de actores, 0/1/2 pasos, giros, regreso y muros`,()=>{
 const game=initialState({turnMode:mode}),snapshot=JSON.stringify(game),turns=cpuLegalTurns(game);
 assert.deepEqual([...new Set(turns.map(t=>t.actor))],legalActors(game));
 for(const actor of legalActors(game)){
  const start=pieceById(game,actor).pos,paths=[[start]];
  for(const first of availableMoves(game,actor,start)){paths.push([start,first]);for(const second of availableMoves(game,actor,first))paths.push([start,first,second]);}
  const expected=paths.flatMap(path=>wallOptions(game,path.at(-1)).map(to=>({actor,path,to})));
  assert.deepEqual(turns.filter(t=>t.actor===actor),expected);
 }
 assert.ok(turns.some(t=>t.path.length===3&&t.path[0]===t.path[2]));assert.ok(turns.some(t=>t.path.length===3&&Math.abs(t.path[1]-t.path[0])!==Math.abs(t.path[2]-t.path[1])));
 for(const turn of turns){validateTurn(game,turn);const next=applyTurn(game,turn);assert.equal(next.moves,1);assert.equal(next.walls.length,1);}
 assert.equal(JSON.stringify(game),snapshot);
 const allStates=new Set(turns.map(t=>{const s=applyTurn(game,t);delete s.lastMove;return JSON.stringify(s);}));
 const deduplicated=cpuLegalTurns(game,{deduplicate:true});assert.ok(deduplicated.length<turns.length);assert.equal(deduplicated.length,allStates.size);
});
test('M2: fichas rivales/aseguradas, ocupación y muros se excluyen mediante el motor',()=>{
 const game=initialState({turnMode:'team'});game.walls=['8-9'];game.moves=1;game.pieces.find(p=>p.id==='B1').pos=15;finishFixture(game);
 for(const turn of cpuLegalTurns(game)){validateTurn(game,turn);assert.equal(turn.actor[0],'A');for(let i=1;i<turn.path.length;i++){assert.notEqual(turn.path[i],15);assert.notDeepEqual(turn.path.slice(i-1,i+1),[8,9]);}}
 const secured=participationFixture().after;for(const turn of cpuLegalTurns(secured))assert.notEqual(turn.actor,'A1');
 assert.deepEqual(cpuLegalTurns(resultFixture().after),[]);
});
test('M2: prefijo irreversible restringe actor y recorrido, incluido regreso de dos pasos',()=>{
 const game=initialState({turnMode:'team'}),one={actor:'A2',path:[40,39]};
 for(const turn of cpuLegalTurns(game,{prefix:one})){assert.equal(turn.actor,'A2');assert.deepEqual(turn.path.slice(0,2),one.path);validateTurn(game,turn);}
 const two={actor:'A2',path:[40,39,40]};assert.ok(cpuLegalTurns(game,{prefix:two}).length);for(const turn of cpuLegalTurns(game,{prefix:two}))assert.deepEqual(turn.path,two.path);
 assert.deepEqual(cpuLegalTurns(game,{prefix:{actor:'B1',path:[12,11]}}),[]);assert.deepEqual(cpuLegalTurns(game,{prefix:{actor:'A1',path:[8,10]}}),[]);
});
test('M2: evaluación pura distingue puntos oficiales, potencial y movilidad; simetría de perspectiva',()=>{
 const game=initialState(),snapshot=JSON.stringify(game),a=evaluateCpuState(game,'A'),b=evaluateCpuState(game,'B');assert.deepEqual(a.score,territory(game).score);assert.equal(a.score.A,0);assert.equal(a.score.B,0);
 assert.ok(Math.abs(a.value+b.value)<1e-10);assert.equal(JSON.stringify(game),snapshot);
 const moved=applyTurn(game,{actor:'A1',path:[8,9,16],to:23}),evaluation=evaluateCpuState(moved,'A');assert.equal(evaluation.score.A,0);assert.notEqual(evaluation.terms.potential,0);assert.ok(Number.isFinite(evaluation.value));
});
test('M2: distancias por caminos abiertos, sin atajos Manhattan ni conexiones diagonales',()=>{
 const game=initialState();game.walls=['0-1'];game.moves=1;const graph=cpuOpenGraph(game),dist=cpuDistances(graph,[0]);assert.equal(dist[1],3);assert.equal(dist[8],2);assert.equal(dist[0],0);
 assert.ok(!graph[0].includes(8));assert.ok(!graph[0].includes(1));assert.deepEqual(cpuDistances(graph,[0,48])[48],0);
});
test('M2: puentes reales y beneficios diferenciados; no todo muro divide la componente',()=>{
 const game=initialState();assert.equal(cpuBridges(cpuOpenGraph(game)).length,0);
 const next=applyTurn(game,{actor:'A1',path:[8],to:1});assert.equal(regions(next).length,1);
 const fixture=conquestFixture(),bridges=cpuBridges(cpuOpenGraph(fixture.before));assert.ok(bridges.some(b=>b.edge.includes(17)&&b.edge.includes(18)));
 assert.ok(regions(fixture.after).length>regions(fixture.before).length);
 const a=evaluateCpuState(fixture.before,'A'),b=evaluateCpuState(fixture.before,'B');assert.ok(a.terms.connections>0);assert.ok(b.terms.connections<0);
 assert.deepEqual(evaluateCpuState(fixture.after,'A').score,territory(fixture.after).score);
});
test('M2: resultados terminales oficiales dominan cualquier heurística y el empate supera la derrota',()=>{
 for(const perspective of ['A','B']){
  const win=resultFixture(perspective==='A'?{A:28,B:16}:{A:16,B:28}).after,loss=resultFixture(perspective==='A'?{A:16,B:28}:{A:28,B:16}).after,draw=resultFixture({A:23,B:23}).after;
  assert.ok(evaluateCpuState(win,perspective).value>=CPU_TERMINAL);assert.ok(evaluateCpuState(loss,perspective).value<=-CPU_TERMINAL);assert.equal(evaluateCpuState(draw,perspective).value,0);
  assert.ok(evaluateCpuState(draw,perspective).value>evaluateCpuState(loss,perspective).value);
 }
});
for(const level of Object.keys(CPU_LEVELS))test(`M2 ${level}: reconoce victoria inmediata, evita preferir derrota y conserva resultado`,()=>{
 for(const mode of ['piece','team']){
  const fixture=resultFixture(),game=finishFixture({...fixture.before,...(mode==='team'?{turnMode:'team'}:{})}),snapshot=JSON.stringify(game);
  const choice=chooseCpuTurn(game,{...fixed,level});validateTurn(game,choice.turn);assert.equal(applyTurn(game,choice.turn).winner,'A');assert.equal(JSON.stringify(game),snapshot);
 }
});
test('M2: niveles diferenciados, semillas reproducibles y variedad razonable de principiante',()=>{
 const game=initialState({turnMode:'team'}),choices=Object.keys(CPU_LEVELS).map(level=>chooseCpuTurn(game,{...fixed,seed:1,level}));
 // Dos niveles pueden coincidir en una buena apertura. La diferenciación se
 // comprueba en varias posiciones reales, no obligando a elegir otra jugada.
 const positions=[game,...TACTICAL_FIXTURES.map(f=>f.game)],decisions=positions.map(position=>Object.keys(CPU_LEVELS).map(level=>JSON.stringify(chooseCpuTurn(position,{...fixed,seed:71,level}).turn)));
 for(const [a,b] of [[0,1],[0,2],[1,2]])assert.ok(decisions.some(row=>row[a]!==row[b]));
 assert.ok(choices[1].stats.nodes>choices[0].stats.nodes);assert.ok(choices[2].stats.completedRoots>choices[1].stats.completedRoots);
 const a=chooseCpuTurn(game,{...fixed,level:'advanced'}),b=chooseCpuTurn(game,{...fixed,level:'advanced'});assert.deepEqual(a.turn,b.turn);assert.equal(a.stats.nodes,b.stats.nodes);
 const variants=new Set(Array.from({length:12},(_,seed)=>JSON.stringify(chooseCpuTurn(game,{...fixed,seed:seed*99991,level:'beginner'}).turn)));assert.ok(variants.size>1);
});
test('M2: victoria inmediata de B bajo ambas políticas y tres niveles',()=>{
 for(const mode of ['piece','team'])for(const level of Object.keys(CPU_LEVELS)){
  const game=finishFixture({...resultFixture({A:16,B:28}).before,turnTeam:'B',...(mode==='team'?{turnMode:'team'}:{})});
  const choice=chooseCpuTurn(game,{...fixed,level});assert.equal(applyTurn(game,choice.turn).winner,'B');
 }
});
test('M2: los tres niveles reconocen conquistas inmediatas para ambos equipos',()=>{
 for(const owner of ['A','B'])for(const level of Object.keys(CPU_LEVELS)){
  const {before}=conquestFixture({owner}),result=chooseCpuTurn(before,{...fixed,level}),next=applyTurn(before,result.turn);assert.equal(territory(next).score[owner],12);
 }
});
for(const fixture of TACTICAL_FIXTURES)test(`M2 ${fixture.mode}: Avanzado evita una amenaza de victoria rival que un análisis inmediato no evita`,()=>{
 const game=fixture.game,opponent=game.turnTeam==='A'?'B':'A';assert.ok(verifyState(game));
 const losesNext=turn=>{const next=applyTurn(game,turn);return next.over?next.winner===opponent:cpuLegalTurns(next,{deduplicate:true}).some(reply=>{const response=applyTurn(next,reply);return response.over&&response.winner===opponent;});};
 assert.equal(losesNext(fixture.unsafe),true);const advanced=chooseCpuTurn(game,{...fixed,level:'advanced'});assert.ok(advanced.stats.completedRoots>0);assert.equal(losesNext(advanced.turn),false);
});
test('M2: presupuesto agotado conserva una jugada legal y no impide examinar las raíces',()=>{
 const game=initialState({turnMode:'team'}),result=chooseCpuTurn(game,{level:'advanced',budgetMs:0,nodeBudget:0});validateTurn(game,result.turn);assert.equal(result.stats.rootCandidates,cpuLegalTurns(game,{deduplicate:true}).length);assert.equal(result.stats.budgetExhausted,true);
 assert.equal(chooseCpuTurn(resultFixture().after,{level:'advanced'}),null);
});
test('M2: búsqueda cooperativa cede el hilo y permite cancelación sin alterar el estado',async()=>{
 const game=initialState({turnMode:'team'});let cancelled=false,yields=0;
 const result=await chooseCpuTurnAsync(game,{...fixed,level:'advanced'},{cancelled:()=>cancelled,yieldTask:async()=>{yields++;cancelled=true;}});assert.equal(result,null);assert.ok(yields>0);assert.equal(game.moves,0);
});
for(const mode of ['piece','team'])test(`M2 ${mode}: plan persistido antes de mover y recuperación exacta en cada prefijo`,()=>{
 const game=initialState({turnMode:mode}),control=config(),turn={actor:mode==='team'?'A2':'A1',path:mode==='team'?[40,39,40]:[8,9,8],to:mode==='team'?33:15},plan=makeCpuPlan(game,turn);let draft=beginDraft(game);
 if(mode==='team')draft=selectDraft(game,draft,turn.actor);
 for(let steps=0;steps<=2;steps++){
  if(steps)draft=advanceDraft(game,draft,turn.path[steps]);
  const raw=encodeGameSave(game,draft,{control,cpuPlan:plan}),decoded=decodeGameSave(raw);assert.deepEqual(decoded.game,game);assert.deepEqual(decoded.control,control);assert.deepEqual(decoded.cpuPlan,plan);assert.equal(decoded.recovered,false);assert.equal(decoded.game.moves,0);assert.equal(decoded.game.walls.length,0);
  if(steps)assert.deepEqual(decoded.draft,draft);assert.equal(validCpuPlan(decoded.game,decoded.draft,decoded.control,decoded.cpuPlan),true);
 }
 const next=applyTurn(game,turn),stored=JSON.parse(encodeGameSave(next,beginDraft(next),{control,cpuPlan:null}));assert.equal(stored.cpuPlan,undefined);assert.equal(stored.pendingTurn,undefined);assert.deepEqual(stored.game,next);assert.deepEqual(stored.control,control);
});
test('M2: planes dañados/obsoletos no borran pasos válidos ni ejecutan una decisión ilegal',()=>{
 const game=initialState(),control=config(),draft=advanceDraft(game,beginDraft(game),9),plan=makeCpuPlan(game,{actor:'A1',path:[8,9,16],to:23}),raw=JSON.parse(encodeGameSave(game,draft,{control,cpuPlan:plan}));
 for(const bad of [{...plan,base:'obsoleto'},{...plan,team:'B'},{...plan,version:2},{...plan,turn:{actor:'B1',path:[12],to:5}},{...plan,turn:{actor:'A1',path:[8,15],to:22}}]){
  const decoded=decodeGameSave(JSON.stringify({...raw,cpuPlan:bad}));assert.equal(decoded.recovered,true);assert.deepEqual(decoded.draft,draft);assert.deepEqual(decoded.game,game);assert.deepEqual(decoded.control,control);assert.equal(decoded.cpuPlan,undefined);
  const choice=chooseCpuTurn(decoded.game,{...fixed,prefix:decoded.draft});assert.deepEqual(choice.turn.path.slice(0,2),draft.path);
 }
});
test('M2: configuración inválida se recupera con aviso y sin alterar el estado matemático',()=>{
 const game=initialState({turnMode:'team'});
 for(const control of [{...config(),humanTeam:'C'},{...config(),difficulty:'expert'},{...config(),seed:-1},null]){
  const recovered=decodeGameSave(JSON.stringify({game,control}));assert.equal(recovered.recovered,true);assert.deepEqual(recovered.game,game);assert.equal(recovered.control,undefined);
 }
});
test('M2: compatibilidad completa de guardados locales antiguos, parciales y terminados',()=>{
 for(const game of [initialState(),initialState({turnMode:'team'}),resultFixture().after,resultFixture({A:23,B:23}).after]){
  const restored=decodeGameSave(JSON.stringify({game}));assert.equal(restored.control,undefined);assert.equal(isCpuTurn(restored.game,restored.control),false);assert.deepEqual(restored.game,game);assert.equal(restored.recovered,false);
 }
 const game=initialState(),draft=advanceDraft(game,beginDraft(game),9),raw=encodeGameSave(game,draft);assert.deepEqual(decodeGameSave(raw).draft,draft);assert.equal(decodeGameSave(raw).control,undefined);
});
test('M2: guardado atómico, errores de almacenamiento y configuración conservada en el final',()=>{
 const game=initialState(),control=config(),draft=beginDraft(game),plan=makeCpuPlan(game,{actor:'A1',path:[8],to:1});let writes=0,value='';
 writeGameSave({setItem(k,v){writes++;value=v;}},game,draft,{control,cpuPlan:plan});assert.equal(writes,1);assert.deepEqual(decodeGameSave(value).cpuPlan,plan);
 assert.throws(()=>writeGameSave({setItem(){throw Error('QuotaExceededError');}},game,draft,{control,cpuPlan:plan}),/Quota/);assert.equal(game.moves,0);
 const final=resultFixture().after,restored=decodeGameSave(encodeGameSave(final,beginDraft(final),{control}));assert.deepEqual(restored.control,control);assert.equal(isCpuTurn(restored.game,control),false);
 assert.equal(cpuDecisionSeed(game,control),cpuDecisionSeed(game,control));assert.notEqual(cpuDecisionSeed(game,control),cpuDecisionSeed(applyTurn(game,plan.turn),control));
});
function controllerFixture({plan=null,planner=null,failPlan=false,failStep=false}={}){
 let game=initialState({turnMode:'team'}),draft=beginDraft(game),control=config(),visible=true,blocked=false;const writes=[],errors=[];let searches=0;
 const selected={actor:'A2',path:[40,39,32],to:25};
 const api={read:()=>({game,draft,control,plan,visible,blocked}),setVisible:v=>{visible=v;},get writes(){return writes;},errors,
  planner:planner??{cancel(){},async find(){searches++;return {turn:selected,stats:{}};}},
  savePlan(value){if(failPlan)return false;plan=value;writes.push(JSON.parse(encodeGameSave(game,draft,{control,cpuPlan:plan})));return true;},
  select(actor){if(draft.path.length<=1)draft=selectDraft(game,draft,actor);},
  async step(to){if(failStep)return false;draft=advanceDraft(game,draft,to);writes.push(JSON.parse(encodeGameSave(game,draft,{control,cpuPlan:plan})));return true;},
  async build(to){game=applyTurn(game,{actor:draft.actor,path:draft.path,to});draft=beginDraft(game);plan=null;writes.push(JSON.parse(encodeGameSave(game,draft,{control})));return true;},status(){},onError:e=>errors.push(e.message),get searches(){return searches;},enableSteps(){failStep=false;}};
 return api;
}
test('M2: controlador usa selección, pasos y muro comunes exactamente una vez',async()=>{
 const fixture=controllerFixture(),controller=createCpuController(fixture);await Promise.all([controller.resume(),controller.resume()]);
 assert.equal(fixture.searches,1);assert.equal(fixture.writes.length,4);assert.equal(fixture.writes[0].pendingTurn,undefined);assert.ok(fixture.writes[0].cpuPlan);assert.equal(fixture.writes[1].pendingTurn.steps,1);assert.equal(fixture.writes[2].pendingTurn.steps,2);assert.equal(fixture.read().game.moves,1);assert.equal(fixture.read().game.turnTeam,'B');assert.equal(fixture.writes.at(-1).cpuPlan,undefined);assert.deepEqual(fixture.errors,[]);
 await controller.resume();assert.equal(fixture.read().game.moves,1);
});
test('M2: fallo al guardar plan no acepta pasos; fallo posterior permite reintentar el mismo plan',async()=>{
 const failed=controllerFixture({failPlan:true});await createCpuController(failed).resume();assert.equal(failed.writes.length,0);assert.equal(failed.read().game.moves,0);
 const retry=controllerFixture({failStep:true}),controller=createCpuController(retry);await controller.resume();assert.equal(retry.writes.length,1);assert.ok(retry.read().plan);retry.enableSteps();await controller.resume();assert.equal(retry.searches,1);assert.equal(retry.read().game.moves,1);
});
test('M2: cancelación/abandono descartan resultados de otra generación sin cambiar la partida',async()=>{
 let resolve;const planner={cancel(){},find:()=>new Promise(r=>{resolve=r;})},fixture=controllerFixture({planner}),controller=createCpuController(fixture);
 const pending=controller.resume();fixture.setVisible(false);controller.cancel();resolve({turn:{actor:'A1',path:[8],to:1}});await pending;assert.equal(fixture.writes.length,0);assert.equal(fixture.read().game.moves,0);assert.equal(controller.running,false);
});
test('M2: Worker cancelado no ejecuta respuestas antiguas ni detiene un Worker nuevo',async()=>{
 const workers=[];class FakeWorker{constructor(){workers.push(this);}postMessage(message){this.message=message;}terminate(){this.terminated=true;}}
 const planner=createCpuPlanner({WorkerClass:FakeWorker,address:()=>new URL('http://localhost/worker')}),game=initialState();const first=planner.find(game,{level:'beginner'});planner.cancel();assert.equal(await first,null);
 const second=planner.find(game,{level:'beginner'}),old=workers[0],current=workers[1];old.onerror();assert.equal(current.terminated,undefined);old.onmessage({data:{id:old.message.id,result:{turn:{actor:'B1',path:[12],to:5}}}});assert.equal(current.terminated,undefined);
 const expected={turn:{actor:'A1',path:[8],to:1}};current.onmessage({data:{id:current.message.id,result:expected}});assert.deepEqual(await second,expected);assert.equal(current.terminated,true);
});
test('M2: sin Worker o con error de creación se utiliza búsqueda cooperativa legal',async()=>{
 for(const WorkerClass of [undefined,class{constructor(){throw Error('Unavailable');}}]){
  const planner=createCpuPlanner({WorkerClass}),game=initialState(),result=await planner.find(game,{level:'beginner',seed:1});validateTurn(game,result.turn);planner.cancel();
 }
});
test('M2: respuesta Worker vacía o ilegal usa respaldo legal sin aceptar la respuesta dañada',async()=>{
 for(const result of [null,{turn:{actor:'B1',path:[12],to:5}}]){
  class InvalidWorker{postMessage(message){queueMicrotask(()=>this.onmessage({data:{id:message.id,result}}));}terminate(){}}
  const game=initialState(),planner=createCpuPlanner({WorkerClass:InvalidWorker,address:()=>new URL('http://localhost/worker')}),chosen=await planner.find(game,{level:'beginner'});validateTurn(game,chosen.turn);assert.equal(chosen.turn.actor,'A1');planner.cancel();
 }
});
test('M2: motor y políticas conservan sus hashes; marca y cuatro reglas breves permanecen',async()=>{
 for(const [name,sha] of [['engine','ee7982394c38dbdee738f04bb7811590e70dc4d9d6e3b39bea44aac8844b3a90'],['turnPolicies','0a06a01c51c25065f5e40564a655986d5e417e22be8dc42a99633178db74b5b0']])assert.equal(createHash('sha256').update(await readFile(new URL(`../src/${name}.mjs`,import.meta.url))).digest('hex'),sha);
 const html=await readFile(new URL('../clasico/index.html',import.meta.url),'utf8'),home=html.slice(html.indexOf('<main id="homeScreen"'),html.indexOf('<div class="app"'));
 assert.match(home,/Cerconexo_logo_v3_transparente.png/);assert.match(home,/data-mode="classic"/);assert.match(home,/data-mode="arena"/);assert.doesNotMatch(home,/Cada muro|subtítulo|eslogan|class="mode-name"/);assert.equal((html.match(/<li><svg viewBox="0 0 44 44"/g)||[]).length,4);assert.doesNotMatch(html,/Cambiar recorrido|Deshacer/);
});
