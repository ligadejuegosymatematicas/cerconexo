import {applyTurn,validateTurn,territory} from '../src/engine.mjs';
import {cpuLegalTurns} from '../src/cpuMoves.mjs';
import {evaluateCpuState,CPU_TERMINAL} from '../src/cpuEvaluate.mjs';

export const CPU_LEVELS=Object.freeze({beginner:{label:'Principiante',budgetMs:120,nodeBudget:200,beam:0},intermediate:{label:'Intermedio',budgetMs:340,nodeBudget:900,beam:5},advanced:{label:'Avanzado',budgetMs:850,nodeBudget:2600,beam:12}});
export function cpuSeededRandom(seed=1){let state=seed>>>0;return ()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};}
export function* cpuSearchSteps(game,{level='intermediate',seed=1,prefix=null,budgetMs,nodeBudget,now=()=>performance.now()}={}){
  const settings=CPU_LEVELS[level];if(!settings)throw new Error('Dificultad desconocida.');
  const started=now(),deadline=started+(budgetMs??settings.budgetMs),limit=nodeBudget??settings.nodeBudget,perspective=game.turnTeam;
  const turns=cpuLegalTurns(game,{prefix,deduplicate:true});if(!turns.length)return null;
  let nodes=0,exhausted=false,completed=0;const roots=[],random=cpuSeededRandom(seed);
  // Primera pasada completa y acotada por el tablero de 49 casillas. Siempre
  // conserva una jugada legal; no omite victorias por el orden de enumeración.
  for(const turn of turns){const state=applyTurn(game,turn),evaluation=evaluateCpuState(state,perspective);roots.push({turn,state,evaluation,value:evaluation.value,tie:random()});nodes++;yield;}
  // Desempate reproducible entre valores numéricamente equivalentes. No altera
  // la prioridad de victorias, amenazas ni ventajas estratégicas significativas.
  roots.sort((a,b)=>Math.abs(b.value-a.value)>1e-8?b.value-a.value:b.tie-a.tie);
  let chosen=roots[0];const wins=roots.filter(r=>r.state.over&&r.state.winner===perspective);
  if(wins.length){const bestWins=wins.filter(r=>r.value>=wins[0].value-1e-8);chosen=bestWins[Math.floor(random()*bestWins.length)];}
  else if(level==='beginner'){
    const acceptable=roots.filter(r=>r.value>=roots[0].value-8&&r.value>-CPU_TERMINAL);
    const pool=acceptable.length?acceptable:[roots[0]];chosen=pool[Math.floor(random()*Math.min(5,pool.length))];
  }else{
    const before=territory(game).score,opponent=perspective==='A'?'B':'A';let best=-Infinity;
    rootLoop:for(const root of roots.slice(0,settings.beam)){
      if(root.state.over){if(root.value>best){best=root.value;chosen=root;}completed++;continue;}
      let worst=Infinity;
      for(const reply of cpuLegalTurns(root.state,{deduplicate:true})){
        if(nodes>=limit||now()>=deadline){exhausted=true;break rootLoop;}
        const response=applyTurn(root.state,reply);let value;
        if(level==='advanced')value=evaluateCpuState(response,perspective).value;
        else{
          const result=evaluateCpuState(response,perspective);
          // Intermedio: amenazas de resultado y pérdida territorial; conserva
          // más peso de su valoración inmediata que la búsqueda minimax.
          value=response.over?result.value:root.value-Math.max(0,result.score[opponent]-before[opponent])*2.4-Math.max(0,root.evaluation.terms.mobility-result.terms.mobility)*8;
        }
        nodes++;worst=Math.min(worst,value);yield;
        if(level==='advanced'&&worst<=best)break; // poda alfa-beta a profundidad 2
      }
      if(worst>best){best=worst;chosen=root;}completed++;
    }
  }
  validateTurn(game,chosen.turn);
  return {turn:chosen.turn,stats:{level,seed,rootCandidates:turns.length,nodes,completedRoots:completed,depth:completed?2:1,budgetExhausted:exhausted,calculationMs:now()-started,evaluation:chosen.evaluation}};
}
export function chooseCpuTurn(game,options){const search=cpuSearchSteps(game,options);let next;do{next=search.next();}while(!next.done);return next.value;}
export async function chooseCpuTurnAsync(game,options,{cancelled=()=>false,yieldTask=()=>new Promise(resolve=>setTimeout(resolve,0))}={}){
  const search=cpuSearchSteps(game,options);let next,start=performance.now();
  do{if(cancelled())return null;next=search.next();if(performance.now()-start>6){await yieldTask();start=performance.now();}}while(!next.done);
  return cancelled()?null:next.value;
}
