import {validateTurn} from './engine.mjs';

export function validCpuControl(control){
  return !!control&&control.version===1&&control.type==='cpu'&&['A','B'].includes(control.humanTeam)&&['beginner','intermediate','advanced'].includes(control.difficulty)&&Number.isInteger(control.seed)&&control.seed>=0&&control.seed<=4294967295;
}
export const isCpuTurn=(game,control)=>!game.over&&validCpuControl(control)&&game.turnTeam!==control.humanTeam;
export function validCpuPlan(game,draft,control,plan){
  if(!isCpuTurn(game,control)||!plan||plan.version!==1||plan.base!==JSON.stringify(game)||plan.team!==game.turnTeam)return false;
  try{validateTurn(game,plan.turn);}catch{return false;}
  if(draft.path.length>1&&(draft.actor!==plan.turn.actor||draft.path.length>plan.turn.path.length||draft.path.some((cell,i)=>cell!==plan.turn.path[i])))return false;
  return true;
}
export function makeCpuPlan(game,turn){
  validateTurn(game,turn);
  return {version:1,base:JSON.stringify(game),team:game.turnTeam,turn:{actor:turn.actor,path:[...turn.path],to:turn.to}};
}
export function cpuDecisionSeed(game,control){return (control.seed^Math.imul(game.moves+1,2654435761))>>>0;}
