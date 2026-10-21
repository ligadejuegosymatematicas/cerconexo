const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CERCONEXO_PLAYWRIGHT_PATH||'playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'validation/phase4');
const idle=p=>p.waitForFunction(()=>document.getElementById('board').getAttribute('aria-busy')==='false');
const saved=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('wallgo-league-v2'))?.game);
async function load(page,game){
  await page.evaluate(game=>{localStorage.removeItem('wallgo-league-v2');if(game)localStorage.setItem('wallgo-league-v2',JSON.stringify({game}));},game);
  await page.reload();await idle(page);await page.evaluate(()=>Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{}))));
}
async function choose(page,to,keyboard=false){
  const el=page.locator(`[data-wall="${to}"]`);
  if(keyboard){await el.focus();await page.keyboard.press('Enter');}
  else{const b=await el.boundingBox();assert.ok(b);await page.touchscreen.tap(b.x+b.width/2,b.y+b.height/2);}
}
async function metrics(page){return page.evaluate(()=>{
  const box=n=>{const b=n.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height,right:b.right,bottom:b.bottom};};
  const board=box(document.getElementById('board')),banner=box(document.getElementById('turnBanner')),result=box(document.getElementById('endScreen'));
  return {size:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],board,banner,result,
    clipped:[...document.querySelectorAll('#endScreen h2,#endScreen p,.minor-stats,.team-roster')].filter(n=>{
      if(!n.getClientRects().length)return false;const b=box(n);return n.scrollWidth>n.clientWidth+1||n.scrollHeight>n.clientHeight+1||b.right>innerWidth+1||b.bottom>innerHeight+1||
        (n.closest('#endScreen')&&(b.y<result.y-1||b.bottom>result.bottom+1));
    }).map(n=>n.id||n.className),
    overlap:Math.min(board.right,result.right)>Math.max(board.x,result.x)&&Math.min(board.bottom,result.bottom)>Math.max(board.y,result.y),
    newButton:box(document.getElementById('new'))};
});}
async function probe(context){await context.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{
  window.finalProbe={samples:[],announcements:[],territory:[],confirmations:[],resultAt:null,started:performance.now()};
  const get=id=>document.getElementById(id),p=window.finalProbe,seen=new Set([...document.querySelectorAll('.token-isolated')].map(n=>n.dataset.piece));
  const announcement=get('resultAnnouncement');
  if(announcement.textContent)p.announcements.push(announcement.textContent);
  new MutationObserver(()=>{if(announcement.textContent)p.announcements.push(announcement.textContent);}).observe(announcement,{childList:true,subtree:true,characterData:true});
  new MutationObserver(()=>{if(!get('endScreen').hidden&&p.resultAt===null){p.resultAt=performance.now();p.resultAnimations=get('endScreen').getAnimations().map(a=>a.effect.getTiming().duration);}}).observe(get('endScreen'),{attributes:true,attributeFilter:['hidden']});
  new MutationObserver(()=>{
    if(!get('territoryNotice').hidden&&get('territoryNotice').dataset.kind==='territory'&&!p.territory.length)p.territory.push(performance.now());
  }).observe(get('territoryNotice'),{attributes:true,childList:true});
  new MutationObserver(()=>{for(const n of document.querySelectorAll('.token-isolated'))if(!seen.has(n.dataset.piece)){seen.add(n.dataset.piece);p.confirmations.push({id:n.dataset.piece,at:performance.now(),durations:n.querySelector('.secured-aura').getAnimations().map(a=>a.effect.getTiming().duration)});}}).observe(get('piecesLayer'),{attributes:true,subtree:true});
  const tick=()=>{
    const b=get('board').getBoundingClientRect(),t=get('turnBanner').getBoundingClientRect();
    p.samples.push({at:performance.now(),page:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],board:[b.width,b.height,b.x,b.y],banner:t.height,
      busy:get('board').getAttribute('aria-busy'),result:!get('endScreen').hidden,notice:get('territoryNotice').dataset.kind,
      wall:document.querySelector('.wall-built')?.getAnimations().map(a=>a.effect.getTiming().duration)||[],scores:[get('scoreA').textContent,get('scoreB').textContent]});
    if(p.samples.length<1000)requestAnimationFrame(tick);
  };requestAnimationFrame(tick);
}));}
(async()=>{
  await fs.mkdir(out,{recursive:true});
  const engine=await import('../src/engine.mjs'),{resultFixture}=await import('./result-fixtures.mjs'),{startPagesServer}=await import('./pages-server.mjs');
  const site=await startPagesServer(),browser=await chromium.launch({headless:true,channel:'msedge'}),errors=[],report={checks:[],resolutions:[],sequences:[]};
  async function create(width=390,height=844,motion='no-preference',vibrate=false){
    const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:width<761,reducedMotion:motion});
    if(vibrate)await context.addInitScript(()=>{window.pulses=[];Object.defineProperty(navigator,'vibrate',{value:p=>{window.pulses.push(p);return true;},configurable:true});});
    await probe(context);const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(site.url);await idle(page);return {context,page};
  }
  try{
    for(const [width,height] of [[1440,900],[1366,768],[390,844],[360,740],[740,360]]){
      const {context,page}=await create(width,height);
      const initial=await metrics(page);
      for(const [name,A,B] of [['victoria-A',28,16],['victoria-B',16,28],['empate',23,23],['sin-vacias',25,24]]){
        const fixture=resultFixture({A,B});await load(page,fixture.before);
        const before=await metrics(page),pieces=await page.locator('.piece-token').evaluateAll(ns=>ns.map(n=>({id:n.dataset.piece,pos:n.getAttribute('transform'),fill:getComputedStyle(n.querySelector('.token-body')).fill,label:n.querySelector('.token-label').textContent})));
        await choose(page,fixture.to,name==='victoria-B');
        await idle(page);await page.waitForTimeout(500);
        assert.deepEqual(await saved(page),fixture.after);
        assert.equal(await page.locator('#winnerTitle').innerText(),fixture.after.winner==='Empate'?'¡EMPATE!':`¡VICTORIA DEL EQUIPO ${fixture.after.winner}!`);
        assert.equal(await page.locator('#scoreA').innerText(),String(A));assert.equal(await page.locator('#scoreB').innerText(),String(B));assert.equal(await page.locator('#emptyCount').innerText(),String(49-A-B));
        assert.equal(await page.locator('#distributionLabel').innerText(),'49 casillas');
        assert.equal(A+B+Number(await page.locator('#emptyCount').innerText()),49);assert.equal(await page.locator('.territory-unit').count(),49);
        assert.equal(await page.locator('.board-cell').count(),49);assert.equal(await page.locator('.wall-built').count(),fixture.after.walls.length);
        assert.equal(await page.locator('.token-isolated').count(),4);assert.equal(await page.locator('[data-to],[data-wall]').count(),0);
        assert.equal(await page.locator('#inspectBoard,#playAgain').count(),0);
        const finalPieces=await page.locator('.piece-token').evaluateAll(ns=>ns.map(n=>({id:n.dataset.piece,pos:n.getAttribute('transform'),fill:getComputedStyle(n.querySelector('.token-body')).fill,label:n.querySelector('.token-label').textContent})));
        assert.deepEqual(finalPieces,pieces);assert.ok(await page.locator('.marker-check').evaluateAll(ns=>ns.every(n=>getComputedStyle(n).display!=='none')));
        const end=await metrics(page),p=await page.evaluate(()=>window.finalProbe);
        assert.deepEqual(end.size,[width,height]);assert.deepEqual(end.clipped,[]);assert.equal(end.overlap,false);
        assert.equal(end.board.width,initial.board.width);assert.equal(end.banner.height,before.banner.height);
        assert.ok(end.newButton.bottom<=height&&end.newButton.right<=width);
        assert.equal(p.announcements.length,1);assert.equal(p.territory.length,1);assert.equal(p.confirmations.length,4);
        assert.deepEqual(p.resultAnimations,[450]);assert.ok(p.resultAt>=Math.max(...p.confirmations.map(c=>c.at))+330);
        for(const s of p.samples){assert.deepEqual(s.page,[width,height],`${name} transient scroll ${width}x${height}`);assert.deepEqual(s.board,[before.board.width,before.board.height,before.board.x,before.board.y],`${name} desplazó el tablero`);assert.equal(s.banner,before.banner.height,`${name} resized banner`);assert.notEqual(s.notice,'participation');}
        assert.ok(p.samples.some(s=>s.busy==='true'&&!s.result));
        await page.screenshot({path:path.join(out,`${name}-${width}x${height}.png`)});
        // Recarga: mismo tablero, sin animación ni celebración territorial antigua.
        await page.reload();await idle(page);const restored=await page.evaluate(()=>window.finalProbe);
        assert.deepEqual(await saved(page),fixture.after);assert.ok(await page.locator('#endScreen').isVisible());
        assert.equal(restored.territory.length,0);assert.equal(restored.confirmations.length,0);assert.equal(await page.evaluate(()=>document.getAnimations().length),0);
        assert.equal(restored.announcements.length,1);assert.deepEqual(await page.locator('.piece-token').evaluateAll(ns=>ns.map(n=>n.dataset.piece)),['A1','B1','A2','B2']);
        report.sequences.push({resolution:[width,height],case:name,official:engine.territory(fixture.after).score,samples:p.samples.length,
          resultAfterTerritory:Math.round(p.resultAt-p.territory[0]),confirmationMs:p.confirmations[0].durations,resultMs:p.resultAnimations,announcements:p.announcements.length});
      }
      report.resolutions.push({viewport:[width,height],boardWidth:initial.board.width});await context.close();
    }
    report.checks.push('Cinco resoluciones y cuatro resultados: transición completa muestreada cada frame; sin scroll, cambio de altura ni reducción del tablero; 49 casillas, muros, cuatro fichas y distintivos conservados');
    const {context,page}=await create(360,740,'no-preference',true),victory=resultFixture(),draw=resultFixture({A:23,B:23});
    // Preferencia persistente: una única señal por la jugada, sin vibración añadida al resultado.
    await page.evaluate(()=>localStorage.setItem('cerconexo-preferences-v1',JSON.stringify({vibration:true})));
    await load(page,victory.before);await choose(page,victory.to);await idle(page);
    assert.deepEqual(await page.evaluate(()=>window.pulses),[[12,35,12]]);
    // Recarga durante cada etapa crítica recupera inmediatamente el estado verdadero.
    for(const stage of ['wall','territory','confirmation','result']){
      await load(page,draw.before);await choose(page,draw.to);
      if(stage==='wall')await page.waitForFunction(()=>document.querySelector('.wall-confirmation'));
      if(stage==='territory')await page.waitForFunction(()=>!document.getElementById('territoryNotice').hidden);
      if(stage==='confirmation')await page.waitForFunction(()=>[...document.querySelectorAll('.secured-aura')].some(n=>n.getAnimations().length));
      if(stage==='result')await page.waitForFunction(()=>document.getElementById('endScreen').getAnimations().length);
      assert.deepEqual(await saved(page),draw.after);await page.reload();await idle(page);
      assert.equal(await page.locator('#winnerTitle').innerText(),'¡EMPATE!');assert.equal(await page.evaluate(()=>document.getAnimations().length),0);
      assert.equal(await page.evaluate(()=>window.finalProbe.territory.length),0);assert.equal(await page.locator('[data-to],[data-wall]').count(),0);
    }
    // Reiniciar dentro de cada etapa invalida todas las continuaciones y conserva preferencias.
    for(const stage of ['wall','confirmation','result']){
      await load(page,victory.before);await choose(page,victory.to);
      if(stage==='confirmation')await page.waitForFunction(()=>[...document.querySelectorAll('.secured-aura')].some(n=>n.getAnimations().length));
      if(stage==='result')await page.waitForFunction(()=>document.getElementById('endScreen').getAnimations().length);
      await page.locator('#new').click();await idle(page);await page.waitForTimeout(1700);
      assert.deepEqual(await saved(page),engine.initialState());assert.ok(await page.locator('#endScreen').isHidden());
      assert.equal(await page.locator('.token-isolated,.wall-built').count(),0);assert.equal(await page.locator('#scoreA').innerText(),'0');assert.equal(await page.locator('#turnDisc').innerText(),'A1');
      assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('cerconexo-preferences-v1')).vibration),true);
    }
    // Preferencia dinámica durante la entrada; nueva partida accesible por teclado.
    await load(page,victory.before);await choose(page,victory.to);await idle(page);await page.emulateMedia({reducedMotion:'reduce'});
    await page.waitForFunction(()=>document.getAnimations().length===0);
    assert.equal(await page.evaluate(()=>document.getAnimations().length),0);await page.locator('#new').focus();await page.keyboard.press('Enter');await idle(page);assert.deepEqual(await saved(page),engine.initialState());
    await context.close();report.checks.push('Guardado previo a los efectos; recarga durante muro/conquista/confirmación/resultado; reinicio seguro, preferencias, una sola vibración por jugada y teclado');
    const reduced=await create(390,844,'reduce');
    for(const fixture of [victory,draw]){
      await load(reduced.page,fixture.before);const start=Date.now();await choose(reduced.page,fixture.to,true);await idle(reduced.page);
      assert.ok(await reduced.page.locator('#endScreen').isVisible());assert.equal(await reduced.page.evaluate(()=>document.getAnimations().length),0);
      assert.ok(Date.now()-start<1000,'El movimiento reducido no espera el aviso territorial final');
      assert.deepEqual(await saved(reduced.page),fixture.after);
    }
    // Partida completa usando únicamente jugadas legales determinadas por el motor.
    await load(reduced.page,engine.initialState());let game=engine.initialState(),seed=4501,turns=0;
    const rnd=n=>{seed=(1664525*seed+1013904223)>>>0;return seed%n;};
    while(!game.over){
      const actor=game.currentActor,route=[engine.pieceById(game,actor).pos];
      for(let n=rnd(3);n>0;n--){const choices=engine.availableMoves(game,actor,route.at(-1));if(!choices.length)break;const to=choices[rnd(choices.length)];route.push(to);await reduced.page.locator(`[data-to="${to}"]`).focus();await reduced.page.keyboard.press('Enter');await idle(reduced.page);}
      const choices=engine.wallOptions(game,route.at(-1)),to=choices[rnd(choices.length)];game=engine.applyTurn(game,{actor,path:route,to});
      await choose(reduced.page,to,true);await idle(reduced.page);assert.deepEqual(await saved(reduced.page),game);turns++;
    }
    assert.equal(await reduced.page.locator('#winnerTitle').innerText(),game.winner==='Empate'?'¡EMPATE!':`¡VICTORIA DEL EQUIPO ${game.winner}!`);
    report.checks.push(`Movimiento reducido y navegador sin vibración: resultado inmediato; partida completa de ${turns} turnos con puntuación oficial intacta`);
    await reduced.context.close();
    const prior=await create(360,740),pockets=resultFixture({pockets:true});
    await load(prior.page,pockets.before);assert.equal(await prior.page.locator('.token-isolated').count(),2);
    await choose(prior.page,pockets.to);await idle(prior.page);
    assert.equal(await prior.page.locator('.token-isolated').count(),4);
    assert.equal(await prior.page.evaluate(()=>window.finalProbe.confirmations.length),2);
    assert.deepEqual(await saved(prior.page),pockets.after);await prior.context.close();
    report.checks.push('Final desde 1 vs. 1 conserva territorios previos y solo confirma las dos fichas nuevas, sin redistribuciones redundantes');
    // Evidencia animada: fotogramas reales, ejecución separada de las mediciones.
    const demo=await create(390,844);
    for(const [name,fixture] of [['victoria',victory],['empate',draw]]){
      await load(demo.page,fixture.before);const frames=path.join(out,`frames-${name}`);await fs.mkdir(frames,{recursive:true});
      await demo.page.screenshot({path:path.join(frames,'000.png')});await choose(demo.page,fixture.to);
      const start=performance.now();let i=1;while(performance.now()-start<2100){await demo.page.screenshot({path:path.join(frames,`${String(i++).padStart(3,'0')}.png`)});await demo.page.waitForTimeout(75);}
      report.checks.push(`Fotogramas reales ${name}: ${i} capturas para GIF`);
    }
    await demo.context.close();
    const offline=await browser.newContext({viewport:{width:360,height:740},hasTouch:true,reducedMotion:'reduce'}),p=await offline.newPage();
    p.on('pageerror',e=>errors.push(e.message));await p.goto(pathToFileURL(path.join(root,'Cerconexo_Premium_Listo_Para_Jugar.html')).href);await idle(p);
    await load(p,draw.before);await choose(p,draw.to,true);await idle(p);assert.equal(await p.locator('#winnerTitle').innerText(),'¡EMPATE!');await p.reload();await idle(p);assert.deepEqual(await saved(p),draw.after);await offline.close();
    report.checks.push('HTML autónomo file://: empate, tablero final persistente y recarga estable');
    assert.deepEqual(errors,[]);report.errors=errors;await fs.writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  }finally{await browser.close();await site.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
