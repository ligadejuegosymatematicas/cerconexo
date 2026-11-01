import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {configuration} from '../src/protocol.mjs';
import {retiredClassicConfiguration} from '../configuration-rules.mjs';
import {applyCommand,advanceRoom,publicRoom,presence} from '../src/room-model.mjs';
const fixture=async name=>structuredClone(JSON.parse(await readFile(new URL('./fixtures/legacy-classic-'+name+'.json',import.meta.url),'utf8')));
test('Solo se retira cuatro personas/equipo de Clásico; las otras modalidades y la lectura antigua se conservan',()=>{
  for(const players of[2,4])for(const policy of['piece','team'])assert.equal(retiredClassicConfiguration(configuration('classic',policy,players)),players===4&&policy==='team');
  assert.equal(retiredClassicConfiguration(configuration('arena-duo','team',4)),false);assert.equal(retiredClassicConfiguration(configuration('arena-ffa','piece',4)),false);
});
test('Lobby antiguo conserva participantes y acceso, pero no comienza ni transforma su tablero',async()=>{
  const {room,ids}=await fixture('lobby'),before=structuredClone(room.classic),participants=Object.keys(room.participants);
  assert.throws(()=>applyCommand(room,ids[0],{type:'start'},1000),{code:'CONFIG_RETIRED'});
  for(const id of ids){const view=publicRoom(room,id,1000);assert.equal(view.self.id,id);assert.equal(view.configurationRetired,true);}
  assert.deepEqual(room.classic,before);assert.deepEqual(Object.keys(room.participants),participants);assert.equal(room.status,'lobby');
});
test('Una cuenta atrás antigua aún no iniciada vuelve a lobby sin consumir reloj',async()=>{
  const {room}=await fixture('lobby'),before=structuredClone(room.classic);room.status='countdown';room.startsAt=3000;advanceRoom(room,5000);
  assert.equal(room.status,'lobby');assert.equal(room.clock.owner,null);assert.deepEqual(room.clock.remainingMs,{A:480000,B:480000});assert.deepEqual(room.classic,before);
});
test('Partida antigua mantiene control, movimiento parcial y reloj al recuperarse',async()=>{
  const {room,ids}=await fixture('active');applyCommand(room,ids[0],{type:'classic.select',params:{actor:'A1',matchId:room.code+':1'}},3100);
  applyCommand(room,ids[0],{type:'classic.step',params:{to:9,matchId:room.code+':1'}},3200);const board=structuredClone(room.classic);
  advanceRoom(room,3300);presence(room,ids[0],false,3300);const restored=JSON.parse(JSON.stringify(room));advanceRoom(restored,4300);presence(restored,ids[0],true,4300);
  assert.deepEqual(restored.classic,board);assert.equal(restored.config.policy,'team');assert.ok(restored.clock.remainingMs.A<=room.clock.remainingMs.A);
});
test('No se inicia una revancha retirada ya aceptada antes de actualizar el servidor',async()=>{
  const {room,ids}=await fixture('active');advanceRoom(room,483000);const before=structuredClone({classic:room.classic,outcome:room.outcome,clock:room.clock});
  room.rematch={id:'old-proposal',matchId:room.code+':1',status:'countdown',votes:Object.fromEntries(ids.map(id=>[id,true])),proposedAt:484000,expiresAt:604000,startsAt:487000};
  advanceRoom(room,488000);assert.equal(room.status,'finished');assert.equal(room.matchNumber,1);assert.equal(room.rematch.status,'retired');assert.equal(publicRoom(room,ids[0],488000).features.rematch,false);
  assert.deepEqual({classic:room.classic,outcome:room.outcome,clock:room.clock},before);
});
