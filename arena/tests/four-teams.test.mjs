import test from 'node:test';
import assert from 'node:assert/strict';
import {createArena,applyArena,legalArenaActions,arenaOrbit,inventoryCapacity} from '../src/engine.mjs';
import {arenaNeighbors,arenaWall,analyzeArena} from '../src/geometry.mjs';
import {ArenaSession} from '../src/session.mjs';

test('Cuatro equipos: misma implementación; posiciones y orden A → B → C → D',()=>{
  let s=createArena({mode:'ffa'});assert.deepEqual(s.pieces.map(p=>[p.id,p.pos]),[['A',10],['B',16],['C',70],['D',64]]);
  assert.deepEqual(s.teams,['A','B','C','D']);assert.equal(s.drops.length,4);assert.equal(analyzeArena(s).score.shared,81);
  const order=[];for(let i=0;i<8;i++){order.push(s.turn.actor);s=applyArena(s,legalArenaActions(s).find(a=>a.type==='wall'));}
  assert.deepEqual(order,['A','B','C','D','A','B','C','D']);assert.throws(()=>createArena({mode:'ffa',policy:'team'}));
});
test('Dos, tres y cuatro equipos distintos hacen una región compartida; una sola identidad la hace exclusiva',()=>{
  const s=createArena({mode:'ffa'});
  const separate=cell=>arenaNeighbors(cell).map(to=>arenaWall(cell,to));
  s.walls=separate(10);let v=analyzeArena(s);assert.equal(v.score.A,1);assert.equal(v.components.find(c=>c.type==='shared').teams.length,3);
  s.walls.push(...separate(16));v=analyzeArena(s);assert.equal(v.score.B,1);assert.equal(v.components.find(c=>c.type==='shared').teams.length,2);
  s.walls.push(...separate(70));v=analyzeArena(s);assert.equal(v.over,true);assert.deepEqual(v.winners,['D']);assert.equal(v.score.D,78);
  assert.equal(Object.values(v.score).reduce((a,b)=>a+b),81);
});
test('Cuatro equipos: salta turnos asegurados, conserva inventario y puede reactivar un equipo rival',()=>{
  let s=createArena({mode:'ffa'});s.walls=arenaNeighbors(16).map(to=>arenaWall(16,to));s.inventories.B=[{id:'retained',type:'jump'}];
  s=applyArena(s,{type:'wall',to:11});assert.equal(s.turn.actor,'C');assert.equal(s.inventories.B[0].id,'retained');assert.equal(inventoryCapacity(s,'B'),1);
  // Escenario estructural: A junto a B asegurado, con Demolición legal.
  s.turn={team:'A',actor:'A',steps:0,path:[15],committed:false,actions:0};s.pieces[0].pos=15;s.inventories.A=[{id:'d',type:'demolition'}];
  s=applyArena(s,{type:'demolition',to:16,power:'d'});assert.ok(analyzeArena(s).active.includes('B'));assert.equal(s.inventories.B[0].id,'retained');
  s=applyArena(s,legalArenaActions(s).find(a=>a.type==='wall'));assert.equal(s.turn.actor,'B');
});
test('Cuatro equipos: oleadas rotacionales completas, deterministas y hasta doce apariciones',()=>{
  const simulate=()=>{
    let s=createArena({mode:'ffa'});
    for(let i=0;i<16;i++){
      const move=legalArenaActions(s).find(a=>a.type==='move');if(move)s=applyArena(s,move);
      while(s.pending)s=applyArena(s,{type:'discard',owner:s.pending.owner,power:s.inventories[s.pending.owner].at(-1).id});
      s=applyArena(s,legalArenaActions(s).find(a=>a.type==='wall'));
    }return s;
  };
  const a=simulate(),b=simulate();assert.deepEqual(a,b);assert.equal(a.waveLog.length,2);
  for(const wave of a.waveLog){assert.equal(wave.placed.length,4);assert.deepEqual([...wave.placed].sort((x,y)=>x-y),arenaOrbit(wave.placed[0],'rotation'));}
  assert.ok(a.drops.length+Object.values(a.inventories).flat().length<=12);
});
test('Cuatro equipos: victoria y empates parciales en el máximo, regiones vacías sin puntos',()=>{
  const s=createArena({mode:'ffa'});s.walls=[];
  for(let c=0;c<81;c++)for(const to of arenaNeighbors(c))s.walls.push(arenaWall(c,to));s.walls=[...new Set(s.walls)];
  const v=analyzeArena(s);assert.equal(v.over,true);assert.deepEqual(v.winners,['A','B','C','D']);assert.equal(v.score.empty,77);
  assert.equal(v.components.length,81);assert.equal(v.score.shared,0);
  // Unir a A una casilla vacía: ganador único A.
  s.walls=s.walls.filter(w=>w!==arenaWall(10,11));assert.deepEqual(analyzeArena(s).winners,['A']);
});
test('40 partidas de cuatro equipos con poderes: resultados, actividad, puntuaciones y persistencia',()=>{
  for(let run=0;run<40;run++){
    const storage={raw:null,setItem(k,v){this.raw=v;}},session=new ArenaSession(storage,{mode:'ffa'});let seed=run+1,steps=0;
    const rnd=n=>{seed=(Math.imul(seed,1103515245)+12345)>>>0;return seed%n;};
    while(!session.game.over&&steps<3000){
      const s=session.game,actions=legalArenaActions(s);
      const a=s.pending?{type:'discard',owner:s.pending.owner,power:s.inventories[s.pending.owner][rnd(s.inventories[s.pending.owner].length)].id}:actions[rnd(actions.length)];
      assert.ok(a);session.dispatch(a);steps++;
      assert.equal(Object.values(analyzeArena(session.game).score).reduce((x,y)=>x+y),81);
      if(steps%37===0)assert.deepEqual(ArenaSession.restore(storage,storage.raw).session.game,session.game);
    }
    assert.ok(session.game.over);assert.ok(session.game.winners.length);assert.equal(session.game.pending,null);
    assert.deepEqual(ArenaSession.restore(storage,storage.raw).session.game,session.game);
  }
});
