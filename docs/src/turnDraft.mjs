import {legalActors,pieceById,availableMoves,wallOptions} from './engine.mjs';

// Turno incompleto: no cambia el estado oficial, pero sus pasos son definitivos.
export const committedDraft=draft=>draft.path.length>1;
export function beginDraft(game){
  const actor=game.over?null:game.currentActor;
  return {actor,path:actor?[pieceById(game,actor).pos]:[]};
}
export function selectDraft(game,draft,actor){
  if(!legalActors(game).includes(actor))throw new Error('Esta ficha no puede actuar en este turno.');
  if(draft.actor===actor)return draft;
  if(committedDraft(draft))throw new Error('La ficha que comenzó a moverse debe completar el turno.');
  return {actor,path:[pieceById(game,actor).pos]};
}
export function validDraft(game,draft){
  if(!draft||!Array.isArray(draft.path)||!legalActors(game).includes(draft.actor))return false;
  if(draft.path.length<1||draft.path.length>3||!draft.path.every(Number.isInteger))return false;
  if(draft.path[0]!==pieceById(game,draft.actor).pos)return false;
  for(let i=1;i<draft.path.length;i++)if(!availableMoves(game,draft.actor,draft.path[i-1]).includes(draft.path[i]))return false;
  return wallOptions(game,draft.path.at(-1)).length>0;
}
export function advanceDraft(game,draft,to){
  if(!validDraft(game,draft)||draft.path.length>=3||!availableMoves(game,draft.actor,draft.path.at(-1)).includes(to))throw new Error('Paso no permitido.');
  return {actor:draft.actor,path:[...draft.path,to]};
}
