import {legalActors,pieceById} from './engine.mjs';

// Selección y recorrido de consulta: nunca mutan ni guardan el estado oficial.
export function beginDraft(game){
  const actor=game.over?null:game.currentActor;
  return {actor,path:actor?[pieceById(game,actor).pos]:[]};
}
export function selectDraft(game,draft,actor){
  if(!legalActors(game).includes(actor))throw new Error('Esta ficha no puede actuar en este turno.');
  if(draft.actor===actor)return draft;
  return {actor,path:[pieceById(game,actor).pos]};
}
