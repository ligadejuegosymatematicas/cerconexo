import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {initialState,activeIds} from '../src/engine.mjs';
import {createHaptics,HAPTIC_KEY} from '../src/haptics.mjs';
import {matchupPresentation,recentParticipationMessage} from '../src/matchup.mjs';
import {bindDialog} from '../src/dialogs.mjs';
import {deriveParticipationEvents} from '../src/participationEvents.mjs';
import {participationFixture,directDuelFixture} from './participation-fixtures.mjs';
import {resultFixture} from './result-fixtures.mjs';

test('5A/M1: el oráculo clásico conserva los bytes de la versión estable',async()=>{
  const data=await readFile(new URL('./classic-engine-v2.mjs',import.meta.url));
  assert.equal(createHash('sha256').update(data).digest('hex'),'48dc06147f1bd0643d9a75ff828566f9f1517f4b24792ff352ca9c2cf1cb6b4b');
});
for(const value of [false,true])test(`5A: decisión de vibración ${value} conservada sin migración destructiva`,()=>{
  const stored=new Map([[HAPTIC_KEY,JSON.stringify({vibration:value})],['wallgo-league-v2','partida']]);let writes=0;
  const storage={getItem:k=>stored.get(k),setItem(k,v){writes++;stored.set(k,v);}};
  const h=createHaptics({nav:{vibrate:()=>true},storage});
  assert.equal(h.enabled,value);assert.equal(writes,0);assert.equal(stored.get('wallgo-league-v2'),'partida');
  h.setEnabled(!value);assert.equal(JSON.parse(stored.get(HAPTIC_KEY)).vibration,!value);assert.equal(stored.get('wallgo-league-v2'),'partida');
});
test('5A: ausencia o datos sin decisión usan nuevo valor; no se pulsa al crear',()=>{
  for(const raw of [null,'{}','null','{"vibration":"false"}','JSON dañado']){
    let calls=0,writes=0;
    const h=createHaptics({nav:{vibrate:()=>{calls++;return true;}},storage:{getItem:()=>raw,setItem:()=>{writes++;}}});
    assert.equal(h.enabled,true);assert.equal(calls,0);assert.equal(writes,0);
  }
});
test('5A: sin API se conserva preferencia sin afirmar soporte ni provocar errores',()=>{
  const h=createHaptics({nav:{},storage:{getItem:()=>'{"vibration":false}'}});
  assert.equal(h.supported,false);assert.equal(h.enabled,false);assert.equal(h.committed(),false);assert.doesNotThrow(()=>h.stop());
});
test('5A: enfrentamiento inicial 2 vs. 2 procede de las fichas activas del motor',()=>{
  const game=initialState(),snapshot=JSON.stringify(game),view=matchupPresentation(game);
  assert.equal(view.label,'2 vs. 2');assert.equal(view.players,'A1 y A2 vs. B1 y B2');
  assert.deepEqual(new Set([...view.teams.A,...view.teams.B]),activeIds(game));assert.equal(JSON.stringify(game),snapshot);
});
for(const team of ['A','B'])test(`5A: composición simétrica tras asegurar ${team}1 y texto de redistribución`,()=>{
  const {before,after}=participationFixture({team}),view=matchupPresentation(after),event=deriveParticipationEvents(before,after);
  assert.equal(view.label,team==='A'?'1 vs. 2':'2 vs. 1');
  assert.equal(view.players,team==='A'?'A2 vs. B1 y B2':'A1 y A2 vs. B2');
  assert.equal(recentParticipationMessage(event),`${team}1 aseguró su territorio. ${team}2 jugará todos los turnos del equipo ${team}.`);
  assert.deepEqual(matchupPresentation(JSON.parse(JSON.stringify(after))),view);
});
test('5A: transición directa o progresiva a 1 vs. 1 usa identificadores reales',()=>{
  for(const {before,after} of [directDuelFixture(),participationFixture({team:'B',alreadyA:true})]){
    const view=matchupPresentation(after),event=deriveParticipationEvents(before,after);
    assert.equal(view.label,'1 vs. 1 · Última disputa');assert.equal(view.players,'A2 vs. B2');
    assert.match(recentParticipationMessage(event),/asegur/);
  }
  const {before,after}=directDuelFixture();assert.equal(recentParticipationMessage(deriveParticipationEvents(before,after)),
    'A1 y B1 aseguraron su territorio. A2 jugará los turnos de A y B2 los turnos de B.');
});
test('5A: recarga y muros sin aseguramiento no fabrican acontecimientos; final suprime enfrentamiento',()=>{
  const {before,after}=participationFixture();assert.equal(recentParticipationMessage(deriveParticipationEvents(after,after)),null);
  const final=resultFixture().after;assert.equal(matchupPresentation(final),null);assert.equal(recentParticipationMessage(deriveParticipationEvents(before,final)),null);
});
test('5A: controles y los cuatro pasos breves mantienen el contenido aprobado',async()=>{
  const html=await readFile(new URL('../clasico/index.html',import.meta.url),'utf8');
  assert.doesNotMatch(html,/brand-copy|bottom-note|Cada muro cambia el mapa\.<\/span>|<p class="micro">LIGA/);
  for(const title of ['MUÉVETE','CONSTRUYE','ASEGURA TERRITORIO','GANA'])assert.ok(html.includes(title));
  const help=html.slice(html.indexOf('<dialog id="helpDialog"'),html.indexOf('<dialog id="optionsDialog"'));
  assert.doesNotMatch(help,/id="vibration"|legend-panel|LIGA DE JUEGOS/);
  assert.match(help,/Ver reglas completas/); // M4 recupera el segundo nivel solicitado.
  // M4.2: guía breve + manual por temas; las excepciones canónicas se mantienen internas.
  for(const text of ['0, 1 o 2','Sin cruzar muros ni fichas','Un muro al final','no vuelves a actuar','gana quien'])assert.ok(help.includes(text),text);
  const canonical=await readFile(new URL('../rules/canonical-classic.html',import.meta.url),'utf8');
  for(const text of ['regresar al origen','exactamente un muro','Una región sin fichas no puntúa','no vuelven a participar','empate'])assert.ok(canonical.includes(text),text);
});
test('5A: cerrar restaura el control que abrió el diálogo aunque el toque no lo enfoque',()=>{
  const previous=globalThis.document;
  try{
    const listeners=new Map(),openerListeners=new Map(),unrelated={};
    globalThis.document={activeElement:unrelated};
    const opener={isConnected:true,setAttribute(){},getClientRects:()=>[{}],addEventListener:(name,fn)=>openerListeners.set(name,fn),focus(){document.activeElement=this;}};
    const close={focus(){document.activeElement=this;}};
    const dialog={id:'rules',scrollTop:100,showModal(){this.open=true;},setAttribute(){},querySelector:()=>close,addEventListener:(name,fn)=>listeners.set(name,fn)};
    bindDialog(dialog,opener);openerListeners.get('click')();
    assert.equal(document.activeElement,close);assert.equal(dialog.scrollTop,0);
    listeners.get('close')();assert.equal(document.activeElement,opener);
  }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});
