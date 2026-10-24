/* Navegación real en el paquete de Pages. No modifica motores ni expone API de pruebas. */
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.CERCONEXO_PLAYWRIGHT_PATH||'playwright');
(async()=>{
  const root=path.resolve(__dirname,'..'),out=path.join(root,'validation/integration/browser');await fs.mkdir(out,{recursive:true});
  const {startPagesServer,publicFiles}=await import('./pages-server.mjs'),{initialState}=await import('../src/engine.mjs');
  const {encodeGameSave}=await import('../src/gameSave.mjs'),{beginDraft,advanceDraft}=await import('../src/turnDraft.mjs');
  const {resultFixture}=await import('./result-fixtures.mjs');
  const {ArenaSession}=await import('../arena/src/session.mjs'),{legalArenaActions,createArena}=await import('../arena/src/engine.mjs');
  const arenaFixtures=JSON.parse(await fs.readFile(path.join(root,'arena/tests/m3a-saves.json'),'utf8'));
  const ck='wallgo-league-v2',ak='cerconexo-arena-m3a-v1',pk='cerconexo-preferences-v1';
  const classic=initialState(),classicRaw=encodeGameSave(classic,advanceDraft(classic,beginDraft(classic),9)),arenaRaw=arenaFixtures.saves.find(f=>f.name==='duo-team').raw;
  const site=await startPagesServer({entry:''}),browser=await chromium.launch({headless:true,channel:process.env.CERCONEXO_BROWSER_CHANNEL||'msedge'});
  const report={checks:[],viewports:[],screens:[],errors:[],resources:[],frames:0};
  const collect=p=>{p.on('pageerror',e=>report.errors.push(e.message));p.on('response',r=>{if(r.status()>=400)report.errors.push(`${r.status()} ${r.url()}`);});};
  const raw=(p,key)=>p.evaluate(key=>localStorage.getItem(key),key);
  const idle=p=>p.waitForFunction(()=>document.getElementById('board')?.getAttribute('aria-busy')==='false');
  const shot=async(p,name)=>{await p.screenshot({path:path.join(out,name+'.png'),fullPage:true});report.screens.push(name+'.png');};
  const metrics=(p,selector)=>p.evaluate(sel=>{const b=document.querySelector(sel)?.getBoundingClientRect();return {page:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],board:b?[b.x,b.y,b.width,b.height]:null,zoom:visualViewport.scale};},selector);
  const watch=(p,selector)=>p.evaluate(sel=>{window.layoutFrames=[];window.watchLayout=true;const tick=()=>{if(!window.watchLayout)return;const b=document.querySelector(sel).getBoundingClientRect();layoutFrames.push({page:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],board:[b.x,b.y,b.width,b.height]});requestAnimationFrame(tick);};requestAnimationFrame(tick);},selector);
  const checkFrames=async(p,size,baseline)=>{const frames=await p.evaluate(()=>{watchLayout=false;return layoutFrames;});assert.ok(frames.length);for(const f of frames){assert.deepEqual(f.page,size);assert.deepEqual(f.board,baseline);}report.frames+=frames.length;};
  const enterClassic=async p=>{await p.goto(site.url+'clasico/?continue=1');await idle(p);};
  const home=async(p,button)=>{await p.locator(button).click();await p.waitForFunction(()=>document.documentElement.dataset.portalReady==='true');};
  try{
    for(const [width,height,classicSize] of [[1440,900,734],[1366,768,602],[1366,600,440],[390,844,366],[360,740,336],[740,360,294],[1280,560,400]]){
      const context=await browser.newContext({viewport:{width,height},hasTouch:width<800,isMobile:width<800,reducedMotion:'reduce'});
      await context.addInitScript(({ck,ak,pk,classicRaw,arenaRaw})=>{
        if(!sessionStorage.getItem('unified-seeded')){localStorage.setItem(ck,classicRaw);localStorage.setItem(ak,arenaRaw);localStorage.setItem(pk,'{"vibration":false}');sessionStorage.setItem('unified-seeded','1');}
        window.portalWrites=[];const put=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){portalWrites.push(k);return put.call(this,k,v);};
      },{ck,ak,pk,classicRaw,arenaRaw});
      const p=await context.newPage();collect(p);await p.goto(site.url);
      assert.ok(await p.locator('.portal-brand img').evaluate(n=>n.complete&&n.naturalWidth>1000));
      assert.equal(await p.locator('.mode-card').count(),2);assert.doesNotMatch(await p.locator('body').innerText(),/Premium/);
      assert.equal(await p.locator('[data-continue]').filter({hasText:'Continuar'}).count(),2);
      assert.deepEqual((await metrics(p)).page,[width,height]);assert.deepEqual(await p.evaluate(()=>portalWrites),[]);
      await shot(p,`inicio-pendientes-${width}x${height}`);
      await p.locator('[data-mode=classic] [data-continue]').click();await idle(p);assert.equal(await raw(p,ck),classicRaw);assert.equal(await raw(p,ak),arenaRaw);
      const cb=(await metrics(p,'#board')).board;assert.equal(cb[2],classicSize);assert.equal(await p.locator('[data-actor]').count(),0);assert.equal(await p.locator('[data-to="8"]').count(),1);
      await shot(p,`clasico-${width}x${height}`);await watch(p,'#board');
      await p.click('#new');assert.ok(await p.locator('#replaceWarning').isVisible());assert.equal(await raw(p,ck),classicRaw);await shot(p,`clasico-configuracion-${width}x${height}`);await checkFrames(p,[width,height],cb);await require('./m4-navigation.cjs').escape(p);await require('./m4-navigation.cjs').resumeClassic(p);
      await home(p,'#home');assert.equal(await raw(p,ck),classicRaw);
      await p.locator('[data-mode=arena] [data-continue]').click();await p.locator('[data-cell-bg]').first().waitFor();assert.equal(await raw(p,ak),arenaRaw);assert.equal(await raw(p,ck),classicRaw);
      const ab=(await metrics(p,'#arenaBoard')).board;if(width===390)assert.equal(ab[2],358);if(width===360)assert.equal(ab[2],328);
      await watch(p,'#arenaBoard');await p.click('#inspectToggle');assert.equal(await p.locator('#inspectToggle').innerText(),'Salir de inspección');
      await p.locator('[data-inspect="10"]').click();assert.equal(await p.locator('.region-count text').textContent(),'81');assert.equal(await raw(p,ak),arenaRaw);
      await shot(p,`arena-inspeccion-${width}x${height}`);await p.click('#inspectToggle');assert.equal(await p.locator('[data-inspect]').count(),0);assert.equal(await raw(p,ak),arenaRaw);
      await p.click('#newOpen');assert.ok(await p.locator('#replaceWarning').isVisible());await shot(p,`arena-configuracion-${width}x${height}`);await checkFrames(p,[width,height],ab);await require('./m4-navigation.cjs').escape(p);await require('./m4-navigation.cjs').resumeArena(p);
      await home(p,'#arenaHome');await p.locator('[data-mode=classic] [data-new]').click();await p.locator('#newDialog').waitFor();assert.ok(await p.locator('#replaceWarning').isVisible());
      assert.equal(await raw(p,ck),classicRaw);await require('./m4-navigation.cjs').escape(p);assert.equal(await raw(p,ck),classicRaw);await require('./m4-navigation.cjs').resumeClassic(p);
      // Construcción y recarga de un paso recuperado de la URL antigua: un único turno.
      await p.locator('[data-wall]').first().click();await idle(p);assert.equal(JSON.parse(await raw(p,ck)).game.moves,1);await p.reload();await p.click('#continueGame');await idle(p);
      assert.equal(JSON.parse(await raw(p,ck)).game.moves,1);assert.equal(await raw(p,ak),arenaRaw);
      // Resultado real del motor, repetición directa y opción de cambiar configuración.
      const final=resultFixture().after,control={version:1,type:'cpu',humanTeam:'A',difficulty:'advanced',seed:812};
      await p.evaluate(({key,value})=>localStorage.setItem(key,value),{key:ck,value:encodeGameSave(final,beginDraft(final),{control})});await enterClassic(p);
      assert.ok(await p.locator('#replay').isVisible());assert.ok(await p.locator('#new').isVisible());assert.equal((await metrics(p,'#board')).board[2],classicSize);
      await watch(p,'#board');await shot(p,`clasico-final-${width}x${height}`);await p.click('#replay');await idle(p);
      const replayed=JSON.parse(await raw(p,ck));assert.equal(replayed.game.moves,0);assert.equal(replayed.control.difficulty,'advanced');assert.equal(replayed.control.humanTeam,'A');assert.equal(replayed.game.turnMode,undefined);
      await checkFrames(p,[width,height],cb);assert.equal(await raw(p,ak),arenaRaw);assert.equal(await raw(p,pk),'{"vibration":false}');
      report.viewports.push({width,height,classicBoard:cb[2],arenaBoard:ab[2],zoom:(await metrics(p,'#board')).zoom});
      report.checks.push(`${width}×${height}: portada con dos pendientes, continuación directa, Inicio, cancelación de reemplazo, turnos recuperados, inspección sin escrituras, revancha CPU, sin scroll ni cambio del tablero`);await context.close();
    }
    // Compatibilidad de todos los diarios originales, incluyendo decisiones que pertenecen al rival.
    for(const fixture of arenaFixtures.saves){
      const c=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,reducedMotion:'reduce'}),p=await c.newPage();collect(p);await p.goto(site.url);
      await p.evaluate(({key,value})=>localStorage.setItem(key,value),{key:ak,value:fixture.raw});await p.goto(site.url+'arena/');assert.equal(await raw(p,ak),fixture.raw);
      await home(p,'#arenaHome');await p.locator('[data-mode=arena] [data-continue]').click();assert.equal(await raw(p,ak),fixture.raw);await p.reload();assert.equal(await raw(p,ak),fixture.raw);
      if(fixture.game.pending)assert.equal(await p.locator('#decisionPanel').isVisible(),true);
      if(fixture.game.over){await p.click('#inspectToggle');await p.locator('[data-inspect="0"]').click();await p.click('#inspectToggle');assert.equal(await raw(p,ak),fixture.raw);}
      await c.close();report.checks.push(`Diario original ${fixture.name}: acceso directo, Inicio/Continuar y recarga sin alteración`);
    }
    // Repetir cada configuración Arena (incluido JSON experimental) desde un final generado con acciones legales.
    for(const setup of [{mode:'duo',policy:'piece'},{mode:'duo',policy:'team'},{mode:'ffa',policy:'piece'}]){
      setup.experiment={...createArena(setup).experiment,waves:[]}; // configuración distinta de la predefinida
      const s=new ArenaSession({setItem(){}},setup);let seed=88;
      for(let i=0;!s.game.over&&i<1800;i++){
        seed=(Math.imul(seed,1664525)+1013904223)>>>0;const actions=legalArenaActions(s.game);
        const preferred=actions.filter(a=>a.type==='wall'||a.type==='select'||a.type==='discard');
        s.dispatch((preferred.length?preferred:actions)[seed%(preferred.length||actions.length)]);
      }
      assert.ok(s.game.over);const c=await browser.newContext({viewport:{width:360,height:740},hasTouch:true,reducedMotion:'reduce'}),p=await c.newPage();collect(p);await p.goto(site.url);
      await p.evaluate(({key,value})=>localStorage.setItem(key,value),{key:ak,value:s.encode()});await p.goto(site.url+'arena/');const before=(await metrics(p,'#arenaBoard')).board;
      assert.ok(await p.locator('#arenaReplay').isVisible());await shot(p,`arena-final-${setup.mode}-${setup.policy}`);await p.click('#arenaReplay');
      const stored=JSON.parse(await raw(p,ak));assert.deepEqual(stored.setup,s.setup);assert.deepEqual(stored.commands,[]);
      assert.equal(await p.locator('[data-cell-bg]').count(),81);assert.equal(await p.locator('[data-piece]').count(),4);assert.deepEqual((await metrics(p,'#arenaBoard')).board,before);
      await p.click('#newOpen');assert.ok(await p.locator('#replaceWarning').isVisible());await require('./m4-navigation.cjs').escape(p);await p.waitForFunction(()=>document.documentElement.dataset.portalReady==='true');assert.equal(await raw(p,ak),JSON.stringify(stored));await c.close();report.checks.push(`Revancha Arena ${setup.mode}/${setup.policy}: conserva configuración experimental, limpia diario, no altera tablero`);
    }
    // Sin guardados: navegar y cancelar no crea nada. Teclado y ambas modalidades nuevas.
    {
      const c=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,reducedMotion:'reduce'}),p=await c.newPage();collect(p);await p.goto(site.url);
      await shot(p,'inicio-sin-partidas');assert.equal(await p.locator('[data-new]:visible').count(),0);await p.locator('[data-mode=classic] [data-continue]').focus();await p.keyboard.press('Enter');
      await p.locator('#newDialog').waitFor();assert.equal(await raw(p,ck),null);await require('./m4-navigation.cjs').escape(p);assert.equal(await raw(p,ck),null);await p.waitForFunction(()=>document.documentElement.dataset.portalReady==='true');
      await p.locator('[data-mode=arena] [data-continue]').click();await p.locator('#newDialog').waitFor();await require('./m4-navigation.cjs').escape(p);assert.equal(await raw(p,ak),null);await p.waitForFunction(()=>document.documentElement.dataset.portalReady==='true');
      await p.locator('[data-mode=classic] [data-continue]').click();await p.check('[name=turnMode][value=team]');await p.click('#startLocal');await idle(p);await p.locator('[data-actor=A2]').focus();await p.keyboard.press('Enter');
      await p.locator('[data-to]').first().focus();await p.keyboard.press('Enter');await idle(p);assert.equal(JSON.parse(await raw(p,ck)).pendingTurn.actor,'A2');
      await home(p,'#home');await p.locator('[data-mode=arena] [data-continue]').click();await p.check('[name=mode][value=ffa]');await p.click('#startArena');
      assert.equal(JSON.parse(await raw(p,ak)).setup.mode,'ffa');await p.click('#inspectToggle');await p.locator('[data-inspect="0"]').focus();await p.keyboard.press('ArrowRight');await p.keyboard.press('Enter');assert.equal(await p.locator('.region-count text').textContent(),'81');
      await p.click('#inspectToggle');assert.equal(await p.locator('[data-kind=move]').count()>0,true);await c.close();report.checks.push('Sin guardados y teclado: entradas directas, cancelaciones sin escrituras, Clásico por equipo y Arena cuatro equipos, foco e inspección');
    }
    {
      const {finishFixture}=await import('./territory-fixtures.mjs');
      const c=await browser.newContext({viewport:{width:360,height:740},hasTouch:true,reducedMotion:'reduce'}),p=await c.newPage();collect(p);await p.goto(site.url);
      const final=finishFixture({...resultFixture().after,turnMode:'team'}),control={version:1,type:'cpu',humanTeam:'B',difficulty:'beginner',seed:66};
      await p.evaluate(({key,value})=>localStorage.setItem(key,value),{key:ck,value:encodeGameSave(final,beginDraft(final),{control})});await enterClassic(p);await p.click('#replay');
      await p.waitForFunction(()=>JSON.parse(localStorage.getItem('wallgo-league-v2'))?.game.moves===1&&document.getElementById('board').getAttribute('aria-busy')==='false');
      const result=JSON.parse(await raw(p,ck));assert.equal(result.game.turnMode,'team');assert.equal(result.game.turnTeam,'B');assert.equal(result.control.humanTeam,'B');assert.equal(result.control.difficulty,'beginner');
      await c.close();report.checks.push('Revancha Clásico por equipo con humano B: conserva dificultad y equipo, comienza la CPU A y devuelve un único turno legal');
    }
    // Un error de almacenamiento no puede borrar el final que se intenta repetir.
    {
      const c=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'}),p=await c.newPage();collect(p);await p.goto(site.url);
      const final=resultFixture().after,classicFinal=encodeGameSave(final,beginDraft(final)),arenaFinal=arenaFixtures.saves.find(f=>f.game.over).raw;
      await c.addInitScript(()=>{const put=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(window.blockReplay)throw Error('Almacenamiento lleno');return put.call(this,k,v);};});
      await p.evaluate(({ck,ak,classicFinal,arenaFinal})=>{localStorage.setItem(ck,classicFinal);localStorage.setItem(ak,arenaFinal);},{ck,ak,classicFinal,arenaFinal});
      await enterClassic(p);await p.evaluate(()=>window.blockReplay=true);await p.click('#replay');assert.equal(await raw(p,ck),classicFinal);assert.match(await p.locator('#configurationStatus').innerText(),/No se reemplazó/);await require('./m4-navigation.cjs').escape(p);
      await p.waitForFunction(()=>document.documentElement.dataset.portalReady==='true');await p.locator('[data-mode=arena] [data-continue]').click();await p.locator('#arenaReplay').waitFor();await p.evaluate(()=>window.blockReplay=true);await p.click('#arenaReplay');assert.equal(await raw(p,ak),arenaFinal);assert.match(await p.locator('#problem').innerText(),/No se reemplazó/);
      await c.close();report.checks.push('Almacenamiento lleno: la repetición en ambas modalidades conserva íntegros el final y el guardado, con aviso visible');
    }
    {
      const c=await browser.newContext({viewport:{width:360,height:740},reducedMotion:'reduce'}),p=await c.newPage();collect(p);await p.goto(site.url);
      await p.evaluate(({ck,ak})=>{localStorage.setItem(ck,'guardado-daño-clasico');localStorage.setItem(ak,'guardado-daño-arena');},{ck,ak});await p.reload();
      await p.locator('[data-mode=classic] [data-continue]').click();await p.locator('#newDialog').waitFor();assert.ok(await p.locator('#replaceWarning').isVisible());await require('./m4-navigation.cjs').escape(p);assert.equal(await raw(p,ck),'guardado-daño-clasico');
      await p.waitForFunction(()=>document.documentElement.dataset.portalReady==='true');await p.locator('[data-mode=arena] [data-continue]').click();await p.locator('#problem').waitFor();assert.equal(await raw(p,ak),'guardado-daño-arena');
      await p.click('#newOpen');assert.ok(await p.locator('#replaceWarning').isVisible());await require('./m4-navigation.cjs').escape(p);assert.equal(await raw(p,ak),'guardado-daño-arena');await c.close();report.checks.push('Guardados dañados: no se borran al entrar; recuperación o reemplazo explícitos e independientes');
    }
    // Entrega offline enlazada: tres HTML autocontenidos, sin módulos externos.
    {
      const {pathToFileURL}=require('node:url');
      const c=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,reducedMotion:'reduce'}),p=await c.newPage();collect(p);
      const file=pathToFileURL(path.join(root,'offline/index.html')).href;
      await p.goto(file);await p.waitForFunction(()=>document.documentElement.dataset.portalReady==='true');
      await p.locator('[data-mode=classic] [data-continue]').click();await p.locator('#newDialog').waitFor();await p.click('#startLocal');await idle(p);
      await p.locator('[data-to="9"]').click();await idle(p);const saved=await raw(p,ck);await home(p,'#home');assert.equal(await raw(p,ck),saved);
      await p.locator('[data-mode=arena] [data-continue]').click();await p.locator('#newDialog').waitFor();await p.click('#startArena');await p.locator('[data-cell-bg]').first().waitFor();
      await p.locator('[data-kind=move]').first().click();const arenaSaved=await raw(p,ak);await home(p,'#arenaHome');
      assert.equal(await raw(p,ck),saved);assert.equal(await raw(p,ak),arenaSaved);await p.locator('[data-mode=classic] [data-continue]').click();await idle(p);assert.equal(await raw(p,ck),saved);
      await p.reload();await p.click('#continueGame');await idle(p);assert.equal(await raw(p,ck),saved);await c.close();
      report.checks.push('Offline file://: portada y dos HTML autónomos, Inicio/Continuar entre modalidades, pasos y recarga conservados sin recursos externos');
    }
    for(const name of await publicFiles()){
      const r=await fetch(site.url+name);assert.equal(r.status,200,name);assert.deepEqual(Buffer.from(await r.arrayBuffer()),await fs.readFile(path.join(root,'docs',name)));report.resources.push(name);
    }
    assert.equal((await fetch(site.url+'clasico')).url,site.url+'clasico/');assert.equal((await fetch(site.url+'arena')).url,site.url+'arena/');
    assert.deepEqual(report.errors,[]);report.ok=true;
  }finally{await fs.writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2));await browser.close();await site.close();}
  console.log(JSON.stringify({ok:report.ok,checks:report.checks.length,frames:report.frames,resources:report.resources.length,viewports:report.viewports},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
