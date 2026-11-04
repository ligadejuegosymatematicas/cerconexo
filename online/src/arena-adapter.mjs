import {createArena,applyArena} from '../../arena/src/engine.mjs';
import {analyzeArena} from '../../arena/src/geometry.mjs';
import {Fault,requireThat,participantCount} from './protocol.mjs';
import {ARENA_FFA_RULESET,isArenaFfaRoom,ffaOutcome} from './arena-timeout.mjs';

export const ARENA_RULESET='arena-duo-online-v1';
export const ARENA_UPDATE='Actualiza esta página para jugar Arena. Se conservará tu acceso.';
export const isArenaRoom=room=>room.config.ruleset===ARENA_RULESET || isArenaFfaRoom(room);
export function arenaConfiguration(config){
  const count = participantCount(config);
  const ffa = config.mode === 'arena-ffa';
  requireThat(ffa ? count === 4 && config.policy === 'piece'
    : config.mode === 'arena-duo' && (count === 2 || count === 4 && config.policy === 'piece'),
    'CONFIG', 'Configuración de Arena Online no admitida.');
  return {...config, ruleset: ffa ? ARENA_FFA_RULESET : ARENA_RULESET};
}
export const createOnlineArena = config => ({
  game: createArena({mode: config.mode === 'arena-ffa' ? 'ffa' : 'duo', policy: config.policy}),
  ...(config.mode === 'arena-ffa' ? {eliminations: []} : {}),
});
export const arenaOneVsOne = config => config.mode === 'arena-duo' && participantCount(config) === 2;

export function arenaControlledPieces(room, seat) {
  return room.arena.game.pieces.filter(piece => arenaOneVsOne(room.config) ? piece.team === seat : piece.id === seat).map(piece => piece.id);
}

export function arenaDecision(room) {
  const game = room.arena.game;
  if (game.over) return null;
  const {pending, turn} = game;
  const team = pending?.team ?? turn.team;
  // Selection is part of the same team decision. Keep its clock and notice key stable.
  const actor = pending?.owner ?? (game.policy === 'piece' ? turn.actor : null);
  const seat = arenaOneVsOne(room.config) ? team : actor;
  const eligible = Object.values(room.participants).filter(p => p.admitted && !p.rejected && p.seat === seat).map(p => p.id);
  requireThat(seat && eligible.length === 1, 'ARENA_STATE', 'No se pudo identificar al propietario de la decisión.', 409);
  const key = pending
    ? JSON.stringify([game.completedTurns, pending, game.inventories[pending.owner].map(item => item.id), game.resolution?.pickup?.id ?? null])
    : `${game.completedTurns}:${actor ?? team}`;
  return {kind: pending ? 'arena-discard' : 'arena', team, actor, eligible, key, ...(game.policy === 'team' && !pending ? {selecting: !turn.actor} : {})};
}
export const arenaView=room=>({game:room.arena.game,territory:analyzeArena(room.arena.game),...(isArenaFfaRoom(room)?{eliminations:room.arena.eliminations}:{})});
export function applyOnlineArena(room,seat,action){
  requireThat(isArenaRoom(room)&&room.status==='active','ARENA','Arena no está activa.',409);
  requireThat(action&&typeof action==='object'&&!Array.isArray(action),'PARAMS','Indica una acción válida.');
  const keys={select:['type','actor'],move:['type','to'],wall:['type','to'],jump:['type','to','power'],demolition:['type','to','power'],extraWall:['type','to','power'],discard:['type','owner','power']}[action.type];
  requireThat(Array.isArray(keys)&&Object.keys(action).length===keys.length&&Object.keys(action).every(k=>keys.includes(k)),'PARAMS','Acción o parámetros no admitidos.');
  if(keys.includes('to'))requireThat(Number.isInteger(action.to)&&action.to>=0&&action.to<81,'PARAMS','Casilla no válida.');
  if(keys.includes('power'))requireThat(typeof action.power==='string'&&action.power.length<=80,'PARAMS','Poder no válido.');
  const game = room.arena.game, pending = game.pending;
  const owns = arenaOneVsOne(room.config)
    ? seat === (pending?.team ?? game.turn.team)
    : seat === (pending?.owner ?? game.turn.actor);
  if (action.type === 'discard') {
    requireThat(owns && pending && action.owner === pending.owner, 'DECISION', 'Solo el propietario puede descartar.', 403);
  } else {
    requireThat(owns && !pending, 'DECISION', 'Solo puedes actuar en la decisión de tu equipo.', 403);
    if (action.type === 'select') {
      requireThat(arenaControlledPieces(room, seat).includes(action.actor), 'DECISION', 'Selecciona una ficha de tu equipo.', 403);
    }
  }
  try{room.arena={...room.arena,game:applyArena(game,action)};}catch(e){if(e instanceof Fault)throw e;throw new Fault('ILLEGAL_ACTION',e.message);}
  return{finished:room.arena.game.over};
}
export function arenaOutcome(room,timedOutTeam=null){
  if (isArenaFfaRoom(room)) return ffaOutcome(room);
  const game=room.arena.game,score=analyzeArena(game).score;
  if(timedOutTeam)return{reason:'timeout',timedOutTeam,losers:[timedOutTeam],winners:game.teams.filter(t=>t!==timedOutTeam),score};
  requireThat(game.over,'RESULT','La partida continúa.',409);return{reason:'territory',winners:[...game.winners],score};
}
