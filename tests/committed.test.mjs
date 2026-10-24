import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {initialState,applyTurn,availableMoves,wallOptions,pieceById,legalActors,territory,activeIds} from '../src/engine.mjs';
import {beginDraft,selectDraft,advanceDraft,committedDraft,validDraft} from '../src/turnDraft.mjs';
import {GAME_SAVE_KEY,encodeGameSave,decodeGameSave,writeGameSave} from '../src/gameSave.mjs';
import {participationFixture} from './participation-fixtures.mjs';
import {resultFixture} from './result-fixtures.mjs';

const start=mode=>initialState({turnMode:mode});
const selected=game=>game.currentActor?beginDraft(game):selectDraft(game,beginDraft(game),'A1');
const reload=(game,draft)=>decodeGameSave(encodeGameSave(game,draft));
for(const mode of ['piece','team']){
  test(`Pasos definitivos ${mode}: primer y segundo paso persisten sin alterar el estado oficial`,()=>{
    const game=start(mode),snapshot=JSON.stringify(game),score=territory(game);let draft=selected(game);
    for(const [to,steps] of [[9,1],[16,2]]){
      const previous=draft;draft=advanceDraft(game,draft,to);assert.notEqual(draft,previous);assert.equal(committedDraft(draft),true);
      const saved=JSON.parse(encodeGameSave(game,draft));assert.equal(saved.pendingTurn.steps,steps);assert.equal(saved.pendingTurn.actor,'A1');
      assert.deepEqual(saved.pendingTurn.path,steps===1?[8,9]:[8,9,16]);assert.deepEqual(reload(game,draft).draft,draft);
      assert.equal(JSON.stringify(game),snapshot);assert.deepEqual(territory(game),score);assert.equal(game.moves,0);assert.deepEqual(game.walls,[]);assert.equal(game.turnTeam,'A');
    }
    assert.throws(()=>advanceDraft(game,draft,23));assert.deepEqual(draft.path,[8,9,16]);
  });
  test(`Pasos definitivos ${mode}: regreso al origen consume ambos pasos y no se confunde con cero`,()=>{
    const game=start(mode),draft=advanceDraft(game,advanceDraft(game,selected(game),9),8),saved=reload(game,draft);
    assert.equal(saved.draft.path.length,3);assert.equal(committedDraft(saved.draft),true);assert.equal(saved.draft.path.at(-1),8);
    assert.throws(()=>advanceDraft(game,saved.draft,15));assert.deepEqual(applyTurn(game,{...saved.draft,to:15}).lastMove.path,[8,9,8]);
  });
  for(const path of [[8],[8,9],[8,15,16]])test(`Pasos definitivos ${mode}: cerrar ${path.length-1} pasos confirma un único muro y elimina avance`,()=>{
    const game=start(mode);let draft=selected(game);for(const to of path.slice(1))draft=advanceDraft(game,draft,to);
    const pending=encodeGameSave(game,draft),to=wallOptions(game,path.at(-1))[0],next=applyTurn(game,{...draft,to}),raw=encodeGameSave(next,beginDraft(next));
    assert.equal(next.moves,1);assert.equal(next.walls.length,1);assert.equal(next.turnTeam,'B');assert.equal(Object.hasOwn(JSON.parse(raw),'pendingTurn'),false);
    assert.deepEqual(decodeGameSave(raw).game,next);assert.equal(committedDraft(decodeGameSave(raw).draft),false);
    assert.equal(Object.hasOwn(JSON.parse(pending),'pendingTurn'),path.length>1);
  });
}
test('Pasos definitivos: la elección es libre solo antes del primer paso, también tras regresar al origen',()=>{
  const game=start('team'),a=selected(game),b=selectDraft(game,a,'A2');assert.deepEqual(b.path,[40]);assert.equal(Object.hasOwn(JSON.parse(encodeGameSave(game,b)),'pendingTurn'),false);
  const one=advanceDraft(game,a,9),two=advanceDraft(game,one,8);
  for(const draft of [one,two]){assert.throws(()=>selectDraft(game,draft,'A2'));assert.equal(selectDraft(game,draft,'A1'),draft);assert.deepEqual(reload(game,draft).draft,draft);}
  assert.throws(()=>selectDraft(game,a,'B1'));const secured=participationFixture().after;assert.throws(()=>selectDraft(secured,beginDraft(secured),'A1'));
});
test('Persistencia: una escritura contiene base oficial y avance; no guarda selección sin pasos',()=>{
  const game=start('team'),draft=advanceDraft(game,selected(game),9),writes=[];const storage={setItem:(key,value)=>writes.push([key,value])};
  writeGameSave(storage,game,draft);assert.equal(writes.length,1);assert.equal(writes[0][0],GAME_SAVE_KEY);
  const decoded=decodeGameSave(writes[0][1]);assert.deepEqual(decoded,{game,draft,recovered:false});assert.deepEqual(JSON.parse(writes[0][1]).game,game);
});
test('Persistencia: fallo de escritura no cambia la partida ni la última envoltura atómica válida',()=>{
  const game=start('piece'),draft=selected(game),old=encodeGameSave(game,draft);let stored=old;
  const storage={setItem(){throw new Error('QuotaExceededError');}};
  assert.throws(()=>writeGameSave(storage,game,advanceDraft(game,draft,9)),/Quota/);assert.equal(stored,old);assert.deepEqual(draft.path,[8]);
  const next=applyTurn(game,{...draft,to:1});assert.throws(()=>writeGameSave(storage,next,beginDraft(next)));assert.equal(game.moves,0);
});
test('Persistencia: guardados anteriores clásicos, por equipo y terminados se cargan sin migración',()=>{
  for(const game of [start('piece'),start('team'),participationFixture().after,resultFixture().after,{...resultFixture({A:23,B:23}).after,turnMode:'team'}]){
    const raw=JSON.stringify({game}),restored=decodeGameSave(raw);assert.deepEqual(restored.game,game);assert.equal(restored.recovered,false);
    assert.deepEqual(restored.draft,beginDraft(game));assert.equal(JSON.stringify({game:restored.game}),raw);
  }
});
test('Persistencia: avance dañado o incompatible recupera solo el estado oficial válido',()=>{
  const game=start('team'),draft=advanceDraft(game,selected(game),9),saved=JSON.parse(encodeGameSave(game,draft));
  const corrupt=[null,{}, {...saved.pendingTurn,version:2},{...saved.pendingTurn,steps:0},{...saved.pendingTurn,steps:2},
    {...saved.pendingTurn,base:'otra partida'},{...saved.pendingTurn,actor:'B1'},{...saved.pendingTurn,path:[8,10]},
    {...saved.pendingTurn,path:[9,8]},{...saved.pendingTurn,path:[8,9,16,23],steps:3},{...saved.pendingTurn,path:'8,9'}];
  for(const pendingTurn of corrupt){const restored=decodeGameSave(JSON.stringify({game,pendingTurn}));assert.equal(restored.recovered,true);assert.deepEqual(restored.game,game);assert.deepEqual(restored.draft,beginDraft(game));}
  const next=applyTurn(game,{...draft,to:2});const stale=decodeGameSave(JSON.stringify({game:next,pendingTurn:saved.pendingTurn}));assert.equal(stale.recovered,true);assert.deepEqual(stale.game,next);
  const final=resultFixture().after;assert.equal(decodeGameSave(JSON.stringify({game:final,pendingTurn:saved.pendingTurn})).recovered,true);
  for(const raw of [null,'{','{}','{"game":null}','{"game":{"pieces":[null]}}'])assert.equal(decodeGameSave(raw).game,null);
});
test('Persistencia: cruces de muro, fichas ocupadas y recorridos ilegales no se restauran',()=>{
  const game=start('piece'),good=JSON.parse(encodeGameSave(game,advanceDraft(game,selected(game),9)));
  for(const [walls,path] of [[['8-9'],[8,9]],[[],[8,12]],[[],[8,9,12]]]){
    const state={...game,walls,moves:walls.length},pending={...good.pendingTurn,base:JSON.stringify(state),path,steps:path.length-1};
    assert.equal(decodeGameSave(JSON.stringify({game:state,pendingTurn:pending})).recovered,true);
  }
  const occupied=start('piece');occupied.pieces.find(p=>p.id==='B1').pos=9;
  assert.equal(validDraft(occupied,{actor:'A1',path:[8,9]}),false);
});
test('Matemática: cada paso conserva abierto el borde de llegada, aun en un callejón',()=>{
  const game=start('piece');game.walls=['2-9','9-10','9-16'];game.moves=3;
  const draft=advanceDraft(game,selected(game),9);assert.deepEqual(wallOptions(game,9),[8]);assert.doesNotThrow(()=>applyTurn(game,{...draft,to:8}));
});
test('Matemática: todos los prefijos legales de partidas completas pueden cerrarse; puntuación inalterada',()=>{
  for(const mode of ['piece','team'])for(let seed=1;seed<=16;seed++){
    let randomState=seed;const rnd=n=>{randomState=(Math.imul(randomState,1664525)+1013904223)>>>0;return randomState%n;};let game=start(mode);
    while(!game.over){
      const actors=legalActors(game),actor=actors[rnd(actors.length)];let draft=selectDraft(game,beginDraft(game),actor);
      for(const first of availableMoves(game,actor,draft.path[0])){
        const one=advanceDraft(game,draft,first);assert.ok(wallOptions(game,first).includes(draft.path[0]));assert.doesNotThrow(()=>applyTurn(game,{...one,to:draft.path[0]}));
        for(const second of availableMoves(game,actor,first)){const two=advanceDraft(game,one,second);assert.ok(wallOptions(game,second).includes(first));assert.doesNotThrow(()=>applyTurn(game,{...two,to:first}));}
      }
      for(let count=rnd(3);count>0;count--){const choices=availableMoves(game,actor,draft.path.at(-1));if(!choices.length)break;draft=advanceDraft(game,draft,choices[rnd(choices.length)]);const reloaded=reload(game,draft);assert.deepEqual(reloaded.draft,draft);assert.deepEqual(territory(reloaded.game),territory(game));}
      const walls=wallOptions(game,draft.path.at(-1));game=applyTurn(game,{...draft,to:walls[rnd(walls.length)]});
      const {score}=territory(game);assert.equal(score.A+score.B+score.mixed+score.empty,49);
    }
    assert.equal(activeIds(game).size,0);assert.equal(territory(game).score.mixed,0);
  }
});
test('Interfaz: sin cancelación ordinaria, guía contextual y motor M1 intacto',async()=>{
  const html=await readFile(new URL('../clasico/index.html',import.meta.url),'utf8'),app=await readFile(new URL('../src/app.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(html,/id="cancel"|Cambiar recorrido|Deshacer/);assert.doesNotMatch(app,/function cancel|addEventListener\('click',cancel/);
  assert.match(html,/Ficha disponible/);assert.match(html,/Ficha seleccionada/);assert.match(html,/Tras el primer paso, queda fijada/);
  const engine=await readFile(new URL('../src/engine.mjs',import.meta.url));assert.equal(createHash('sha256').update(engine).digest('hex'),'ee7982394c38dbdee738f04bb7811590e70dc4d9d6e3b39bea44aac8844b3a90');
});
