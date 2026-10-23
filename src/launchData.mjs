import {decodeGameSave,GAME_SAVE_KEY} from './gameSave.mjs';
import {replayArenaSave,ARENA_SAVE_KEY} from '../arena/src/session.mjs';

// Consulta pura: solo los validadores de cada modalidad interpretan sus guardados.
// Nunca migra, escribe ni inicia una partida al mostrar la portada.
export function launchState(storage){
  const result={};
  for(const [mode,key,decode] of [['classic',GAME_SAVE_KEY,decodeGameSave],['arena',ARENA_SAVE_KEY,replayArenaSave]]){
    try{
      const raw=storage.getItem(key);
      if(!raw){result[mode]={status:'new'};continue;}
      const saved=decode(raw);
      result[mode]=saved.game?{status:saved.game.over?'finished':'pending'}:{status:'invalid'};
    }catch{result[mode]={status:'unavailable'};}
  }
  return result;
}

export function launchLinks(mode,status){
  const path=mode==='arena'?'./arena/':'./clasico/';
  return {enter:status==='new'?path+'?new=1':path+'?continue=1',fresh:path+'?new=1',
    label:status==='pending'?'Continuar':status==='finished'?'Ver resultado':status==='invalid'?'Revisar partida':'Jugar',
    showNew:status==='pending'||status==='finished'||status==='invalid'};
}
