import {legalActors,pieceById,availableMoves,wallOptions,wallKey} from './engine.mjs';

// Enumeración de jugadas completas: la legalidad procede exclusivamente del motor.
// Un prefijo ya ejecutado nunca se acorta ni cambia de ficha.
export function cpuLegalTurns(game,{prefix=null,deduplicate=false}={}){
  if(game.over)return [];
  const output=[],seen=new Set();
  const visit=(actor,path)=>{
    const end=path.at(-1);
    for(const to of wallOptions(game,end)){
      const key=`${actor}:${end}:${wallKey(end,to)}`;
      if(deduplicate&&seen.has(key))continue;
      seen.add(key);output.push({actor,path:[...path],to});
    }
    if(path.length<3)for(const to of availableMoves(game,actor,end))visit(actor,[...path,to]);
  };
  for(const actor of legalActors(game)){
    if(prefix?.path?.length>1&&prefix.actor!==actor)continue;
    const path=prefix?.path?.length>1?[...prefix.path]:[pieceById(game,actor).pos];
    if(path[0]!==pieceById(game,actor).pos||path.length>3||path.some((cell,i)=>i>0&&!availableMoves(game,actor,path[i-1]).includes(cell)))continue;
    visit(actor,path);
  }
  return output;
}
