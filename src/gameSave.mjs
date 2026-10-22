import {verifyState} from './engine.mjs';
import {beginDraft,committedDraft,validDraft} from './turnDraft.mjs';

export const GAME_SAVE_KEY='wallgo-league-v2';
// Una única envoltura atómica. El formato oficial v2 no cambia.
export function encodeGameSave(game,draft){
  if(!verifyState(game))throw new Error('Estado oficial no válido.');
  const envelope={game};
  if(committedDraft(draft)){
    if(!validDraft(game,draft))throw new Error('Recorrido ejecutado no válido.');
    envelope.pendingTurn={version:1,base:JSON.stringify(game),actor:draft.actor,path:[...draft.path],steps:draft.path.length-1};
  }
  return JSON.stringify(envelope);
}
export function decodeGameSave(raw){
  let envelope;
  try{
    envelope=JSON.parse(raw);
    if(!envelope||!verifyState(envelope.game))return {game:null,recovered:false};
  }catch{return {game:null,recovered:false};}
  const game=envelope.game,draft=beginDraft(game);
  if(!Object.hasOwn(envelope,'pendingTurn'))return {game,draft,recovered:false};
  const pending=envelope.pendingTurn;
  if(pending&&pending.version===1&&pending.base===JSON.stringify(game)&&
    Array.isArray(pending.path)&&pending.path.length>=2&&pending.steps===pending.path.length-1&&validDraft(game,pending)){
    return {game,draft:{actor:pending.actor,path:[...pending.path]},recovered:false};
  }
  // No ejecutar datos dañados. Conservar íntegramente la partida oficial válida.
  return {game,draft,recovered:true};
}
export function writeGameSave(storage,game,draft){
  storage.setItem(GAME_SAVE_KEY,encodeGameSave(game,draft));
}
