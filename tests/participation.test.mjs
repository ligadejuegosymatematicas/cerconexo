import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,activeIds,territory,applyTurn,wallOptions,availableMoves,pieceById,wallKey} from '../src/engine.mjs';
import {deriveParticipationEvents,participationMessage} from '../src/participationEvents.mjs';
import {deriveTerritoryEvents} from '../src/territoryEvents.mjs';
import {participationFixture,directDuelFixture} from './participation-fixtures.mjs';
import {conquestFixture,finishFixture,enclose} from './territory-fixtures.mjs';

test('3B: inicio 2 vs. 2 sin acontecimientos antiguos ni mensajes',()=>{
  const game=initialState(),event=deriveParticipationEvents(game,game);
  assert.deepEqual(event.after,{A:['A1','A2'],B:['B1','B2']});assert.deepEqual(event.secured,[]);
  assert.equal(participationMessage(event),null);
});
for(const team of ['A','B']){
  test(`3B: ${team} asegura una ficha; transición simétrica y compañero único`,()=>{
    const {before,after}=participationFixture({team}),snapshot=JSON.stringify([before,after]);
    const event=deriveParticipationEvents(before,after);
    assert.deepEqual(event.secured,[{id:team+'1',team}]);assert.equal(event.matchup,'continues');
    assert.deepEqual(event.redistributions,[{team,player:team+'2',secured:[team+'1']}]);
    assert.equal(JSON.stringify([before,after]),snapshot);
    const message=participationMessage(event);assert.equal(message.title,'CONTINÚA LA DISPUTA');
    assert.match(message.announcement,new RegExp(`${team}2 jugará todos los turnos del equipo ${team}`));
    assert.ok(after.pieces.some(p=>p.id===team+'1'&&p.pos===before.pieces.find(p=>p.id===team+'1').pos));
    assert.ok(!activeIds(after).has(team+'1'));assert.equal(after.pieces.length,4);
  });
}
test('3B: el motor alterna equipos y asigna todos los turnos al compañero activo',()=>{
  let game=participationFixture().after;const actors=[];
  for(let i=0;i<4;i++){
    actors.push(game.currentActor);const actor=game.currentActor,pos=pieceById(game,actor).pos;
    game=applyTurn(game,{actor,path:[pos],to:wallOptions(game,pos)[0]});
  }
  assert.deepEqual(actors,['B1','A2','B2','A2']);
});
for(const team of ['A','B']){
  test(`3B: ${team}2 puede asegurar y ${team}1 queda como participante único`,()=>{
    const {before}=participationFixture({team}),one=before.pieces.find(p=>p.id===team+'1'),two=before.pieces.find(p=>p.id===team+'2');
    [one.pos,two.pos]=[two.pos,one.pos];before.lastActed[team]=team+'1';finishFixture(before);
    const after=applyTurn(before,{actor:team+'2',path:[two.pos],to:team==='A'?15:19});
    const event=deriveParticipationEvents(before,after);assert.equal(event.secured[0].id,team+'2');
    assert.equal(event.redistributions[0].player,team+'1');assert.match(participationMessage(event).body,new RegExp(team+'1'));
  });
}
test('3B: 1 vs. 2 pasa a 1 vs. 1 con los identificadores reales',()=>{
  const {before,after}=participationFixture({team:'B',alreadyA:true}),event=deriveParticipationEvents(before,after);
  assert.deepEqual(event.before,{A:['A2'],B:['B1','B2']});assert.deepEqual(event.after,{A:['A2'],B:['B2']});
  assert.equal(event.matchup,'last');assert.equal(participationMessage(event).body,'A2 vs. B2');
  assert.equal(participationMessage(event).title,'¡ÚLTIMA DISPUTA!');
});
test('3B: 2 vs. 2 pasa directamente a 1 vs. 1; dos confirmaciones y un aviso',()=>{
  const {before,after}=directDuelFixture(),event=deriveParticipationEvents(before,after);
  assert.deepEqual(event.secured.map(p=>p.id),['A1','B1']);assert.equal(event.redistributions.length,2);
  assert.equal(event.matchup,'last');assert.equal(event.gameEnded,false);
  assert.match(participationMessage(event).announcement,/A2 jugará todos los turnos del equipo A/);
  assert.match(participationMessage(event).announcement,/B2 jugará todos los turnos del equipo B/);
});
test('3B: finalización asegura varias fichas pero suprime cambios de enfrentamiento',()=>{
  const {before,after}=conquestFixture({both:true}),event=deriveParticipationEvents(before,after);
  assert.equal(event.secured.length,4);assert.equal(event.matchup,null);
  assert.deepEqual(event.redistributions,[]);assert.equal(participationMessage(event),null);
  const capture=deriveTerritoryEvents(before,after);assert.deepEqual(capture.gains,{A:12,B:37});
  assert.equal(capture.conquests.find(e=>e.team==='A').players.length,2);
});
test('3B: sin conquista no cambia participación; integración reutiliza las componentes',()=>{
  const before=initialState(),after=applyTurn(before,{actor:'A1',path:[8],to:9});
  const events=deriveTerritoryEvents(before,after);
  assert.deepEqual(events.participation,deriveParticipationEvents(before,after));
  assert.equal(participationMessage(events.participation),null);
});
test('3B: subdivisión ya asegurada y recarga no repiten confirmación',()=>{
  const before=initialState();before.pieces[0].pos=0;before.pieces[2].pos=2;
  enclose(before,[0,1,2]);finishFixture(before);
  const after=structuredClone(before);after.walls.push(wallKey(1,2));finishFixture(after);
  assert.deepEqual(deriveParticipationEvents(before,after).secured,[]);
  assert.deepEqual(deriveParticipationEvents(after,after).secured,[]);
});
test('3B: 30 partidas completas no cambian puntuación y confirman cada ficha una vez',()=>{
  for(let run=0;run<30;run++){
    let game=initialState(),seed=run+177;const confirmed=new Set();
    const rnd=n=>{seed=(1664525*seed+1013904223)>>>0;return seed%n;};
    while(!game.over){
      const actor=game.currentActor,path=[pieceById(game,actor).pos];
      for(let n=rnd(3);n>0;n--){const choices=availableMoves(game,actor,path.at(-1));if(!choices.length)break;path.push(choices[rnd(choices.length)]);}
      const choices=wallOptions(game,path.at(-1)),after=applyTurn(game,{actor,path,to:choices[rnd(choices.length)]});
      const snapshot=JSON.stringify(after),event=deriveTerritoryEvents(game,after);
      for(const p of event.participation.secured){assert.ok(!confirmed.has(p.id));confirmed.add(p.id);}
      assert.equal(JSON.stringify(after),snapshot);assert.deepEqual(event.after,territory(after).score);
      assert.equal(Object.values(event.after).reduce((a,b)=>a+b),49);
      assert.deepEqual(new Set([...event.participation.after.A,...event.participation.after.B]),activeIds(after));
      if(after.over)assert.equal(participationMessage(event.participation),null);
      game=after;
    }
    assert.equal(confirmed.size,4);
  }
});
