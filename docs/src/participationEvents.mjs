import {activeIds} from './engine.mjs';

// La participación siempre procede de las componentes mixtas del motor.
export function activeFromComponents(components){
  return new Set(components.filter(component=>component.type==='mixed').flatMap(component=>component.ids));
}
export function deriveParticipationEvents(before,after,{beforeActive=activeIds(before),afterActive=activeIds(after)}={}){
  const group=active=>({A:before.pieces.filter(p=>p.team==='A'&&active.has(p.id)).map(p=>p.id),B:before.pieces.filter(p=>p.team==='B'&&active.has(p.id)).map(p=>p.id)});
  const previous=group(beforeActive),current=group(afterActive);
  const secured=before.pieces.filter(p=>beforeActive.has(p.id)&&!afterActive.has(p.id)).map(p=>({id:p.id,team:p.team}));
  const redistributions=after.over?[]:['A','B'].filter(team=>previous[team].length===2&&current[team].length===1)
    .map(team=>({team,player:current[team][0],secured:secured.filter(p=>p.team===team).map(p=>p.id)}));
  const changed=secured.length>0&&!after.over&&(previous.A.length!==current.A.length||previous.B.length!==current.B.length);
  const matchup=changed&&current.A.length===1&&current.B.length===1?'last':changed&&[current.A.length,current.B.length].sort().join(',')==='1,2'?'continues':null;
  return {secured,before:previous,after:current,redistributions,matchup,gameEnded:after.over};
}
export function participationMessage(event){
  if(event.gameEnded||!event.secured.length)return null;
  const ids=event.secured.map(p=>p.id),join=values=>values.join(' y ');
  const title=event.matchup==='last'?'¡ÚLTIMA DISPUTA!':event.matchup==='continues'?'CONTINÚA LA DISPUTA':`${join(ids)} ${ids.length===1?'ASEGURÓ':'ASEGURARON'} SU TERRITORIO`;
  const body=event.matchup==='last'?`${join(event.after.A)} vs. ${join(event.after.B)}`:event.matchup==='continues'?`${join(event.after.A)} frente a ${join(event.after.B)}`:join([...event.after.A,...event.after.B]);
  const detail=event.redistributions.length===1?`${join(ids)} ${ids.length===1?'asegurado':'asegurados'} · ${event.redistributions[0].player} juega los turnos de ${event.redistributions[0].team}`:`${join(ids)} asegurados · Continúan ${join([...event.after.A,...event.after.B])}`;
  const announcement=`${join(ids)} ${ids.length===1?'aseguró':'aseguraron'} su territorio. ${title}. ${body}. ${event.redistributions.map(r=>`${r.player} jugará todos los turnos del equipo ${r.team}.`).join(' ')}`;
  return {title,body,detail,announcement};
}
