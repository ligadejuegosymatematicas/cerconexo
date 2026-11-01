import test from 'node:test';
import assert from 'node:assert/strict';
import { active, offline, online } from './helpers.mjs';
import { advanceRoom, leaveView, publicRoom } from '../src/room-model.mjs';
test('Inicio no concede gracia, no abandona la ficha y no restaura tiempo',()=>{
  const room=active(),id=room.hostId,game=structuredClone(room.classic??room.probe);
  leaveView(room,id,4000);assert.equal(room.clock.grace,null);assert.equal(room.clock.players[id].usedMs,0);
  advanceRoom(room,7000);assert.equal(room.clock.remainingMs.A,476000);assert.deepEqual(room.classic??room.probe,game);assert.equal(room.participants[id].admitted,true);
  const incident=room.clock.players[id].incident;leaveView(room,id,7000);assert.equal(room.clock.players[id].incident,incident);
  online(room,id,8000);offline(room,id,9000);assert.equal(room.clock.grace.until,39000);assert.equal(publicRoom(room,id,9000).features.viewAway,true);
});
test('Salir a Inicio repetidamente no renueva una ventana ni devuelve presupuesto de gracia',()=>{
  const room=active(),id=room.hostId;
  offline(room,id,4000);advanceRoom(room,14000);assert.equal(room.clock.players[id].usedMs,10000);
  // A delayed view-away from an already lost connection preserves the real incident.
  leaveView(room,id,15000);assert.equal(room.clock.grace.until,34000);assert.equal(room.clock.players[id].usedMs,11000);
  online(room,id,16000);const used=room.clock.players[id].usedMs;
  for(let now=17000;now<=19000;now+=1000){
    leaveView(room,id,now);leaveView(room,id,now);assert.equal(room.clock.grace,null);assert.equal(room.clock.players[id].usedMs,used);online(room,id,now+100);
  }
  offline(room,id,20000);advanceRoom(room,70000);assert.ok(room.clock.players[id].usedMs<=60000);
  const consumed=room.clock.players[id].usedMs;online(room,id,71000);leaveView(room,id,72000);advanceRoom(room,75000);
  assert.equal(room.clock.players[id].usedMs,consumed);assert.equal(room.clock.grace,null);
});
