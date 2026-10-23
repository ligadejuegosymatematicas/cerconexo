import {chooseCpuTurn} from './cpuSearch.mjs';

self.onmessage=event=>{
  const {id,game,options}=event.data;
  try{self.postMessage({id,result:chooseCpuTurn(game,options)});}
  catch(error){self.postMessage({id,error:String(error.message||error)});}
};
