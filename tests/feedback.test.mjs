import test from 'node:test';
import assert from 'node:assert/strict';
import {InteractionGate,createFeedback,MOTION_MS} from '../src/feedback.mjs';

test('Una transición admite una sola acción; una finalización repetida no desbloquea otra',()=>{
  const gate=new InteractionGate(),first=gate.begin();
  assert.ok(gate.busy);assert.equal(gate.begin(),null);
  assert.ok(gate.finish(first));
  const second=gate.begin();
  assert.equal(gate.finish(first),false);assert.ok(gate.busy);
  assert.ok(gate.finish(second));assert.equal(gate.busy,false);
});
test('Nueva partida invalida las continuaciones anteriores aunque haya otra transición activa',()=>{
  const gate=new InteractionGate(),old=gate.begin();
  gate.reset();const fresh=gate.begin();
  assert.equal(gate.current(old),false);assert.equal(gate.finish(old),false);
  assert.ok(gate.current(fresh));assert.ok(gate.finish(fresh));
});
test('Movimiento reducido evita Web Animations y presenta directamente el destino',async()=>{
  const node={style:{},setAttribute:(key,value)=>{node[key]=value;},animate:()=>{throw Error('No animar');}};
  const feedback=createFeedback({board:{querySelector:()=>node},banner:node,prompt:{},reduced:{matches:true,addEventListener(){}}});
  await feedback.move(node,8,9);
  assert.equal(node.transform,'translate(260 180)');
  feedback.turnStarted({actor:'A1',team:'A'});
  assert.ok(MOTION_MS.step>=150&&MOTION_MS.step<=220);
  assert.ok(MOTION_MS.wall>=200&&MOTION_MS.wall<=350);
});
