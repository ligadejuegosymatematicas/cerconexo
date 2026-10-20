import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,territory,applyTurn,pieceById,availableMoves,wallOptions,verifyState} from '../src/engine.mjs';
import {finalPresentation} from '../src/resultEvents.mjs';
import {createResultFeedback,RESULT_MS} from '../src/resultFeedback.mjs';
import {deriveTerritoryEvents} from '../src/territoryEvents.mjs';
import {participationMessage} from '../src/participationEvents.mjs';
import {resultFixture} from './result-fixtures.mjs';

for(const [winner,A,B] of [['A',28,16],['B',16,28],['Empate',23,23],['A',25,24],['B',24,25]]){
  test(`4: resultado oficial ${winner}, A=${A}, B=${B}, sin duplicar puntos`,()=>{
    const {before,after}=resultFixture({A,B}),snapshot=JSON.stringify(after),score=territory(after).score;
    assert.ok(verifyState(before)&&verifyState(after));assert.equal(before.over,false);assert.equal(after.winner,winner);
    const view=finalPresentation(after);assert.equal(view.winner,after.winner);
    assert.deepEqual(view.score,{A,B,empty:49-A-B});assert.equal(A+B+view.score.empty,49);
    assert.equal(view.difference,Math.abs(A-B));
    assert.equal(view.title,winner==='Empate'?'¡EMPATE!':`¡VICTORIA DEL EQUIPO ${winner}!`);
    assert.match(view.detail,winner==='Empate'?/Ambos equipos aseguraron 23 casillas/:/gana por (12 casillas|1 casilla)/);
    assert.doesNotMatch(JSON.stringify(view),/derrotad|desempat|por ciento/i);
    assert.equal(score.mixed,0);assert.equal(JSON.stringify(after),snapshot);
    const event=deriveTerritoryEvents(before,after);assert.equal(event.conquests.length,2);
    assert.equal(event.participation.secured.length,4);assert.equal(participationMessage(event.participation),null);
    assert.deepEqual(event.after,score);assert.deepEqual(finalPresentation(after,event.after),view);
  });
}
test('4: no presenta resultado ni confunde disputa con vacías durante el juego',()=>{
  const game=initialState();assert.equal(finalPresentation(game),null);
  assert.deepEqual(territory(game).score,{A:0,B:0,empty:0,mixed:49});
});
test('4: el ganador se toma del estado oficial, nunca se decide en presentación',()=>{
  const {after}=resultFixture();
  assert.equal(finalPresentation({...after,winner:'B'}).title,'¡VICTORIA DEL EQUIPO B!');
});
test('4: el motor rechaza movimiento y construcción después del cierre',()=>{
  const {after}=resultFixture();
  assert.throws(()=>applyTurn(after,{actor:'A1',path:[after.pieces[0].pos],to:0}),/terminó/);
});
test('4: final desde 1 vs. 1 conserva territorios previos y solo confirma fichas nuevas',()=>{
  const {before,after}=resultFixture({pockets:true}),event=deriveTerritoryEvents(before,after);
  assert.deepEqual(territory(before).score,{A:1,B:1,empty:5,mixed:42});
  assert.deepEqual(event.participation.secured.map(p=>p.id).sort(),['A2','B2']);
  assert.deepEqual(event.gains,{A:27,B:15});
  assert.deepEqual(finalPresentation(after).score,{A:28,B:16,empty:5});
  assert.equal(participationMessage(event.participation),null);
});
test('4: 50 partidas completas conservan resultado, regiones vacías y persistencia',()=>{
  for(let run=0;run<50;run++){
    let game=initialState(),seed=run+921;
    const rnd=n=>{seed=(1664525*seed+1013904223)>>>0;return seed%n;};
    while(!game.over){
      assert.equal(finalPresentation(game),null);
      const actor=game.currentActor,path=[pieceById(game,actor).pos];
      for(let n=rnd(3);n>0;n--){const choices=availableMoves(game,actor,path.at(-1));if(!choices.length)break;path.push(choices[rnd(choices.length)]);}
      const options=wallOptions(game,path.at(-1));game=applyTurn(game,{actor,path,to:options[rnd(options.length)]});
    }
    const data=finalPresentation(game),score=territory(game).score;
    assert.equal(data.winner,game.winner);assert.equal(data.score.empty,score.empty);
    assert.equal(data.score.A+data.score.B+data.score.empty,49);
    assert.deepEqual(finalPresentation(JSON.parse(JSON.stringify(game))),data);
  }
});

function fakeNode(){
  const attrs={},classes=new Set(),history=[];
  return {hidden:true,dataset:{},history,classes,textContent:'',
    classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c),toggle(c,on){if(on)classes.add(c);else classes.delete(c);}},
    setAttribute(k,v){attrs[k]=v;},
    animate(frames,options){const a={frames,options,cancelled:false,finished:new Promise(()=>{}),cancel(){this.cancelled=true;}};history.push(a);return a;}};
}
function setup(matches=false){
  const nodes=Object.fromEntries(['banner','result','title','subtitle','detail','announcement'].map(k=>[k,fakeNode()]));
  const scores={A:fakeNode(),B:fakeNode()},reduced={matches,addEventListener(_,fn){this.change=fn;}};
  return {nodes,scores,reduced,feedback:createResultFeedback({...nodes,scores,reduced})};
}
test('4: una sola presentación, título y anuncio; victoria destaca solo al ganador',()=>{
  const {nodes,scores,feedback}=setup(),data=finalPresentation(resultFixture().after);
  feedback.show(data);assert.equal(nodes.result.hidden,false);assert.equal(nodes.title.textContent,data.title);
  assert.equal(nodes.announcement.textContent,data.announcement);assert.ok(scores.A.classes.has('final-emphasis'));assert.ok(!scores.B.classes.has('final-emphasis'));
  nodes.announcement.textContent='anuncio ya leído';feedback.show(data);assert.equal(nodes.announcement.textContent,'anuncio ya leído');
  feedback.enter();assert.equal(nodes.result.history[0].options.duration,RESULT_MS);assert.equal(RESULT_MS,450);
});
test('4: empate neutro con énfasis equilibrado, sin celebración al restaurar',()=>{
  const {nodes,scores,feedback}=setup();feedback.show(finalPresentation(resultFixture({A:23,B:23}).after));
  assert.equal(nodes.banner.dataset.result,'draw');assert.ok(scores.A.classes.has('final-emphasis')&&scores.B.classes.has('final-emphasis'));
  assert.equal(nodes.result.history.length,0);
});
test('4: reinicio cancela entrada, limpia resultado y permite otro desenlace',()=>{
  const {nodes,scores,feedback}=setup();feedback.show(finalPresentation(resultFixture().after));feedback.enter();
  feedback.reset();assert.ok(nodes.result.history[0].cancelled);assert.ok(nodes.result.hidden);assert.equal(nodes.announcement.textContent,'');
  assert.equal(nodes.banner.dataset.result,undefined);assert.ok(!scores.A.classes.has('final-emphasis'));
  feedback.show(finalPresentation(resultFixture({A:16,B:28}).after));assert.equal(nodes.banner.dataset.result,'B');
});
test('4: movimiento reducido inicial o dinámico conserva toda la información sin animar',()=>{
  const {nodes,reduced,feedback}=setup(true);feedback.show(finalPresentation(resultFixture().after));feedback.enter();
  assert.equal(nodes.result.history.length,0);assert.ok(nodes.title.textContent&&nodes.announcement.textContent);
  reduced.matches=false;feedback.enter();reduced.matches=true;reduced.change();assert.ok(nodes.result.history[0].cancelled);
});
