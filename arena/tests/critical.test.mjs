import test from 'node:test';
import assert from 'node:assert/strict';
import {createArena,applyArena,legalArenaActions,arenaPiece} from '../src/engine.mjs';
import {analyzeArena,arenaNeighbors,arenaWall} from '../src/geometry.mjs';
import {ArenaSession,replayArenaSave} from '../src/session.mjs';

function finalBridge(a,b,{team='A',extra=false}={}){
  const s=createArena({policy:'team'});s.drops=[];
  const group=c=>c<a?'A':c<a+b?'B':'empty';
  s.walls=[...new Set(Array.from({length:81},(_,c)=>arenaNeighbors(c).filter(to=>group(c)!==group(to)).map(to=>arenaWall(c,to))).flat())].filter(w=>w!==arenaWall(a-1,a));
  s.pieces=[{id:'A1',team:'A',pos:0},{id:'A2',team:'A',pos:a-1},{id:'B1',team:'B',pos:a},{id:'B2',team:'B',pos:a+b-1}];
  const actor=team==='A'?'A2':'B1';s.turn={team,actor,steps:0,path:[arenaPiece(s,actor).pos],committed:false,actions:0};
  if(extra){s.inventories.A=[{id:'x',type:'extraWall'},{id:'y',type:'jump'}];s.inventories.B=[{id:'z',type:'jump'},{id:'q',type:'demolition'}];}
  return s;
}
for(const [a,b,winners] of [[42,39,['A']],[40,41,['B']],[23,23,['A','B']]]){
  test(`Resultado oficial ${a}/${b}: última componente compartida, puntuación sin duplicar y bloqueo final`,()=>{
    let s=finalBridge(a,b);assert.equal(analyzeArena(s).score.shared,a+b);
    s=applyArena(s,{type:'wall',to:a});assert.equal(s.over,true);assert.deepEqual(s.winners,winners);
    const v=analyzeArena(s);assert.equal(v.score.A,a);assert.equal(v.score.B,b);assert.equal(v.score.empty,81-a-b);
    assert.equal(v.score.shared,0);assert.equal(v.active.length,0);assert.equal(legalArenaActions(s).length,0);
    assert.throws(()=>applyArena(s,{type:'move',to:a-2}));assert.throws(()=>applyArena(s,{type:'wall',to:0}));
    assert.equal(s.completedTurns,1);
  });
}
test('Final por muro adicional desde 2 vs. 2: varias fichas aseguradas, sin descarte ni segundo muro',()=>{
  let s=finalBridge(42,39,{extra:true});const count=s.walls.length;
  s=applyArena(s,{type:'extraWall',to:42,power:'x'});assert.equal(s.over,true);assert.equal(s.pending,null);
  assert.equal(s.walls.length,count+1);assert.equal(s.completedTurns,1);assert.equal(s.lastEvents.filter(e=>e.type==='secured').length,4);
  assert.deepEqual(s.winners,['A']);
});
test('Reconquista reversible: aseguró → reactivada → asegurada; los puntos se restan y se recuperan una sola vez',()=>{
  let s=createArena();s.walls=arenaNeighbors(10).map(to=>arenaWall(10,to));s.pieces.find(p=>p.id==='A2').pos=11;
  s.turn={team:'A',actor:'A2',steps:0,path:[11],committed:false,actions:0};s.inventories.A2=[{id:'d',type:'demolition'}];
  assert.equal(analyzeArena(s).score.A,1);s=applyArena(s,{type:'demolition',to:10,power:'d'});assert.equal(analyzeArena(s).score.A,0);
  assert.ok(analyzeArena(s).active.includes('A1'));s=applyArena(s,{type:'wall',to:10});assert.equal(analyzeArena(s).score.A,1);
  assert.ok(!analyzeArena(s).active.includes('A1'));assert.equal(s.completedTurns,1);assert.equal(s.turn.actor,'B1');
});
test('Salto cambia de componente y puede dejar la región anterior exclusiva de un rival',()=>{
  let s=createArena();s.pieces=[{id:'A1',team:'A',pos:10},{id:'B1',team:'B',pos:9},{id:'A2',team:'A',pos:70},{id:'B2',team:'B',pos:64}];
  const source=[9,10];s.walls=[...new Set(source.flatMap(c=>arenaNeighbors(c).filter(n=>!source.includes(n)).map(n=>arenaWall(c,n))))];
  s.inventories.A1=[{id:'s',type:'jump'}];s.turn.path=[10];
  s=applyArena(s,{type:'jump',to:11,power:'s'});const view=analyzeArena(s);
  assert.equal(view.score.B,2);assert.ok(!view.active.includes('B1'));assert.ok(view.active.includes('A1'));assert.equal(s.turn.steps,1);assert.equal(s.completedTurns,0);
});
test('Capacidad antes que recolección: descarte rival pendiente conserva la visita desactivada y el poder por resolver',()=>{
  // Salto de A1 desde región con B1: B pierde una ficha activa; A recoge poder en otra región compartida.
  let s=createArena({policy:'team'});s.drops=[{id:'incoming',type:'extraWall',cell:11}];
  s.pieces=[{id:'A1',team:'A',pos:10},{id:'B1',team:'B',pos:9},{id:'A2',team:'A',pos:70},{id:'B2',team:'B',pos:64}];
  s.walls=[...new Set([9,10].flatMap(c=>arenaNeighbors(c).filter(n=>![9,10].includes(n)).map(n=>arenaWall(c,n))))];
  s.turn={team:'A',actor:'A1',steps:0,path:[10],committed:false,actions:0};s.inventories.A=[{id:'s',type:'jump'}];s.inventories.B=[{id:'b1',type:'demolition'},{id:'b2',type:'jump'}];
  s=applyArena(s,{type:'jump',to:11,power:'s'});assert.equal(s.pending.owner,'B');assert.equal(s.inventories.A.length,0);
  assert.equal(s.resolution.pickup.id,'incoming');assert.equal(s.drops.length,0);assert.equal(s.turn.steps,1);
  s=applyArena(s,{type:'discard',owner:'B',power:'b1'});assert.equal(s.pending,null);assert.equal(s.inventories.A[0].id,'incoming');assert.equal(s.turn.actor,'A1');
});
test('Tras volver al origen con dos pasos, una recarga no habilita selección ni nuevos pasos; poder puede usarse si es legal',()=>{
  const storage={raw:null,setItem(key,value){this.raw=value;}},session=new ArenaSession(storage,{policy:'team',experiment:{initial:[{cell:11,type:'extraWall'}],waves:[],symmetry:'vertical',placement:'center-first'}});
  session.dispatch({type:'select',actor:'A1'});session.dispatch({type:'move',to:11});session.dispatch({type:'move',to:10});
  const restored=ArenaSession.restore(storage,storage.raw).session;assert.equal(restored.game.turn.steps,2);
  assert.ok(!legalArenaActions(restored.game).some(a=>['move','jump','select'].includes(a.type)));
  restored.dispatch(legalArenaActions(restored.game).find(a=>a.type==='extraWall'));
  assert.equal(restored.game.turn.steps,2);assert.equal(restored.game.completedTurns,0);assert.equal(restored.game.walls.length,1);
});
test('Guardado es un diario versionado validado por el motor; un poder inventado, paso repetido o respuesta atrasada se rechazan',()=>{
  const storage={raw:null,setItem(key,value){this.raw=value;}},session=new ArenaSession(storage);session.dispatch({type:'move',to:11});
  const before=storage.raw;assert.throws(()=>session.dispatch({type:'jump',to:20,power:'inventado'}));assert.equal(storage.raw,before);
  for(const command of [{type:'move',to:11},{type:'select',actor:'B1'},{type:'demolition',to:10,power:'inventado'}]){
    const data=JSON.parse(before);data.commands.push(command);assert.equal(replayArenaSave(JSON.stringify(data)).ok,false);
  }
});
