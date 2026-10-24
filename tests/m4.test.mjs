import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {RegionInspection,regionAnnotation} from '../arena/src/regionInspection.mjs';
import {initialState,territory} from '../src/engine.mjs';
test('M4: consulta Clásico usa las componentes oficiales y no muta el estado',()=>{
 const g=initialState(),before=JSON.stringify(g),m=new RegionInspection();m.update(territory(g).components,7);m.toggle();m.select(8);assert.equal(m.selected.cells.length,49);assert.equal(JSON.stringify(g),before);
 const a=regionAnnotation(m.selected,7,{occupied:g.pieces.map(p=>p.pos)});assert.ok(m.selected.cells.includes(a.cell));m.select(9);assert.equal(m.selected,null);
});
test('M4: el adaptador de consulta no accede a almacenamiento ni funciones de jugada',async()=>{
 const source=await readFile(new URL('../src/liveInspection.mjs',import.meta.url),'utf8');assert.doesNotMatch(source,/localStorage|sessionStorage|applyTurn|writeGameSave|dispatch\(/);
});
test('M4: cabeceras ofrecen Inicio, Guía y Nueva partida; Arena conserva diagnóstico separado',async()=>{
 for(const file of ['clasico/index.html','arena/index.html']){const s=await readFile(new URL('../'+file,import.meta.url),'utf8');assert.match(s,/gameShell.css/);assert.match(s,/>Guía</);assert.match(s,/>Nueva partida</);assert.match(s,/Ver reglas completas/);}
 const a=await readFile(new URL('../arena/index.html',import.meta.url),'utf8');assert.match(a,/id="experimentDetails" hidden/);
});
