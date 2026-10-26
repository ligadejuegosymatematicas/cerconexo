import {arenaDecisionTeam,arenaCpuActions,sameArenaAction,chooseArenaCpu} from './cpuStrategy.mjs';

export function arenaWorker(){
  if(typeof globalThis.CERCONEXO_ARENA_CPU_WORKER_SOURCE==='string'){
    const url=URL.createObjectURL(new Blob([globalThis.CERCONEXO_ARENA_CPU_WORKER_SOURCE],{type:'text/javascript'}));
    try{return new Worker(url);}finally{URL.revokeObjectURL(url);}
  }
  return new Worker(new URL('./cpuWorker.mjs',import.meta.url),{type:'module'});
}
export function createArenaCpuController({getSession,getControl,isPaused,dispatch,onThinking=()=>{},onError=()=>{},onMeasure=()=>{},workerFactory=arenaWorker,timeout=1600}){
  let serial=0,pending=null,scheduled=false;
  const owns=s=>s?.mode==='duo'&&getControl().opponent==='cpu'&&arenaDecisionTeam(s)!==null&&arenaDecisionTeam(s)!==getControl().humanTeam;
  function cancel(){serial++;if(pending){clearTimeout(pending.timer);pending.worker?.terminate();pending=null;}onThinking(false);}
  function tick(){
    if(scheduled)return;scheduled=true;
    setTimeout(()=>{scheduled=false;run();},0);
  }
  async function run(){
    const session=getSession(),game=session?.game;
    if(pending||!owns(game)||isPaused()||!arenaCpuActions(game).length)return;
    const id=++serial,revision=game.revision,team=arenaDecisionTeam(game),start=performance.now();
    const job={id,session,game,revision,team,worker:null,timer:null};pending=job;onThinking(true);
    const current=()=>pending===job&&serial===id&&getSession()===session&&session.game===game&&session.game.revision===revision&&owns(game)&&arenaDecisionTeam(game)===team&&!isPaused();
    function finish(result){
      if(!current()){if(pending===job)cancel();return;}
      const legal=arenaCpuActions(session.game),validated=legal.find(a=>sameArenaAction(a,result?.action)),action=validated??legal[0];
      clearTimeout(job.timer);job.worker?.terminate();pending=null;onThinking(false);
      onMeasure({milliseconds:performance.now()-start,nodes:result?.nodes??0,fallback:!validated,revision,team});
      if(action){try{dispatch(action);tick();}catch(e){onError(e);}}
    }
    async function fallback(){
      if(job.fallback)return;job.fallback=true;clearTimeout(job.timer);
      job.worker?.terminate();job.worker=null;
      if(!current())return;
      try{finish(await chooseArenaCpu(game,{team,budget:{nodes:48,milliseconds:32,depth:4,beam:3},yieldControl:()=>new Promise(r=>setTimeout(r,0))}));}
      catch{finish(null);}
    }
    try{
      job.worker=workerFactory();
      job.worker.onmessage=({data})=>{if(data.id!==id||data.revision!==revision)return;if(data.error)fallback();else finish(data);};
      job.worker.onerror=e=>{e.preventDefault?.();clearTimeout(job.timer);fallback();};
      job.timer=setTimeout(fallback,timeout);
      job.worker.postMessage({id,game,options:{team}});
    }catch{fallback();}
  }
  return {tick,cancel,owns,get thinking(){return !!pending;}};
}
