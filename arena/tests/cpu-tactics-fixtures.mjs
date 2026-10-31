import {createArena} from '../src/engine.mjs';
import {arenaNeighbors,arenaWall} from '../src/geometry.mjs';
import {bridgeDefense,reconquest,jumpConquest,terminalClosure} from './cpu-strategy-fixtures.mjs';

// Los 13 casos de la auditoría M5-C, sin cambiar su geometría.
// Instantáneas sintéticas: no reconstrucciones del video.
export function pocket(cells,{actor=40,door=[[40,41]],policy='piece',power=null}={}){
 const s=createArena({policy});s.drops=[];s.experiment.waves=[];
 s.pieces=[{id:'A1',team:'A',pos:actor},{id:'A2',team:'A',pos:70},{id:'B1',team:'B',pos:16},{id:'B2',team:'B',pos:64}];
 const set=new Set(cells),open=new Set(door.map(([a,b])=>arenaWall(a,b)));
 s.walls=[...new Set(cells.flatMap(c=>arenaNeighbors(c).filter(n=>!set.has(n)).map(n=>arenaWall(c,n))))].filter(w=>!open.has(w));
 s.turn={team:'A',actor:'A1',steps:0,path:[actor],committed:false,actions:0};
 if(power)s.inventories[policy==='team'?'A':'A1']=[{id:'audit-power',type:power}];
 return s;
}

export function harmfulSmallClosure(){
 const s=bridgeDefense({policy:'team'});s.experiment.waves=[];
 s.turn.actor='A1';s.turn.path=[30];s.walls.push(arenaWall(29,30));
 s.inventories.A=[{id:'defense-d',type:'demolition'},{id:'small-e',type:'extraWall'}];
 return {name:'asegurar-1-pierde-defensa',state:s,witness:[{type:'extraWall',to:21,power:'small-e'},{type:'wall',to:39}]};
}
export function enemyGainClosure(){
 const s=enemyPocket([41,49,50,58,59,60,67,68,69],{b1:59,b2:16});
 return {name:'cierre-regala-9-rival',state:s,witness:[{type:'extraWall',to:41,power:'audit-power'},{type:'wall',to:49}]};
}
export function enemyPocket(cells,{b1,b2,policy='piece'}={}){
 const s=pocket(cells,{actor:40,door:[[40,41],[40,49]],policy,power:'extraWall'});
 s.pieces.find(p=>p.id==='B1').pos=b1;s.pieces.find(p=>p.id==='B2').pos=b2;return s;
}
export function fixtures(){
 const square=[20,21,22,29,30,31,38,39,40];
 const bad=bridgeDefense();bad.pieces.find(p=>p.id==='A1').pos=39;bad.turn.path=[39];bad.inventories.A1=[];
 return [
  {name:'cierre-9-inmediato',state:pocket(square),witness:[{type:'wall',to:41}]},
  {name:'cierre-9-con-paso',state:pocket(square,{actor:31}),witness:[{type:'move',to:40},{type:'wall',to:41}]},
  {name:'cierre-9-dos-muros',state:pocket(square,{door:[[40,41],[40,49]],power:'extraWall'}),witness:[{type:'extraWall',to:41,power:'audit-power'},{type:'wall',to:49}]},
  {name:'asegurar-1-con-poder',state:pocket([40],{door:[[40,41],[40,49]],power:'extraWall'}),witness:[{type:'extraWall',to:41,power:'audit-power'},{type:'wall',to:49}]},
  {name:'victoria-dos-muros-rival-3',state:enemyPocket([41,49,50],{b1:41,b2:49}),witness:[{type:'extraWall',to:41,power:'audit-power'},{type:'wall',to:49}]},
  {name:'victoria-dos-muros-rival-5',state:enemyPocket([41,49,50,58,59],{b1:58,b2:59}),witness:[{type:'extraWall',to:41,power:'audit-power'},{type:'wall',to:49}]},
  {name:'victoria-dos-muros-equipo',state:enemyPocket([41,49,50,58,59],{b1:58,b2:59,policy:'team'}),witness:[{type:'extraWall',to:41,power:'audit-power'},{type:'wall',to:49}]},
  ...['piece','team'].map(policy=>({name:'defensa-puente-'+policy,state:bridgeDefense({policy}),witness:policy==='piece'?[{type:'demolition',to:31,power:'defense-d'},{type:'wall',to:21}]:[{type:'select',actor:'A1'},{type:'demolition',to:31,power:'defense-d'},{type:'wall',to:21}]})),
  {name:'reconquista-demolicion',state:reconquest(),witness:[{type:'demolition',to:10,power:'reconquest-d'},{type:'wall',to:2}]},
  {name:'salto-region-vacia',state:jumpConquest(),witness:[{type:'jump',to:11,power:'jump-1'}]},
  {name:'cierre-terminal-favorable',state:terminalClosure(),witness:[{type:'wall',to:42}]},
  {name:'cierre-terminal-perjudicial',state:bad,witness:[{type:'wall',to:40}]},
 ];
}
