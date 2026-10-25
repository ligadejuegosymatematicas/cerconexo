import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {manualExample,manualBoard,manualChapters} from '../src/illustratedManual.mjs';
import {initialState,availableMoves,wallOptions,territory,verifyState} from '../src/engine.mjs';
import {createArena,legalArenaActions,applyArena} from '../arena/src/engine.mjs';
import {analyzeArena} from '../arena/src/geometry.mjs';

for(const mode of ['classic','arena']){
 test(`M4.2 ${mode}: ilustración inicial coincide con las cuatro posiciones del motor`,()=>{
  const e=manualExample(mode),g=mode==='classic'?initialState():createArena();
  assert.deepEqual(e.pieces.map(({id,team,pos})=>({id,team,pos})),g.pieces.map(({id,team,pos})=>({id,team,pos})));
  assert.deepEqual(e.walls,g.walls);assert.equal(e.size,mode==='classic'?7:9);
  const svg=manualBoard(e);assert.equal((svg.match(/<circle/g)||[]).length,4);assert.match(svg,/role="img"/);
 });
 test(`M4.2 ${mode}: ejemplo de dos pasos con giro es legal y termina con muro disponible`,()=>{
  const e=manualExample(mode,'move');let g=mode==='classic'?initialState():createArena();
  for(let i=1;i<e.path.length;i++){
   if(mode==='classic')assert.ok(availableMoves(g,'A1',e.path[i-1]).includes(e.path[i]));
   else{const action={type:'move',to:e.path[i]};assert.ok(legalArenaActions(g).some(a=>a.type==='move'&&a.to===action.to));g=applyArena(g,action);}
  }
  assert.ok(mode==='classic'?wallOptions(g,e.path.at(-1)).length:legalArenaActions(g).some(a=>a.type==='wall'));
 });
 test(`M4.2 ${mode}: región ilustrada puntúa exactamente cuatro casillas con fronteras verdaderas`,()=>{
  const e=manualExample(mode,'territory'),g=mode==='classic'?initialState():createArena();g.walls=e.walls;
  if(mode==='classic'){g.moves=e.walls.length;g.currentActor='A2';assert.ok(verifyState(g));}
  const view=mode==='classic'?territory(g):analyzeArena(g),region=view.components.find(c=>c.ids.includes('A1'));
  assert.deepEqual(region.cells.toSorted((a,b)=>a-b),e.highlight.toSorted((a,b)=>a-b));
  assert.equal(view.score.A,4);assert.equal(view.score[mode==='classic'?'mixed':'shared'],e.size**2-4);
  for(const wall of e.walls){const [a,b]=wall.split('-').map(Number);assert.equal(e.highlight.includes(a),!e.highlight.includes(b));}
 });
 test(`M4.2 ${mode}: manual es consulta pura, sin almacenamiento ni llamadas de jugada`,()=>{
  const before=JSON.stringify(manualExample(mode));const chapters=manualChapters(mode);
  assert.equal(new Set(chapters.map(c=>c.id)).size,chapters.length);
  assert.equal(JSON.stringify(manualExample(mode)),before);
  for(const c of chapters)assert.ok(c.cards.length&&c.cards.every(c=>c.items.every(s=>typeof s==='string'&&s.length)));
 });
}
test('M4.2: las diferencias de aseguramiento y excepciones están explícitas en el manual',()=>{
 const text=m=>JSON.stringify(manualChapters(m));
 for(const rule of ['no vuelve','ambos pasos quedan consumidos','exactamente un muro','vacía','empate']){
  const expected={'no vuelve':'deja de participar para siempre','exactamente un muro':'Exactamente un muro','vacía':'Vacía'}[rule]||rule;
  assert.ok(text('classic').includes(expected),expected);
 }
 for(const rule of ['se reactiva inmediatamente','también','no destruye el muro','rival','rechazar','no vuelve','oleada','sin pedir otro muro']){
  const expected={'también':'también si recargas','no vuelve':'Lo descartado no vuelve'}[rule]||rule;assert.ok(text('arena').includes(expected),expected);
 }
 assert.doesNotMatch(text('classic'),/puede reactivarse/);
});
test('M4.2: no se expone JSON ni códigos internos en el contenido del manual',async()=>{
 for(const mode of ['classic','arena'])assert.doesNotMatch(JSON.stringify(manualChapters(mode)),/posiciones internas|0–80|JSON|\(2,2\)/);
 const src=await readFile(new URL('../src/illustratedManual.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(src,/localStorage|sessionStorage|applyTurn\(|applyArenaAction\(|writeGameSave/);
});
test('M4.2: ambas guías conservan cuatro conceptos compartidos y la diferencia territorial',async()=>{
 for(const file of ['clasico/index.html','arena/index.html']){
  const s=await readFile(new URL('../'+file,import.meta.url),'utf8');
  for(const h of ['MUÉVETE','CONSTRUYE','ASEGURA TERRITORIO','GANA'])assert.match(s,new RegExp('<h3>'+h+'</h3>'));
  assert.ok(file.startsWith('arena')?s.includes('puedes reactivarte'):s.includes('no vuelves a actuar'));
 }
});
test('M4.2: portada ofrece nueva partida primaria y consulta secundaria sin descripciones redundantes',async()=>{
 const s=await readFile(new URL('../index.html',import.meta.url),'utf8');
 assert.equal((s.match(/class="enter-mode" data-new/g)||[]).length,2);
 assert.equal((s.match(/class="continue-mode" data-continue/g)||[]).length,2);
 assert.doesNotMatch(s,/Muros y estrategia territorial|Poderes, conquista y reconquista/);
});
