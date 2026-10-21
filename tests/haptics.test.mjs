import test from 'node:test';
import assert from 'node:assert/strict';
import {createHaptics,HAPTIC_KEY} from '../src/haptics.mjs';

function fixture(options={}){
  const calls=[],data=new Map();let clock=1000;
  const storage={getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value)};
  const reduced={matches:false};
  const h=createHaptics({nav:{vibrate:pattern=>{calls.push(pattern);return true;}},storage,reduced,now:()=>clock,...options});
  return {h,calls,data,storage,reduced,tick:()=>{clock+=200;}};
}
test('Vibración activada por defecto sin escribir una decisión; preferencia independiente del guardado',()=>{
  const f=fixture();f.data.set('wallgo-league-v2','partida');
  assert.equal(f.h.enabled,true);assert.deepEqual(f.calls,[]);assert.equal(f.data.has(HAPTIC_KEY),false);
  f.h.setEnabled(true);assert.deepEqual(f.calls,[]);
  const restored=createHaptics({nav:{vibrate:()=>true},storage:f.storage});
  assert.equal(restored.enabled,true);assert.equal(f.data.get('wallgo-league-v2'),'partida');
  assert.deepEqual(JSON.parse(f.data.get(HAPTIC_KEY)),{vibration:true});
});
test('Una sola señal por jugada: aislamiento sustituye al muro; se limitan ráfagas',()=>{
  const f=fixture();f.h.setEnabled(true);
  assert.ok(f.h.committed());assert.equal(f.h.committed(),false);
  f.tick();assert.ok(f.h.committed({secured:true}));
  f.tick();assert.ok(f.h.pulse('turn'));
  assert.deepEqual(f.calls,[12,[12,35,12],8]);
});
test('Desactivar cancela el pulso y no vuelve a vibrar, aunque se confirme otra jugada',()=>{
  const f=fixture();f.h.setEnabled(true);f.h.pulse('wall');f.h.setEnabled(false);f.tick();
  assert.equal(f.h.committed(),false);assert.deepEqual(f.calls,[12,0]);
  assert.equal(JSON.parse(f.data.get(HAPTIC_KEY)).vibration,false);
});
test('Sin API, API rechazada o excepción: no hay errores ni dependencia del juego',()=>{
  for(const nav of [{},{vibrate:()=>false},{vibrate:()=>{throw Error('Bloqueada');}}]){
    const f=fixture({nav});f.h.setEnabled(true);
    assert.equal(f.h.committed(),false);assert.doesNotThrow(()=>f.h.stop());
  }
});
test('Visibilidad y movimiento reducido suprimen la vibración sin borrar la preferencia',()=>{
  let visible=false;const f=fixture({visible:()=>visible});f.h.setEnabled(true);
  assert.equal(f.h.pulse('turn'),false);visible=true;f.reduced.matches=true;
  assert.equal(f.h.committed(),false);assert.equal(f.h.enabled,true);
  f.reduced.matches=false;assert.ok(f.h.committed());
});
test('Datos corruptos y almacenamiento bloqueado mantienen una opción utilizable en memoria',()=>{
  for(const storage of [{getItem:()=>'{mal JSON',setItem:()=>{throw Error('Sin almacenamiento');}},
    {getItem:()=>{throw Error('Bloqueado');},setItem:()=>{throw Error('Bloqueado');}}]){
    const f=fixture({storage});assert.equal(f.h.enabled,true);
    assert.doesNotThrow(()=>f.h.setEnabled(true));assert.ok(f.h.committed());
  }
});
