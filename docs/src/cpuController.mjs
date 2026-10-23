import {validateTurn} from './engine.mjs';
import {committedDraft} from './turnDraft.mjs';
import {isCpuTurn,validCpuPlan,makeCpuPlan,cpuDecisionSeed} from './cpuSession.mjs';

// Coordinación, no reglas: reutiliza las mismas acciones persistentes/animadas
// que ejecuta una persona. Cancelar no borra ningún paso o plan ya guardado.
export function createCpuController({planner,read,savePlan,select,step,build,status,onError}){
  let generation=0,running=false;
  const eligible=()=>{const s=read();return s.visible&&!s.blocked&&isCpuTurn(s.game,s.control);};
  function cancel(){generation++;running=false;planner.cancel();}
  async function resume(){
    if(running||!eligible())return;
    const token=++generation;running=true;
    try{
      let s=read(),plan=s.plan;const base=JSON.stringify(s.game);
      if(!validCpuPlan(s.game,s.draft,s.control,plan)){
        status('thinking');
        const result=await planner.find(s.game,{level:s.control.difficulty,seed:cpuDecisionSeed(s.game,s.control),prefix:committedDraft(s.draft)?s.draft:null});
        if(token!==generation||!eligible()||JSON.stringify(read().game)!==base||!result)return;
        s=read();validateTurn(s.game,result.turn);plan=makeCpuPlan(s.game,result.turn);
        if(!validCpuPlan(s.game,s.draft,s.control,plan))throw new Error('La respuesta CPU no respeta el avance guardado.');
        if(!savePlan(plan,result.stats))return;
      }
      if(token!==generation||!eligible())return;
      s=read();if(!validCpuPlan(s.game,s.draft,s.control,plan))throw new Error('El plan CPU no corresponde al turno actual.');
      select(plan.turn.actor);status('acting');
      while(read().draft.path.length<plan.turn.path.length){
        if(token!==generation||!eligible())return;
        if(!await step(plan.turn.path[read().draft.path.length]))return;
      }
      if(token!==generation||!eligible())return;
      await build(plan.turn.to);
    }catch(error){if(token===generation)onError(error);}
    finally{if(token===generation){running=false;status('idle');}}
  }
  return {cancel,resume,get running(){return running;}};
}
