import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../../',import.meta.url)),base='0eb4d274ddf109df07daa4d57176f99fc7196be8';
export async function legacySource(){
  const directory=path.join(root,'online/.state/ux-legacy-source');
  const files=execFileSync('git',['ls-tree','-r','--name-only',base,'--','online/src','src/engine.mjs','src/turnPolicies.mjs','src/turnDraft.mjs','arena/src/engine.mjs','arena/src/config.mjs','arena/src/geometry.mjs'],{cwd:root,windowsHide:true}).toString().trim().split(/\r?\n/);
  for(const name of files){const target=path.join(directory,name);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,execFileSync('git',['show',base+':'+name],{cwd:root,windowsHide:true}));}
  return{worker:path.join(directory,'online/src/worker.mjs'),model:await import(pathToFileURL(path.join(directory,'online/src/room-model.mjs')).href),base};
}
if(process.argv.includes('--fixtures')){
  const {model:m}=await legacySource(),room=m.createRoom({code:'ABCDEFGH23',name:'Ana',mode:'classic',policy:'team',players:4,tokenHash:'host'},0),ids=[room.hostId];m.presence(room,room.hostId,true,0);
  for(let i=1;i<4;i++){const id=m.joinRoom(room,{name:'Persona '+(i+1),tokenHash:'token-'+i},0);ids.push(id);m.presence(room,id,true,0);m.applyCommand(room,ids[0],{type:'admit',params:{playerId:id,seat:room.config.seats[i]}},0);}
  for(const id of ids){m.clientFeatures(room,id,['rematch-v1','classic-config-v2'],0);m.applyCommand(room,id,{type:'ready',params:{ready:true}},0);}
  const directory=new URL('../tests/fixtures/',import.meta.url);await writeFile(new URL('legacy-classic-lobby.json',directory),JSON.stringify({base,room,ids},null,2)+'\n');
  m.applyCommand(room,ids[0],{type:'start'},0);m.advanceRoom(room,3000);await writeFile(new URL('legacy-classic-active.json',directory),JSON.stringify({base,room,ids},null,2)+'\n');
  console.log('Fixtures creadas con el modelo original 0eb4d27; sin credenciales reales.');
}
