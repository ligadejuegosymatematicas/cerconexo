import {verifyState} from './engine.mjs';
import {beginDraft,committedDraft,validDraft} from './turnDraft.mjs';
import {validCpuControl,validCpuPlan} from './cpuSession.mjs';

export const GAME_SAVE_KEY='wallgo-league-v2';
// Una única envoltura atómica. El formato oficial v2 no cambia.
export function encodeGameSave(game,draft,session={}){
  if(!verifyState(game))throw new Error('Estado oficial no válido.');
  const envelope={game};
  if(committedDraft(draft)){
    if(!validDraft(game,draft))throw new Error('Recorrido ejecutado no válido.');
    envelope.pendingTurn={version:1,base:JSON.stringify(game),actor:draft.actor,path:[...draft.path],steps:draft.path.length-1};
  }
  if(session.control){
    if(!validCpuControl(session.control))throw new Error('Configuración CPU no válida.');
    envelope.control={...session.control};
    if(session.cpuPlan){
      if(!validCpuPlan(game,draft,session.control,session.cpuPlan))throw new Error('Plan CPU no válido.');
      envelope.cpuPlan=structuredClone(session.cpuPlan);
    }
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
  const sessionResult=result=>{
    if(Object.hasOwn(envelope,'control')){
      if(validCpuControl(envelope.control)){
        result.control={...envelope.control};
        if(envelope.cpuPlan){
          if(validCpuPlan(game,result.draft,result.control,envelope.cpuPlan))result.cpuPlan=structuredClone(envelope.cpuPlan);
          else result.recovered=true;
        }
      }else result.recovered=true;
    }else if(envelope.cpuPlan)result.recovered=true;
    return result;
  };
  if(!Object.hasOwn(envelope,'pendingTurn'))return sessionResult({game,draft,recovered:false});
  const pending=envelope.pendingTurn;
  if(pending&&pending.version===1&&pending.base===JSON.stringify(game)&&
    Array.isArray(pending.path)&&pending.path.length>=2&&pending.steps===pending.path.length-1&&validDraft(game,pending)){
    return sessionResult({game,draft:{actor:pending.actor,path:[...pending.path]},recovered:false});
  }
  // No ejecutar datos dañados. Conservar íntegramente la partida oficial válida.
  return sessionResult({game,draft,recovered:true});
}
export function writeGameSave(storage,game,draft,session){
  storage.setItem(GAME_SAVE_KEY,encodeGameSave(game,draft,session));
}
