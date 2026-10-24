import {createArena,applyArena} from './engine.mjs';

export const ARENA_SAVE_KEY='cerconexo-arena-m3a-v1';
export const ARENA_SAVE_FORMAT='cerconexo-arena-journal';

/** Se reconstruye cada acción con el motor: no se confía en posiciones o decisiones guardadas. */
export function replayArenaSave(raw){
  try{
    if(typeof raw!=='string'||raw.length>2000000)throw new Error('Tamaño de guardado inválido.');
    const data=JSON.parse(raw);
    if(data.format!==ARENA_SAVE_FORMAT||data.version!==1||!data.setup||!Array.isArray(data.commands)||data.commands.length>12000)throw new Error('Formato de Arena no reconocido.');
    let game=createArena(data.setup);
    for(const command of data.commands)game=applyArena(game,command);
    return {ok:true,game,setup:data.setup,commands:data.commands};
  }catch(e){return {ok:false,error:`No se pudo validar el guardado de Arena: ${e.message}`};}
}

export class ArenaSession {
  constructor(storage,setup={}){
    this.storage=storage;this.game=createArena(setup);
    this.setup={mode:this.game.mode,policy:this.game.policy,experiment:structuredClone(this.game.experiment)};
    this.commands=[];
  }
  static restore(storage,raw){
    const replay=replayArenaSave(raw);
    if(!replay.ok)return replay;
    const session=Object.create(ArenaSession.prototype);
    Object.assign(session,{storage,setup:replay.setup,commands:replay.commands,game:replay.game});
    return {ok:true,session};
  }
  encode(commands=this.commands){return JSON.stringify({format:ARENA_SAVE_FORMAT,version:1,setup:this.setup,commands});}
  save(){this.storage.setItem(ARENA_SAVE_KEY,this.encode());}
  dispatch(action){
    const game=applyArena(this.game,action),commands=[...this.commands,structuredClone(action)];
    // Una sola escritura, antes de presentar el efecto. Si falla, no se confirma la acción.
    this.storage.setItem(ARENA_SAVE_KEY,this.encode(commands));
    this.game=game;this.commands=commands;return game;
  }
}
