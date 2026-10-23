import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {RegionInspection,regionAnnotation,regionBoundary,regionDescription} from '../src/regionInspection.mjs';
import {powerIcon,POWER_DRAWINGS} from '../src/powerIcons.mjs';
import {createArena,applyArena,legalArenaActions} from '../src/engine.mjs';
import {analyzeArena,arenaNeighbors,arenaWall} from '../src/geometry.mjs';
import {ArenaSession} from '../src/session.mjs';
const comp=(cells,type='empty',ids=[],teams=[])=>({cells,type,ids,teams});
const enclosing=cells=>[...new Set(cells.flatMap(c=>arenaNeighbors(c).filter(n=>!cells.includes(n)).map(n=>arenaWall(c,n))))];

test('Inspección genérica recibe componentes sin importar motor, DOM, guardado ni reglas',()=>{
  const source=fs.readFileSync(new URL('../src/regionInspection.mjs',import.meta.url),'utf8');assert.ok(!/^import /m.test(source));
  for(const n of [7,9]){const v=new RegionInspection();v.update([comp(Array.from({length:n*n},(_,c)=>c))],n);v.toggle();for(let c=0;c<n*n;c++){v.selectedCell=null;assert.ok(v.select(c));assert.equal(v.selected.cells.length,n*n);}}
});
test('Modo consulta: activa, selecciona, cambia, deselecciona y abandona sin afectar el modelo',()=>{
  const v=new RegionInspection(),components=[comp([0,1]),comp([2])],before=JSON.stringify(components);v.update(components,3,1);
  assert.equal(v.select(0),false);v.toggle();v.select(0);assert.equal(v.selected,components[0]);v.select(1);assert.equal(v.selected,null);
  v.select(2);assert.equal(v.selected.cells.length,1);v.toggle();assert.equal(v.selected,null);assert.equal(JSON.stringify(components),before);
});
test('Propietario, compartida con varios equipos y vacía; conteos reales y singular',()=>{
  assert.match(regionDescription(comp([10],'A',['A1'],['A'])),/exclusiva.*Equipo A.*1 casilla.*A1/);
  assert.match(regionDescription(comp([1,2],'shared',['A','B','C'],['A','B','C'])),/compartida.*A, B, C.*2 casillas/);
  assert.match(regionDescription(comp([0],'empty')),/vacía.*Sin puntos.*1 casilla/);
});
for(const cells of [[0],[0,1,9,10],[30,31,40],[0,1,2,9,11,18,19,20]])test(`Etiqueta dentro de componente de ${cells.length} casillas, incluyendo entrantes y agujeros`,()=>{
  for(const occupied of [[],cells]){
    const a=regionAnnotation(comp(cells),9,{occupied});assert.ok(cells.includes(a.cell));
    assert.equal(Math.floor(a.y)*9+Math.floor(a.x),a.cell);assert.equal(a.count,cells.length);
    const halfW=(a.compact?52:70)/200,halfH=(a.compact?34:48)/200;
    for(const x of [a.x-halfW,a.x+halfW])for(const y of [a.y-halfH,a.y+halfH])assert.equal(Math.floor(y)*9+Math.floor(x),a.cell);
  }
});
test('Frontera real: no segmentos internos, conserva hueco, selección de una sola casilla',()=>{
  assert.equal(regionBoundary([0],9).length,4);assert.equal(regionBoundary([0,1],9).length,6);
  const ring=[0,1,2,9,11,18,19,20];assert.equal(regionBoundary(ring,9).length,16);
  assert.deepEqual(regionBoundary([8,9],9).length,8); // No une extremos de filas.
});
test('Teclado: foco único, flechas ortogonales, límites, Home y End',()=>{
  const v=new RegionInspection();v.update([],9);assert.equal(v.moveFocus('ArrowLeft'),0);assert.equal(v.moveFocus('ArrowUp'),0);
  assert.equal(v.moveFocus('ArrowRight'),1);assert.equal(v.moveFocus('ArrowDown'),10);assert.equal(v.moveFocus('End'),17);assert.equal(v.moveFocus('ArrowRight'),17);assert.equal(v.moveFocus('Home'),9);
});
test('Actualización de topología o clasificación limpia la selección; render idéntico la conserva',()=>{
  const v=new RegionInspection();v.update([comp([0,1])],9);v.toggle();v.select(0);v.update([comp([1,0])],9);assert.ok(v.selected);
  v.update([comp([0]),comp([1])],9);assert.equal(v.selected,null);v.select(0);v.update([comp([0],'A'),comp([1])],9);assert.equal(v.selected,null);v.reset();assert.equal(v.enabled,false);
});
test('Todos los modos: consulta no modifica puntuación, inventario, turno, diario ni almacenamiento',()=>{
  for(const setup of [{mode:'duo',policy:'piece'},{mode:'duo',policy:'team'},{mode:'ffa',policy:'piece'}]){
    const storage={raw:null,setItem(k,v){this.raw=v;}},session=new ArenaSession(storage,setup);session.save();const raw=storage.raw,game=JSON.stringify(session.game);
    const view=analyzeArena(session.game),v=new RegionInspection();v.update(view.components,9);v.toggle();for(let c=0;c<81;c++){v.select(c);regionAnnotation(v.selected,9);}
    assert.equal(storage.raw,raw);assert.equal(JSON.stringify(session.game),game);assert.equal(session.commands.length,0);
  }
});
test('Regiones del motor con exclusiva, compartida y vacías; compañeras cuentan una vez',()=>{
  const s=createArena();s.walls=[...enclosing([10]),...enclosing([0]),...enclosing([30,31,40])];const view=analyzeArena(s),v=new RegionInspection();v.update(view.components,9);v.toggle();
  for(const [cell,type,count] of [[10,'A',1],[0,'empty',1],[30,'empty',3],[16,'shared',76]]){
    v.selectedCell=null;v.select(cell);assert.equal(v.selected.type,type);assert.equal(v.selected.cells.length,count);
  }
});
test('Tres SVG originales distintos, vectoriales y reutilizables, sin imágenes ni letras de sustitución',()=>{
  assert.equal(new Set(Object.values(POWER_DRAWINGS)).size,3);
  for(const type of ['demolition','jump','extraWall']){
    const svg=powerIcon(type);assert.match(svg,/<svg.*viewBox="0 0 24 24"/);assert.match(svg,/<path /);assert.ok(!/<text|<image|href=|<script/.test(svg));assert.match(svg,/currentColor/);
  }assert.throws(()=>powerIcon('otro'));
});
test('M3-A: compatibilidad de diario, pasos y descartes pendientes sin migración',()=>{
  const data=JSON.parse(fs.readFileSync(new URL('./m3a-saves.json',import.meta.url),'utf8'));
  for(const [name,hash] of Object.entries(data.hashes))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(new URL(`../src/${name}.mjs`,import.meta.url))).digest('hex'),hash,`Núcleo M3-A modificado: ${name}`);
  for(const fixture of data.saves){const restored=ArenaSession.restore({setItem(){throw new Error('La consulta no escribe');}},fixture.raw);assert.equal(restored.ok,true);assert.deepEqual(restored.session.game,fixture.game);}
});
