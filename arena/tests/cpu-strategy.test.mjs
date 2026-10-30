import test from 'node:test';
import assert from 'node:assert/strict';
import {createArena,applyArena} from '../src/engine.mjs';
import {analyzeArena} from '../src/geometry.mjs';
import {chooseArenaCpu,arenaCpuActions,sameArenaAction,evaluateArenaCpu} from '../src/cpuStrategy.mjs';
import {arenaCpuFeatures} from '../src/cpuEvaluation.mjs';
import {bridgeDefense,defenseDiscard,reconquest,jumpConquest,terminalClosure,powerConservation,strategicPositions} from './cpu-strategy-fixtures.mjs';
import {m5aReference,ownTurn,winningTurnReply} from './cpu-strategy-tools.mjs';

const old=await m5aReference(),fixed={now:()=>0};
for(const policy of ['piece','team'])for(const team of ['A','B'])test(`M5-B defensa ${policy}/${team}: evita la respuesta ganadora demostrada de M5-A`,async()=>{
  const s=bridgeDefense({policy,team}),before=JSON.stringify(s);
  const a=await ownTurn(s,old.chooseArenaCpu),b=await ownTurn(s,chooseArenaCpu);
  assert.ok(winningTurnReply(a.state,team).sequence,'La referencia debe conservar el contraejemplo');
  if(policy==='piece'&&team==='A'){
    const larger=await ownTurn(s,old.chooseArenaCpu,{budget:{nodes:1600,depth:8,beam:12}});
    assert.ok(winningTurnReply(larger.state,team).sequence,'Más búsqueda propia no sustituye examinar al rival');
  }
  const response=winningTurnReply(b.state,team);assert.ok(response.complete);assert.equal(response.sequence,null);
  assert.ok(b.sequence.some(a=>a.type==='demolition'));assert.equal(JSON.stringify(s),before);
  assert.ok(b.measure.some(m=>m.replyNodes>0));
});
for(const policy of ['piece','team'])test(`M5-B descarte ${policy}: conserva la defensa útil en vez de guiarse solo por el valor fijo`,async()=>{
  const s=defenseDiscard(policy),a=await ownTurn(s,old.chooseArenaCpu),b=await ownTurn(s,chooseArenaCpu);
  assert.ok(winningTurnReply(a.state,'A').sequence);assert.equal(b.sequence[0].power,'discard-extra');
  assert.ok(b.sequence.some(a=>a.type==='demolition'));const reply=winningTurnReply(b.state,'A');assert.ok(reply.complete);assert.equal(reply.sequence,null);
});
test('M5-B reconquista: conserva un plan de entrada en la región rival tras demoler',async()=>{
  const s=reconquest(),r=await chooseArenaCpu(s,fixed);assert.equal(r.action.type,'demolition');
  assert.equal(analyzeArena(applyArena(s,r.action)).score.B,0);
});
test('M5-B controles positivos: Salto asegura y cierre favorable conserva el resultado oficial',async()=>{
  const jump=jumpConquest(),j=await chooseArenaCpu(jump,fixed),next=applyArena(jump,j.action);
  assert.equal(j.action.type,'jump');assert.equal(analyzeArena(next).score.A,1);assert.equal(next.completedTurns,1);
  const s=terminalClosure(),r=await chooseArenaCpu(s,fixed),end=applyArena(s,r.action);assert.ok(end.over);assert.deepEqual(end.winners,['A']);
});
test('M5-B evaluación simétrica; el territorio potencial no altera puntos, inventarios ni estado',()=>{
  for(const {state} of strategicPositions()){
    assert.deepEqual(arenaCpuActions(state),old.arenaCpuActions(state));
    const before=JSON.stringify(state);assert.ok(Math.abs(evaluateArenaCpu(state,'A')+evaluateArenaCpu(state,'B'))<1e-8);
    assert.equal(arenaCpuFeatures(state,'A').points,analyzeArena(state).score.A-analyzeArena(state).score.B);assert.equal(JSON.stringify(state),before);
  }
});
test('M5-B conserva un poder cuando abrir un muro no ofrece una ventaja táctica',async()=>{
  const turn=await ownTurn(powerConservation(),chooseArenaCpu);
  assert.ok(!turn.sequence.some(a=>a.type==='demolition'));assert.equal(turn.state.inventories.A1[0].id,'save-d');
});
test('M5-B no valora como utilizable el poder retenido por una ficha asegurada',()=>{
  const s=defenseDiscard('team');s.pending=null;s.resolution=null;s.inventories.A=[];
  // En política individual, A2 conserva un poder aunque no pueda utilizarlo.
  s.policy='piece';s.inventories={A1:[],A2:[],B1:[],B2:[]};
  const before=arenaCpuFeatures(s,'A').powers;s.inventories.A2=[{id:'retained',type:'demolition'}];
  const retained=arenaCpuFeatures(s,'A').powers-before;s.inventories.A2=[];s.inventories.A1=[{id:'active',type:'demolition'}];
  assert.ok(retained>0);assert.ok(arenaCpuFeatures(s,'A').powers-before>retained);
});
test('M5-B presupuesto común a planificación y respuestas; respaldo legal y determinista',async()=>{
  for(const nodes of [0,1,12,40,160])for(const s of [createArena(),createArena({policy:'team'}),defenseDiscard()]){
    const before=JSON.stringify(s),a=await chooseArenaCpu(s,{budget:{nodes},...fixed}),b=await chooseArenaCpu(s,{budget:{nodes},...fixed});
    assert.ok(a.nodes<=nodes);assert.equal(a.nodes,(a.ownNodes??0)+(a.replyNodes??0));
    assert.ok(arenaCpuActions(s).some(x=>sameArenaAction(x,a.action)));assert.deepEqual(a.action,b.action);assert.equal(JSON.stringify(s),before);
  }
});
test('M5-B reloj agotado termina sin inventar acciones, y sigue cediendo el hilo',async()=>{
  let clock=0,yields=0;const s=bridgeDefense(),r=await chooseArenaCpu(s,{now:()=>clock++,yieldControl:async()=>{yields++;}});
  assert.ok(r.nodes<160);assert.ok(arenaCpuActions(s).some(a=>sameArenaAction(a,r.action)));assert.ok(yields>0);
  assert.equal((await chooseArenaCpu(createArena({mode:'ffa'}))).action,null);
});
