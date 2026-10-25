import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {applyTurn,territory} from '../src/engine.mjs';
import {deriveParticipationEvents} from '../src/participationEvents.mjs';
import {recentParticipationPresentation} from '../src/matchup.mjs';
import {finalRegions,componentSummary,regionDescription} from '../src/explorationData.mjs';
import {participationFixture,directDuelFixture} from './participation-fixtures.mjs';
import {finishFixture} from './territory-fixtures.mjs';
import {resultFixture} from './result-fixtures.mjs';

for(const team of ['A','B'])for(const number of [1,2])test(`UX: aviso de ${team}${number} identifica éxito y redistribución real`,()=>{
  const {before}=participationFixture({team});
  if(number===2){
    const one=before.pieces.find(p=>p.id===team+'1'),two=before.pieces.find(p=>p.id===team+'2');
    [one.pos,two.pos]=[two.pos,one.pos];before.lastActed[team]=team+'1';finishFixture(before);
  }
  const actor=team+number,pos=before.pieces.find(p=>p.id===actor).pos;
  const after=applyTurn(before,{actor,path:[pos],to:team==='A'?15:19}),event=deriveParticipationEvents(before,after),data=recentParticipationPresentation(event);
  assert.equal(data.heading,`✓ ${actor} ASEGURÓ SU TERRITORIO`);assert.equal(data.team,team);
  assert.equal(data.detail,`${team}${number===1?2:1} jugará todos los turnos del equipo ${team}.`);
});
test('UX: aseguramiento simultáneo se comunica en un solo aviso sin perder ningún equipo',()=>{
  const {before,after}=directDuelFixture(),event=deriveParticipationEvents(before,after),saved=JSON.stringify(after),data=recentParticipationPresentation(event);
  assert.equal(data.heading,'✓ A1 Y B1 ASEGURARON TERRITORIO');assert.equal(data.team,'both');
  assert.equal(data.detail,'A2 jugará todos los turnos del equipo A. B2 jugará todos los turnos del equipo B.');
  assert.equal(JSON.stringify(after),saved);
});
test('UX: resumen distingue componentes de casillas oficiales para victoria A/B/empate',()=>{
  for(const options of [{A:28,B:16},{A:16,B:28},{A:23,B:23},{A:25,B:24}]){
    const {after}=resultFixture(options),saved=JSON.stringify(after),model=finalRegions(after);
    assert.equal(componentSummary(model),`${model.total} componentes: A ${model.counts.A} · B ${model.counts.B} · Vacías ${model.counts.empty}`);
    assert.equal(model.total,model.counts.A+model.counts.B+model.counts.empty);assert.equal(model.score.A+model.score.B+model.score.empty,49);
    assert.deepEqual(model.score,territory(after).score);assert.equal(JSON.stringify(after),saved);
  }
});
test('UX: textos contextuales aprobados, plural y ausencia de puntos en vacías',()=>{
  assert.equal(regionDescription({type:'A',cells:[8],ids:['A1']}).pieces,'Ficha A1');
  assert.equal(regionDescription({type:'B',cells:[8,9],ids:['B1','B2']}).pieces,'Fichas B1 y B2');
  assert.equal(regionDescription({type:'A',cells:[8],ids:['A1']}).explanation,'Estas casillas forman una componente conexa: puedes pasar de una a otra sin cruzar muros.');
  const empty=regionDescription({type:'empty',cells:[0],ids:[]});assert.equal(empty.title,'COMPONENTE CONEXA · VACÍA');assert.equal(empty.size,'1 casilla');assert.equal(empty.pieces,'Sin puntos');
  assert.equal(empty.explanation,'Estas casillas están conectadas, pero no pertenecen a ningún equipo.');
});
test('UX: solo cuatro pasos, sin modo separado ni teoría; controles accesibles',async()=>{
  const html=await readFile(new URL('../clasico/index.html',import.meta.url),'utf8');
  assert.doesNotMatch(html,/id="explore"|exploration-tabs|explorationPanel|¿Qué matemática hay detrás\?/);
  assert.equal((html.match(/<li><svg viewBox="0 0 44 44"/g)||[]).length,4);
  assert.match(html,/Sin rivales, aseguras la región y no vuelves a actuar/);
  const manual=await readFile(new URL('../src/illustratedManual.mjs',import.meta.url),'utf8');assert.match(manual,/con igualdad en el máximo hay empate/);
  assert.match(html,/aria-label="Quitar selección"/);
  const panel=html.slice(html.indexOf('<aside class="score-panel'),html.indexOf('<section class="arena'));
  for(const id of ['componentInfo','scoreA','scoreB','activeA','activeB','meter','emptyCount'])assert.ok(panel.includes(`id="${id}"`));
});
test('UX: fin y jugadas sin aseguramiento no producen avisos nuevos',()=>{
  const {before,after}=resultFixture();assert.equal(recentParticipationPresentation(deriveParticipationEvents(before,after)),null);
  assert.equal(recentParticipationPresentation(deriveParticipationEvents(before,before)),null);
});
test('UX: se conserva exactamente el algoritmo de frontera aprobado',async()=>{
  const source=await readFile(new URL('../src/explorationData.mjs',import.meta.url),'utf8');
  const boundary=source.slice(source.indexOf('export function componentBoundary'));
  assert.equal(createHash('sha256').update(boundary).digest('hex'),'60decf931ae293b8a0d76eca57024f0522570144a9f769755b6ce6e0bbb48410');
});
