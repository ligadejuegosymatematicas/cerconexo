import test from 'node:test';
import assert from 'node:assert/strict';
import {createArena,applyArena,legalArenaActions} from '../src/engine.mjs';
import {analyzeArena,arenaNeighbors,arenaWall} from '../src/geometry.mjs';
import {ArenaSession,ARENA_SAVE_KEY} from '../src/session.mjs';
import {chooseArenaCpu,arenaCpuActions,arenaDecisionTeam,sameArenaAction,evaluateArenaCpu} from '../src/cpuStrategy.mjs';
import {createArenaCpuController} from '../src/cpuController.mjs';
import {restoreArenaControl,saveArenaControl,ARENA_CPU_KEY} from '../src/cpuConfig.mjs';

const memory=()=>({data:new Map(),getItem(k){return this.data.get(k)??null;},setItem(k,v){this.data.set(k,v);}});
const decide=s=>chooseArenaCpu(s,{budget:{nodes:40,milliseconds:200}});
async function until(predicate){const end=Date.now()+2000;while(!predicate()){assert.ok(Date.now()<end,'Condición del controlador pendiente');await new Promise(r=>setTimeout(r,2));}}
function barrier(){
 const s=createArena({policy:'team'});s.drops=[];
 s.pieces=[{id:'A1',team:'A',pos:10},{id:'B1',team:'B',pos:9},{id:'A2',team:'A',pos:70},{id:'B2',team:'B',pos:64}];
 s.walls=[...new Set([9,10].flatMap(c=>arenaNeighbors(c).filter(n=>![9,10].includes(n)).map(n=>arenaWall(c,n))))];
 s.turn={team:'A',actor:'A1',steps:0,path:[10],committed:false,actions:0};return s;
}
for(const policy of ['piece','team'])for(const team of ['A','B'])test(`CPU ${policy}/${team}: acción legal, estado puro y búsqueda acotada`,async()=>{
 let s=createArena({policy});if(team==='B'){if(!s.turn.actor)s=applyArena(s,{type:'select',actor:'A1'});s=applyArena(s,legalArenaActions(s).find(a=>a.type==='wall'));}
 const before=JSON.stringify(s),r=await decide(s);assert.equal(JSON.stringify(s),before);assert.equal(arenaDecisionTeam(s),team);
 assert.ok(arenaCpuActions(s).some(a=>sameArenaAction(a,r.action)));assert.ok(r.nodes<=40);assert.doesNotThrow(()=>applyArena(s,r.action));
});
test('CPU: presupuesto agotado conserva respaldo legal determinista; cuatro equipos no admite CPU',async()=>{
 const s=createArena(),a=await chooseArenaCpu(s,{budget:{nodes:0}}),b=await chooseArenaCpu(s,{budget:{nodes:0}});
 assert.deepEqual(a.action,b.action);assert.doesNotThrow(()=>applyArena(s,a.action));assert.equal((await decide(createArena({mode:'ffa'}))).action,null);
});
test('CPU: no alterna selecciones sin mover; respeta actor comprometido y ficha única',()=>{
 let s=createArena({policy:'team'});assert.equal(arenaCpuActions(s).length,2);s=applyArena(s,{type:'select',actor:'A2'});
 assert.ok(!arenaCpuActions(s).some(a=>a.type==='select'));s=applyArena(s,arenaCpuActions(s).find(a=>a.type==='move'));
 assert.ok(!arenaCpuActions(s).some(a=>a.type==='select'));assert.equal(s.turn.actor,'A2');
 s=barrier();s.pieces.find(p=>p.id==='B1').pos=63;s.turn.actor='A2';s.turn.path=[70];
 assert.ok(!analyzeArena(s).active.includes('A1'));assert.ok(arenaCpuActions(s).every(a=>a.actor!=='A1'));
});
test('CPU: demolición reactiva y revierte puntos mediante el motor',async()=>{
 let s=barrier();s.pieces.find(p=>p.id==='B1').pos=63;s.turn.actor='A2';s.pieces.find(p=>p.id==='A2').pos=11;s.turn.path=[11];s.inventories.A=[{id:'d',type:'demolition'}];
 assert.equal(analyzeArena(s).score.A,2);const a=arenaCpuActions(s).find(a=>a.type==='demolition'&&a.to===10);assert.ok(a);
 s=applyArena(s,a);assert.equal(analyzeArena(s).score.A,0);assert.ok(analyzeArena(s).active.includes('A1'));assert.ok((await decide(s)).action);
});
test('CPU: salto, descarte humano, continuación propia, recolección y poderes consecutivos',async()=>{
 let s=barrier();s.drops=[{id:'new',type:'extraWall',cell:11}];s.inventories.A=[{id:'j',type:'jump'}];s.inventories.B=[{id:'b1',type:'jump'},{id:'b2',type:'demolition'}];
 s=applyArena(s,{type:'jump',to:11,power:'j'});assert.equal(arenaDecisionTeam(s),'B');assert.equal(s.turn.team,'A');
 assert.ok(arenaCpuActions(s).every(a=>a.type==='discard'&&a.owner==='B'));const r=await decide(s);assert.equal(r.action.power,'b1');s=applyArena(s,r.action);
 assert.equal(arenaDecisionTeam(s),'A');assert.equal(s.turn.steps,1);assert.equal(s.inventories.A[0].type,'extraWall');
 const wall=arenaCpuActions(s).find(a=>a.type==='extraWall');s=applyArena(s,wall);assert.equal(s.turn.steps,1);assert.ok(!s.over);assert.equal(s.completedTurns,0);
 assert.ok((await decide(s)).action);
});
test('CPU: evalúa victoria inmediata y el fin evita descartes irrelevantes',async()=>{
 const s=createArena({policy:'team'});const group=c=>c<42?'A':'B';
 s.walls=[...new Set(Array.from({length:81},(_,c)=>arenaNeighbors(c).filter(n=>group(c)!==group(n)).map(n=>arenaWall(c,n))).flat())].filter(w=>w!==arenaWall(41,42));
 s.pieces=[{id:'A1',team:'A',pos:0},{id:'A2',team:'A',pos:41},{id:'B1',team:'B',pos:42},{id:'B2',team:'B',pos:80}];
 s.turn={team:'A',actor:'A2',steps:0,path:[41],committed:false,actions:0};s.inventories.A=[{id:'x',type:'extraWall'}];
 const r=await chooseArenaCpu(s,{budget:{nodes:100,milliseconds:500}}),after=applyArena(s,r.action);
 assert.equal(after.over,true);assert.deepEqual(after.winners,['A']);assert.equal(after.pending,null);assert.equal(arenaCpuActions(after).length,0);assert.ok(evaluateArenaCpu(after,'A')>100000);
});
test('Estrategia: Demolición recupera puntos rivales, Salto conquista y Muro adicional prepara el cierre',async()=>{
 let s=barrier();s.pieces=[{id:'A1',team:'A',pos:11},{id:'B1',team:'B',pos:9},{id:'A2',team:'A',pos:70},{id:'B2',team:'B',pos:64}];s.turn.actor='A1';s.turn.path=[11];s.inventories.A=[{id:'d',type:'demolition'}];
 let r=await chooseArenaCpu(s,{budget:{nodes:160,milliseconds:500}});assert.equal(r.action.type,'demolition');assert.equal(analyzeArena(applyArena(s,r.action)).score.B,0);
 s=createArena();s.drops=[];s.walls=arenaNeighbors(11).map(n=>arenaWall(11,n));s.inventories.A1=[{id:'j',type:'jump'}];
 r=await chooseArenaCpu(s,{budget:{nodes:160,milliseconds:500}});assert.equal(r.action.type,'jump');let next=applyArena(s,r.action);assert.equal(analyzeArena(next).score.A,1);assert.equal(next.completedTurns,1);
 s=createArena();s.drops=[];s.pieces=[{id:'A1',team:'A',pos:40},{id:'A2',team:'A',pos:70},{id:'B1',team:'B',pos:31},{id:'B2',team:'B',pos:49}];
 s.walls=[...new Set([31,49].flatMap(c=>arenaNeighbors(c).filter(n=>n!==40).map(n=>arenaWall(c,n))))];s.turn.path=[40];s.inventories.A1=[{id:'e',type:'extraWall'}];
 r=await chooseArenaCpu(s,{budget:{nodes:160,milliseconds:500}});assert.equal(r.action.type,'extraWall');next=applyArena(s,r.action);
 r=await chooseArenaCpu(next,{budget:{nodes:160,milliseconds:500}});next=applyArena(next,r.action);assert.equal(next.over,true);assert.deepEqual(next.winners,['A']);
});
test('Control persistente: antiguo local, CPU recargada, reemplazo local y formato del diario intacto',()=>{
 const storage=memory();const old=new ArenaSession(storage);old.save();const raw=storage.getItem(ARENA_SAVE_KEY);
 assert.equal(restoreArenaControl(storage,raw).opponent,'local');const config={opponent:'cpu',humanTeam:'B'};
 const wrapped={setItem:(k,v)=>saveArenaControl(storage,k,v,config)},session=new ArenaSession(wrapped,{policy:'team'});session.save();session.dispatch({type:'select',actor:'A1'});session.dispatch({type:'move',to:11});
 const saved=storage.getItem(ARENA_SAVE_KEY),restored=ArenaSession.restore(wrapped,saved);assert.ok(restored.ok);assert.equal(restored.session.game.turn.steps,1);
 assert.deepEqual(restoreArenaControl(storage,saved),config);assert.deepEqual(Object.keys(JSON.parse(saved)),['format','version','setup','commands']);
 saveArenaControl(storage,ARENA_SAVE_KEY,raw,{opponent:'local'});assert.equal(restoreArenaControl(storage,raw).opponent,'local');assert.equal(restoreArenaControl(storage,raw,'ffa').opponent,'local');
 storage.setItem(ARENA_CPU_KEY,'corrupto');assert.equal(restoreArenaControl(storage,raw).opponent,'local');
});
test('Control persistente: fallo de escritura no confirma acción y mantiene asignación anterior',()=>{
 const store=memory(),cfg={opponent:'cpu',humanTeam:'A'};let fail=false;
 const storage={getItem:k=>store.getItem(k),setItem(k,v){if(fail&&k===ARENA_SAVE_KEY)throw Error('cuota');store.setItem(k,v);}};
 const wrapped={setItem:(k,v)=>saveArenaControl(storage,k,v,cfg)},s=new ArenaSession(wrapped);s.save();const before=store.getItem(ARENA_SAVE_KEY);fail=true;
 assert.throws(()=>s.dispatch({type:'move',to:11}),/cuota/);assert.equal(s.game.revision,0);assert.equal(store.getItem(ARENA_SAVE_KEY),before);assert.deepEqual(restoreArenaControl(store,before),cfg);
});
test('Controlador: respuestas obsoletas, pausa humana, cancelación y respaldo sin Worker',async()=>{
 let session=new ArenaSession(memory()),paused=false;const workers=[],applied=[];
 const controller=createArenaCpuController({getSession:()=>session,getControl:()=>({opponent:'cpu',humanTeam:'B'}),isPaused:()=>paused,
  workerFactory:()=>{const w={postMessage(d){this.request=d;},terminate(){this.stopped=true;}};workers.push(w);return w;},dispatch:a=>{applied.push(a);session.dispatch(a);}});
 controller.tick();await until(()=>workers.length===1);const old=workers[0];controller.cancel();
 old.onmessage({data:{id:old.request.id,revision:0,action:{type:'wall',to:11}}});assert.equal(applied.length,0);assert.ok(old.stopped);
 controller.tick();await until(()=>workers.length===2);const w=workers[1];w.onmessage({data:{id:w.request.id-1,revision:0,action:{type:'wall',to:11}}});assert.equal(applied.length,0);
 paused=true;w.onmessage({data:{id:w.request.id,revision:0,action:{type:'wall',to:11}}});assert.equal(applied.length,0);controller.cancel();
 paused=false;session=new ArenaSession(memory());const fallback=createArenaCpuController({getSession:()=>session,getControl:()=>({opponent:'cpu',humanTeam:'B'}),isPaused:()=>paused,workerFactory:()=>{throw Error('Worker bloqueado');},dispatch:a=>{session.dispatch(a);paused=true;}});
 fallback.tick();await until(()=>session.game.revision>0);fallback.cancel();assert.ok(session.game.revision>0);
});
test('Controlador: nunca descarta por humano; retoma tras decisión humana y detecta cambio de sesión',async()=>{
 let game=barrier();game.inventories.A=[{id:'j',type:'jump'}];game.inventories.B=[{id:'b1',type:'jump'},{id:'b2',type:'demolition'}];game=applyArena(game,{type:'jump',to:11,power:'j'});
 let session={game},requests=0;const controller=createArenaCpuController({getSession:()=>session,getControl:()=>({opponent:'cpu',humanTeam:'B'}),isPaused:()=>false,workerFactory:()=>{requests++;return {postMessage(){},terminate(){}};},dispatch:()=>assert.fail('No debe actuar mientras decide el humano')});
 controller.tick();await new Promise(r=>setTimeout(r,10));assert.equal(requests,0);
 session={game:applyArena(game,{type:'discard',owner:'B',power:'b1'})};controller.tick();await until(()=>requests===1);controller.cancel();
});
test('Controlador: respuesta ilegal y Worker silencioso usan respaldo legal; nueva sesión invalida respuesta',async()=>{
 for(const scenario of ['illegal','silent','replaced']){
  let session=new ArenaSession(memory()),paused=false,worker;const applied=[],measure=[];
  const controller=createArenaCpuController({getSession:()=>session,getControl:()=>({opponent:'cpu',humanTeam:'B'}),isPaused:()=>paused,timeout:15,
   workerFactory:()=>worker={postMessage(request){this.request=request;},terminate(){}},onMeasure:r=>measure.push(r),
   dispatch:a=>{assert.ok(arenaCpuActions(session.game).some(x=>sameArenaAction(x,a)));applied.push(a);session.dispatch(a);paused=true;}});
  controller.tick();await until(()=>worker);
  if(scenario==='replaced'){session=new ArenaSession(memory());worker.onmessage({data:{id:worker.request.id,revision:0,action:{type:'wall',to:11}}});assert.equal(applied.length,0);}
  else{
   if(scenario==='illegal')worker.onmessage({data:{id:worker.request.id,revision:0,action:{type:'demolition',to:80,power:'inventado'}}});
   await until(()=>applied.length===1);if(scenario==='illegal')assert.equal(measure[0].fallback,true);
  }
  controller.cancel();
 }
});
