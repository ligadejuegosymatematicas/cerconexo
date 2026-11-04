import {createArena,applyArena} from '../../arena/src/engine.mjs';
import {analyzeArena} from '../../arena/src/geometry.mjs';
import {Fault,requireThat,participantCount} from './protocol.mjs';

export const ARENA_RULESET='arena-duo-online-v1';
export const ARENA_UPDATE='Actualiza esta página para jugar Arena. Se conservará tu acceso.';
export const isArenaRoom=room=>room.config.ruleset===ARENA_RULESET;
export function arenaConfiguration(config){
  requireThat(config.mode==='arena-duo'&&config.policy==='piece'&&participantCount(config)===4,'CONFIG','Arena Online admite por ahora 2 vs. 2, cuatro personas y turnos por ficha.');
  return{...config,ruleset:ARENA_RULESET};
}
export const createOnlineArena=()=>({game:createArena({mode:'duo',policy:'piece'})});
export function arenaDecision(room){
  const g=room.arena.game;if(g.over)return null;
  const pending=g.pending,actor=pending?.owner??g.turn.actor,team=pending?.team??g.turn.team;
  const eligible=Object.values(room.participants).filter(p=>p.admitted&&!p.rejected&&p.seat===actor).map(p=>p.id);
  requireThat(actor&&eligible.length===1,'ARENA_STATE','No se pudo identificar al propietario de la decisión.',409);
  const key=pending?JSON.stringify([g.completedTurns,pending,g.inventories[pending.owner].map(i=>i.id),g.resolution?.pickup?.id??null]):`${g.completedTurns}:${actor}`;
  return{kind:pending?'arena-discard':'arena',team,actor,eligible,key};
}
export const arenaView=room=>({game:room.arena.game,territory:analyzeArena(room.arena.game)});
export function applyOnlineArena(room,seat,action){
  requireThat(isArenaRoom(room)&&room.status==='active','ARENA','Arena no está activa.',409);
  requireThat(action&&typeof action==='object'&&!Array.isArray(action),'PARAMS','Indica una acción válida.');
  const keys={move:['type','to'],wall:['type','to'],jump:['type','to','power'],demolition:['type','to','power'],extraWall:['type','to','power'],discard:['type','owner','power']}[action.type];
  requireThat(Array.isArray(keys)&&Object.keys(action).length===keys.length&&Object.keys(action).every(k=>keys.includes(k)),'PARAMS','Acción o parámetros no admitidos.');
  if(keys.includes('to'))requireThat(Number.isInteger(action.to)&&action.to>=0&&action.to<81,'PARAMS','Casilla no válida.');
  if(keys.includes('power'))requireThat(typeof action.power==='string'&&action.power.length<=80,'PARAMS','Poder no válido.');
  const game=room.arena.game;
  if(action.type==='discard')requireThat(game.pending&&action.owner===game.pending.owner&&seat===game.pending.owner,'DECISION','Solo el propietario puede descartar.',403);
  else requireThat(!game.pending&&seat===game.turn.actor,'DECISION','Solo puedes actuar con tu ficha en su turno.',403);
  try{room.arena={game:applyArena(game,action)};}catch(e){if(e instanceof Fault)throw e;throw new Fault('ILLEGAL_ACTION',e.message);}
  return{finished:room.arena.game.over};
}
export function arenaOutcome(room,timedOutTeam=null){
  const game=room.arena.game,score=analyzeArena(game).score;
  if(timedOutTeam)return{reason:'timeout',timedOutTeam,losers:[timedOutTeam],winners:game.teams.filter(t=>t!==timedOutTeam),score};
  requireThat(game.over,'RESULT','La partida continúa.',409);return{reason:'territory',winners:[...game.winners],score};
}
