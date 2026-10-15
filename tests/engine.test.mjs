import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,PLAYERS,wallKey,MAX_INTERIOR_WALLS,adjacent,regions,territory,activeIds,chooseActor,availableMoves,wallOptions,applyTurn,validateTurn,verifyState,finished} from '../src/engine.mjs';
const setup=(pieces,walls=[],lastActed={A:null,B:null},turnTeam='A')=>{
 const g=initialState();g.pieces=pieces;g.walls=walls;g.moves=walls.length;g.lastActed=lastActed;g.turnTeam=turnTeam;g.over=finished(g);g.currentActor=g.over?null:chooseActor(g,turnTeam);return g;
};
test('Inicio exacto y perímetro cerrado; existen 84 lados interiores',()=>{
 const s=initialState();assert.deepEqual(s.pieces.map(p=>[p.id,p.pos]),[['A1',8],['B1',12],['A2',40],['B2',36]]);
 assert.equal(s.currentActor,'A1');assert.equal(PLAYERS.length,4);assert.equal(territory(s).score.mixed,49);
 const all=new Set();for(let c=0;c<49;c++)for(const to of adjacent(c))all.add(wallKey(c,to));assert.equal(all.size,84);
 assert.equal(MAX_INTERIOR_WALLS,84);
});
test('0 pasos y muro entre fichas rivales adyacentes',()=>{
 const s=initialState();s.pieces.find(p=>p.id==='B1').pos=9;
 const n=applyTurn(s,{actor:'A1',path:[8],to:9});
 assert.equal(n.walls[0],wallKey(8,9));assert.equal(n.pieces[0].pos,8);
 assert.equal(n.currentActor,'B1');
});
test('2 pasos admiten girar y volver a casilla original',()=>{
 const s=initialState();
 for(const path of [[8,9,8],[8,15,16]]){
  const n=applyTurn(s,{actor:'A1',path,to:adjacent(path.at(-1))[0]});
  assert.equal(n.pieces[0].pos,path.at(-1));assert.equal(n.moves,1);
 }
 assert.throws(()=>validateTurn(s,{actor:'A1',path:[8,10],to:11}),/Desplazamiento ilegal/);
});
test('Una ficha aislada deja de jugar; alternan equipos A/B con 1 vs 2 y luego 1 vs 1',()=>{
 // Separar el tablero con un muro vertical entre columnas 2 y 3,
 // colocar A1 en celda individual encerrada por paredes mientras A2,B1,B2 comparten otra región.
 const walls=[wallKey(8,1),wallKey(8,7),wallKey(8,9),wallKey(8,15)];
 const s=setup(initialState().pieces,walls);
 assert.deepEqual([...activeIds(s)].sort(),['A2','B1','B2']);
 assert.equal(s.currentActor,'A2');
 const afterA=applyTurn(s,{actor:'A2',path:[40],to:39});
 assert.equal(afterA.currentActor,'B1');
 const afterB=applyTurn(afterA,{actor:'B1',path:[12],to:13});
 assert.equal(afterB.currentActor,'A2');
 // aísla B1 también
 const walls2=[...walls,...adjacent(12).map(b=>wallKey(12,b))];
 const s2=setup(initialState().pieces,walls2,{A:'A2',B:'B1'},'A');
 assert.deepEqual([...activeIds(s2)].sort(),['A2','B2']);
 assert.equal(s2.currentActor,'A2');
 const n=applyTurn(s2,{actor:'A2',path:[40],to:39});
 assert.equal(n.currentActor,'B2');
 const n2=applyTurn(n,{actor:'B2',path:[36],to:35});
 assert.equal(n2.currentActor,'A2');
});
test('No se permite construir en perímetro ni mover a través de paredes o fichas',()=>{
 const s=initialState();
 assert.throws(()=>applyTurn(s,{actor:'A1',path:[8],to:-1}),/muro/);
 assert.throws(()=>applyTurn(s,{actor:'B1',path:[12],to:13}),/Debe jugar/);
 const own=initialState();own.pieces.find(p=>p.id==='B1').pos=9;
 assert.ok(!availableMoves(own,'A1').includes(9));
});
test('Puntuación exclusiva, vacía y sin doble contabilización',()=>{
 const s=initialState();
 // tabique completo fila 3-4: separa dos mitades, A y B siguen mezclados.
 for(let c=0;c<7;c++)s.walls.push(wallKey(14+c,21+c));
 const x=territory(s).score;
 assert.equal(x.A+x.B+x.empty+x.mixed,49);
 // rodear la casilla (1,1), vacía al comienzo
 s.walls.push(wallKey(0,1),wallKey(0,7));
 assert.equal(territory(s).score.empty,1);
});
test('Ninguna ficha activa carece de muro legal desde su casilla',()=>{
 let s=initialState();
 // 220 partidas hasta cierre, alternando movimientos pseudoaleatorios deterministas.
 for(let run=0;run<220;run++){
  s=initialState();
  let random=(run*7919+17)>>>0;
  const rnd=(n)=>{random=(1664525*random+1013904223)>>>0;return random%n;};
  while(!s.over){
   const active=activeIds(s);
   for(const id of active)assert.ok(wallOptions(s,s.pieces.find(p=>p.id===id).pos).length>0);
   const actor=s.currentActor,p=s.pieces.find(p=>p.id===actor),path=[p.pos];
   for(let i=0,steps=rnd(3);i<steps;i++){
     const choices=availableMoves(s,actor,path.at(-1));
     if(!choices.length)break;
     path.push(choices[rnd(choices.length)]);
   }
   const w=wallOptions(s,path.at(-1));assert.ok(w.length>0);
   s=applyTurn(s,{actor,path,to:w[rnd(w.length)]});
   assert.ok(s.moves<=MAX_INTERIOR_WALLS);
   assert.ok(verifyState(s));
  }
  assert.equal(territory(s).score.mixed,0);
  assert.equal(territory(s).score.A+territory(s).score.B+territory(s).score.empty,49);
 }
});
