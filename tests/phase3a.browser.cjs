// Navegador real: estados del motor, animaciones nativas, accesibilidad y persistencia.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CERCONEXO_PLAYWRIGHT_PATH||'playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'validation/phase3a');
const idle=page=>page.waitForFunction(()=>document.getElementById('board').getAttribute('aria-busy')==='false');
const saved=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('wallgo-league-v2'))?.game);
async function load(page,game){
  await page.evaluate(game=>{localStorage.clear();localStorage.setItem('wallgo-league-v2',JSON.stringify({game}));},game);
  await page.reload();await idle(page);
  await page.evaluate(()=>Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{}))));
}
async function choose(page,to){
  const box=await page.locator(`[data-wall="${to}"]`).boundingBox();assert.ok(box);
  await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);
}
async function instrument(context){
  await context.addInitScript(()=>{
    window.territorialProbes=[];window.resultTime=null;
    document.addEventListener('DOMContentLoaded',()=>{
      const notice=document.getElementById('territoryNotice'),board=document.getElementById('board');
      let observed=false;
      const snapshot=()=>({at:performance.now(),busy:board.getAttribute('aria-busy'),scores:['A','B'].map(t=>Number(document.getElementById(`score${t}`).textContent)),
        animations:[...board.querySelectorAll('.board-cell')].flatMap(node=>node.getAnimations().map(a=>({cell:Number(node.dataset.cell),territory:node.dataset.territory,delay:a.effect.getTiming().delay,duration:a.effect.getTiming().duration,frames:a.effect.getKeyframes().map(f=>f.fill)}))),
        computed:[...board.querySelectorAll('.board-cell')].map(node=>getComputedStyle(node).fill),saved:JSON.parse(localStorage.getItem('wallgo-league-v2')).game});
      new MutationObserver(()=>{
        if(notice.hidden||notice.dataset.kind!=='territory'||observed)return;observed=true;
        const probe={start:performance.now(),text:notice.textContent,samples:[snapshot()]};window.territorialProbes.push(probe);
        // Doble acción mientras el muro ya está guardado y el territorio se presenta.
        board.querySelector('[data-wall]')?.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
        probe.afterDuplicate=JSON.parse(localStorage.getItem('wallgo-league-v2')).game;
        for(const delay of [100,200,350,550,1000,1250])setTimeout(()=>probe.samples.push(snapshot()),delay);
        const timer=setInterval(()=>{if(notice.hidden||notice.dataset.kind!=='territory'){probe.end=performance.now();clearInterval(timer);}},10);
      }).observe(notice,{attributes:true,childList:true});
      new MutationObserver(()=>{if(!document.getElementById('endScreen').hidden)window.resultTime=performance.now();})
        .observe(document.getElementById('endScreen'),{attributes:true,attributeFilter:['hidden']});
    });
  });
}
(async()=>{
  await fs.mkdir(out,{recursive:true});
  const engine=await import(pathToFileURL(path.join(root,'src/engine.mjs')));
  const fixtures=await import('./territory-fixtures.mjs');
  const {startPagesServer}=await import('./pages-server.mjs');
  const site=await startPagesServer(),browser=await require('./navigation.cjs').historicalBrowser(await chromium.launch({headless:true,channel:'msedge'}));
  const report={checks:[],screens:[],timing:[]},errors=[];
  async function create(width=390,height=844,motion='no-preference'){
    const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:width<761,reducedMotion:motion});
    await instrument(context);const page=await context.newPage();
    page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>errors.push(r.url()));
    await page.goto(site.url);await idle(page);return {page,context};
  }
  function equalScore(game,score){const official=engine.territory(game).score;assert.deepEqual(score,[official.A,official.B]);assert.equal(Object.values(official).reduce((a,b)=>a+b),49);}
  try{
    for(const [width,height] of [[1440,900],[1366,768],[390,844],[360,740]]){
      const {page,context}=await create(width,height),fixture=fixtures.conquestFixture();
      await load(page,fixture.before);
      const boardBefore=await page.locator('#board').boundingBox();
      await choose(page,fixture.to);await page.waitForFunction(()=>!document.getElementById('territoryNotice').hidden);
      await page.screenshot({path:path.join(out,`conquista-${width}x${height}.png`)});
      const metric=await page.evaluate(()=>{
        const rect=id=>{const r=document.getElementById(id).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right};};
        const notice=document.getElementById('territoryNotice'),r=notice.getBoundingClientRect();
        const clipped=[...notice.querySelectorAll('.conquest-heading,.conquest-gain')].filter(n=>{const b=n.getBoundingClientRect();return b.x<r.x-1||b.right>r.right+1||b.bottom>r.bottom+1;}).map(n=>n.className);
        return {viewport:[innerWidth,innerHeight],page:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],board:rect('board'),turn:rect('turnBanner'),score:document.querySelector('.score-panel').getBoundingClientRect().bottom,notice:rect('territoryNotice'),clipped,
          message:notice.textContent,fonts:[...notice.querySelectorAll('span,strong')].filter(n=>n.className!=='conquest-unit').map(n=>parseFloat(getComputedStyle(n).fontSize))};
      });
      assert.deepEqual(metric.page,[width,height]);assert.deepEqual(metric.clipped,[]);assert.ok(metric.fonts.every(n=>n>=12));
      assert.equal(metric.board.width,boardBefore.width);assert.ok(metric.board.bottom<=height&&metric.score<=height);
      const overlap=Math.min(metric.notice.right,metric.board.right)>Math.max(metric.notice.x,metric.board.x)&&Math.min(metric.notice.bottom,metric.board.bottom)>Math.max(metric.notice.y,metric.board.y);
      assert.ok(!overlap,'El aviso no cubre el tablero');report.screens.push(metric);
      await idle(page);await page.waitForFunction(()=>window.territorialProbes[0]?.samples.length===7);
      const probe=await page.evaluate(()=>window.territorialProbes[0]);
      assert.match(probe.text,/Equipo A.*\+12.*casillas/);assert.deepEqual(probe.samples[0].saved,fixture.after);assert.deepEqual(probe.afterDuplicate,fixture.after);
      const animations=probe.samples[0].animations;assert.equal(animations.length,12);
      assert.ok(animations.every(a=>a.territory==='A'&&a.duration===200));
      assert.equal(Math.min(...animations.map(a=>a.delay)),0);assert.equal(Math.max(...animations.map(a=>a.delay+a.duration)),500);
      equalScore(fixture.after,probe.samples.at(-1).scores);assert.equal(probe.samples[4].animations.length,0);
      assert.ok(probe.end-probe.start>=1100&&probe.end-probe.start<1500);
      assert.equal(await page.locator('#turnDisc').innerText(),fixture.after.currentActor);
      assert.notEqual(await page.locator('#territoryNotice').getAttribute('data-kind'),'territory');
      assert.deepEqual(await saved(page),fixture.after);
      await page.screenshot({path:path.join(out,`territorio-${width}x${height}.png`)});
      report.timing.push({viewport:[width,height],noticeMs:probe.end-probe.start,spreadMs:500,scores:probe.samples.map(s=>({ms:Math.round(s.at-probe.start),values:s.scores}))});
      // Ejemplo simultáneo: dos colores y un único aviso; el resultado espera.
      const both=fixtures.conquestFixture({both:true});await load(page,both.before);await choose(page,both.to);
      await page.waitForFunction(()=>!document.getElementById('territoryNotice').hidden);
      await page.screenshot({path:path.join(out,`simultanea-${width}x${height}.png`)});
      await idle(page);
      const simultaneous=await page.evaluate(()=>({probe:window.territorialProbes[0],resultTime:window.resultTime}));
      assert.match(simultaneous.probe.text,/TERRITORIOS ASEGURADOS.*Equipo A.*\+12.*Equipo B.*\+37/);
      const aa=simultaneous.probe.samples[0].animations;
      assert.equal(aa.length,49);assert.deepEqual(new Set(aa.map(a=>a.territory)),new Set(['A','B']));
      assert.ok(simultaneous.resultTime-simultaneous.probe.start>=1100);
      assert.ok(await page.locator('#endScreen').isVisible());assert.equal(await page.locator('.token-isolated').count(),4);
      equalScore(both.after,await page.evaluate(()=>['A','B'].map(t=>Number(document.getElementById(`score${t}`).textContent))));
      await context.close();
    }
    report.checks.push('Cuatro resoluciones: mismo tablero, sin scroll ni solapamientos; conquista A, BFS 500 ms, contador y aviso 1200 ms; simultánea A/B y resultado posterior');
    const landscape=await create(740,360),split=fixtures.conquestFixture({both:true});
    await load(landscape.page,split.before);await choose(landscape.page,split.to);
    await landscape.page.waitForFunction(()=>!document.getElementById('territoryNotice').hidden);
    const rotated=await landscape.page.evaluate(()=>{
      const notice=document.getElementById('territoryNotice'),r=notice.getBoundingClientRect(),board=document.getElementById('board').getBoundingClientRect();
      return {page:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],clear:r.right<board.x,
        clipped:[...notice.querySelectorAll('.conquest-heading,.conquest-gain')].some(node=>{const b=node.getBoundingClientRect();return b.right>r.right+1||b.bottom>r.bottom+1;})};
    });
    assert.deepEqual(rotated.page,[740,360]);assert.ok(rotated.clear);assert.equal(rotated.clipped,false);
    await landscape.page.screenshot({path:path.join(out,'simultanea-740x360.png')});await idle(landscape.page);await landscape.context.close();
    report.checks.push('Orientación horizontal 740×360: aviso simultáneo legible dentro del panel, sin cubrir el tablero');
    const {page,context}=await create();
    for(const options of [{owner:'B'},{owner:'B',rival:true}]){
      const fixture=fixtures.conquestFixture(options);await load(page,fixture.before);await choose(page,fixture.to);await idle(page);
      assert.match(await page.evaluate(()=>window.territorialProbes[0].text),/Equipo B.*\+12/);
      assert.equal(await page.locator('#scoreB').innerText(),'12');
    }
    for(const fixture of [fixtures.emptyFixture(),fixtures.sharedFixture()]){
      await load(page,fixture.before);await choose(page,fixture.to);await idle(page);
      assert.equal(await page.evaluate(()=>window.territorialProbes.length),0);assert.deepEqual(await saved(page),fixture.after);
    }
    report.checks.push('B asegura territorio en turno propio o por muro de A; región vacía y división compartida sin celebración');
    // Recarga y reinicio en plena propagación. No se persiste ningún evento visual.
    const fixture=fixtures.conquestFixture();await load(page,fixture.before);await choose(page,fixture.to);
    await page.waitForFunction(()=>!document.getElementById('territoryNotice').hidden);await page.reload();await idle(page);
    assert.deepEqual(await saved(page),fixture.after);assert.equal(await page.evaluate(()=>window.territorialProbes.length),0);
    assert.equal(await page.locator('#scoreA').innerText(),'12');assert.equal(await page.locator('#turnDisc').innerText(),'B1');
    await load(page,fixture.before);await choose(page,fixture.to);await page.waitForFunction(()=>!document.getElementById('territoryNotice').hidden);
    await page.locator('#new').click();await page.locator('#startLocal').click();await idle(page);
    await page.waitForTimeout(1400);assert.equal((await saved(page)).moves,0);
    assert.equal(await page.locator('#scoreA').innerText(),'0');assert.equal(await page.locator('#turnDisc').innerText(),'A1');assert.ok(await page.locator('#territoryNotice').isHidden());
    // Cambiar a movimiento reducido termina efectos pendientes y deja los puntos oficiales.
    await load(page,fixture.before);await choose(page,fixture.to);await page.waitForFunction(()=>!document.getElementById('territoryNotice').hidden);
    await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>document.getAnimations().length===0);
    assert.equal(await page.locator('#scoreA').innerText(),'12');await idle(page);
    await load(page,fixture.before);await choose(page,fixture.to);await page.waitForFunction(()=>!document.getElementById('territoryNotice').hidden);
    const reduced=await page.evaluate(()=>window.territorialProbes[0]);assert.equal(reduced.samples[0].animations.length,0);
    equalScore(fixture.after,reduced.samples[0].scores);assert.match(reduced.text,/Equipo A.*\+12/);
    await idle(page);assert.deepEqual(await saved(page),fixture.after);
    // Singular y una sola celebración aun cuando se intenta confirmar de nuevo.
    const one=engine.initialState();one.walls=[1,7,9].map(to=>engine.wallKey(8,to));one.moves=3;
    await load(page,one);await choose(page,15);await idle(page);
    const single=await page.evaluate(()=>window.territorialProbes);assert.equal(single.length,1);assert.match(single[0].text,/\+1 casilla$/);
    assert.equal(await page.locator('#scoreA').innerText(),'1');assert.equal(await page.locator('.token-isolated').count(),1);
    await context.close();
    report.checks.push('Recarga durante conquista, reinicio cancela continuaciones, reducción de movimiento al inicio/durante efecto, singular y ausencia de dobles acciones');
    // Mismo módulo en HTML autónomo sin recursos de red.
    const standalone=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,reducedMotion:'reduce'});
    await instrument(standalone);const singlePage=await standalone.newPage();singlePage.on('pageerror',e=>errors.push(e.message));
    await singlePage.goto(pathToFileURL(path.join(root,'Cerconexo_Premium_Listo_Para_Jugar.html')).href);await idle(singlePage);
    await load(singlePage,fixture.before);await choose(singlePage,fixture.to);await idle(singlePage);
    assert.deepEqual(await saved(singlePage),fixture.after);await singlePage.reload();await idle(singlePage);assert.equal(await singlePage.locator('#scoreA').innerText(),'12');
    await standalone.close();report.checks.push('HTML autónomo file://: conquista, contador, guardado y recarga');
    assert.deepEqual(errors,[]);report.errors=errors;
    await fs.writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  }finally{await browser.close();await site.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
