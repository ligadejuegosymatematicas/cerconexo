import test from 'node:test';
import assert from 'node:assert/strict';
import {arenaWall,arenaNeighbors,analyzeArena,arenaDistances} from '../src/geometry.mjs';
import {createArena,applyArena,legalArenaActions,arenaPiece,inventoryCapacity,arenaOrbit} from '../src/engine.mjs';
import {ArenaSession,ARENA_SAVE_KEY,replayArenaSave} from '../src/session.mjs';

const experimental=(initial=[])=>({initial,waves:[],symmetry:'vertical',placement:'center-first'});
export function arenaFixture({policy='piece',walls=[],positions={},actor='A1',items={}}={}){
  const s=createArena({policy,experiment:experimental()});
  for(const p of s.pieces)if(Object.hasOwn(positions,p.id))p.pos=positions[p.id];
  s.walls=[...new Set(walls)];s.turn={team:actor[0],actor,steps:0,path:[arenaPiece(s,actor).pos],committed:false,actions:0};
  for(const [owner,types] of Object.entries(items))s.inventories[owner]=types.map((type,i)=>({id:`test-${owner}-${i}`,type}));
  return s;
}
const enclosing=cells=>[...new Set(cells.flatMap(c=>arenaNeighbors(c).filter(n=>!cells.includes(n)).map(n=>arenaWall(c,n))))];
const powerAction=(s,type,to)=>legalArenaActions(s).find(a=>a.type===type&&a.to===to);
const assertSum=s=>{const v=analyzeArena(s);assert.equal(Object.values(v.score).reduce((a,b)=>a+b),81);assert.equal(v.components.flatMap(c=>c.cells).length,81);return v;};
const memory=()=>({value:null,setItem(key,value){assert.equal(key,ARENA_SAVE_KEY);this.value=value;}});

test('2 vs. 2: 9×9, posiciones diagonales, seis poderes, 144 lados interiores, cuatro fichas activas',()=>{
  const s=createArena();assert.deepEqual(s.pieces.map(p=>[p.id,p.pos]),[['A1',10],['B1',16],['A2',70],['B2',64]]);
  assert.equal(s.drops.length,6);assert.equal(assertSum(s).score.shared,81);assert.equal(s.turn.actor,'A1');
  assert.equal(new Set(Array.from({length:81},(_,c)=>arenaNeighbors(c).map(n=>arenaWall(c,n))).flat()).size,144);
});
test('Clásico: A1 → B1 → A2 → B2 y exactamente un muro final por intervención',()=>{
  let s=createArena();const actors=[];
  for(let i=0;i<8;i++){actors.push(s.turn.actor);const a=legalArenaActions(s).find(a=>a.type==='wall');s=applyArena(s,a);assert.equal(s.walls.length,i+1);}
  assert.deepEqual(actors,['A1','B1','A2','B2','A1','B1','A2','B2']);assert.equal(s.completedTurns,8);
});
test('0, 1 y 2 pasos; giro y regreso consumen pasos definitivos, sin avanzar el turno ni construir',()=>{
  for(const path of [[],[11],[11,20],[11,10]]){
    let s=createArena();for(const to of path)s=applyArena(s,{type:'move',to});
    assert.equal(s.turn.steps,path.length);assert.equal(s.completedTurns,0);assert.equal(s.walls.length,0);
    assert.equal(arenaPiece(s,'A1').pos,path.at(-1)??10);
    if(path.length===2)assert.ok(!legalArenaActions(s).some(a=>a.type==='move'));
    const wall=legalArenaActions(s).find(a=>a.type==='wall');s=applyArena(s,wall);assert.equal(s.completedTurns,1);assert.equal(s.walls.length,1);
  }
});
test('Los pasos y poderes no mutan el estado anterior; no existe acción de deshacer',()=>{
  const s=createArena(),snapshot=JSON.stringify(s),n=applyArena(s,{type:'move',to:11});
  assert.equal(JSON.stringify(s),snapshot);assert.equal(arenaPiece(n,'A1').pos,11);
  for(const type of ['undo','cancel','resetSteps'])assert.throws(()=>applyArena(n,{type}));
});
test('Legalidad: muros exteriores, diagonales, fichas ocupadas, tercer paso y acciones rivales rechazados',()=>{
  let s=arenaFixture({walls:[arenaWall(10,11)],positions:{B1:19}});
  for(const to of [-1,11,19,20])assert.throws(()=>applyArena(s,{type:'move',to}));
  assert.throws(()=>applyArena(s,{type:'wall',to:11}));assert.throws(()=>applyArena(s,{type:'wall',to:0}));
  assert.throws(()=>applyArena(s,{type:'select',actor:'B1'}));
  s=applyArena(s,{type:'move',to:9});s=applyArena(s,{type:'move',to:10});assert.throws(()=>applyArena(s,{type:'move',to:1}));
});
test('Por equipo: selección libre antes de actuar, compromiso después de movimiento o poder, repetición de ficha',()=>{
  let s=createArena({policy:'team'});assert.equal(s.turn.actor,null);
  s=applyArena(s,{type:'select',actor:'A1'});s=applyArena(s,{type:'select',actor:'A2'});s=applyArena(s,{type:'select',actor:'A1'});
  assert.equal(s.completedTurns,0);s=applyArena(s,{type:'move',to:11});
  assert.throws(()=>applyArena(s,{type:'select',actor:'A2'}));s=applyArena(s,{type:'wall',to:12});
  s=applyArena(s,{type:'select',actor:'B2'});s=applyArena(s,legalArenaActions(s).find(a=>a.type==='wall'));
  assert.equal(s.turn.team,'A');s=applyArena(s,{type:'select',actor:'A1'});assert.equal(s.turn.actor,'A1');
  let p=arenaFixture({policy:'team',items:{A:['extraWall']}});p=applyArena(p,powerAction(p,'extraWall',11));
  assert.equal(p.turn.steps,0);assert.throws(()=>applyArena(p,{type:'select',actor:'A2'}));
});
test('Recolección inmediata: poder recién obtenido utilizable antes del segundo paso',()=>{
  let s=createArena({experiment:experimental([{cell:11,type:'extraWall'}])});s=applyArena(s,{type:'move',to:11});
  assert.equal(s.drops.length,0);assert.equal(s.inventories.A1[0].type,'extraWall');
  s=applyArena(s,powerAction(s,'extraWall',12));assert.equal(s.turn.steps,1);assert.equal(s.completedTurns,0);assert.equal(s.walls.length,1);
  s=applyArena(s,{type:'move',to:20});s=applyArena(s,{type:'wall',to:21});assert.equal(s.walls.length,2);assert.equal(s.completedTurns,1);
});
for(const discardNew of [true,false])test(`Inventario lleno: decisión manual permite ${discardNew?'rechazar el poder nuevo':'sustituir el poder anterior'} y desactiva la casilla`,()=>{
  let s=createArena({experiment:experimental([{cell:11,type:'extraWall'},{cell:20,type:'jump'}])});
  s=applyArena(s,{type:'move',to:11});s=applyArena(s,{type:'move',to:20});
  assert.equal(s.pending.reason,'pickup');assert.equal(s.pending.owner,'A1');assert.equal(s.drops.length,0);assert.equal(s.turn.steps,2);
  assert.throws(()=>applyArena(s,{type:'wall',to:21}));assert.throws(()=>applyArena(s,{type:'discard',owner:'B1',power:s.inventories.A1[0].id}));
  s=applyArena(s,{type:'discard',owner:'A1',power:s.inventories.A1[discardNew?1:0].id});
  assert.equal(s.pending,null);assert.equal(s.inventories.A1[0].type,discardNew?'extraWall':'jump');assert.equal(s.turn.steps,2);
});
test('Demolición: adyacente, sin consumir paso, reactiva y revierte puntos inmediatamente',()=>{
  let s=arenaFixture({walls:enclosing([10]),positions:{A2:11},actor:'A2',items:{A2:['demolition'],A1:['jump']}});
  assert.equal(assertSum(s).score.A,1);assert.ok(!analyzeArena(s).active.includes('A1'));
  s=applyArena(s,powerAction(s,'demolition',10));const v=assertSum(s);
  assert.equal(s.turn.steps,0);assert.equal(v.score.A,0);assert.ok(v.active.includes('A1'));
  assert.equal(s.inventories.A1[0].type,'jump');assert.ok(s.lastEvents.some(e=>e.type==='reactivated'&&e.actor==='A1'));
  assert.ok(legalArenaActions(s).some(a=>a.type==='move'&&a.to===2));
});
test('Salto: cruza sin destruir el muro, consume poder y paso; puede permanecer en la misma componente',()=>{
  let s=arenaFixture({walls:[arenaWall(10,11)],items:{A1:['jump']}});
  assert.equal(analyzeArena(s).components.length,1);s=applyArena(s,powerAction(s,'jump',11));
  assert.equal(s.turn.steps,1);assert.equal(s.walls.length,1);assert.equal(s.inventories.A1.length,0);assert.equal(s.turn.actor,'A1');
  s=applyArena(s,{type:'move',to:20});assert.equal(s.turn.steps,2);assertSum(s);
});
test('Salto hacia región vacía: se vuelve exclusiva y termina sin muro final si sigue otra disputa',()=>{
  let s=arenaFixture({walls:enclosing([11]),items:{A1:['jump']}});
  assert.equal(analyzeArena(s).score.empty,1);s=applyArena(s,powerAction(s,'jump',11));
  assert.equal(s.walls.length,4);assert.equal(s.turn.team,'B');assert.equal(s.completedTurns,1);assert.equal(s.over,false);
  assert.equal(assertSum(s).score.A,1);assert.ok(!analyzeArena(s).active.includes('A1'));
});
test('Salto a componente propia: ambas fichas quedan aseguradas, fin inmediato sin muro',()=>{
  let s=arenaFixture({walls:enclosing([11,12]),positions:{A2:12},items:{A1:['jump']}});
  const count=s.walls.length;s=applyArena(s,powerAction(s,'jump',11));
  assert.equal(s.over,true);assert.equal(s.walls.length,count);assert.equal(assertSum(s).score.A,2);assert.equal(s.pending,null);
});
test('Salto hacia casilla ocupada o sin muro no es legal, ni un tercer movimiento con poder',()=>{
  let s=arenaFixture({walls:[arenaWall(10,11)],positions:{B1:11},items:{A1:['jump']}});
  assert.ok(!legalArenaActions(s).some(a=>a.type==='jump'));assert.throws(()=>applyArena(s,{type:'jump',to:1,power:'test-A1-0'}));
  s=arenaFixture({walls:[arenaWall(10,11)],items:{A1:['jump']}});s=applyArena(s,{type:'move',to:1});s=applyArena(s,{type:'move',to:10});
  assert.ok(!legalArenaActions(s).some(a=>a.type==='jump'));
});
test('Muro adicional asegura a la ficha: cierre inmediato sin consumir un paso ni exigir otro muro',()=>{
  let s=arenaFixture({walls:enclosing([10]).filter(w=>w!==arenaWall(10,11)),items:{A1:['extraWall']}});
  s=applyArena(s,powerAction(s,'extraWall',11));assert.equal(s.walls.length,4);assert.equal(s.completedTurns,1);assert.equal(s.turn.actor,'B1');
  assert.equal(analyzeArena(s).score.A,1);assert.ok(s.lastEvents.some(e=>e.type==='secured'&&e.actor==='A1'));
});
test('Varios poderes en una intervención, incluso después de ambos pasos; siempre un muro final si continúa activa',()=>{
  let s=arenaFixture({policy:'team',walls:[arenaWall(10,11)],items:{A:['demolition','extraWall']}});
  s=applyArena(s,powerAction(s,'demolition',11));s=applyArena(s,{type:'move',to:11});s=applyArena(s,{type:'move',to:10});
  s=applyArena(s,powerAction(s,'extraWall',19));assert.equal(s.turn.steps,2);assert.equal(s.completedTurns,0);
  assert.ok(legalArenaActions(s).every(a=>a.type==='wall'));s=applyArena(s,{type:'wall',to:11});assert.equal(s.completedTurns,1);assert.equal(s.walls.length,2);
});
test('Descarte del adversario pausa la intervención; conserva al actor y devuelve su control después',()=>{
  let s=arenaFixture({policy:'team',walls:enclosing([11]).filter(w=>w!==arenaWall(10,11)),positions:{B1:11},items:{A:['extraWall'],B:['jump','demolition']}});
  s=applyArena(s,powerAction(s,'extraWall',11));assert.equal(s.pending.owner,'B');assert.equal(s.pending.capacity,1);
  assert.equal(s.turn.actor,'A1');assert.equal(s.turn.team,'A');assert.equal(s.completedTurns,0);assert.equal(s.turn.steps,0);
  assert.throws(()=>applyArena(s,{type:'move',to:1}));const kept=s.inventories.B[1].id;
  s=applyArena(s,{type:'discard',owner:'B',power:s.inventories.B[0].id});
  assert.equal(s.pending,null);assert.equal(s.turn.actor,'A1');assert.equal(s.inventories.B[0].id,kept);
  s=applyArena(s,{type:'wall',to:1});assert.equal(s.turn.team,'B');assert.equal(s.turn.actor,'B2');
});
test('Capacidad compartida se recupera por reactivación, pero no devuelve poderes descartados',()=>{
  let s=arenaFixture({policy:'team',walls:enclosing([10]),positions:{A2:11},actor:'A2',items:{A:['demolition']}});
  assert.equal(inventoryCapacity(s,'A'),1);s=applyArena(s,powerAction(s,'demolition',10));
  assert.equal(inventoryCapacity(s,'A'),2);assert.equal(s.inventories.A.length,0);
});
test('Ficha asegurada retiene inventario individual y no puede seleccionarse ni usarlo',()=>{
  const s=arenaFixture({walls:enclosing([10]),actor:'A2',items:{A1:['jump']}});
  assert.equal(inventoryCapacity(s,'A1'),1);assert.equal(s.inventories.A1.length,1);assert.throws(()=>applyArena(s,{type:'select',actor:'A1'}));
  assert.ok(!legalArenaActions(s).some(a=>a.power==='test-A1-0'));
});
test('Victoria y empate: regiones exclusivas con dos fichas cuentan una vez; fin omite descartes irrelevantes',()=>{
  for(const sizeA of [30,40,42]){
    // Componentes: primeros sizeA, siguientes sizeA (si cabe), resto vacío. Todas las aristas entre categorías cerradas.
    const sizeB=Math.min(sizeA,81-sizeA),a=Array.from({length:sizeA},(_,i)=>i),b=Array.from({length:sizeB},(_,i)=>sizeA+i);
    const group=c=>a.includes(c)?'A':b.includes(c)?'B':'empty';
    const walls=[];for(let c=0;c<81;c++)for(const to of arenaNeighbors(c))if(group(c)!==group(to))walls.push(arenaWall(c,to));
    const s=arenaFixture({walls,positions:{A1:0,A2:sizeA-1,B1:sizeA,B2:sizeA+sizeB-1}}),v=assertSum(s);
    assert.equal(v.over,true);assert.equal(v.score.A,sizeA);assert.equal(v.score.B,sizeB);
    assert.deepEqual(v.winners,sizeA===sizeB?['A','B']:['A']);
  }
  let s=arenaFixture({policy:'team',positions:{A1:0,A2:1,B1:79,B2:80},items:{A:['jump','extraWall'],B:['demolition','jump']}});
  // Une dos regiones de color uniforme por una única arista: la última construcción termina desde 2 vs. 2.
  s.walls=[...new Set(Array.from({length:81},(_,c)=>arenaNeighbors(c).filter(to=>(c<40)!==(to<40)).map(to=>arenaWall(c,to))).flat())].filter(w=>w!==arenaWall(39,40));
  s.pieces.find(p=>p.id==='A1').pos=39;s.turn.path=[39];
  s=applyArena(s,{type:'wall',to:40});assert.equal(s.over,true);assert.equal(s.pending,null);assert.equal(s.resolution,null);
  assert.equal(s.inventories.A.length,2);assert.equal(s.inventories.B.length,2);assert.equal(assertSum(s).score.shared,0);
  assert.throws(()=>applyArena(s,{type:'wall',to:30}));
});
test('Oleadas: turnos efectivamente completados 8/16, parejas reflejadas, distancias y máximo diez',()=>{
  let s=createArena();
  for(let i=0;i<16;i++){
    const move=legalArenaActions(s).find(a=>a.type==='move');if(move)s=applyArena(s,move);
    while(s.pending)s=applyArena(s,{type:'discard',owner:s.pending.owner,power:s.inventories[s.pending.owner].at(-1).id});
    s=applyArena(s,legalArenaActions(s).find(a=>a.type==='wall'));assertSum(s);
  }
  assert.equal(s.waveLog.length,2);assert.equal(s.drops.length+Object.values(s.inventories).flat().length,10);
  for(const w of s.waveLog){assert.equal(w.placed.length,2);assert.deepEqual(arenaOrbit(w.placed[0],'vertical'),w.placed);assert.equal(w.access.length,2);}
});
test('Oleada sin conjunto completo se omite y registra; no sustituye ficha o poder',()=>{
  let s=createArena({experiment:{...experimental(Array.from({length:81},(_,i)=>i).filter(c=>![10,16,70,64].includes(c)).map(cell=>({cell,type:'jump'}))),waves:[{afterTurn:1,type:'jump',count:2}]}});
  const before=structuredClone(s.drops);s=applyArena(s,{type:'wall',to:11});
  assert.deepEqual(s.drops,before);assert.deepEqual(s.waveLog[0].placed,[]);assert.match(s.waveLog[0].skipped,/completo/);
});
test('Config experimental validada, sin superponer poderes iniciales ni crear órbitas incompletas',()=>{
  assert.throws(()=>createArena({experiment:experimental([{cell:10,type:'jump'}])}));
  assert.throws(()=>createArena({experiment:experimental([{cell:11,type:'jump'},{cell:11,type:'jump'}])}));
  assert.throws(()=>createArena({experiment:{...experimental(),waves:[{afterTurn:1,type:'jump',count:3}]}}));
});
for(const policy of ['piece','team'])test(`Persistencia ${policy}: pasos y regreso al origen sobreviven; no duplican turnos ni muros`,()=>{
  const storage=memory(),session=new ArenaSession(storage,{policy});session.save();
  if(policy==='team')session.dispatch({type:'select',actor:'A1'});
  for(const to of [11,10]){
    session.dispatch({type:'move',to});const restored=ArenaSession.restore(storage,storage.value);assert.equal(restored.ok,true);
    assert.deepEqual(restored.session.game,session.game);assert.equal(restored.session.game.completedTurns,0);
  }
  assert.equal(session.game.turn.steps,2);assert.equal(session.game.walls.length,0);
  session.dispatch({type:'wall',to:11});assert.equal(session.game.completedTurns,1);
  assert.deepEqual(ArenaSession.restore(storage,storage.value).session.game,session.game);
});
test('Persistencia atómica con descarte pendiente, rechazo del poder y acciones ilegales o datos dañados',()=>{
  const storage=memory(),session=new ArenaSession(storage,{experiment:experimental([{cell:11,type:'jump'},{cell:20,type:'demolition'}])});
  session.dispatch({type:'move',to:11});session.dispatch({type:'move',to:20});
  let r=ArenaSession.restore(storage,storage.value);assert.ok(r.ok);assert.equal(r.session.game.pending.owner,'A1');
  r.session.dispatch({type:'discard',owner:'A1',power:r.session.game.inventories.A1[1].id});assert.equal(r.session.game.pending,null);
  assert.equal(replayArenaSave('{').ok,false);const data=JSON.parse(storage.value);data.commands.push({type:'move',to:80});
  assert.equal(replayArenaSave(JSON.stringify(data)).ok,false);data.format='wallgo';assert.equal(replayArenaSave(JSON.stringify(data)).ok,false);
  assert.equal(replayArenaSave(JSON.stringify({format:'cerconexo-arena-journal',version:99})).ok,false);
});
test('Fallo de almacenamiento no confirma movimiento ni consume un poder',()=>{
  const session=new ArenaSession({setItem(){throw new Error('Sin espacio');}}),before=JSON.stringify(session.game);
  assert.throws(()=>session.dispatch({type:'move',to:11}),/espacio/);assert.equal(JSON.stringify(session.game),before);assert.equal(session.commands.length,0);
});
test('Distancias y componentes respetan paredes, sin diagonales; una arista puede no separar',()=>{
  let s=arenaFixture({walls:[arenaWall(10,11)]});assert.equal(analyzeArena(s).components.length,1);assert.equal(arenaDistances(s,10)[11],3);
  s=arenaFixture({walls:enclosing([11])});assert.equal(analyzeArena(s).components.length,2);assert.equal(arenaDistances(s,10)[11],null);
});
test('60 partidas 2 vs. 2 completas con poderes, descartes y ambas políticas conservan 81 casillas',()=>{
  for(let run=0;run<60;run++){
    let s=createArena({policy:run%2?'team':'piece'}),seed=run+17,actions=0;
    const rnd=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
    while(!s.over&&actions<3000){
      let action;
      if(s.pending){const items=s.inventories[s.pending.owner];action={type:'discard',owner:s.pending.owner,power:items[rnd(items.length)].id};}
      else{
        let legal=legalArenaActions(s);assert.ok(legal.length);
        if(!s.turn.actor)legal=legal.filter(a=>a.type==='select');
        else legal=legal.filter(a=>a.type!=='select');
        // Después de dos pasos prioriza cierre; utiliza poderes de manera reproducible.
        action=legal[rnd(legal.length)];
      }
      s=applyArena(s,action);assertSum(s);actions++;
    }
    assert.ok(s.over,`partida ${run} no terminó`);assert.equal(analyzeArena(s).score.shared,0);assert.equal(s.pending,null);
  }
});
