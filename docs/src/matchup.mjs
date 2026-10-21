import {activeIds} from './engine.mjs';

// Estado continuo derivado del motor; los avisos no determinan la participación.
export function matchupPresentation(game,active=activeIds(game)){
  if(game.over)return null;
  const teams=Object.fromEntries(['A','B'].map(team=>[team,game.pieces.filter(p=>p.team===team&&active.has(p.id)).map(p=>p.id)]));
  const last=teams.A.length===1&&teams.B.length===1;
  return {teams,last,label:`${teams.A.length} vs. ${teams.B.length}${last?' · Última disputa':''}`,
    players:`${teams.A.join(' y ')} vs. ${teams.B.join(' y ')}`};
}
export function recentParticipationMessage(event){
  if(event.gameEnded||!event.secured.length)return null;
  const ids=event.secured.map(p=>p.id).join(' y '),verb=event.secured.length===1?'aseguró':'aseguraron';
  const secured=`${ids} ${verb} su territorio.`;
  const redistribution=event.redistributions.length===1?
    `${event.redistributions[0].player} jugará todos los turnos del equipo ${event.redistributions[0].team}.`:
    event.redistributions.map((r,i)=>`${r.player} ${i?'los':'jugará los'} turnos de ${r.team}`).join(' y ')+'.';
  return `${secured}${event.redistributions.length?' '+redistribution:''}`;
}

// Jerarquía del aviso, derivada del mismo acontecimiento (sin reglas de turnos).
export function recentParticipationPresentation(event){
  const announcement=recentParticipationMessage(event);if(!announcement)return null;
  return {
    heading:`✓ ${event.secured.map(p=>p.id).join(' y ')} ${event.secured.length===1?'aseguró su territorio':'aseguraron territorio'}`.toLocaleUpperCase('es'),
    detail:event.redistributions.map(r=>`${r.player} jugará todos los turnos del equipo ${r.team}.`).join(' '),
    team:new Set(event.secured.map(p=>p.team)).size===1?event.secured[0].team:'both',announcement
  };
}
