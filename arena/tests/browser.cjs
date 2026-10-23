/* Navegador real: UI de Arena y HTML autónomo, sin tocar la aplicación Premium. */
const fs=require('node:fs/promises');
const path=require('node:path');
const http=require('node:http');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');

(async()=>{
  const {chromium}=require(process.env.CERCONEXO_PLAYWRIGHT_PATH||'playwright');
  const root=path.resolve(__dirname,'..'),out=path.join(root,'evidence/m3b-regression');await fs.mkdir(out,{recursive:true});
  const {startPagesServer}=await import('../../tests/pages-server.mjs');
  const site=await startPagesServer({entry:'arena/'}),url=site.url;
  const browser=await chromium.launch({headless:true,channel:process.env.CERCONEXO_BROWSER_CHANNEL||'msedge'});
  const report={checks:[],viewports:[],errors:[],screens:[],recordings:[]};
  const click=async(page,selector,touch=false)=>{
    const loc=page.locator(selector).first();
    try{await loc.waitFor({state:'visible'});}catch(error){await page.screenshot({path:path.join(out,'failure.png'),fullPage:true});console.error(await page.locator('#turnTitle').innerText(),await page.locator('#problem').innerText(),await saved(page));throw error;}
    await loc.scrollIntoViewIfNeeded();
    if(touch){const box=await loc.boundingBox();await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);}else await loc.click();
  };
  const setup=async(page,{mode='duo',policy='piece',experiment}={})=>{
    if(!await page.locator('#newDialog').evaluate(d=>d.open))await page.click('#newOpen');
    await page.check(`[name="mode"][value="${mode}"]`);
    if(mode==='duo')await page.check(`[name="policy"][value="${policy}"]`);
    if(experiment)await page.locator('#experimentJson').evaluate((el,cfg)=>{el.value=JSON.stringify(cfg);},experiment);
    // close() cambia .open antes de emitir close y restaurar el foco. No empezar
    // una prueba de teclado hasta haber observado ese acontecimiento real.
    await page.locator('#newDialog').evaluate(d=>{d.closeObserved=false;d.addEventListener('close',()=>d.closeObserved=true,{once:true});});
    await page.click('#startArena');await page.waitForFunction(()=>{const d=document.getElementById('newDialog');return !d.open&&d.closeObserved;});
  };
  const saved=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('cerconexo-arena-m3a-v1')));
  const newContext=async(viewport,reducedMotion='reduce',video=false)=>{
    const context=await browser.newContext({viewport,hasTouch:viewport.width<=760,isMobile:viewport.width<=760,reducedMotion,
      ...(video&&process.env.CERCONEXO_RECORD_VIDEO==='1'?{recordVideo:{dir:path.join(out,'recordings'),size:viewport}}:{})});
    await context.addInitScript(()=>{localStorage.setItem('wallgo-league-v2','premium-no-modificar');localStorage.setItem('cerconexo-preferences-v1','preferencias-no-modificar');});
    const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));await page.goto(url);return {context,page};
  };
  const shot=async(page,name)=>{const filename=name+'.png';await page.screenshot({path:path.join(out,filename),fullPage:true});report.screens.push(filename);};
  try{
    for(const [width,height] of [[1440,900],[1366,768],[1366,600],[390,844],[360,740],[740,360]]){
      const {context,page}=await newContext({width,height}),touch=width<=760;
      await shot(page,`selector-${width}x${height}`);await setup(page,{policy:'team'});
      assert.equal(await page.locator('[data-cell-bg]').count(),81);assert.equal(await page.locator('[data-piece]').count(),4);
      const boardWidth=await page.locator('#arenaBoard').evaluate(e=>e.getBoundingClientRect().width);
      await click(page,'[data-kind="select"][data-cell="10"]',touch);await click(page,'[data-kind="select"][data-cell="70"]',touch);
      assert.match(await page.locator('#turnTitle').innerText(),/A2/,`selección ${width}x${height}`);
      await click(page,'[data-kind="move"][data-cell="69"]',touch);
      assert.equal(await page.locator('[data-kind="select"]').count(),0);assert.equal(await page.locator('[data-piece="A2"]').getAttribute('data-position'),'69');
      await page.reload();assert.equal(await page.locator('[data-piece="A2"]').getAttribute('data-position'),'69');assert.match(await page.locator('#turnHint').innerText(),/1 paso/);
      await click(page,'[data-kind="move"][data-cell="70"]',touch);await page.reload();
      assert.match(await page.locator('#turnHint').innerText(),/2 pasos/);assert.equal(await page.locator('[data-kind="move"]').count(),0);
      await click(page,'[data-kind="wall"]',touch);assert.match(await page.locator('#turnTitle').innerText(),/Equipo B/);
      assert.equal((await saved(page)).commands.filter(c=>c.type==='wall').length,1);
      await page.click('#rulesOpen');await page.keyboard.press('Escape');assert.equal(await page.locator('#rulesOpen').evaluate(e=>document.activeElement===e),true);
      await page.click('#newOpen');await page.locator('#newDialog [data-close]').click();
      assert.equal(await page.locator('#arenaBoard').evaluate(e=>e.getBoundingClientRect().width),boardWidth);
      const dimensions=await page.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight}));
      assert.equal(dimensions.scrollWidth,width,`desborde horizontal ${width}x${height}`);
      assert.equal(await page.evaluate(()=>localStorage.getItem('wallgo-league-v2')),'premium-no-modificar');
      assert.equal(await page.evaluate(()=>localStorage.getItem('cerconexo-preferences-v1')),'preferencias-no-modificar');
      await shot(page,`equipo-${width}x${height}`);report.viewports.push({...dimensions,boardWidth});
      await setup(page,{mode:'ffa'});assert.match(await page.locator('#turnTitle').innerText(),/Equipo A/);
      for(const team of ['B','C','D','A']){await click(page,'[data-kind="wall"]',touch);assert.match(await page.locator('#turnTitle').innerText(),new RegExp(`Equipo ${team}`));}
      await page.reload();assert.equal(await page.locator('[data-score]').count(),4);await shot(page,`cuatro-equipos-${width}x${height}`);
      report.checks.push(`${width}×${height}: selección, cambio antes de actuar, compromiso, recarga de uno/dos pasos y regreso, muro, cuatro equipos, diálogos y aislamiento de Premium`);
      await context.close();
      console.log(`Arena ${width}x${height}: correcto`);
    }
    const {context,page}=await newContext({width:390,height:844},'no-preference',true);
    const experiment={initial:[{cell:11,type:'extraWall'},{cell:20,type:'jump'}],waves:[],symmetry:'vertical',placement:'center-first'};
    await setup(page,{experiment});
    await page.locator('[data-kind="move"][data-cell="11"]').focus();
    await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');
    assert.equal(await page.locator('[data-kind="move"][data-cell="11"]').evaluate(e=>{const ring=e.querySelector('.focus-ring');return getComputedStyle(ring).stroke!=='rgba(0, 0, 0, 0)';}),true);
    assert.ok(await page.locator('[data-kind="move"][data-cell="11"]').evaluate(n=>n===document.activeElement&&n.matches(':focus-visible')));
    const pickupBefore=await saved(page);
    await page.keyboard.press('Enter');
    await page.waitForFunction(n=>JSON.parse(localStorage.getItem('cerconexo-arena-m3a-v1')).commands.length===n+1,pickupBefore.commands.length);
    const pickupAfter=await saved(page),{replayArenaSave}=await import('../src/session.mjs'),beforePower=replayArenaSave(JSON.stringify(pickupBefore)),afterPower=replayArenaSave(JSON.stringify(pickupAfter));
    assert.ok(beforePower.ok&&afterPower.ok);assert.equal(beforePower.game.inventories.A1.length,0);assert.equal(afterPower.game.inventories.A1.length,1);
    assert.deepEqual(pickupAfter.commands.at(-1),{type:'move',to:11});assert.equal(afterPower.game.pieces.find(p=>p.id==='A1').pos,11);
    assert.equal(afterPower.game.drops.some(p=>p.cell===11),false);assert.match(await page.locator('#inventoryTitle').innerText(),/1\/1/);
    await click(page,'[data-kind="move"][data-cell="20"]',true);await shot(page,'inventario-lleno-pendiente');
    assert.equal(await page.locator('#decisionPanel').isVisible(),true);assert.equal(await page.locator('[data-action]').count(),0);
    const pendingBefore=await saved(page);await page.reload();assert.deepEqual(await saved(page),pendingBefore);assert.equal(await page.locator('#decisionPanel').isVisible(),true);
    await page.locator('#discardOptions button').filter({hasText:'Salto'}).click();assert.equal(await page.locator('#decisionPanel').isVisible(),false);
    await page.locator('[data-power]').click();assert.equal(await page.locator('[data-kind="extraWall"]').count()>0,true);
    await click(page,'[data-kind="extraWall"]',true);assert.equal(await page.locator('[data-wall]').count(),1);assert.match(await page.locator('#turnHint').innerText(),/2 pasos/);
    await page.reload();assert.equal(await page.locator('[data-wall]').count(),1);assert.equal(await page.locator('[data-power]').count(),0);
    await click(page,'[data-kind="wall"]',true);assert.equal(await page.locator('[data-wall]').count(),2);assert.match(await page.locator('#turnTitle').innerText(),/Equipo B/);
    report.checks.push('Ratón, tacto y Enter; inventario lleno, descarte pendiente conservado tras recarga, poder usado con dos pasos y muro final único');
    await shot(page,'poder-y-muro-confirmados');
    await setup(page,{mode:'duo',policy:'team'});assert.equal(await page.locator('[data-wall]').count(),0);assert.equal(await page.locator('[data-piece][data-secured="true"]').count(),0);
    report.checks.push('Nueva partida restaura fichas, inventarios y muros; elige política sin residuos');
    const video=page.video();await context.close();if(video){const filename=await video.path();report.recordings.push(path.relative(out,filename));}

    // Finales y adversario: fixtures estructurales en un envoltorio de prueba; el motor bajo prueba permanece íntegro.
    const {createArena,legalArenaActions}=await import('../src/engine.mjs');const {arenaNeighbors,arenaWall,analyzeArena}=await import('../src/geometry.mjs');
    const fixture=createArena({policy:'team',experiment:{initial:[],waves:[],symmetry:'vertical',placement:'center-first'}});
    fixture.pieces.find(p=>p.id==='B1').pos=11;
    fixture.walls=arenaNeighbors(11).filter(n=>n!==10).map(n=>arenaWall(11,n));
    fixture.turn={team:'A',actor:'A1',steps:0,path:[10],committed:false,actions:0};
    fixture.inventories.A=[{id:'fixture-a',type:'extraWall'}];fixture.inventories.B=[{id:'fixture-b1',type:'jump'},{id:'fixture-b2',type:'demolition'}];
    const originalEngine=await fs.readFile(path.join(root,'src/engine.mjs'),'utf8');
    const wrapper=originalEngine.replace('export function createArena(', 'function originalCreateArena(')+`\nexport function createArena(options={}) { originalCreateArena(options); return structuredClone(${JSON.stringify(fixture)}); }\n`;
    const fixtureContext=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
    await fixtureContext.route('**/src/engine.mjs',route=>route.fulfill({status:200,contentType:'text/javascript',body:wrapper}));
    const f=await fixtureContext.newPage();f.on('pageerror',e=>report.errors.push(e.message));await f.goto(url);await setup(f,{policy:'team',experiment:{initial:[],waves:[],symmetry:'vertical',placement:'center-first'}});
    await f.click('[data-power="fixture-a"]');await f.click('[data-kind="extraWall"][data-to="11"]');
    assert.match(await f.locator('#decisionTitle').innerText(),/B/);assert.equal(await f.locator('[data-piece="B1"]').getAttribute('data-secured'),'true');
    await shot(f,'descarte-del-adversario');await f.reload();assert.equal(await f.locator('#decisionPanel').isVisible(),true);
    await f.locator('#discardOptions button').first().click();assert.equal(await f.locator('#decisionPanel').isVisible(),false);assert.match(await f.locator('#turnTitle').innerText(),/Equipo A/);
    assert.match(await f.locator('#eventNotice').innerText(),/Inventario resuelto.*A1/);
    await f.locator('[data-kind="wall"]').first().focus();await f.keyboard.press('Enter');assert.match(await f.locator('#turnTitle').innerText(),/Equipo B/);assert.match(await f.locator('#turnTitle').innerText(),/B2/);
    report.checks.push('Fixture de adversario: A asegura B1, B elige descarte, recarga conserva pausa y devuelve control a A; después B2 se selecciona automáticamente');await fixtureContext.close();

    // Una partida completa legal se reproduce hasta su penúltima acción y el navegador construye el muro final.
    const {ArenaSession}=await import('../src/session.mjs'),memory={setItem(){}};
    const played=new ArenaSession(memory);let seed=731,finalAction,prefix;
    for(let i=0;i<1500&&!played.game.over;i++){
      const s=played.game;seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      const legal=legalArenaActions(s).filter(a=>a.type==='wall'||a.type==='move');
      const a=s.pending?{type:'discard',owner:s.pending.owner,power:s.inventories[s.pending.owner][seed%s.inventories[s.pending.owner].length].id}:legal[seed%legal.length];
      prefix=played.encode();finalAction=a;played.dispatch(a);
    }
    assert.equal(played.game.over,true);assert.equal(finalAction.type,'wall');
    const endContext=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,reducedMotion:'reduce'});
    await endContext.addInitScript(raw=>{if(!localStorage.getItem('cerconexo-arena-m3a-v1'))localStorage.setItem('cerconexo-arena-m3a-v1',raw);},prefix);
    const endPage=await endContext.newPage();endPage.on('pageerror',e=>report.errors.push(e.message));await endPage.goto(url);
    await click(endPage,`[data-kind="wall"][data-to="${finalAction.to}"]`,true);
    assert.match(await endPage.locator('#turnTitle').innerText(),/Victoria|Empate/);assert.equal(await endPage.locator('[data-action]').count(),0);
    assert.equal(await endPage.locator('[data-piece][data-secured="true"]').count(),4);assert.equal(await endPage.locator('[data-wall]').count(),played.game.walls.length);
    const finalScore=analyzeArena(played.game).score;for(const t of played.game.teams)assert.equal(+(await endPage.locator(`[data-score="${t}"]`).innerText()),finalScore[t]);
    await shot(endPage,'final-partida-legal');const finalSaved=await saved(endPage);await endPage.reload();assert.deepEqual(await saved(endPage),finalSaved);assert.match(await endPage.locator('#turnTitle').innerText(),/Victoria|Empate/);
    await setup(endPage,{policy:'team'});assert.equal(await endPage.locator('[data-wall]').count(),0);assert.equal(await endPage.locator('[data-piece][data-secured="true"]').count(),0);
    report.checks.push('Partida completa legal, última construcción real en móvil, resultado oficial, 81 casillas, cuatro fichas aseguradas, bloqueo, recarga y reinicio');await endContext.close();

    const badContext=await browser.newContext({viewport:{width:360,height:740}});await badContext.addInitScript(()=>localStorage.setItem('cerconexo-arena-m3a-v1','diario-dañado'));
    const bad=await badContext.newPage();bad.on('pageerror',e=>report.errors.push(e.message));await bad.goto(url);
    assert.equal(await bad.locator('[data-action]').count(),0);assert.match(await bad.locator('#turnTitle').innerText(),/no válido/);
    assert.equal(await bad.evaluate(()=>localStorage.getItem('cerconexo-arena-m3a-v1')),'diario-dañado');
    report.checks.push('Guardado dañado: sin acciones disponibles ni sobrescritura silenciosa; recuperación explícita desde Nueva partida');await badContext.close();

    // Archivo autónomo real: sin servidor ni recursos externos.
    const fileContext=await browser.newContext({viewport:{width:1366,height:768},reducedMotion:'reduce'}),filePage=await fileContext.newPage();
    filePage.on('pageerror',e=>report.errors.push(e.message));await filePage.goto(pathToFileURL(path.join(root,'Cerconexo_Arena_M3B.html')).href);
    await setup(filePage,{mode:'ffa'});await click(filePage,'[data-kind="move"]');await filePage.reload();
    assert.match(await filePage.locator('#turnHint').innerText(),/1 paso/);assert.equal(await filePage.locator('[data-cell-bg]').count(),81);
    assert.equal(await filePage.locator('.brand img').evaluate(i=>i.complete&&i.naturalWidth>0),true);await shot(filePage,'autonomo-cuatro-equipos');
    report.checks.push('HTML autónomo file://: marca integrada, cuatro equipos, paso guardado y recarga sin servidor');await fileContext.close();
    assert.deepEqual(report.errors,[]);report.ok=true;
  }finally{
    await fs.writeFile(path.join(out,'browser-results.json'),JSON.stringify(report,null,2));await browser.close();await site.close();
  }
  process.stdout.write(JSON.stringify({ok:report.ok,checks:report.checks.length,screens:report.screens.length,viewports:report.viewports},null,2)+'\n');
})().catch(e=>{console.error(e);process.exitCode=1;});
