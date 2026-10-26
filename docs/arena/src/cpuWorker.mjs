import {chooseArenaCpu} from './cpuStrategy.mjs';
self.onmessage=async({data})=>{
  try{self.postMessage({id:data.id,revision:data.game.revision,...await chooseArenaCpu(data.game,data.options)});}
  catch{self.postMessage({id:data.id,revision:data.game.revision,error:true});}
};
