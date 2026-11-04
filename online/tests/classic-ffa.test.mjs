import test from 'node:test';
import assert from 'node:assert/strict';
import {adjacent,wallKey,wallOptions,availableMoves,validateTurn} from '../../src/engine.mjs';
import {initialClassicFfa,ffaTerritory,ffaActiveIds,ffaDraft,resolveClassicFfa,stepClassicFfa,wallClassicFfa,eliminateClassicFfa} from '../classic-ffa.mjs';
import {createRoom,joinRoom,presence,clientFeatures,seated,applyCommand,advanceRoom,publicRoom,leaveView} from '../src/room-model.mjs';
import {classicDecision,classicOutcome} from '../src/classic-adapter.mjs';
import {matchId} from '../src/rematch.mjs';
import {chooseDecision} from '../src/clocks.mjs';
import {configuration} from '../src/protocol.mjs';

export function classicFfaRoom() {
  const room=createRoom({code:'ABCDEFGH23',name:'Ana',mode:'classic-ffa',policy:'piece',players:4,tokenHash:'host'},0);
  for(let i=0;i<4;i++){
    const id=i?joinRoom(room,{name:'Persona '+i,tokenHash:'hash-'+i},0):room.hostId;
    presence(room,id,true,0);clientFeatures(room,id,['rematch-v1','classic-ffa-v1'],0);
    if(i)applyCommand(room,room.hostId,{type:'admit',params:{playerId:id,seat:room.config.seats[i]}},0);
  }
  for(const p of seated(room))applyCommand(room,p.id,{type:'ready',params:{ready:true}},0);
  applyCommand(room,room.hostId,{type:'start'},0);advanceRoom(room,3000);return room;
}
function command(room,type,to,now=3000,id=room.decision.eligible[0]) {
  advanceRoom(room,now);
  return applyCommand(room,id,{type,params:{matchId:matchId(room),...(to===undefined?{}:{to})}},now);
}
function closeBoundary(game,cells) {
  const inside=new Set(cells);
  for(const cell of cells)for(const n of adjacent(cell))if(!inside.has(n)&&!game.walls.includes(wallKey(cell,n)))game.walls.push(wallKey(cell,n));
  game.moves=game.walls.length;
}
function install(room,game,now=3000){
  room.classic={game,draft:ffaDraft(game)};room.decision=classicDecision(room);
  chooseDecision(room.clock,room.decision,room.participants,now);
}
const expire=room=>advanceRoom(room,room.clock.anchoredAt+room.clock.remainingMs[room.clock.owner]);

test('Clásico FFA: cuatro fichas oficiales 7×7 y cinco minutos; solo admite cuatro personas por ficha',()=>{
  const r=classicFfaRoom();
  assert.deepEqual(r.classic.game.pieces.map(p=>[p.id,p.pos]),[['A',8],['B',12],['C',40],['D',36]]);
  assert.deepEqual(r.config.teams,['A','B','C','D']);assert.equal(r.config.clockMs,300000);
  assert.equal(ffaTerritory(r.classic.game).score.mixed,49);
  for(const p of seated(r))assert.deepEqual(publicRoom(r,p.id,3000).self.controlledPieces,[p.seat]);
  assert.throws(()=>configuration('classic-ffa','team',4));assert.throws(()=>configuration('classic-ffa','piece',2));
});

test('Componentes compartidas con dos, tres y cuatro equipos nunca puntúan',()=>{
  for(const count of [2,3,4]){
    const game=initialClassicFfa();game.pieces=game.pieces.slice(0,count);
    const view=ffaTerritory(game);assert.equal(view.score.mixed,49);
    assert.deepEqual(view.components[0].teams,game.pieces.map(p=>p.team));
    assert.equal(view.score.A+view.score.B+view.score.C+view.score.D,0);
  }
});

test('Cero pasos y muro entre casillas ocupadas son legales; giro y regreso conservan validación oficial',()=>{
  let game=initialClassicFfa();game.pieces[1].pos=9;
  assert.equal(validateTurn(game,{actor:'A',path:[8],to:9}),8);
  assert.ok(wallClassicFfa(game,ffaDraft(game),9).walls.includes('8-9'));
  game=initialClassicFfa();
  let draft=stepClassicFfa(game,ffaDraft(game),9);draft=stepClassicFfa(game,draft,8);
  assert.deepEqual(draft.path,[8,9,8]);assert.throws(()=>stepClassicFfa(game,draft,7));
  assert.deepEqual(stepClassicFfa(game,stepClassicFfa(game,ffaDraft(game),9),16).path,[8,9,16]);
});

test('Grafo completamente bloqueado: cuatro puntos exclusivos, 45 vacíos, empate neutral',()=>{
  const game=initialClassicFfa();
  game.walls=Array.from({length:49},(_,c)=>adjacent(c).filter(n=>n>c).map(n=>wallKey(c,n))).flat();game.moves=84;
  resolveClassicFfa(game);
  assert.equal(game.over,true);assert.equal(game.finishReason,'territory');
  assert.deepEqual(game.winners,['A','B','C','D']);
  assert.deepEqual(ffaTerritory(game).score,{A:1,B:1,C:1,D:1,mixed:0,empty:45});
  assert.deepEqual(ffaActiveIds(game),[]);
});

test('Asegurar no gana: un equipo asegurado grande supera al último actor sin tiempo',()=>{
  const room=classicFfaRoom(),g=initialClassicFfa();
  // A owns the top four rows (28 cells); B/C/D still share the bottom 21.
  g.pieces[1].pos=33;closeBoundary(g,Array.from({length:28},(_,i)=>i));
  resolveClassicFfa(g,'A');install(room,g);
  assert.equal(g.over,false);assert.equal(g.secured.A.score,28);assert.equal(room.clock.owner,'B');
  expire(room);assert.equal(room.clock.owner,'C');expire(room);
  assert.equal(room.status,'finished');assert.deepEqual(room.outcome.winners,['A']);
  assert.equal(room.outcome.reason,'territory');assert.equal(room.outcome.score.D,21);
  assert.deepEqual(room.outcome.ranking.map(r=>[r.team,r.rank,r.eliminated]),[['A',1,false],['D',2,false],['C',3,true],['B',4,true]]);
  assert.equal(room.clock.remainingMs.A,300000);assert.equal(room.clock.remainingMs.D,300000);
  assert.ok(room.classic.game.pieces.some(p=>p.team==='A'));
});

test('Vencimientos sucesivos retiran fichas sin retirar muros y terminan con el único no eliminado',()=>{
  const room=classicFfaRoom();command(room,'classic.wall',1);
  const walls=[...room.classic.game.walls];
  for(const team of ['B','C','D']){
    assert.equal(room.clock.owner,team);expire(room);
    assert.ok(!room.classic.game.pieces.some(p=>p.team===team));
    assert.deepEqual(room.classic.game.walls,walls);
  }
  assert.deepEqual(room.outcome.winners,['A']);assert.equal(room.outcome.reason,'last-survivor');
  assert.deepEqual(room.outcome.ranking.map(r=>r.team),['A','D','C','B']);
  const snapshot=JSON.stringify(room);advanceRoom(room,room.finishedAt);assert.equal(JSON.stringify(room),snapshot);
});

test('Irreversibilidad: todos los siguientes turnos legales y un vencimiento conservan exactamente una región asegurada',()=>{
  const game=initialClassicFfa();closeBoundary(game,[8]);resolveClassicFfa(game,'A');
  assert.equal(game.currentActor,'B');assert.deepEqual(game.secured.A,{cells:[8],score:1});
  const paths=[[12]];
  for(const to of availableMoves(game,'B',12)){
    paths.push([12,to]);for(const end of availableMoves(game,'B',to))paths.push([12,to,end]);
  }
  let checked=0;
  for(const path of paths)for(const to of wallOptions(game,path.at(-1))){
    const next=wallClassicFfa(game,{actor:'B',path},to);
    assert.deepEqual(next.secured.A,game.secured.A);
    assert.deepEqual(ffaTerritory(next).components.find(r=>r.type==='A').cells,[8]);
    assert.equal(ffaTerritory(next).score.A,1);assert.ok(!ffaActiveIds(next).includes('A'));checked++;
  }
  assert.ok(checked>20);
  const next=eliminateClassicFfa(game,ffaDraft(game),'B',300000);
  assert.deepEqual(next.secured.A,game.secured.A);assert.equal(ffaTerritory(next).score.A,1);
  assert.throws(()=>eliminateClassicFfa(game,ffaDraft(game),'A',300000));
});

test('Vencimiento durante recorrido parcial conserva muros, limpia la decisión e impide reactivar o actuar',()=>{
  const room=classicFfaRoom();command(room,'classic.step',9,4000);command(room,'classic.step',16,5000);
  const eliminatedId=room.decision.eligible[0];expire(room);
  assert.equal(room.classic.game.eliminations[0].cell,16);assert.deepEqual(room.classic.draft,{actor:'B',path:[12]});
  assert.equal(room.clock.remainingMs.A,0);assert.equal(room.clock.remainingMs.B,300000);
  assert.equal(publicRoom(room,eliminatedId,305000).self.eliminated,true);
  assert.throws(()=>command(room,'classic.wall',5,305000,eliminatedId));
  assert.throws(()=>eliminateClassicFfa(room.classic.game,room.classic.draft,'A',305000));
});

test('Una alarma tardía no consume retrospectivamente el reloj del siguiente jugador',()=>{
  const room=classicFfaRoom();advanceRoom(room,900000);
  assert.equal(room.classic.game.eliminations.length,1);assert.equal(room.clock.owner,'B');
  assert.equal(room.clock.remainingMs.B,300000);assert.equal(room.clock.anchoredAt,900000);
});

test('Eliminar convierte una región disputada en exclusiva y no concede puntos a una región vacía',()=>{
  const room=classicFfaRoom(),g=initialClassicFfa();
  closeBoundary(g,[8,9,10,11,12]);closeBoundary(g,[0]);install(room,g);
  expire(room);
  assert.equal(room.classic.game.secured.B.score,5);assert.equal(room.clock.owner,'C');
  const v=ffaTerritory(room.classic.game);assert.equal(v.score.A,0);assert.equal(v.score.B,5);assert.ok(v.score.empty>=1);
});

test('Navegar no pausa: recuperación JSON conserva recorrido, identidad y presupuesto de gracia',()=>{
  let room=classicFfaRoom();command(room,'classic.step',9,4000);const id=room.hostId;
  leaveView(room,id,5000);advanceRoom(room,15000);
  assert.equal(room.clock.grace,null);assert.equal(room.clock.remainingMs.A,288000);
  room=JSON.parse(JSON.stringify(room));presence(room,id,true,16000);advanceRoom(room,17000);
  assert.deepEqual(room.classic.draft.path,[8,9]);assert.ok(room.clock.remainingMs.A<=287000);
  assert.equal(room.clock.players[id].usedMs,0);
});

test('Desconexión inesperada consume únicamente la gracia existente y nunca reinicia el tiempo',()=>{
  const room=classicFfaRoom();command(room,'classic.step',9,4000);presence(room,room.hostId,false,4000);
  advanceRoom(room,14000);presence(room,room.hostId,true,14000);advanceRoom(room,15000);
  assert.equal(room.clock.players[room.hostId].usedMs,10000);assert.equal(room.clock.remainingMs.A,298000);
  assert.deepEqual(room.classic.draft.path,[8,9]);
});

test('Cliente anterior conserva identidad pero debe actualizar para preparar, actuar y aceptar revancha',()=>{
  const room=classicFfaRoom(),id=room.hostId;
  clientFeatures(room,id,['rematch-v1'],3000);
  assert.equal(publicRoom(room,id,3000).canDecide,false);
  assert.throws(()=>command(room,'classic.wall',1),e=>e.code==='DECISION');
  clientFeatures(room,id,['rematch-v1','classic-ffa-v1'],3000);assert.equal(publicRoom(room,id,3000).canDecide,true);
  const lobby=classicFfaRoom();lobby.status='lobby';
  clientFeatures(lobby,lobby.hostId,['rematch-v1'],3000);
  assert.throws(()=>applyCommand(lobby,lobby.hostId,{type:'ready',params:{ready:true}},3000),e=>e.code==='UPDATE_REQUIRED');
  assert.throws(()=>applyCommand(lobby,lobby.hostId,{type:'start'},3000),e=>e.code==='UPDATE_REQUIRED');
  for(let n=0;n<3;n++)expire(room);
  let now=room.finishedAt;
  applyCommand(room,id,{type:'rematch.propose',params:{matchId:matchId(room)}},now);
  const other=seated(room)[1].id;clientFeatures(room,other,['rematch-v1'],now);
  const accept=pid=>applyCommand(room,pid,{type:'rematch.respond',params:{matchId:matchId(room),proposalId:room.rematch.id,accept:true}},now);
  assert.throws(()=>accept(other),e=>e.code==='UPDATE_REQUIRED');
  clientFeatures(room,other,['rematch-v1','classic-ffa-v1'],now);
  for(const p of seated(room).slice(1))accept(p.id);
  assert.equal(room.rematch.status,'countdown');
  clientFeatures(room,other,['rematch-v1'],now);
  assert.equal(room.rematch.status,'pending','Una página antigua detiene inmediatamente la cuenta atrás de revancha');
  advanceRoom(room,now+3000);assert.equal(room.matchNumber,1);
  now+=3000;clientFeatures(room,other,['rematch-v1','classic-ffa-v1'],now);
  assert.equal(room.rematch.status,'countdown');advanceRoom(room,now+3000);assert.equal(room.matchNumber,2);
});

test('Partidas completas: turnos de 0/1/2 pasos, puntuación exacta, aseguramiento irreversible y revancha unánime',()=>{
  for(let seed=0;seed<12;seed++){
    let room=classicFfaRoom();const lengths=new Set();
    while(room.status==='active'){
      const game=room.classic.game,actor=game.currentActor,secured=structuredClone(game.secured),path=[...room.classic.draft.path];
      const paths=[path];
      for(const to of availableMoves(game,actor,path[0])){
        paths.push([...path,to]);for(const end of availableMoves(game,actor,to))paths.push([...path,to,end]);
      }
      const preferred=paths.filter(p=>p.length===game.moves%3+1);
      const turns=(preferred.length?preferred:paths).flatMap(p=>wallOptions(game,p.at(-1)).map(to=>({path:p,to})));
      const turn=turns[(game.moves*17+seed*13+3)%turns.length];lengths.add(turn.path.length-1);
      for(const to of turn.path.slice(1))command(room,'classic.step',to);
      command(room,'classic.wall',turn.to);
      const after=room.classic.game;
      assert.deepEqual(after.secured,{...after.secured,...secured});
      for(const [team,record] of Object.entries(secured)){
        const region=ffaTerritory(after).components.find(r=>r.type===team);
        assert.deepEqual(region.cells,record.cells);assert.equal(ffaTerritory(after).score[team],record.score);
      }
      assert.ok(after.moves<=84);
      room=JSON.parse(JSON.stringify(room));
    }
    assert.equal(room.outcome.reason,'territory');assert.equal(ffaTerritory(room.classic.game).score.mixed,0);
    assert.equal(Object.values(room.outcome.score).reduce((a,b)=>a+b),49);
    assert.equal(lengths.size,3);
    const old=structuredClone(room.outcome);
    applyCommand(room,room.hostId,{type:'rematch.propose',params:{matchId:matchId(room)}},3000);
    for(const p of seated(room).slice(1))applyCommand(room,p.id,{type:'rematch.respond',params:{matchId:matchId(room),proposalId:room.rematch.id,accept:true}},3000);
    assert.equal(room.status,'finished');assert.equal(room.rematch.status,'countdown');advanceRoom(room,6000);
    assert.equal(room.status,'active');assert.equal(room.matchNumber,2);assert.deepEqual(room.classic.game,initialClassicFfa());
    assert.deepEqual(room.previousResults[0].outcome,old);assert.deepEqual(room.clock.remainingMs,{A:300000,B:300000,C:300000,D:300000});
    assert.throws(()=>applyCommand(room,room.hostId,{type:'classic.wall',params:{to:1,matchId:room.code+':1'}},6000),e=>e.code==='MATCH');
  }
});

test('Acciones ilegales no modifican el estado; un actor ajeno no puede mover ni construir',()=>{
  const room=classicFfaRoom(),before=JSON.stringify(room.classic);
  for(const to of [-1,49,12,40,8])assert.throws(()=>command(room,'classic.step',to));
  assert.throws(()=>command(room,'classic.wall',48));assert.throws(()=>command(room,'classic.select','A'));
  assert.throws(()=>command(room,'classic.wall',1,3000,seated(room)[1].id));
  assert.equal(JSON.stringify(room.classic),before);
});
