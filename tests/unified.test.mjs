import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {launchState,launchLinks} from '../src/launchData.mjs';
import {initialState} from '../src/engine.mjs';
import {beginDraft,advanceDraft} from '../src/turnDraft.mjs';
import {encodeGameSave,GAME_SAVE_KEY} from '../src/gameSave.mjs';
import {makeCpuPlan} from '../src/cpuSession.mjs';
import {ArenaSession,ARENA_SAVE_KEY} from '../arena/src/session.mjs';
import {resultFixture} from './result-fixtures.mjs';

const oldArena=JSON.parse(await readFile(new URL('../arena/tests/m3a-saves.json',import.meta.url),'utf8'));
const storage=(values={})=>({getItem:key=>values[key]??null,setItem(){assert.fail('La portada no puede escribir');},removeItem(){assert.fail('La portada no puede borrar');}});

test('Inicio sin guardados no crea partidas ni preferencias',()=>{
  assert.deepEqual(launchState(storage()),{classic:{status:'new'},arena:{status:'new'}});
});
test('Partida clásica anterior sin campo de modalidad se reconoce en la ruta nueva',()=>{
  const raw=JSON.stringify({game:initialState()});
  assert.equal(launchState(storage({[GAME_SAVE_KEY]:raw})).classic.status,'pending');
  assert.match(launchLinks('classic','pending').enter,/clasico\/\?continue=1$/);
});
for(const mode of ['piece','team'])test(`Consulta conserva el turno irreversible ${mode} sin confirmarlo ni consumirlo`,()=>{
  const game=initialState({turnMode:mode}),actor=mode==='piece'?'A1':'A2';
  const draft=advanceDraft(game,{actor,path:[mode==='piece'?8:40]},mode==='piece'?9:39);
  const raw=encodeGameSave(game,draft),values={[GAME_SAVE_KEY]:raw};
  assert.equal(launchState(storage(values)).classic.status,'pending');
  assert.equal(values[GAME_SAVE_KEY],raw);assert.equal(JSON.parse(raw).game.moves,0);
});
test('Un plan CPU pendiente se consulta sin ejecutarlo ni reescribir su decisión',()=>{
  const game=initialState(),control={version:1,type:'cpu',difficulty:'advanced',humanTeam:'B',seed:812};
  const raw=encodeGameSave(game,beginDraft(game),{control,cpuPlan:makeCpuPlan(game,{actor:'A1',path:[8,9],to:16})});
  const values={[GAME_SAVE_KEY]:raw};assert.equal(launchState(storage(values)).classic.status,'pending');assert.equal(values[GAME_SAVE_KEY],raw);
});
test('Victorias y empate clásicos dan acceso al resultado sin nueva partida',()=>{
  for(const options of [{A:28,B:16},{A:16,B:28},{A:23,B:23}]){
    const game=resultFixture(options).after,raw=encodeGameSave(game,beginDraft(game));
    assert.equal(launchState(storage({[GAME_SAVE_KEY]:raw})).classic.status,'finished');
    assert.equal(launchLinks('classic','finished').label,'Ver resultado');
  }
});
test('Todos los diarios originales M3-A, incluido descarte pendiente y final, permanecen legibles',()=>{
  for(const fixture of oldArena.saves){
    const values={[ARENA_SAVE_KEY]:fixture.raw};
    assert.equal(launchState(storage(values)).arena.status,fixture.game.over?'finished':'pending',fixture.name);
    assert.equal(values[ARENA_SAVE_KEY],fixture.raw);
  }
});
test('La portada no mezcla modalidades, configuraciones ni preferencias',()=>{
  const classic=encodeGameSave(initialState(),beginDraft(initialState()));
  const session=new ArenaSession(storage(),{mode:'ffa'});
  const values={[GAME_SAVE_KEY]:classic,[ARENA_SAVE_KEY]:session.encode(),'cerconexo-preferences-v1':'{"vibration":false}'};
  const before=JSON.stringify(values);
  assert.deepEqual(launchState(storage(values)),{classic:{status:'pending'},arena:{status:'pending'}});
  assert.equal(JSON.stringify(values),before);
});
test('Datos dañados o almacenamiento bloqueado no sobrescriben la otra partida',()=>{
  const raw=oldArena.saves[0].raw;
  assert.deepEqual(launchState(storage({[GAME_SAVE_KEY]:'dañado',[ARENA_SAVE_KEY]:raw})),{classic:{status:'invalid'},arena:{status:'pending'}});
  assert.deepEqual(launchState({getItem(){throw Error('Bloqueado');}}),{classic:{status:'unavailable'},arena:{status:'unavailable'}});
});
test('Los enlaces de entrada solo solicitan vista o configuración; nunca confirman reemplazos',()=>{
  for(const mode of ['classic','arena']){
    for(const status of ['new','pending','finished','invalid']){
      const links=launchLinks(mode,status);
      assert.ok(links.enter.startsWith('./'));assert.ok(links.fresh.endsWith('?new=1'));
      assert.equal(links.enter.includes('new=1'),status==='new');
    }
  }
});
test('Manifiesto único: tres entradas, logotipos compartidos y cada motor una sola vez',async()=>{
  const files=JSON.parse(await readFile(new URL('../scripts/pages-files.json',import.meta.url),'utf8'));
  for(const name of ['index.html','clasico/index.html','arena/index.html','src/engine.mjs','arena/src/engine.mjs'])assert.equal(files.filter(n=>n===name).length,1,name);
  assert.ok(!files.includes('arena/assets/wordmark.png'));
  for(const name of ['clasico/index.html','arena/index.html']){
    const html=await readFile(new URL('../'+name,import.meta.url),'utf8');
    assert.doesNotMatch(html,/Premium/);assert.match(html,/\.\.\/assets\//);
  }
});
test('Los 32 módulos y recursos protegidos mantienen exactamente los bytes de M2 y M3-B',async()=>{
  const reference=JSON.parse(await readFile(new URL('../scripts/frozen-files.json',import.meta.url),'utf8'));
  for(const [name,sha] of Object.entries(reference.files))assert.equal(createHash('sha256').update(await readFile(new URL('../'+name,import.meta.url))).digest('hex'),sha,name);
});
