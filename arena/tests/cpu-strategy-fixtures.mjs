import {createArena,applyArena} from '../src/engine.mjs';
import {arenaNeighbors,arenaWall} from '../src/geometry.mjs';

export function bridgeDefense({policy='piece',team='A',distance=0}={}){
  const s=createArena({policy});s.drops=[];
  s.walls=Array.from({length:9},(_,r)=>arenaWall(r*9+3,r*9+4)).filter(w=>w!==arenaWall(39,40));
  s.pieces=[{id:'A1',team:'A',pos:30},{id:'A2',team:'A',pos:10},{id:'B1',team:'B',pos:40+distance},{id:'B2',team:'B',pos:70}];
  s.turn={team:'A',actor:policy==='piece'?'A1':null,steps:0,path:policy==='piece'?[30]:[],committed:false,actions:0};
  s.inventories[policy==='team'?'A':'A1']=[{id:'defense-d',type:'demolition'}];
  if(team==='B'){
    const flip=t=>t==='A'?'B':'A';s.pieces=s.pieces.map(p=>({...p,id:flip(p.team)+p.id.slice(1),team:flip(p.team)}));
    s.inventories=Object.fromEntries(Object.entries(s.inventories).map(([k,v])=>[flip(k[0])+k.slice(1),v]));
    s.turn.team='B';if(s.turn.actor)s.turn.actor='B1';
  }
  return s;
}
export function defenseDiscard(policy='piece'){
  const s=bridgeDefense({policy});s.turn.actor='A1';s.turn.path=[21,30];s.turn.steps=1;s.turn.committed=true;s.turn.actions=1;
  if(policy==='team'){
    s.pieces.find(p=>p.id==='A2').pos=0;s.walls.push(...arenaNeighbors(0).map(c=>arenaWall(0,c)));
  }
  const owner=policy==='team'?'A':'A1';
  s.inventories[owner]=[{id:'keep-demolition',type:'demolition'},{id:'discard-extra',type:'extraWall'}];
  s.pending={kind:'discard',owner,team:'A',capacity:1,reason:'pickup'};
  s.resolution={actor:'A1',finish:false,pickup:null,pickupOwner:owner};return s;
}
export function jumpConquest(){
  const s=createArena();s.drops=[];s.walls=arenaNeighbors(11).map(n=>arenaWall(11,n));s.inventories.A1=[{id:'jump-1',type:'jump'}];return s;
}
export function reconquest(){
  const s=createArena({policy:'team'});s.drops=[];s.pieces=[{id:'A1',team:'A',pos:11},{id:'B1',team:'B',pos:9},{id:'A2',team:'A',pos:70},{id:'B2',team:'B',pos:64}];
  s.walls=[...new Set([9,10].flatMap(c=>arenaNeighbors(c).filter(n=>![9,10].includes(n)).map(n=>arenaWall(c,n))))];
  s.turn={team:'A',actor:'A1',steps:0,path:[11],committed:false,actions:0};s.inventories.A=[{id:'reconquest-d',type:'demolition'}];return s;
}
export function terminalClosure(){
  const s=createArena({policy:'team'});s.drops=[];
  s.walls=[...new Set(Array.from({length:81},(_,c)=>arenaNeighbors(c).filter(n=>(c<42)!==(n<42)).map(n=>arenaWall(c,n))).flat())].filter(w=>w!==arenaWall(41,42));
  s.pieces=[{id:'A1',team:'A',pos:0},{id:'A2',team:'A',pos:41},{id:'B1',team:'B',pos:42},{id:'B2',team:'B',pos:80}];
  s.turn={team:'A',actor:'A2',steps:0,path:[41],committed:false,actions:0};s.inventories.A=[{id:'finish-e',type:'extraWall'}];return s;
}
export function powerConservation(){
  const s=createArena();s.drops=[];s.pieces.find(p=>p.id==='A1').pos=30;s.turn.path=[30];
  s.walls=[arenaWall(30,31)];s.inventories.A1=[{id:'save-d',type:'demolition'}];return s;
}
export function branchingPowers(){
  const s=createArena({policy:'team'});s.drops=[];s.pieces.find(p=>p.id==='A1').pos=40;
  s.turn.actor='A1';s.turn.path=[40];s.walls=[arenaWall(40,31)];
  s.inventories.A=[{id:'branch-d',type:'demolition'},{id:'branch-e',type:'extraWall'}];return s;
}
export function strategicPositions(){
  return [
    ...['piece','team'].flatMap(policy=>['A','B'].map(team=>({name:`bridge-${policy}-${team}`,state:bridgeDefense({policy,team})}))),
    {name:'bridge-one-step-reply',state:bridgeDefense({distance:1})},
    {name:'discard-piece-defense',state:defenseDiscard('piece')},{name:'discard-team-defense',state:defenseDiscard('team')},
    {name:'jump-conquest',state:jumpConquest()},{name:'demolition-reconquest',state:reconquest()},
    {name:'terminal-win',state:terminalClosure()},{name:'conserve-unneeded-power',state:powerConservation()},
    {name:'branching-two-powers',state:branchingPowers()},
    {name:'opening-piece',state:createArena()},{name:'opening-team',state:createArena({policy:'team'})}
  ];
}
