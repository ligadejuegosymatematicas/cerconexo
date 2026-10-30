import test from 'node:test';
import assert from 'node:assert/strict';
import {createArena,applyArena} from '../src/engine.mjs';
import {arenaCpuPresentation,createCpuPresentation,CPU_PRESENTATION_MS} from '../src/cpuPresentation.mjs';
import {ArenaSession,ARENA_SAVE_KEY,replayArenaSave} from '../src/session.mjs';
import {createArenaCpuController} from '../src/cpuController.mjs';
import {chooseArenaCpu,arenaCpuActions,sameArenaAction} from '../src/cpuStrategy.mjs';

test('Presentación: selección, pasos y muro no alteran el estado ni los tiempos de cálculo',()=>{
  let s=createArena({policy:'team'});
  for(const a of [{type:'select',actor:'A1'},{type:'move',to:11},{type:'wall',to:12}]){
    const after=applyArena(s,a),raw=JSON.stringify([s,after]);
    const steps=arenaCpuPresentation(s,after,a);
    assert.equal(steps[0].kind,a.type);assert.equal(steps[0].milliseconds,CPU_PRESENTATION_MS[a.type]);
    assert.equal(JSON.stringify([s,after]),raw);s=after;
  }
});
test('Presentación: poder, recogida y territorio en orden; descarte nombra el poder consumido',()=>{
  const before=createArena();before.inventories.A1=[{id:'j',type:'jump'}];
  const after=structuredClone(before);after.lastEvents=[{type:'pickup',actor:'A1',power:'extraWall'},{type:'secured',actor:'A1'},{type:'territory',team:'A',delta:1}];
  const steps=arenaCpuPresentation(before,after,{type:'jump',power:'j',to:11});
  assert.deepEqual(steps.map(s=>s.kind),['jump','pickup','territory']);
  assert.match(steps[0].text,/Salto/);assert.match(steps[1].text,/Muro adicional/);assert.match(steps[2].text,/1 casilla\./);
  after.lastEvents=[];
  assert.match(arenaCpuPresentation(before,after,{type:'discard',owner:'A1',power:'j'})[0].text,/A1 descarta Salto/);
});
test('Presentación: fin y descarte humano son información, sin decisiones automáticas',()=>{
  const before=createArena(),after=structuredClone(before);after.pending={team:'B'};
  assert.match(arenaCpuPresentation(before,after,{type:'wall',to:11})[0].text,/Equipo B: elige qué descartar/);
  after.pending=null;after.over=true;after.winners=['A','B'];
  const steps=arenaCpuPresentation(before,after,{type:'wall',to:11});
  assert.match(steps.at(-1).text,/Empate entre A, B/);assert.equal(steps.at(-1).milliseconds,900);
});
function clock(){
  let id=0;const pending=new Map();return {pending,schedule(fn,ms){pending.set(++id,{fn,ms});return id;},unschedule(i){pending.delete(i);},advance(){const [i,t]=pending.entries().next().value;pending.delete(i);t.fn();}};
}
test('Presentación: barrera activa hasta terminar, un único anuncio por etapa',()=>{
  const c=clock(),seen=[];let finished=0;
  const p=createCpuPresentation({...c,show:s=>seen.push(s.text),onFinish:()=>finished++});
  p.play([{text:'uno',milliseconds:700},{text:'dos',milliseconds:850}]);
  assert.equal(p.active,true);assert.deepEqual(seen,['uno']);c.advance();assert.deepEqual(seen,['uno','dos']);
  assert.equal(finished,0);c.advance();assert.equal(finished,1);assert.equal(p.active,false);
});
test('Presentación: cancelar/reemplazar/reiniciar invalida callbacks anteriores sin reanudaciones tardías',()=>{
  const c=clock(),seen=[];let finished=0;
  const p=createCpuPresentation({...c,show:s=>seen.push(s.text),onFinish:()=>finished++});
  p.play([{text:'anterior',milliseconds:100}]);const stale=[...c.pending.values()][0].fn;
  p.play([{text:'nueva',milliseconds:100}]);stale();assert.deepEqual(seen,['anterior','nueva']);assert.equal(finished,0);
  p.cancel();c.pending.clear();stale();assert.equal(p.active,false);assert.equal(finished,0);
});

test('M5-C: tres poderes, recogida y muro se guardan antes de presentarse y se recuperan sin duplicación',()=>{
  const data=new Map();let writes=0;
  const storage={getItem:k=>data.get(k),setItem(k,v){writes++;data.set(k,v);}};
  const setup={policy:'team',experiment:{initial:[{type:'demolition',cell:11},{type:'extraWall',cell:20},{type:'jump',cell:21}],waves:[],symmetry:'vertical',placement:'center-first'}};
  const session=new ArenaSession(storage,setup);session.save();
  for(const action of [{type:'select',actor:'A1'},{type:'move',to:11},{type:'move',to:20},{type:'wall',to:21},{type:'select',actor:'B1'},{type:'wall',to:15}])session.dispatch(action);
  const plan=[{type:'select',actor:'A1'},{type:'demolition',to:21,power:'initial-0'},{type:'move',to:21},{type:'extraWall',to:22,power:'initial-1'},{type:'jump',to:22,power:'initial-2'},{type:'wall',to:31}];
  const c=clock(),seen=[];let finishes=0;
  const presentation=createCpuPresentation({...c,show:step=>seen.push({kind:step.kind,raw:storage.getItem(ARENA_SAVE_KEY)}),onFinish:()=>finishes++});
  for(const action of plan){
    assert.ok(arenaCpuActions(session.game).some(a=>sameArenaAction(a,action)));
    const before=session.game;session.dispatch(action);const raw=storage.getItem(ARENA_SAVE_KEY),count=writes;
    const recovered=replayArenaSave(raw);assert.ok(recovered.ok);assert.deepEqual(recovered.game,session.game);
    presentation.play(arenaCpuPresentation(before,session.game,action));assert.equal(presentation.active,true);
    while(presentation.active)c.advance();
    assert.equal(writes,count);assert.equal(storage.getItem(ARENA_SAVE_KEY),raw);
    assert.equal(seen.at(-1).raw,raw);
  }
  assert.deepEqual(seen.map(s=>s.kind),['select','demolition','move','pickup','extraWall','jump','wall']);
  assert.equal(finishes,6);assert.equal(session.game.completedTurns,3);assert.equal(session.game.turn.team,'B');
  assert.deepEqual(session.game.inventories.A,[]);assert.equal(session.game.pieces.find(p=>p.id==='A1').pos,22);
});

test('M5-C: la presentación pausa decisiones; respuestas obsoletas y reemplazo no ejecutan acciones tardías',async()=>{
  const data=new Map(),storage={setItem:(k,v)=>data.set(k,v)},workers=[];
  let session=new ArenaSession(storage),paused=false;session.save();
  const c=clock();let controller;
  const presentation=createCpuPresentation({...c,show:()=>{},onFinish:()=>controller.tick()});
  controller=createArenaCpuController({getSession:()=>session,getControl:()=>({opponent:'cpu',humanTeam:'B'}),isPaused:()=>paused||presentation.active,
    workerFactory:()=>{const w={postMessage(request){this.request=request;},terminate(){this.stopped=true;}};workers.push(w);return w;},
    dispatch:action=>{const before=session.game;session.dispatch(action);presentation.play(arenaCpuPresentation(before,session.game,action));}});
  const until=async predicate=>{const end=performance.now()+1500;while(!predicate()){assert.ok(performance.now()<end,'Controlador integrado sin completar su condición');await new Promise(r=>setTimeout(r,0));}};
  try{
    controller.tick();await until(()=>workers.length===1);
    const first=workers[0],result=await chooseArenaCpu(session.game,{now:()=>0});
    first.onmessage({data:{id:first.request.id,revision:first.request.game.revision,...result}});
    assert.equal(session.commands.length,1);assert.ok(presentation.active);
    const raw=data.get(ARENA_SAVE_KEY);controller.tick();await new Promise(r=>setTimeout(r,0));
    assert.equal(workers.length,1);first.onmessage({data:{id:first.request.id,revision:first.request.game.revision,...result}});
    assert.equal(data.get(ARENA_SAVE_KEY),raw);
    while(presentation.active)c.advance();await until(()=>workers.length===2);
    const late=workers[1],next=await chooseArenaCpu(session.game,{now:()=>0});
    controller.cancel();presentation.cancel();paused=true;session=new ArenaSession(storage);session.save();
    late.onmessage({data:{id:late.request.id,revision:late.request.game.revision,...next}});
    assert.equal(session.commands.length,0);assert.equal(session.game.revision,0);assert.ok(late.stopped);
  }finally{controller.cancel();presentation.cancel();}
});
