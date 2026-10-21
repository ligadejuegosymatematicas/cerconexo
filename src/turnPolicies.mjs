/** Políticas locales. No calculan caminos, territorios ni puntuación. */
export const PIECE_TURNS='piece';
export const TEAM_TURNS='team';
export const turnMode=state=>state.turnMode??PIECE_TURNS;
export const validTurnMode=mode=>mode===PIECE_TURNS||mode===TEAM_TURNS;

export function policyActors(state,active){
  if(state.over)return [];
  if(turnMode(state)===PIECE_TURNS)return active.has(state.currentActor)?[state.currentActor]:[];
  return state.pieces.filter(p=>p.team===state.turnTeam&&active.has(p.id)).map(p=>p.id);
}
export function policyActor(state,team,ids,active){
  if(turnMode(state)===TEAM_TURNS){
    const choices=ids.filter(id=>active.has(id));
    return choices.length===1?choices[0]:null;
  }
  const last=state.lastActed[team];
  let index=last===null?-1:ids.indexOf(last);
  for(let attempts=0;attempts<ids.length;attempts++){
    index=(index+1)%ids.length;
    if(active.has(ids[index]))return ids[index];
  }
  return null;
}
