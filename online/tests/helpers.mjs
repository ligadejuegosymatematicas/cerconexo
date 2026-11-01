import { createRoom, joinRoom, presence, applyCommand, advanceRoom, seated } from '../src/room-model.mjs';
export function fixture(mode = 'classic', policy = 'piece') {
  const room = createRoom({ code: 'ABCDEFGH23', name: 'Ana', mode, policy, tokenHash: 'hash-0', probeOnly: true }, 0);
  presence(room, room.hostId, true, 0);
  for (let i = 1; i < 4; i++) {
    const id = joinRoom(room, { name: ['Ana', 'Beto', 'Carla', 'Diego'][i], tokenHash: `hash-${i}` }, 0);
    presence(room, id, true, 0);
    applyCommand(room, room.hostId, { type: 'admit', params: { playerId: id, seat: room.config.seats[i] } }, 0);
  }
  for (const player of seated(room)) applyCommand(room, player.id, { type: 'ready', params: { ready: true } }, 0);
  return room;
}
export function active(mode = 'classic', policy = 'piece') {
  const room = fixture(mode, policy);
  applyCommand(room, room.hostId, { type: 'start' }, 0); advanceRoom(room, 3000); return room;
}
export function command(room, id, type, now, params = {}) { advanceRoom(room, now); return applyCommand(room, id, { type, params }, now); }
export function offline(room, id, now) { advanceRoom(room, now); presence(room, id, false, now); }
export function online(room, id, now) { advanceRoom(room, now); presence(room, id, true, now); }
