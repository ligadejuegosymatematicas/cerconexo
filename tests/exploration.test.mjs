import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {initialState,territory,verifyState,adjacent,wallKey,regions} from '../src/engine.mjs';
import {finalRegions,explorationLayers,regionDescription} from '../src/explorationData.mjs';
import {resultFixture} from './result-fixtures.mjs';

test('5B: antes del final no existe instantánea educativa',()=>assert.equal(finalRegions(initialState()),null));
for(const options of [{A:28,B:16},{A:16,B:28},{A:23,B:23},{A:25,B:24},{A:28,B:16,pockets:true}]){
  test(`5B: clasificación oficial, cobertura única e invariantes ${JSON.stringify(options)}`,()=>{
    const {after}=resultFixture(options),original=JSON.stringify(after),model=finalRegions(after),official=territory(after);
    assert.ok(verifyState(after));assert.deepEqual(model.score,official.score);
    assert.equal(model.score.A+model.score.B+model.score.empty,49);
    assert.equal(model.total,model.counts.A+model.counts.B+model.counts.empty);
    assert.equal(new Set(model.regions.flatMap(r=>r.cells)).size,49);
    assert.equal(model.regions.reduce((n,r)=>n+r.cells.length,0),49);
    for(let cell=0;cell<49;cell++){
      const region=model.byCell[cell],officialRegion=official.components.find(r=>r.cells.includes(cell));
      assert.deepEqual(region.cells,officialRegion.cells);assert.deepEqual(region.ids,[...officialRegion.ids].sort());
      const layers=explorationLayers(model,cell),distance=new Map(layers.flatMap((list,depth)=>list.map(c=>[c,depth])));
      assert.deepEqual(layers[0],[cell]);assert.deepEqual([...distance.keys()].sort((a,b)=>a-b),[...region.cells].sort((a,b)=>a-b));
      for(const [target,depth] of distance)if(depth){
        assert.ok(adjacent(target).some(from=>distance.get(from)===depth-1&&!after.walls.includes(wallKey(from,target))));
      }
      for(const list of layers)for(const target of list)assert.equal(model.byCell[target],region);
    }
    assert.equal(JSON.stringify(after),original,'No se alteran ni puntuación, ni resultado ni partida');
  });
}
test('5B: dos fichas compañeras comparten una región y no duplican casillas',()=>{
  const {after}=resultFixture(),model=finalRegions(after);
  for(const team of ['A','B']){
    const r=model.regions.find(r=>r.type===team);assert.deepEqual(r.ids,[team+'1',team+'2']);
    assert.equal(r.cells.length,model.score[team]);assert.match(regionDescription(r).pieces,new RegExp(team+'1 y '+team+'2'));
  }
});
test('5B: singular, plural y región vacía sin atribuir puntos',()=>{
  assert.deepEqual(regionDescription({type:'A',cells:[8],ids:['A1']}),{
    title:'REGIÓN DEL EQUIPO A',size:'1 casilla conectada',pieces:'Ficha presente: A1',
    explanation:'Estas casillas están conectadas porque podemos desplazarnos entre ellas sin cruzar muros.'});
  const empty=regionDescription({type:'empty',cells:[0,1],ids:[]});
  assert.equal(empty.size,'2 casillas conectadas');assert.equal(empty.title,'REGIÓN VACÍA');assert.equal(empty.pieces,'Sin fichas · No otorga puntos');
});
test('5B: cada conexión visual es ortogonal y abierta, sin diagonales ni perímetro',()=>{
  const {after}=resultFixture({pockets:true}),model=finalRegions(after);
  for(let from=0;from<49;from++)for(const to of model.connections[from]){
    assert.ok(adjacent(from).includes(to));assert.ok(!after.walls.includes(wallKey(from,to)));
    assert.equal(model.byCell[from],model.byCell[to]);
  }
  assert.deepEqual(explorationLayers(model,49),[]);
});
test('5B: quitar una conexión con camino alternativo no crea una componente ficticia',()=>{
  const {after}=resultFixture({A:25,B:24}),before=finalRegions(after);
  let candidate;
  for(const region of before.regions)for(const cell of region.cells)for(const to of before.connections[cell]){
    const state=structuredClone(after);state.walls.push(wallKey(cell,to));state.moves++;
    if(regions(state).length===before.total){candidate=state;break;}
    if(candidate)break;
  }
  assert.ok(candidate,'Existe una conexión redundante en la fixture');
  const model=finalRegions(candidate);assert.equal(model.total,before.total);assert.deepEqual(model.score,before.score);
});
test('5B: modelo independiente del objeto mutable y consultas sin escritura',()=>{
  const {after}=resultFixture(),model=finalRegions(after),saved=JSON.stringify(after);
  model.regions[0].ids.push('ejemplo');model.score.A=-1;
  assert.equal(JSON.stringify(after),saved);assert.equal(territory(after).score.A,28);
});
test('5B: motor y animaciones anteriores permanecen byte por byte estables',async()=>{
  const engine=await readFile(new URL('../src/engine.mjs',import.meta.url));
  assert.equal(createHash('sha256').update(engine).digest('hex'),'48dc06147f1bd0643d9a75ff828566f9f1517f4b24792ff352ca9c2cf1cb6b4b');
  const stable={"feedback": "7426e3e3fce72137c9271fa4f659d3d23c34657554d75974d14fc6f12f5f2d14", "haptics": "6a42f4ebd8d5f54e22f001a1829fde39dfbe0bb5f3841f260c419463e553719a", "territoryEvents": "d4d34eac9555fc21dd2aae3b44969a8d6558da6412fa8c57aa84135671e5f379", "territoryFeedback": "e560ad4307015e88a0ac636cf30c1e7e62157e62bf60cf478641168a63043dbd", "participationEvents": "a485395bced6158113dfd2e234cbe984888ecd2e171dd024e24a30c60b8712bb", "participationFeedback": "ececff410715ebeec372eb1d78e2d5a18685c747c101debf2c871d61cc39f410", "resultEvents": "359920bf2886f05451d4542bd45cc21a28fd834029e1bdf71472f5256491f51c", "resultFeedback": "7db9ee2004b3f178f510de3db35f3f14fc0166edd7f5a701e1b117247a4112d7", "boardTargets": "68cb0d3ec87a81ea624d08d6e719388638336dea6a5fe99979a63146d2dafb87", "boardView": "affe2e975dc097ffeef1db2ae6933a1e4d008d6c9e9f9c197a6b249078d14c62"};
  for(const [name,hash] of Object.entries(stable)){
    const bytes=await readFile(new URL('../src/'+name+'.mjs',import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),hash,name+' idéntico a e88cfa6');
  }
  const module=await readFile(new URL('../src/exploration.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(module,/localStorage|applyTurn|safeStore|vibrat|deriveTerritoryEvents/);
  assert.match(module,/EXPLORATION_MS=320/);
});
