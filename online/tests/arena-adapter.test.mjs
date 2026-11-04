import test from 'node:test';import assert from 'node:assert/strict';
import {createArena,applyArena,legalArenaActions} from '../../arena/src/engine.mjs';
import {arenaNeighbors,arenaWall,analyzeArena} from '../../arena/src/geometry.mjs';
import {arenaCpuActions} from '../../arena/src/cpuStrategy.mjs';
import {arenaRoom,arenaCommand} from './arena-helper.mjs';
import {reviewTraces} from '../scripts/arena-trace.mjs';
import {arenaDecision,isArenaRoom} from '../src/arena-adapter.mjs';
import {createRoom,advanceRoom,publicRoom,presence,clientFeatures,applyCommand} from '../src/room-model.mjs';
import {createDecisionNotice} from '../decision-notice.mjs';

test('Arena: modo versionado, cuatro fichas, diez minutos y sondas antiguas independientes',()=>{
  const r=arenaRoom();assert.ok(isArenaRoom(r));assert.equal(r.config.clockMs,600000);assert.deepEqual(r.arena.game,createArena({mode:'duo',policy:'piece'}));assert.equal(r.clock.owner,'A');
  const probe=createRoom({code:'ABCDEFGH24',name:'Ana',mode:'arena-duo',policy:'team',tokenHash:'x'},0);assert.ok(!isArenaRoom(probe));assert.ok(!probe.arena);
  assert.throws(()=>createRoom({code:'ABCDEFGH25',name:'Ana',mode:'arena-duo',policy:'team',arenaOnline:true,tokenHash:'x'},0),{code:'CONFIG'});
});
test('Arena: propiedad, ámbito de partida, campos, tercer paso y acción posterior al final',()=>{
  const r=arenaRoom(),before=structuredClone(r.arena);const other=Object.keys(r.participants).find(id=>id!==r.hostId);
  assert.throws(()=>arenaCommand(r,{type:'move',to:11},3000,other),{code:'DECISION'});assert.deepEqual(r.arena,before);
  assert.throws(()=>arenaCommand(r,{type:'move',to:11,state:{}}),{code:'PARAMS'});
  assert.throws(()=>arenaCommand(r,{type:'constructor'}),{code:'PARAMS'});
  assert.throws(()=>applyCommand(r,r.hostId,{type:'arena.action',params:{matchId:r.code+':0',action:{type:'move',to:11}}},3000),{code:'MATCH'});
  arenaCommand(r,{type:'move',to:11},4000);arenaCommand(r,{type:'move',to:10},5000);assert.equal(r.clock.remainingMs.A,598000);assert.equal(r.clock.owner,'A');
  assert.throws(()=>arenaCommand(r,{type:'move',to:11},5000),{code:'ILLEGAL_ACTION'});arenaCommand(r,{type:'wall',to:11},6000);assert.equal(r.clock.owner,'B');assert.equal(r.clock.remainingMs.A,597000);
  advanceRoom(r,606000);assert.equal(r.outcome.reason,'timeout');assert.throws(()=>arenaCommand(r,{type:'wall',to:17},606000,other),{code:'DECISION'});
});
test('Arena: salto asegura durante el turno sin muro, y demolición reactiva y reconquista',()=>{
  const r=arenaRoom(),s=createArena();s.walls=arenaNeighbors(11).map(c=>arenaWall(11,c));s.inventories.A1=[{id:'jump-test',type:'jump'}];r.arena.game=s;r.decision=arenaDecision(r);
  const expected=applyArena(s,{type:'jump',to:11,power:'jump-test'});arenaCommand(r,{type:'jump',to:11,power:'jump-test'});
  assert.deepEqual(r.arena.game,expected);assert.equal(expected.completedTurns,1);assert.equal(expected.turn.actor,'B1');assert.ok(expected.lastEvents.some(e=>e.type==='secured'&&e.actor==='A1'));assert.deepEqual(expected.walls,s.walls);assert.equal(r.clock.owner,'B');
  // Official demolition opens the exclusive pocket and reactivates A1.
  const d=structuredClone(expected);d.pieces.find(p=>p.id==='B1').pos=12;d.turn={team:'B',actor:'B1',steps:0,path:[12],committed:false,actions:0};d.inventories.B1=[{id:'demo-test',type:'demolition'}];r.arena.game=d;r.decision=arenaDecision(r);
  const demolished=applyArena(d,{type:'demolition',to:11,power:'demo-test'});arenaCommand(r,{type:'demolition',to:11,power:'demo-test'});
  assert.deepEqual(r.arena.game,demolished);assert.ok(demolished.lastEvents.some(e=>e.type==='reactivated'&&e.actor==='A1'));assert.ok(analyzeArena(demolished).score.A<analyzeArena(d).score.A);
  // Later recoverable position: A1 has left the reopened pocket. B1 can
  // jump into it and close the opening, changing its official owner to B.
  const reclaim=structuredClone(demolished);reclaim.drops=[];reclaim.pieces.find(p=>p.id==='A1').pos=12;reclaim.pieces.find(p=>p.id==='B1').pos=20;reclaim.turn={team:'B',actor:'B1',steps:0,path:[20],committed:false,actions:0};reclaim.inventories.B1=[{id:'reclaim-jump',type:'jump'}];r.arena.game=reclaim;r.decision=arenaDecision(r);
  let reclaimed=applyArena(reclaim,{type:'jump',to:11,power:'reclaim-jump'});arenaCommand(r,{type:'jump',to:11,power:'reclaim-jump'});assert.deepEqual(r.arena.game,reclaimed);
  reclaimed=applyArena(reclaimed,{type:'wall',to:12});arenaCommand(r,{type:'wall',to:12});assert.deepEqual(r.arena.game,reclaimed);assert.equal(analyzeArena(reclaimed).components[analyzeArena(reclaimed).byCell[11]].type,'B');assert.equal(analyzeArena(reclaimed).score.B,1);
});
test('Arena: descarte obligatorio persistido, propietario rival, reloj y recuperación sin resolverlo',()=>{
  let r=arenaRoom();r.arena.game.pending={kind:'discard',owner:'B1',team:'B',capacity:1,reason:'capacity'};r.arena.game.inventories.B1=[{id:'one',type:'jump'},{id:'two',type:'demolition'}];r.decision=arenaDecision(r);
  presence(r,r.hostId,false,4000);assert.equal(r.clock.owner,'B');assert.equal(r.clock.grace,null);
  const owner=Object.values(r.participants).find(p=>p.seat==='B1').id;presence(r,owner,false,5000);assert.ok(r.clock.grace);
  r=JSON.parse(JSON.stringify(r));advanceRoom(r,7000);assert.equal(r.arena.game.pending.owner,'B1');presence(r,owner,true,8000);
  assert.throws(()=>arenaCommand(r,{type:'discard',owner:'B1',power:'one'},8000,r.hostId),{code:'AUTH'});const next=applyArena(r.arena.game,{type:'discard',owner:'B1',power:'one'});arenaCommand(r,{type:'discard',owner:'B1',power:'one'},9000,owner);assert.deepEqual(r.arena.game,next);assert.equal(r.clock.owner,'A');
});
test('Arena: motor y adaptador coinciden en partidas completas con poderes y descarte',()=>{
  const types=new Set(),events=new Set();let total=0;
  for(let seed=1;seed<=16;seed++){
    const r=arenaRoom();let official=createArena(),rng=seed,n=0;
    while(!official.over&&n++<1200){
      const choices=arenaCpuActions(official),powers=choices.filter(a=>['jump','demolition','extraWall'].includes(a.type));rng=(Math.imul(rng,1664525)+1013904223)>>>0;
      const moves=choices.filter(a=>a.type==='move');const distance=a=>Math.min(...official.drops.map(d=>Math.abs(d.cell%9-a.to%9)+Math.abs(Math.floor(d.cell/9)-Math.floor(a.to/9))));
      const closest=moves.length&&official.drops.length?Math.min(...moves.map(distance)):null;
      const pool=powers.length&&(seed>8||rng%3===0)?powers:closest!==null?moves.filter(a=>distance(a)===closest):choices,action=pool[rng%pool.length];assert.ok(action);
      official=applyArena(official,action);arenaCommand(r,action,3000+n);assert.deepEqual(r.arena.game,official);types.add(action.type);for(const e of official.lastEvents)events.add(e.type);
    }
    assert.ok(official.over);assert.equal(r.outcome.reason,'territory');assert.deepEqual(r.outcome.score,analyzeArena(official).score);assert.deepEqual(r.outcome.winners,official.winners);total+=n;
  }
  for(const t of ['move','wall','extraWall','demolition','jump','discard'])assert.ok(types.has(t),t);assert.ok(events.has('reactivated'));assert.ok(total>100);
});
test('Arena: muro adicional conserva turno y puede terminar inmediatamente sin muro normal',()=>{
  const r=arenaRoom(),s=createArena();s.inventories.A1=[{id:'extra',type:'extraWall'}];r.arena.game=s;r.decision=arenaDecision(r);arenaCommand(r,{type:'extraWall',power:'extra',to:11});assert.equal(r.arena.game.completedTurns,0);assert.equal(r.arena.game.turn.actor,'A1');assert.equal(r.clock.owner,'A');
  assert.throws(()=>arenaCommand(r,{type:'extraWall',power:'extra',to:19}),{code:'ILLEGAL_ACTION'});arenaCommand(r,{type:'wall',to:19});assert.equal(r.arena.game.completedTurns,1);
  const f=createArena();f.drops=[];f.pieces.forEach(p=>p.pos={A1:0,A2:41,B1:42,B2:80}[p.id]);f.walls=[...new Set(Array.from({length:81},(_,c)=>arenaNeighbors(c).filter(n=>(c<42)!==(n<42)).map(n=>arenaWall(c,n))).flat())].filter(w=>w!==arenaWall(41,42));f.turn={team:'A',actor:'A2',steps:0,path:[41],committed:false,actions:0};f.inventories.A2=[{id:'last-extra',type:'extraWall'}];
  r.status='active';r.outcome=null;r.arena.game=f;r.decision=arenaDecision(r);const expected=applyArena(f,{type:'extraWall',to:42,power:'last-extra'});arenaCommand(r,{type:'extraWall',to:42,power:'last-extra'});assert.deepEqual(r.arena.game,expected);assert.equal(r.status,'finished');assert.equal(r.outcome.reason,'territory');assert.deepEqual(r.outcome.winners,['A']);
});
test('Arena: revancha unánime y cliente antiguo no habilitado',()=>{
  const r=arenaRoom();advanceRoom(r,603000);assert.equal(r.status,'finished');const players=Object.values(r.participants),id=r.code+':1';
  applyCommand(r,r.hostId,{type:'rematch.propose',params:{matchId:id}},603000);
  for(const p of players.slice(1))applyCommand(r,p.id,{type:'rematch.respond',params:{matchId:id,proposalId:r.rematch.id,accept:true}},603000);
  clientFeatures(r,players[1].id,['rematch-v1'],603001);advanceRoom(r,606001);assert.equal(r.matchNumber,1);
  clientFeatures(r,players[1].id,['rematch-v1','arena-duo-v1'],606002);advanceRoom(r,609002);assert.equal(r.matchNumber,2);assert.deepEqual(r.arena.game,createArena());assert.deepEqual(r.clock.remainingMs,{A:600000,B:600000});assert.equal(r.previousResults.length,1);
  const view=publicRoom(r,r.hostId,609002);assert.ok(view.arena);assert.equal(view.features.rematch,true);
});

test('Arena: una decisión conserva su aviso durante los pasos y no se repite al recuperar',()=>{
  const r=arenaRoom(),records=new Map(),shown=[],storage={getItem:k=>records.get(k),setItem:(k,v)=>records.set(k,v)};
  const make=()=>createDecisionNotice({storage,visible:()=>true,show:text=>shown.push(text)}),notice=make();
  const first=publicRoom(r,r.hostId,3000);assert.equal(notice.update(first),true);
  arenaCommand(r,{type:'move',to:11},4000);const partial=publicRoom(r,r.hostId,4000);assert.equal(partial.decisionId,first.decisionId);assert.equal(notice.update(partial),false);assert.equal(make().update(partial),false);
  arenaCommand(r,{type:'wall',to:2},5000);assert.equal(notice.update(publicRoom(r,r.hostId,5000)),false);
  assert.deepEqual(shown,['¡Tu turno, A1!']);
});

test('Arena: un cliente anterior conserva la sesión pero no puede preparar ni comenzar una sala',()=>{
  const r=arenaRoom(),id=Object.values(r.participants).find(p=>p.seat==='B1').id;r.status='lobby';
  clientFeatures(r,id,['rematch-v1','classic-config-v2'],3000);
  assert.throws(()=>applyCommand(r,id,{type:'ready',params:{ready:true}},3000),{code:'UPDATE_REQUIRED'});
  assert.throws(()=>applyCommand(r,r.hostId,{type:'start'},3000),{code:'UPDATE_REQUIRED'});
  assert.equal(publicRoom(r,id,3000).self.id,id);assert.equal(publicRoom(r,id,3000).self.seat,'B1');
});

test('Arena 1 vs. 1 por ficha: dos fichas propias con inventarios independientes', () => {
  const room = arenaRoom({players: 2});
  const [a,b] = Object.values(room.participants);
  assert.deepEqual(room.config.seats, ['A','B']);
  assert.deepEqual(publicRoom(room,a.id,3000).self.controlledPieces, ['A1','A2']);
  assert.deepEqual(publicRoom(room,b.id,3000).self.controlledPieces, ['B1','B2']);
  const game = room.arena.game;
  game.drops = [{id:'pickup',type:'jump',cell:11}];
  game.inventories.A1 = [{id:'owned',type:'demolition'}];
  game.inventories.A2 = [{id:'other',type:'extraWall'}];
  arenaCommand(room,{type:'move',to:11},4000,a.id);
  assert.equal(room.arena.game.pending.owner,'A1');
  assert.deepEqual(room.decision.eligible,[a.id]);
  assert.throws(()=>arenaCommand(room,{type:'discard',owner:'A2',power:'other'},4000,a.id),{code:'DECISION'});
  assert.throws(()=>arenaCommand(room,{type:'discard',owner:'A1',power:'owned'},4000,b.id),{code:'DECISION'});
  arenaCommand(room,{type:'discard',owner:'A1',power:'owned'},5000,a.id);
  assert.deepEqual(room.arena.game.inventories.A2,[{id:'other',type:'extraWall'}]);
  assert.deepEqual(room.arena.game.inventories.A1,[{id:'pickup',type:'jump'}]);
  assert.equal(room.clock.remainingMs.A,598000);
});

test('Arena 1 vs. 1 por equipo: elección de ficha con inventario y reloj compartidos', () => {
  const room = arenaRoom({players: 2,policy:'team'}), [a,b] = Object.values(room.participants);
  assert.equal(room.arena.game.turn.actor,null);
  assert.deepEqual(Object.keys(room.arena.game.inventories),['A','B']);
  const decision = publicRoom(room,a.id,3000).decisionId;
  assert.throws(()=>arenaCommand(room,{type:'select',actor:'B1'},3000,a.id),{code:'DECISION'});
  assert.throws(()=>arenaCommand(room,{type:'select',actor:'A2'},3000,b.id),{code:'DECISION'});
  arenaCommand(room,{type:'select',actor:'A2'},4000,a.id);
  assert.equal(publicRoom(room,a.id,4000).decisionId,decision);
  assert.equal(room.clock.remainingMs.A,599000);
  room.arena.game.inventories.A.push({id:'shared',type:'extraWall'});
  const action = legalArenaActions(room.arena.game).find(x=>x.type==='extraWall');
  arenaCommand(room,action,5000,a.id);
  assert.deepEqual(room.arena.game.inventories.A,[]);
  assert.equal(room.arena.game.turn.actor,'A2');
  assert.throws(()=>arenaCommand(room,{type:'select',actor:'A1'},5000,a.id),{code:'ILLEGAL_ACTION'});
  assert.equal(room.clock.remainingMs.A,598000);
  advanceRoom(room,603000);
  assert.equal(room.outcome.reason,'timeout');
  applyCommand(room,a.id,{type:'rematch.propose',params:{matchId:room.code+':1'}},603000);
  applyCommand(room,b.id,{type:'rematch.respond',params:{matchId:room.code+':1',proposalId:room.rematch.id,accept:true}},603000);
  advanceRoom(room,606000);
  assert.deepEqual(room.arena.game,createArena({policy:'team'}));
  assert.deepEqual(room.clock.remainingMs,{A:600000,B:600000});
});

test('Arena 1 vs. 1: un descarte por capacidad rival cambia de responsable y se recupera', () => {
  let room = arenaRoom({players:2,policy:'team'});
  const [a,b] = Object.values(room.participants);
  const game = room.arena.game;
  game.drops = [];
  const positions={A1:10,B1:9,A2:70,B2:64};
  for (const piece of game.pieces) piece.pos=positions[piece.id];
  game.walls=[...new Set([9,10].flatMap(c=>arenaNeighbors(c).filter(n=>![9,10].includes(n)).map(n=>arenaWall(c,n))))];
  game.turn={team:'A',actor:'A1',steps:0,path:[10],committed:false,actions:0};
  game.inventories.A=[{id:'jump',type:'jump'}];
  game.inventories.B=[{id:'keep',type:'jump'},{id:'other',type:'demolition'}];
  arenaCommand(room,{type:'jump',to:11,power:'jump'},4000,a.id);
  assert.equal(room.arena.game.pending.owner,'B');
  assert.equal(room.clock.owner,'B');
  assert.deepEqual(room.decision.eligible,[b.id]);
  const discard={type:'discard',owner:'B',power:'other'};
  assert.throws(()=>arenaCommand(room,discard,4000,a.id),{code:'DECISION'});
  advanceRoom(room,5000);
  presence(room,b.id,false,5000);
  assert.ok(room.clock.grace);
  room=JSON.parse(JSON.stringify(room));
  clientFeatures(room,b.id,['rematch-v1','arena-duo-v1'],7000);
  presence(room,b.id,true,7000);
  assert.equal(publicRoom(room,b.id,7000).canDecide,false);
  assert.equal(publicRoom(room,b.id,7000).self.id,b.id);
  assert.throws(()=>arenaCommand(room,discard,7000,b.id),{code:'UPDATE_REQUIRED'});
  clientFeatures(room,b.id,['rematch-v1','arena-1v1-v1'],7000);
  assert.equal(room.arena.game.pending.owner,'B');
  const expected=applyArena(room.arena.game,discard);
  arenaCommand(room,discard,8000,b.id);
  assert.deepEqual(room.arena.game,expected);
  assert.equal(room.clock.owner,'A');
  assert.equal(room.clock.remainingMs.B,598000);
});


test('Arena 1 vs. 1: la reactivación y la puntuación coinciden con el motor en ambas políticas', () => {
  for (const policy of ['piece','team']) {
    const room = arenaRoom({players:2,policy});
    const [,trace] = reviewTraces(policy);
    assert.ok(trace.events.includes('reactivated'));
    for (const [index,action] of trace.commands.entries()) {
      arenaCommand(room,action,3000+index);
      assert.deepEqual(room.arena.game,trace.states[index]);
    }
    assert.equal(room.status,'finished');
    assert.deepEqual(room.outcome.score,analyzeArena(trace.states.at(-1)).score);
  }
});
