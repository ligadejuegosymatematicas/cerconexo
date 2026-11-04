import {createArena,applyArena} from '../../arena/src/engine.mjs';
import {arenaCpuActions} from '../../arena/src/cpuStrategy.mjs';
export function arenaTrace(seed,policy='piece',mode='duo'){
  let game=createArena({policy,mode}),rng=seed;const commands=[],states=[],types=new Set(),events=new Set();
  while(!game.over&&commands.length<1200){
    const choices=arenaCpuActions(game),powers=choices.filter(a=>['jump','demolition','extraWall'].includes(a.type)),moves=choices.filter(a=>a.type==='move');rng=(Math.imul(rng,1664525)+1013904223)>>>0;
    const distance=a=>Math.min(...game.drops.map(d=>Math.abs(d.cell%9-a.to%9)+Math.abs(Math.floor(d.cell/9)-Math.floor(a.to/9))));const closest=moves.length&&game.drops.length?Math.min(...moves.map(distance)):null;
    const pool=powers.length&&(seed>8||rng%3===0)?powers:closest!==null?moves.filter(a=>distance(a)===closest):choices,action=pool[rng%pool.length];
    if(!action)throw Error('Sin acción oficial');game=applyArena(game,action);commands.push(action);states.push(game);types.add(action.type);game.lastEvents.forEach(e=>events.add(e.type));
  }
  if(!game.over)throw Error('Traza no terminada');return{seed,commands,states,types:[...types],events:[...events]};
}
export function reviewTraces(policy='piece',mode='duo'){
  const all=Array.from({length:16},(_,i)=>arenaTrace(i+1,policy,mode)),first=all.find(t=>['move','wall','jump','demolition','extraWall','discard'].every(k=>t.types.includes(k)));
  if(!first)throw Error('Falta traza completa de poderes');const second=all.find(t=>t.events.includes('reactivated'));
  if(!second)throw Error('Falta traza de reactivación');return[first,second];
}
