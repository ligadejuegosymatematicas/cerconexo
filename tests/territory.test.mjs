import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,territory,adjacent,wallKey,wallOptions,availableMoves,pieceById,applyTurn} from '../src/engine.mjs';
import {deriveTerritoryEvents} from '../src/territoryEvents.mjs';
import {conquestFixture,emptyFixture,sharedFixture,enclose,finishFixture} from './territory-fixtures.mjs';

function check(before,after){
  const snapshot=JSON.stringify([before,after]),event=deriveTerritoryEvents(before,after);
  assert.equal(JSON.stringify([before,after]),snapshot,'La detección no muta el estado');
  assert.deepEqual(event.before,territory(before).score);assert.deepEqual(event.after,territory(after).score);
  for(const score of [event.before,event.after])assert.equal(score.A+score.B+score.mixed+score.empty,49);
  const cells=event.conquests.flatMap(region=>region.cells);
  assert.equal(new Set(cells).size,cells.length,'Ninguna casilla aparece dos veces');
  const previous=territory(before).components;
  for(const region of event.conquests){
    assert.deepEqual(new Set(region.layers.flat()),new Set(region.cells));
    for(const cell of region.cells)assert.equal(previous.find(c=>c.cells.includes(cell)).type,'mixed');
    // Distancia mínima independiente por relajación, incluyendo obstáculos internos.
    const distance=new Map(region.component.map(cell=>[cell,Infinity]));
    for(const seed of region.seeds)distance.set(seed,0);
    for(let i=0;i<49;i++)for(const cell of region.component)for(const to of adjacent(cell)){
      if(distance.has(to)&&!after.walls.includes(wallKey(cell,to)))distance.set(to,Math.min(distance.get(to),distance.get(cell)+1));
    }
    region.layers.forEach((layer,depth)=>layer.forEach(cell=>assert.equal(distance.get(cell),depth)));
  }
  return event;
}
test('3A: un muro sin conquista y una división todavía compartida no celebran',()=>{
  const before=initialState(),after=applyTurn(before,{actor:'A1',path:[8],to:9});
  assert.deepEqual(check(before,after).conquests,[]);
  const split=sharedFixture(),event=check(split.before,split.after);
  assert.equal(territory(split.after).components.filter(c=>c.type==='mixed').length,2);
  assert.deepEqual(event.conquests,[]);
});
for(const options of [{owner:'A'},{owner:'B'},{owner:'B',rival:true}]){
  test(`3A: conquista de ${options.owner}${options.rival?' provocada por A':''}, con puntuación oficial`,()=>{
    const {before,after}=conquestFixture(options),event=check(before,after);
    assert.equal(event.conquests.length,1);assert.equal(event.conquests[0].team,options.owner);
    assert.equal(event.gains[options.owner],12);assert.equal(event.after[options.owner],12);
    if(options.rival)assert.equal(after.lastMove.actor,'A1');
  });
}
test('3A: dos fichas aliadas originan BFS simultáneo y cuentan una única región',()=>{
  const {before,after}=conquestFixture({both:true}),event=check(before,after);
  const region=event.conquests.find(c=>c.team==='A');
  assert.equal(region.increment,12);assert.equal(region.players.length,2);
  assert.deepEqual(new Set(region.layers[0]),new Set([8,17]));
});
test('3A: conquistas simultáneas y finalización se notifican juntas, con sus propietarios',()=>{
  const {before,after}=conquestFixture({both:true}),event=check(before,after);
  assert.deepEqual(event.gains,{A:12,B:37});assert.equal(event.conquests.length,2);
  assert.equal(event.gameEnded,true);assert.equal(after.over,true);
  assert.equal(event.after.A+event.after.B,49);
});
test('3A: una región vacía no puntúa ni produce conquista',()=>{
  const {before,after}=emptyFixture(),event=check(before,after);
  assert.deepEqual(event.newlyEmpty,[0]);assert.deepEqual(event.conquests,[]);
  assert.deepEqual(event.gains,{A:0,B:0});assert.equal(event.after.empty,1);
});
test('3A: subdividir un territorio asegurado no vuelve a celebrarlo',()=>{
  // Estado estructural de prueba. Las fichas aseguradas no pueden efectuar esta jugada en la UI.
  const before=initialState();before.pieces[0].pos=0;before.pieces[2].pos=2;
  enclose(before,[0,1,2]);finishFixture(before);
  const after=structuredClone(before);after.walls.push(wallKey(1,2));finishFixture(after);
  const event=check(before,after);assert.equal(event.after.A,3);
  assert.deepEqual(event.conquests,[]);assert.deepEqual(event.gains,{A:0,B:0});
  assert.deepEqual(check(after,after).conquests,[]);
});
test('3A: el BFS respeta muros internos y no toma atajos por otra componente',()=>{
  const {before}=conquestFixture();before.walls.push(wallKey(8,9),wallKey(15,16));finishFixture(before);
  const after=applyTurn(before,{actor:'A1',path:[17],to:18}),event=check(before,after);
  assert.equal(event.conquests[0].cells.length,12);
});
test('3A: 40 partidas completas conservan 49 casillas y celebran cada casilla como máximo una vez',()=>{
  for(let run=0;run<40;run++){
    let game=initialState(),seed=run+37;const secured=new Set();
    const rnd=n=>{seed=(1664525*seed+1013904223)>>>0;return seed%n;};
    while(!game.over){
      const actor=game.currentActor,path=[pieceById(game,actor).pos];
      for(let n=rnd(3);n>0;n--){const options=availableMoves(game,actor,path.at(-1));if(!options.length)break;path.push(options[rnd(options.length)]);}
      const options=wallOptions(game,path.at(-1)),after=applyTurn(game,{actor,path,to:options[rnd(options.length)]});
      const event=check(game,after);
      for(const cell of event.conquests.flatMap(e=>e.cells)){assert.ok(!secured.has(cell));secured.add(cell);}
      game=after;
    }
  }
});
