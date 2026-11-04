import {createRoom,joinRoom,presence,clientFeatures,applyCommand,advanceRoom,seated} from '../src/room-model.mjs';
import {matchId} from '../src/rematch.mjs';
export function arenaRoom({players=4,policy='piece'}={}){
  const r=createRoom({code:'ABCDEFGH23',name:'Ana',mode:'arena-duo',policy,players,arenaOnline:true,tokenHash:'host'},0);
  for(let i=0;i<players;i++){
    const id=i?joinRoom(r,{name:'Persona '+i,tokenHash:'hash-'+i},0):r.hostId;
    presence(r,id,true,0);clientFeatures(r,id,['rematch-v1',players===2?'arena-1v1-v1':'arena-duo-v1'],0);
    if(i)applyCommand(r,r.hostId,{type:'admit',params:{playerId:id,seat:r.config.seats[i]}},0);
  }
  for(const p of seated(r))applyCommand(r,p.id,{type:'ready',params:{ready:true}},0);
  applyCommand(r,r.hostId,{type:'start'},0);advanceRoom(r,3000);return r;
}
export function arenaCommand(room,action,now=3000,id=room.decision.eligible[0]){advanceRoom(room,now);return applyCommand(room,id,{type:'arena.action',params:{matchId:matchId(room),action}},now);}
