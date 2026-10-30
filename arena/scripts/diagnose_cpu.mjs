/** Auditoría M5-A: observadores y contrafactuales; no es una estrategia jugable. */
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createArena,applyArena,legalArenaActions} from '../src/engine.mjs';
import {analyzeArena,arenaNeighbors,arenaWall} from '../src/geometry.mjs';
import {chooseArenaCpu,arenaCpuActions,arenaDecisionTeam,evaluateArenaCpu} from '../src/cpuStrategy.mjs';

const out=new URL('../../validation/m5a1/strategy/',import.meta.url);await mkdir(out,{recursive:true});
// Instrumentación en memoria de la MISMA búsqueda: cuenta lo que realmente expande.
let source=await readFile(new URL('../src/cpuStrategy.mjs',import.meta.url),'utf8');
for(const name of ['engine','geometry'])source=source.replace(`'./${name}.mjs'`,JSON.stringify(new URL(`../src/${name}.mjs`,import.meta.url).href));
source=source.replace('let nodes=0,best=null','const trace=[];let nodes=0,best=null')
 .replace('nodes++;','nodes++;trace.push({depth:depth+1,team:arenaDecisionTeam(node.state),type:action.type});')
 .replace('action:chosen?.first??legal[0],nodes,','action:chosen?.first??legal[0],trace,completedFrontier:done.length,nodes,');
const observed=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const snapshot=s=>({score:analyzeArena(s).score,turn:s.turn,completedTurns:s.completedTurns,pending:s.pending,over:s.over});
const cases=[];
function makeThreat(){
 const s=createArena();s.drops=[];
 s.walls=Array.from({length:9},(_,r)=>arenaWall(r*9+3,r*9+4)).filter(w=>w!==arenaWall(39,40));
 s.pieces=[{id:'A1',team:'A',pos:30},{id:'A2',team:'A',pos:10},{id:'B1',team:'B',pos:40},{id:'B2',team:'B',pos:70}];
 s.turn.path=[30];s.inventories.A1=[{id:'d',type:'demolition'}];return s;
}
const threat=makeThreat();cases.push({name:'defensa-puente',state:threat});
cases.push({name:'apertura-por-ficha',state:createArena()},{name:'apertura-por-equipo',state:createArena({policy:'team'})});
const jump=createArena();jump.drops=[];jump.walls=arenaNeighbors(11).map(c=>arenaWall(11,c));jump.inventories.A1=[{id:'j',type:'jump'}];cases.push({name:'salto-a-region-vacia',state:jump});
const reconquest=makeThreat();reconquest.walls.push(arenaWall(39,40));reconquest.pieces.find(p=>p.id==='A2').pos=70;reconquest.pieces.find(p=>p.id==='B2').pos=31;
// A1 y B1 comparten el lado izquierdo; B2 tiene región exclusiva a la derecha.
reconquest.pieces.find(p=>p.id==='B1').pos=10;reconquest.pieces.find(p=>p.id==='A2').pos=20;reconquest.pieces.find(p=>p.id==='B2').pos=70;
cases.push({name:'demolicion-reconquista',state:reconquest});
const pickup=createArena();pickup.drops=[{id:'e',type:'extraWall',cell:11}];pickup.inventories.A1=[{id:'j',type:'jump'}];cases.push({name:'descarte-por-recogida',state:applyArena(pickup,{type:'move',to:11})});
const finish=createArena({policy:'team'});finish.drops=[];
finish.walls=[...new Set(Array.from({length:81},(_,c)=>arenaNeighbors(c).filter(n=>(c<42)!==(n<42)).map(n=>arenaWall(c,n))).flat())].filter(w=>w!==arenaWall(41,42));
finish.pieces=[{id:'A1',team:'A',pos:0},{id:'A2',team:'A',pos:41},{id:'B1',team:'B',pos:42},{id:'B2',team:'B',pos:80}];finish.turn.actor='A2';finish.turn.path=[41];finish.inventories.A=[{id:'e',type:'extraWall'}];cases.push({name:'cierre-terminal-favorable',state:finish});
const dense=createArena({policy:'team'});dense.turn.actor='A1';dense.turn.path=[40];dense.drops=[];
dense.pieces=[{id:'A1',team:'A',pos:40},{id:'A2',team:'A',pos:10},{id:'B1',team:'B',pos:39},{id:'B2',team:'B',pos:41}];
dense.walls=[arenaWall(40,31),arenaWall(40,49)];dense.inventories.A=[{id:'d',type:'demolition'},{id:'e',type:'extraWall'}];
cases.push({name:'ramificacion-con-poderes',state:dense});
function opponentWins(s,team){
 if(s.over||arenaDecisionTeam(s)===team)return [];
 return arenaCpuActions(s).filter(a=>a.type==='wall').filter(a=>{const n=applyArena(s,a);return n.over&&!n.winners.includes(team);});
}
async function finishCpuTurn(state){
 const team=arenaDecisionTeam(state),sequence=[];let s=state;
 while(!s.over&&arenaDecisionTeam(s)===team&&sequence.length<12){
  const result=await chooseArenaCpu(s,{now:()=>0});sequence.push(result.action);s=applyArena(s,result.action);
  if(s.completedTurns!==state.completedTurns)break;
 }return {sequence,state:s,opponentImmediateWinningWalls:opponentWins(s,team)};
}
const report={reference:'5afd939c6237209659a2dbea45bbb32f59b53ebf',strategyUnchanged:true,environment:{platform:process.platform,node:process.version},cases:[]};
for(const fixture of cases){
 const s=fixture.state,team=arenaDecisionTeam(s),before=JSON.stringify(s),variants=[];
 for(const [name,budget] of [['nodos-release',{nodes:160,depth:6,beam:6}],['mas-presupuesto-solo-diagnostico',{nodes:1600,depth:8,beam:12}]]){
  const r=await observed.chooseArenaCpu(s,{budget,now:()=>0});
  const trace=r.trace??[];variants.push({name,action:r.action,nodes:r.nodes,maxDepth:Math.max(0,...trace.map(t=>t.depth)),opponentExpansions:trace.filter(t=>t.team!==team).length,completedFrontier:r.completedFrontier,chosenSuccessor:snapshot(applyArena(s,r.action))});
 }
 const measured=[];for(let i=0;i<5;i++){const start=performance.now(),r=await chooseArenaCpu(s);measured.push({action:r.action,nodes:r.nodes,ms:performance.now()-start});}
 if(before!==JSON.stringify(s))throw Error('El diagnóstico alteró un fixture');
 report.cases.push({name:fixture.name,fixture:s,initial:snapshot(s),variants,measured,ownTurn:await finishCpuTurn(s)});
}
const normal=await finishCpuTurn(threat);
const alternativeAction={type:'demolition',to:31,power:'d'},opened=applyArena(threat,alternativeAction),alternative=applyArena(opened,{type:'wall',to:21});
report.defenseCounterexample={fixture:threat,baseline:{...normal,state:snapshot(normal.state),replies:normal.opponentImmediateWinningWalls.map(a=>({action:a,after:snapshot(applyArena(normal.state,a)),winners:applyArena(normal.state,a).winners}))},alternative:{sequence:[alternativeAction,{type:'wall',to:21}],state:snapshot(alternative),opponentImmediateWinningWalls:opponentWins(alternative,'A')},
 immediateEvaluation:{before:evaluateArenaCpu(threat,'A'),afterDemolition:evaluateArenaCpu(opened,'A')},
 interpretation:'Una amenaza demostrada requiere respuesta terminal concreta; no demuestra el resultado final de todos los contrafactuales.'};
// Son acciones oficiales de fixtures, nunca cambios a las reglas ni partidas personales.
report.ok=report.cases.every(c=>c.variants.every(v=>arenaCpuActions(c.fixture).some(a=>JSON.stringify(a)===JSON.stringify(v.action))));
await writeFile(new URL('results.json',out),JSON.stringify(report,null,2));
console.log(JSON.stringify({ok:report.ok,cases:report.cases.map(c=>({name:c.name,variants:c.variants.map(v=>({...v,chosenSuccessor:undefined})),actions:c.ownTurn.sequence})),defense:report.defenseCounterexample},null,2));
if(!report.ok)process.exitCode=1;
