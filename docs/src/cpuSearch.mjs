import {applyTurn,validateTurn} from './engine.mjs';
import {cpuLegalTurns} from './cpuMoves.mjs';
import {evaluateCpuState,CPU_TERMINAL} from './cpuEvaluate.mjs';
const CPU_EPSILON=1e-8;

export const CPU_LEVELS=Object.freeze({beginner:{label:'Principiante',budgetMs:120,nodeBudget:200,beam:0},intermediate:{label:'Intermedio',budgetMs:340,nodeBudget:1600,beam:8},advanced:{label:'Avanzado',budgetMs:850,nodeBudget:5000,beam:18}});
export function cpuSeededRandom(seed=1){let state=seed>>>0;return ()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};}
function cpuCanonicalTurnKey(turn,perspective){
  const cell=n=>perspective==='A'?n:Math.floor(n/7)*7+6-n%7,end=cell(turn.path.at(-1)),other=cell(turn.to);
  return [turn.actor[0]===perspective?1:2,Number(turn.actor[1]),end,Math.min(end,other),Math.max(end,other)].join(':');
}
export function cpuTieBreak(turn,perspective,seed){
  let hash=seed>>>0;for(const character of cpuCanonicalTurnKey(turn,perspective)){hash=Math.imul(hash^character.charCodeAt(0),16777619);hash^=hash>>>16;}return hash>>>0;
}
function cpuOrderedTurns(game,perspective,seed){
  return cpuLegalTurns(game,{deduplicate:true}).map(turn=>({turn,tie:cpuTieBreak(turn,perspective,seed),key:cpuCanonicalTurnKey(turn,perspective)})).sort((a,b)=>a.tie-b.tie||a.key.localeCompare(b.key)).map(v=>v.turn);
}
export function* cpuSearchSteps(game,{level='intermediate',seed=1,prefix=null,budgetMs,nodeBudget,now=()=>performance.now()}={}){
  const settings=CPU_LEVELS[level];if(!settings)throw new Error('Dificultad desconocida.');
  const started=now(),deadline=started+(budgetMs??settings.budgetMs),limit=nodeBudget??settings.nodeBudget,perspective=game.turnTeam;
  const turns=cpuLegalTurns(game,{prefix,deduplicate:true});if(!turns.length)return null;
  let nodes=0,exhausted=false,completed=0,depth=1;const roots=[],random=cpuSeededRandom(seed),cache=new Map();
  const evaluate=state=>{
    // Solo se memoriza la evaluación pura del tablero, nunca actores ni turnos.
    const key=JSON.stringify([state.pieces.map(p=>p.pos),[...state.walls].sort(),state.over,state.winner]);
    if(!cache.has(key))cache.set(key,evaluateCpuState(state,perspective));
    return cache.get(key);
  };
  const timeLeft=()=>nodes<limit&&now()<deadline;
  // Primera pasada completa: siempre conserva respaldo legal y victorias.
  for(const turn of turns){const state=applyTurn(game,turn),evaluation=evaluate(state);roots.push({turn,state,evaluation,value:evaluation.value,tie:cpuTieBreak(turn,perspective,seed),key:cpuCanonicalTurnKey(turn,perspective)});nodes++;yield;}
  // Desempate reproducible entre valores numéricamente equivalentes. No altera
  // la prioridad de victorias, amenazas ni ventajas estratégicas significativas.
  roots.sort((a,b)=>Math.abs(b.value-a.value)>1e-8?b.value-a.value:b.tie-a.tie||a.key.localeCompare(b.key));
  let chosen=roots[0];const wins=roots.filter(r=>r.state.over&&r.state.winner===perspective);
  if(wins.length){const bestWins=wins.filter(r=>r.value>=wins[0].value-1e-8);chosen=bestWins[Math.floor(random()*bestWins.length)];}
  else if(level==='beginner'){
    const acceptable=roots.filter(r=>r.value>=roots[0].value-8&&r.value>-CPU_TERMINAL);
    const pool=acceptable.length?acceptable:[roots[0]];chosen=pool[Math.floor(random()*Math.min(5,pool.length))];
  }else{
    let best=-Infinity;const completedRoots=[];
    rootLoop:for(const root of roots.slice(0,settings.beam)){
      if(root.state.over){root.minimax=root.value;completedRoots.push(root);if(root.value>best+CPU_EPSILON){best=root.value;chosen=root;}completed++;continue;}
      let worst=Infinity,pruned=false;const replies=[];
      for(const turn of cpuOrderedTurns(root.state,perspective,seed)){
        if(!timeLeft()){exhausted=true;break rootLoop;}
        const state=applyTurn(root.state,turn),value=evaluate(state).value;
        nodes++;replies.push({state,value,tie:cpuTieBreak(turn,perspective,seed),key:cpuCanonicalTurnKey(turn,perspective)});worst=Math.min(worst,value);yield;
        if(level==='intermediate'&&worst<=best+CPU_EPSILON){pruned=true;break;}
      }
      root.minimax=worst;root.replies=replies;
      if(!pruned)completedRoots.push(root);
      if(worst>best+CPU_EPSILON){best=worst;chosen=root;}completed++;depth=2;
    }
    // Avanzado anticipa otra jugada propia entre las mejores candidatas.
    // Comprueba TODAS las respuestas rivales; poda solo con cotas válidas.
    if(level==='advanced'&&!exhausted){
      const frontier=completedRoots.sort((a,b)=>Math.abs(b.minimax-a.minimax)>CPU_EPSILON?b.minimax-a.minimax:b.tie-a.tie||a.key.localeCompare(b.key)).slice(0,3);
      let refinedBest=-Infinity,refinedChoice=null,complete=true,expanded=0;
      deepLoop:for(const root of frontier){
        let worst=root.minimax;
        if(!root.state.over&&worst>-CPU_TERMINAL){
          worst=Infinity;
          for(const reply of root.replies.sort((a,b)=>Math.abs(a.value-b.value)>CPU_EPSILON?a.value-b.value:a.tie-b.tie||a.key.localeCompare(b.key))){
            let responseBest=reply.value;
            if(!reply.state.over){
              responseBest=-Infinity;
              for(const turn of cpuOrderedTurns(reply.state,perspective,seed)){
                if(!timeLeft()){complete=false;exhausted=true;break deepLoop;}
                const value=evaluate(applyTurn(reply.state,turn)).value;
                nodes++;expanded++;responseBest=Math.max(responseBest,value);yield;
                if(responseBest>=worst-CPU_EPSILON)break;
              }
            }
            worst=Math.min(worst,responseBest);
            if(worst<=refinedBest+CPU_EPSILON)break;
          }
        }
        if(worst>refinedBest+CPU_EPSILON){refinedBest=worst;refinedChoice=root;}
      }
      if(complete&&refinedChoice){chosen=refinedChoice;if(expanded)depth=3;}
    }
  }
  validateTurn(game,chosen.turn);
  return {turn:chosen.turn,stats:{level,seed,rootCandidates:turns.length,nodes,completedRoots:completed,depth,budgetExhausted:exhausted,calculationMs:now()-started,evaluation:chosen.evaluation,evaluations:cache.size}};
}
export function chooseCpuTurn(game,options){const search=cpuSearchSteps(game,options);let next;do{next=search.next();}while(!next.done);return next.value;}
export async function chooseCpuTurnAsync(game,options,{cancelled=()=>false,yieldTask=()=>new Promise(resolve=>setTimeout(resolve,0))}={}){
  const search=cpuSearchSteps(game,options);let next,start=performance.now();
  do{if(cancelled())return null;next=search.next();if(performance.now()-start>6){await yieldTask();start=performance.now();}}while(!next.done);
  return cancelled()?null:next.value;
}
