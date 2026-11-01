import test from 'node:test';
import assert from 'node:assert/strict';
import {finalAppearance,FINAL_COLORS,createFinalPresenter} from '../src/finalPresentation.mjs';
test('Resultado: color oficial para los cuatro equipos, derrota, empate y Local compartido',()=>{
  assert.equal(finalAppearance(),null);
  for(const team of ['A','B','C','D']){
    assert.deepEqual(finalAppearance({finished:true,winners:[team],viewerTeam:team}),{winner:team,color:FINAL_COLORS[team],role:'winner'});
    assert.equal(finalAppearance({finished:true,winners:[team],viewerTeam:'otro'}).role,'loser');
    assert.equal(finalAppearance({finished:true,winners:[team],shared:true}).role,'shared');
    // All title colors exceed WCAG AA against the existing dark result surface.
    const linear=byte=>{const n=byte/255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;};
    const luminance=hex=>hex.match(/\w\w/g).map(n=>linear(parseInt(n,16))).reduce((v,n,i)=>v+n*[.2126,.7152,.0722][i],0);
    assert.ok((luminance(FINAL_COLORS[team].slice(1))+.05)/(luminance('151e27')+.05)>4.5);
  }
  assert.equal(finalAppearance({finished:true,winners:['A','B'],viewerTeam:'A'}).role,'draw');
  assert.equal(finalAppearance({finished:true,winners:[]}).color,FINAL_COLORS.neutral);
});
function setup(){
  const calls={animation:0,pulse:0,cancel:0},doc={hidden:false,getElementById:()=>true},reduced={matches:false};
  const element={classList:{toggle(){}},dataset:{},style:{setProperty(){}}},title={setAttribute(){},removeAttribute(){},getClientRects:()=>[{}],animate:()=>{calls.animation++;return{cancel(){calls.cancel++;}};}};
  return{calls,doc,reduced,element,presenter:createFinalPresenter({element,title,document:doc,reduced,haptics:{pulse:event=>{assert.equal(event,'secured');calls.pulse++;}}})};
}
test('Resultado: restaurar solo presenta; finalizar celebra una vez y revancha permite otro efecto',()=>{
  const s=setup(),result={finished:true,winners:['B'],viewerTeam:'B'};
  s.presenter.render(result);assert.equal(s.calls.animation,0);assert.equal(s.calls.pulse,0);
  assert.equal(s.presenter.celebrate(),true);s.presenter.render(result);assert.equal(s.presenter.celebrate(),false);
  assert.equal(s.calls.animation,1);assert.equal(s.calls.pulse,1);
  s.presenter.render({finished:false});s.presenter.render(result);s.presenter.celebrate();assert.equal(s.calls.animation,2);
  s.presenter.destroy();assert.ok(s.calls.cancel>0);
});
test('Resultado: perdedor, empate, movimiento reducido y segundo plano sin celebración ni pulso',()=>{
  for(const kind of ['loser','draw','reduced','hidden','shared']){
    const s=setup();s.reduced.matches=kind==='reduced';s.doc.hidden=kind==='hidden';
    s.presenter.render({finished:true,winners:kind==='draw'?['A','B']:['A'],viewerTeam:kind==='loser'?'B':'A',shared:kind==='shared'});
    s.presenter.celebrate();assert.equal(s.calls.pulse,0,kind);assert.equal(s.calls.animation,kind==='shared'?1:0,kind);
  }
});
