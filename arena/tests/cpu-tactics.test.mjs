import test from 'node:test';
import assert from 'node:assert/strict';
import {applyArena,createArena} from '../src/engine.mjs';
import {analyzeArena} from '../src/geometry.mjs';
import {chooseArenaCpu,arenaCpuActions,sameArenaAction,ARENA_CPU_BUDGET} from '../src/cpuStrategy.mjs';
import {fixtures,harmfulSmallClosure,enemyGainClosure} from './cpu-tactics-fixtures.mjs';
import {m5cReference,completeTurns,flipTeams} from './cpu-tactics-tools.mjs';
import {ownTurn,winningTurnReply} from './cpu-strategy-tools.mjs';
const fixed={now:()=>0},baseline=await m5cReference();
const nine=()=>fixtures().find(f=>f.name==='cierre-9-dos-muros').state;

for(const policy of ['piece','team'])for(const team of ['A','B'])test(`M5-D cierre de 9 protegido ${policy}/${team}, legal y sin alterar el origen`,async()=>{
 let s=nine();if(policy==='team'){s.policy='team';s.inventories={A:s.inventories.A1,B:[]};s.turn.actor=null;s.turn.path=[];}
 if(team==='B')s=flipTeams(s);const before=JSON.stringify(s);
 const turn=await ownTurn(s,chooseArenaCpu);
 assert.equal(analyzeArena(turn.state).score[team],9);
 assert.ok(turn.sequence.some(a=>a.type==='extraWall'));assert.equal(turn.sequence.at(-1).type,'wall');
 assert.equal(JSON.stringify(s),before);assert.ok(turn.measure.some(m=>m.tacticalNodes>0));
 for(const m of turn.measure){assert.ok(m.nodes<=160);assert.equal(m.nodes,m.ownNodes+m.replyNodes);assert.ok(m.tacticalNodes<=24);}
 const replies=completeTurns(turn.state);assert.ok(replies.complete);assert.ok(replies.ends.length>0);
 for(const reply of replies.ends)assert.equal(analyzeArena(reply.state).score[team],9);
});
test('M5-D reproduce la omisión de M5-C y la corrige sin cambiar pesos ni presupuesto',async()=>{
 const old=await ownTurn(nine(),baseline.chooseArenaCpu),next=await ownTurn(nine(),chooseArenaCpu);
 assert.equal(analyzeArena(old.state).score.A,0);assert.equal(analyzeArena(next.state).score.A,9);
 assert.deepEqual(ARENA_CPU_BUDGET,baseline.ARENA_CPU_BUDGET);
});
test('M5-D protege la consecuencia territorial en las cuatro orientaciones del tablero',async()=>{
 const rotate=c=>(c%9)*9+8-Math.floor(c/9);let s=nine();
 for(let n=0;n<4;n++){
  const turn=await ownTurn(s,chooseArenaCpu);assert.equal(analyzeArena(turn.state).score.A,9);
  s=structuredClone(s);s.pieces.forEach(p=>{p.pos=rotate(p.pos);});s.turn.path=s.turn.path.map(rotate);
  s.walls=s.walls.map(w=>w.split('-').map(Number).map(rotate).sort((a,b)=>a-b).join('-'));
 }
});
test('M5-D no premia regalar 9 casillas al rival',async()=>{
 const f=enemyGainClosure(),w=f.witness.reduce(applyArena,f.state);assert.equal(analyzeArena(w).score.B,9);assert.equal(analyzeArena(w).score.A,0);
 const turn=await ownTurn(f.state,chooseArenaCpu);assert.equal(analyzeArena(turn.state).score.B,0);
});
test('M5-D asegura una casilla cuando es razonable; evita hacerlo si permite derrota inmediata',async()=>{
 const good=fixtures().find(f=>f.name==='asegurar-1-con-poder'),small=await ownTurn(good.state,chooseArenaCpu);
 assert.equal(analyzeArena(small.state).score.A,1);assert.ok(!analyzeArena(small.state).active.includes('A1'));
 const bad=harmfulSmallClosure(),closed=bad.witness.reduce(applyArena,bad.state);assert.equal(analyzeArena(closed).score.A,1);
 assert.ok(winningTurnReply(closed,'A').sequence,'El cierre pequeño permite una derrota verificable');
 const defended=await ownTurn(bad.state,chooseArenaCpu),replies=winningTurnReply(defended.state,'A');
 assert.ok(replies.complete);assert.equal(replies.sequence,null);assert.ok(defended.sequence.some(a=>a.type==='demolition'));
});
test('M5-D presupuestos menores y reloj vencido conservan respaldo legal y estado',async()=>{
 for(const nodes of [0,1,12,48,160]){
  const s=nine(),before=JSON.stringify(s),a=await chooseArenaCpu(s,{...fixed,budget:{nodes}});
  assert.ok(a.nodes<=nodes);assert.ok(arenaCpuActions(s).some(x=>sameArenaAction(x,a.action)));assert.equal(JSON.stringify(s),before);
 }
 let clock=0;const s=createArena(),r=await chooseArenaCpu(s,{now:()=>clock++});
 assert.ok(r.nodes<=160);assert.ok(arenaCpuActions(s).some(x=>sameArenaAction(x,r.action)));
});
test('M5-D completa el sondeo antes del corte blando observado en un Worker frío',async()=>{
 let clock=0;const s=nine(),r=await chooseArenaCpu(s,{now:()=>clock,yieldControl:async()=>{clock=41;}});
 assert.equal(r.action.type,'extraWall');assert.ok([41,49].includes(r.action.to));assert.ok(r.tacticalNodes>0);assert.ok(r.nodes<=160);
 const after=applyArena(s,r.action),turn=await ownTurn(after,chooseArenaCpu);assert.equal(analyzeArena(turn.state).score.A,9);
});
