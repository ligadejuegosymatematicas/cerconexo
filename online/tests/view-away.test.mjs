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
