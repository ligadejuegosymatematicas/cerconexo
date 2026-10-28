import test from 'node:test';
import assert from 'node:assert/strict';
import {createArena,applyArena} from '../src/engine.mjs';
import {arenaCpuPresentation,createCpuPresentation,CPU_PRESENTATION_MS} from '../src/cpuPresentation.mjs';

test('Presentación: selección, pasos y muro no alteran el estado ni los tiempos de cálculo',()=>{
  let s=createArena({policy:'team'});
  for(const a of [{type:'select',actor:'A1'},{type:'move',to:11},{type:'wall',to:12}]){
    const after=applyArena(s,a),raw=JSON.stringify([s,after]);
    const steps=arenaCpuPresentation(s,after,a);
    assert.equal(steps[0].kind,a.type);assert.equal(steps[0].milliseconds,CPU_PRESENTATION_MS[a.type]);
    assert.equal(JSON.stringify([s,after]),raw);s=after;
  }
});
test('Presentación: poder, recogida y territorio en orden; descarte nombra el poder consumido',()=>{
  const before=createArena();before.inventories.A1=[{id:'j',type:'jump'}];
  const after=structuredClone(before);after.lastEvents=[{type:'pickup',actor:'A1',power:'extraWall'},{type:'secured',actor:'A1'},{type:'territory',team:'A',delta:1}];
  const steps=arenaCpuPresentation(before,after,{type:'jump',power:'j',to:11});
  assert.deepEqual(steps.map(s=>s.kind),['jump','pickup','territory']);
  assert.match(steps[0].text,/Salto/);assert.match(steps[1].text,/Muro adicional/);assert.match(steps[2].text,/1 casilla\./);
  after.lastEvents=[];
  assert.match(arenaCpuPresentation(before,after,{type:'discard',owner:'A1',power:'j'})[0].text,/A1 descarta Salto/);
});
test('Presentación: fin y descarte humano son información, sin decisiones automáticas',()=>{
  const before=createArena(),after=structuredClone(before);after.pending={team:'B'};
  assert.match(arenaCpuPresentation(before,after,{type:'wall',to:11})[0].text,/Equipo B: elige qué descartar/);
  after.pending=null;after.over=true;after.winners=['A','B'];
  const steps=arenaCpuPresentation(before,after,{type:'wall',to:11});
  assert.match(steps.at(-1).text,/Empate entre A, B/);assert.equal(steps.at(-1).milliseconds,900);
});
function clock(){
  let id=0;const pending=new Map();return {pending,schedule(fn,ms){pending.set(++id,{fn,ms});return id;},unschedule(i){pending.delete(i);},advance(){const [i,t]=pending.entries().next().value;pending.delete(i);t.fn();}};
}
test('Presentación: barrera activa hasta terminar, un único anuncio por etapa',()=>{
  const c=clock(),seen=[];let finished=0;
  const p=createCpuPresentation({...c,show:s=>seen.push(s.text),onFinish:()=>finished++});
  p.play([{text:'uno',milliseconds:700},{text:'dos',milliseconds:850}]);
  assert.equal(p.active,true);assert.deepEqual(seen,['uno']);c.advance();assert.deepEqual(seen,['uno','dos']);
  assert.equal(finished,0);c.advance();assert.equal(finished,1);assert.equal(p.active,false);
});
test('Presentación: cancelar/reemplazar/reiniciar invalida callbacks anteriores sin reanudaciones tardías',()=>{
  const c=clock(),seen=[];let finished=0;
  const p=createCpuPresentation({...c,show:s=>seen.push(s.text),onFinish:()=>finished++});
  p.play([{text:'anterior',milliseconds:100}]);const stale=[...c.pending.values()][0].fn;
  p.play([{text:'nueva',milliseconds:100}]);stale();assert.deepEqual(seen,['anterior','nueva']);assert.equal(finished,0);
  p.cancel();c.pending.clear();stale();assert.equal(p.active,false);assert.equal(finished,0);
});
