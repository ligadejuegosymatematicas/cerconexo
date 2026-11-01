import test from 'node:test';
import assert from 'node:assert/strict';
import { storageKey } from '../session.mjs';
import { rememberOnline, recoverableOnline, dismissOnline } from '../session-index.mjs';
function fixture(){const map=new Map();return {get length(){return map.size;},key:i=>[...map.keys()][i],getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};}
const code='ABCDEFGH23',credential='A'.repeat(43);
test('Inicio recupera accesos anteriores sin migrar ni duplicar sus credenciales',()=>{
  const storage=fixture(),raw=JSON.stringify({code,credential,pending:{actionId:'pending'}});storage.setItem(storageKey(code),raw);
  assert.equal(recoverableOnline(storage).saved.credential,credential);rememberOnline(storage,{code,profile:'1'});
  assert.equal(storage.getItem(storageKey(code)),raw);assert.ok(!storage.getItem('cerconexo-online-view-v1').includes(credential));
  assert.equal(recoverableOnline(storage).saved.pending.actionId,'pending');
});
test('Una sala caducada se retira de Inicio sin borrar el acceso ni los guardados locales',()=>{
  const storage=fixture();storage.setItem(storageKey(code),JSON.stringify({code,credential}));storage.setItem('wallgo-league-v2','local-save');rememberOnline(storage,{code,profile:'1'});dismissOnline(storage,{code,profile:'1'});
  assert.equal(recoverableOnline(storage),null);assert.ok(storage.getItem(storageKey(code)));assert.equal(storage.getItem('wallgo-league-v2'),'local-save');
});
test('La última vista elegida y su perfil tienen prioridad sobre otras salas',()=>{
  const storage=fixture();for(const profile of ['1','2'])storage.setItem(storageKey(code,profile),JSON.stringify({code,credential}));
  rememberOnline(storage,{code,profile:'1'});assert.equal(recoverableOnline(storage).profile,'1');dismissOnline(storage,{code,profile:'1'});assert.equal(recoverableOnline(storage).profile,'2');
});
test('Metadatos corruptos o almacenamiento no disponible no inventan una sesión',()=>{
  const storage=fixture();storage.setItem('cerconexo-online-view-v1','{invalid');assert.equal(recoverableOnline(storage),null);
  assert.equal(recoverableOnline({getItem(){throw new Error('blocked');},get length(){throw new Error('blocked');}}),null);
});
