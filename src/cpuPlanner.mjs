import {chooseCpuTurnAsync} from './cpuSearch.mjs';
import {validateTurn} from './engine.mjs';
import {cpuFollowsPrefix} from './cpuSession.mjs';

// build.py sustituye solo esta URL por un worker Blob con las mismas fuentes.
function cpuWorkerAddress(){return new URL('./cpuWorker.mjs',import.meta.url);}
export function createCpuPlanner({WorkerClass=globalThis.Worker,address=cpuWorkerAddress}={}){
  let generation=0,worker=null,finish=null,timer=null;
  function cancel(){generation++;clearTimeout(timer);worker?.terminate();worker=null;finish?.(null);finish=null;}
  return {
    cancel,
    async find(game,options){
      cancel();const id=generation;
      if(typeof WorkerClass==='function'){
        const result=await new Promise(resolve=>{
          finish=resolve;
          try{
            const url=address(),instance=new WorkerClass(url,{type:'module'});worker=instance;
            if(typeof url==='string'&&url.startsWith('blob:'))URL.revokeObjectURL(url);
            worker.onmessage=event=>{const data=event.data;if(id!==generation||data?.id!==id)return;clearTimeout(timer);instance.terminate();worker=null;finish=null;resolve(data.error?{workerError:data.error}:data.result);};
            worker.onerror=()=>{if(id!==generation)return;clearTimeout(timer);instance.terminate();worker=null;finish=null;resolve({workerError:'Worker no disponible'});};
            timer=setTimeout(()=>{if(id!==generation)return;instance.terminate();worker=null;finish=null;resolve({workerError:'Worker sin respuesta'});},2500);
            worker.postMessage({id,game,options});
          }catch{worker?.terminate();worker=null;finish=null;resolve({workerError:'Worker no disponible'});}
        });
        if(id!==generation)return null;
        if(result&&!result.workerError){try{validateTurn(game,result.turn);if(cpuFollowsPrefix(result.turn,options?.prefix))return result;}catch{}}
      }
      // Alternativa cooperativa sin dependencias; cede el hilo cada ~6 ms.
      return chooseCpuTurnAsync(game,options,{cancelled:()=>id!==generation});
    }
  };
}
