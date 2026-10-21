import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {initialState,territory,verifyState,adjacent,wallKey,regions} from '../src/engine.mjs';
import {finalRegions,explorationLayers,regionDescription,componentBoundary} from '../src/explorationData.mjs';
import {contourShapes,contourFixture} from './contour-fixtures.mjs';
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

// Oráculo independiente: XOR de los cuatro lados no orientados de cada cuadrado.
function boundaryOracle(cells){
  const edges=new Set(),key=(a,b)=>[a.join(','),b.join(',')].sort().join('|');
  for(const cell of cells){
    const x=cell%7,y=Math.floor(cell/7),corners=[[x,y],[x+1,y],[x+1,y+1],[x,y+1]];
    for(let i=0;i<4;i++){const k=key(corners[i],corners[(i+1)%4]);if(edges.has(k))edges.delete(k);else edges.add(k);}
  }
  return {edges,key};
}
function verifyBoundary(cells){
  const {segments,loops,path}=componentBoundary(cells),{edges,key}=boundaryOracle(cells);
  const represented=segments.map(e=>key(e.from,e.to));
  assert.equal(represented.length,new Set(represented).size,'Sin segmentos duplicados');
  assert.deepEqual(new Set(represented),edges,'Solo y todos los lados de la frontera');
  const traversed=[],points=[];let signedArea=0;
  for(const loop of loops){
    assert.deepEqual(loop[0],loop.at(-1),'Cada contorno se cierra');
    for(let i=1;i<loop.length;i++){
      const a=loop[i-1],b=loop[i];assert.equal(Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1]),1);
      traversed.push(key(a,b));signedArea+=(a[0]*b[1]-b[0]*a[1])/2;
    }
    points.push(...loop.slice(0,-1).map(([x,y])=>[60+80*x,60+80*y]));
  }
  assert.deepEqual(traversed.sort(),represented.sort(),'Los bucles recorren cada segmento exactamente una vez');
  assert.equal(signedArea,cells.length,'Área exterior menos agujeros = número de casillas');
  assert.deepEqual([...path.matchAll(/[ML](\d+) (\d+)/g)].map(m=>[+m[1],+m[2]]),points,'El SVG representa los mismos vértices, en la geometría original');
  assert.equal((path.match(/Z/g)||[]).length,loops.length);
  return {segments,loops,path};
}
for(const [name,cells] of Object.entries(contourShapes))test(`Contorno: geometría exacta ${name}, sin fronteras internas`,()=>{
  const original=[...cells],boundary=verifyBoundary(cells);assert.deepEqual(cells,original);
  const game=contourFixture(name);assert.ok(verifyState(game));assert.ok(game.over);
  const region=finalRegions(game).byCell[cells[0]];assert.deepEqual(new Set(region.cells),new Set(cells));
  assert.deepEqual(new Set(componentBoundary(region.cells).segments.map(e=>JSON.stringify(e))),new Set(boundary.segments.map(e=>JSON.stringify(e))));
  if(name==='hole')assert.equal(boundary.loops.length,2);
  if(name==='large')assert.equal(boundary.loops.length,3);
});
test('Contorno: perímetro del tablero y frontera común de dos componentes',()=>{
  const whole=verifyBoundary(Array.from({length:49},(_,i)=>i));assert.equal(whole.segments.length,28);assert.equal(whole.loops.length,1);
  const a=componentBoundary([0]),b=componentBoundary([1]);
  assert.ok(a.segments.some(e=>JSON.stringify(e.from)==='[1,0]'&&JSON.stringify(e.to)==='[1,1]'));
  assert.ok(b.segments.some(e=>JSON.stringify(e.from)==='[1,1]'&&JSON.stringify(e.to)==='[1,0]'));
  assert.equal(componentBoundary([0,1]).segments.length,6);
});
test('Contorno: exhaustividad de las 511 uniones de un sector 3×3, incluidos contactos de vértice',()=>{
  const sector=[0,1,2,7,8,9,14,15,16];
  for(let mask=1;mask<512;mask++)verifyBoundary(sector.filter((_,i)=>mask&(1<<i)));
});
test('Contorno: permutar casillas no cambia lados ni área; el modelo y BFS se conservan',()=>{
  const game=contourFixture('hole'),saved=JSON.stringify(game),model=finalRegions(game),region=model.byCell[16];
  const original=explorationLayers(model,16);verifyBoundary(region.cells);verifyBoundary([...region.cells].reverse());
  assert.deepEqual(explorationLayers(model,16),original);assert.equal(JSON.stringify(game),saved);
});
test('5B: singular, plural y región vacía sin atribuir puntos',()=>{
  assert.deepEqual(regionDescription({type:'A',cells:[8],ids:['A1']}),{
    title:'COMPONENTE CONEXA · EQUIPO A',size:'1 casilla',pieces:'Ficha A1',
    explanation:'Estas casillas forman una componente conexa: puedes pasar de una a otra sin cruzar muros.'});
  const empty=regionDescription({type:'empty',cells:[0,1],ids:[]});
  assert.equal(empty.size,'2 casillas');assert.equal(empty.title,'COMPONENTE CONEXA · VACÍA');assert.equal(empty.pieces,'Sin puntos');
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
  const stable={"feedback": "7426e3e3fce72137c9271fa4f659d3d23c34657554d75974d14fc6f12f5f2d14", "haptics": "6a42f4ebd8d5f54e22f001a1829fde39dfbe0bb5f3841f260c419463e553719a", "territoryEvents": "d4d34eac9555fc21dd2aae3b44969a8d6558da6412fa8c57aa84135671e5f379", "territoryFeedback": "e560ad4307015e88a0ac636cf30c1e7e62157e62bf60cf478641168a63043dbd", "participationEvents": "a485395bced6158113dfd2e234cbe984888ecd2e171dd024e24a30c60b8712bb", "resultEvents": "359920bf2886f05451d4542bd45cc21a28fd834029e1bdf71472f5256491f51c", "resultFeedback": "7db9ee2004b3f178f510de3db35f3f14fc0166edd7f5a701e1b117247a4112d7", "boardTargets": "68cb0d3ec87a81ea624d08d6e719388638336dea6a5fe99979a63146d2dafb87", "boardView": "affe2e975dc097ffeef1db2ae6933a1e4d008d6c9e9f9c197a6b249078d14c62"};
  for(const [name,hash] of Object.entries(stable)){
    const bytes=await readFile(new URL('../src/'+name+'.mjs',import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),hash,name+' idéntico a e88cfa6');
  }
  const participation=await readFile(new URL('../src/participationFeedback.mjs',import.meta.url),'utf8');
  assert.equal(createHash('sha256').update(participation.slice(participation.indexOf('  async function confirm'),participation.indexOf('  function announce'))).digest('hex'),'c0c9c7a1fe2ac387a2473266bdfdededbb9ad49b70f88fc2d66d72263714a71a','Confirmación anterior intacta; solo cambia la presentación del aviso');
  const module=await readFile(new URL('../src/exploration.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(module,/localStorage|applyTurn|safeStore|vibrat|deriveTerritoryEvents/);
  assert.match(module,/EXPLORATION_MS=320/);
});
