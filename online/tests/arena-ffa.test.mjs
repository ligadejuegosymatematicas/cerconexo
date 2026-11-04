import test from 'node:test';
import assert from 'node:assert/strict';
import {createArena,applyArena,legalArenaActions} from '../../arena/src/engine.mjs';
import {analyzeArena,arenaNeighbors,arenaWall} from '../../arena/src/geometry.mjs';
import {arenaRoom,arenaCommand} from './arena-helper.mjs';
import {advanceRoom,publicRoom,applyCommand,clientFeatures,presence} from '../src/room-model.mjs';
import {arenaDecision,arenaOutcome} from '../src/arena-adapter.mjs';
import {eliminateByTime,ffaOutcome} from '../src/arena-timeout.mjs';

const make=()=>arenaRoom({mode:'arena-ffa'});
const expire=(room,now)=>advanceRoom(room,now??room.clock.anchoredAt+room.clock.remainingMs[room.clock.owner]);
test('FFA online conserva el inicio oficial, cuatro asientos y cinco minutos individuales',()=>{
  const room=make();
  assert.deepEqual(room.arena.game,createArena({mode:'ffa'}));
  assert.deepEqual(room.config.seats,['A','B','C','D']);
  assert.equal(room.config.clockMs,300000);
  for(const player of Object.values(room.participants)){
    assert.deepEqual(publicRoom(room,player.id,3000).self.controlledPieces,[player.seat]);
  }
});

test('FFA elimina tres equipos sucesivos, conserva los relojes y clasifica al último superviviente',()=>{
  const room=make();
  for(const team of ['A','B','C']){
    assert.equal(room.clock.owner,team);
    const before=structuredClone(room.arena.game), now=room.clock.anchoredAt+300000;
    expire(room,now);
    assert.equal(room.arena.game.completedTurns,before.completedTurns);
    assert.deepEqual(room.arena.game.walls,before.walls);
    assert.deepEqual(room.arena.game.waveLog,before.waveLog);
    assert.ok(!room.arena.game.pieces.some(p=>p.team===team));
    assert.equal(room.arena.game.inventories[team],undefined);
    const snapshot=JSON.stringify(room);
    advanceRoom(room,now);
    assert.equal(JSON.stringify(room),snapshot,'Alarma repetida');
  }
  assert.equal(room.status,'finished');
  assert.deepEqual(room.outcome.winners,['D']);
  assert.equal(room.outcome.reason,'last-survivor');
  assert.deepEqual(room.outcome.ranking.map(r=>[r.team,r.rank]),[['D',1],['C',2],['B',3],['A',4]]);
  assert.equal(room.arena.game.revision,3);
  assert.equal(room.arena.game.completedTurns,0);
});

test('FFA una alarma tardía no consume tiempo del siguiente equipo ni repite la eliminación',()=>{
  const room=make();
  expire(room,900000);
  assert.equal(room.status,'active');
  assert.equal(room.clock.owner,'B');
  assert.equal(room.clock.remainingMs.B,300000);
  assert.equal(room.clock.anchoredAt,900000);
  assert.equal(room.arena.eliminations.length,1);
  const game=JSON.stringify(room.arena.game);
  const result=eliminateByTime(room,'A',900001);
  assert.equal(result.duplicate,true);
  assert.equal(JSON.stringify(room.arena.game),game);
});

for(const type of ['move','extraWall','demolition','jump','discard']){
  test('FFA vencimiento tras '+type+' conserva las acciones aceptadas y limpia solo al eliminado',()=>{
    const room=make(),s=room.arena.game;
    let action;
    if(type==='discard'){
      s.drops=[{id:'pickup',type:'jump',cell:11}];
      s.inventories.A=[{id:'keep',type:'demolition'}];
      action={type:'move',to:11};
    }else if(type==='move')action={type:'move',to:11};
    else {
      s.inventories.A=[{id:'power',type}];
      if(type!=='extraWall')s.walls=[arenaWall(10,11)];
      action={type,to:11,power:'power'};
    }
    arenaCommand(room,action,4000);
    const before=structuredClone(room.arena.game);
    if(type==='discard')assert.equal(before.pending.owner,'A');
    expire(room);
    assert.equal(room.status,'active');
    assert.equal(room.clock.owner,'B');
    assert.equal(room.arena.game.pending,null);
    assert.equal(room.arena.game.resolution,null);
    assert.deepEqual(room.arena.game.walls,before.walls);
    assert.deepEqual(room.arena.game.drops,before.drops);
    assert.equal(room.arena.game.completedTurns,before.completedTurns);
    assert.ok(!room.arena.game.pieces.some(p=>p.id==='A'));
    assert.deepEqual(room.arena.game.pieces,before.pieces.filter(p=>p.id!=='A'));
    assert.equal(room.arena.eliminations[0].cell,before.pieces.find(p=>p.id==='A').pos);
    assert.equal(analyzeArena(room.arena.game).score.shared,81);
    const old=Object.values(room.participants).find(p=>p.seat==='A');
    const view=publicRoom(room,old.id,room.clock.anchoredAt);
    assert.equal(view.self.eliminated,true);
    assert.equal(view.arena.eliminations[0].team,'A');
    assert.equal(view.canDecide,false);
    assert.deepEqual(view.self.controlledPieces,[]);
    assert.throws(()=>arenaCommand(room,{type:'wall',to:11},room.clock.anchoredAt,old.id),{code:'DECISION'});
  });
}

test('FFA retira la ficha, libera su casilla y el motor continúa con tres y dos equipos',()=>{
  const room=make();
  expire(room);
  const game=room.arena.game;
  assert.equal(analyzeArena(game).components[0].teams.length,3);
  const b=game.pieces.find(p=>p.id==='B');
  b.pos=11;game.turn.path=[11];
  assert.ok(legalArenaActions(game).some(a=>a.type==='move'&&a.to===10),'Casilla liberada');
  const action={type:'move',to:10};
  const official=applyArena(game,action);
  arenaCommand(room,action,room.clock.anchoredAt+1);
  assert.deepEqual(room.arena.game,official);
  expire(room);
  assert.equal(analyzeArena(room.arena.game).components[0].teams.length,2);
  const next=legalArenaActions(room.arena.game)[0];
  const expected=applyArena(room.arena.game,next);
  arenaCommand(room,next,room.clock.anchoredAt+1);
  assert.deepEqual(room.arena.game,expected);
  assert.ok(!expected.pieces.some(p=>['A','B'].includes(p.id)),'Ninguna reactivación del eliminado');
});

test('FFA eliminar puede asegurar supervivientes y terminar inmediatamente por territorio',()=>{
  const room=make(),game=room.arena.game;
  const positions={A:40,B:0,C:8,D:80};
  game.pieces.forEach(p=>p.pos=positions[p.id]);
  game.turn.path=[40];
  game.walls=[...new Set([0,8,80].flatMap(c=>arenaNeighbors(c).map(n=>arenaWall(c,n))))];
  room.decision=arenaDecision(room);
  expire(room);
  assert.equal(room.status,'finished');
  assert.equal(room.outcome.reason,'territory');
  assert.deepEqual(room.outcome.winners,['B','C','D']);
  assert.deepEqual(room.outcome.ranking.map(r=>[r.team,r.rank]),[['B',1],['C',1],['D',1],['A',4]]);
  assert.equal(room.outcome.score.empty,78);
  assert.ok(room.arena.game.lastEvents.some(e=>e.type==='finished'));
});

test('FFA recuperación de un descarte y nueva partida conserva clasificación y restaura las cuatro fichas',()=>{
  let room=make();
  room.arena.game.drops=[{id:'pickup',type:'jump',cell:11}];
  room.arena.game.inventories.A=[{id:'keep',type:'demolition'}];
  arenaCommand(room,{type:'move',to:11},4000);
  room=JSON.parse(JSON.stringify(room));
  const host=room.hostId,match=room.code+':1';
  clientFeatures(room,host,['rematch-v1','arena-duo-v1'],4001);
  assert.equal(publicRoom(room,host,4001).canDecide,false);
  assert.throws(()=>arenaCommand(room,{type:'discard',owner:'A',power:'keep'},4001,host),{code:'UPDATE_REQUIRED'});
  clientFeatures(room,host,['rematch-v1','arena-ffa-v1'],4002);
  assert.equal(room.arena.game.pending.owner,'A');
  expire(room);
  room=JSON.parse(JSON.stringify(room));
  expire(room);expire(room);
  const result=structuredClone(room.outcome);
  applyCommand(room,host,{type:'rematch.propose',params:{matchId:match}},room.finishedAt);
  for(const p of Object.values(room.participants).filter(p=>p.id!==host)){
    applyCommand(room,p.id,{type:'rematch.respond',params:{matchId:match,proposalId:room.rematch.id,accept:true}},room.finishedAt);
  }
  advanceRoom(room,room.finishedAt+3000);
  assert.equal(room.status,'active');
  assert.deepEqual(room.arena.game,createArena({mode:'ffa'}));
  assert.deepEqual(room.arena.eliminations,[]);
  assert.deepEqual(room.clock.remainingMs,{A:300000,B:300000,C:300000,D:300000});
  assert.deepEqual(room.previousResults[0].outcome,result);
  assert.equal(publicRoom(room,host,room.clock.anchoredAt).self.eliminated,false);
});


test('FFA clasificación territorial sitúa supervivientes por puntuación y eliminados en orden inverso',()=>{
  const room=make();
  expire(room);
  const game=room.arena.game,positions={B:36,C:80,D:0};
  game.pieces.forEach(p=>p.pos=positions[p.id]);
  game.turn.path=[36];
  game.walls=Array.from({length:9},(_,i)=>arenaWall(27+i,36+i));
  room.decision=arenaDecision(room);
  expire(room);
  assert.equal(room.status,'finished');
  assert.equal(room.outcome.reason,'territory');
  assert.deepEqual(room.outcome.winners,['C']);
  assert.deepEqual(room.outcome.ranking.map(r=>[r.team,r.rank,r.score]),[['C',1,45],['D',2,36],['B',3,0],['A',4,0]]);
});

test('FFA los supervivientes pueden reactivarse y reconquistar tras una eliminación',()=>{
  const room=make();expire(room);
  const game=room.arena.game;
  game.drops=[];
  game.pieces.forEach(p=>p.pos={B:12,C:11,D:64}[p.id]);
  game.walls=arenaNeighbors(11).map(n=>arenaWall(11,n));
  game.turn.path=[12];
  game.inventories.B=[{id:'demo',type:'demolition'}];
  room.decision=arenaDecision(room);
  assert.equal(analyzeArena(game).score.C,1);
  arenaCommand(room,{type:'demolition',to:11,power:'demo'},room.clock.anchoredAt+1);
  assert.ok(room.arena.game.lastEvents.some(e=>e.type==='reactivated'&&e.actor==='C'));
  assert.equal(analyzeArena(room.arena.game).score.C,0);
  const reopened=room.arena.game;
  reopened.pieces.find(p=>p.id==='C').pos=12;
  reopened.pieces.find(p=>p.id==='B').pos=20;
  reopened.turn={team:'B',actor:'B',steps:0,path:[20],committed:false,actions:0};
  reopened.inventories.B=[{id:'jump',type:'jump'}];
  arenaCommand(room,{type:'jump',to:11,power:'jump'},room.clock.anchoredAt+1);
  arenaCommand(room,{type:'wall',to:12},room.clock.anchoredAt+1);
  assert.equal(analyzeArena(room.arena.game).score.B,1);
  assert.ok(!room.arena.game.pieces.some(p=>p.id==='A'));
  assert.equal(room.arena.eliminations.length,1);
});
