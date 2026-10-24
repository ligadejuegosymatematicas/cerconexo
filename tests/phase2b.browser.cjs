const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CERCONEXO_PLAYWRIGHT_PATH||'playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'validation/phase2b');
const idle=page=>page.waitForFunction(()=>document.getElementById('board').getAttribute('aria-busy')==='false');
const settle=page=>page.evaluate(()=>Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{}))));
const saved=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('wallgo-league-v2'))?.game);
const positive=page=>page.evaluate(()=>window.vibrationCalls.filter(v=>v!==0));
async function choose(page,selector){
  const box=await page.locator(selector).first().boundingBox();
  await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);await idle(page);
}
async function enable(page,value){
  await page.locator('#options').click();await page.locator('#vibration').setChecked(value);
  await page.locator('#optionsDialog .dialog-close').click();
}
(async()=>{
  await fs.mkdir(out,{recursive:true});
  const {startPagesServer}=await import('./pages-server.mjs');
  const engine=await import(pathToFileURL(path.join(root,'src/engine.mjs')));
  const site=await startPagesServer(),browser=await require('./navigation.cjs').historicalBrowser(await chromium.launch({headless:true,channel:process.env.CERCONEXO_BROWSER_CHANNEL||'msedge'}));
  const errors=[],report={screens:[],checks:[]};
  async function create({mode='supported',width=390,height=844}={}){
    const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:width<761});
    await context.addInitScript(mode=>{
      window.vibrationCalls=[];
      Object.defineProperty(navigator,'vibrate',{configurable:true,value:mode==='absent'?undefined:pattern=>{
        window.vibrationCalls.push(pattern);if(mode==='throws')throw Error('Vibration denied');return mode!=='denied';
      }});
    },mode);
    const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
    page.on('requestfailed',request=>errors.push(request.url()));
    await page.goto(site.url);await idle(page);await settle(page);return {context,page};
  }
  try{
    for(const [width,height] of [[1440,900],[1366,768],[390,844],[360,740]]){
      const {page,context}=await create({width,height});
      const metrics=await page.evaluate(()=>{
        const css=selector=>getComputedStyle(document.querySelector(selector));
        const b=document.getElementById('board').getBoundingClientRect();
        const h=document.querySelector('.branding h1').getBoundingClientRect(),img=document.querySelector('.official-logo').getBoundingClientRect();
        return {viewport:[innerWidth,innerHeight],page:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],boardWidth:b.width,
          colors:{a:css('[data-piece="A1"] .token-body').fill,b:css('[data-piece="B1"] .token-body').fill,move:css('.move-target').fill,wall:css('.wall-glow').stroke,neutral:css('[data-cell="0"]').fill,bg:css(':root').backgroundColor,logo:css('.branding h1').backgroundColor},
          logoInside:h.x<=img.x&&h.right>=img.right&&h.y<=img.y&&h.bottom>=img.bottom};
      });
      assert.deepEqual(metrics.page,[width,height]);assert.ok(metrics.logoInside);
      assert.equal(metrics.colors.bg,'rgb(7, 26, 47)');
      assert.deepEqual([metrics.colors.a,metrics.colors.b,metrics.colors.move,metrics.colors.wall,metrics.colors.neutral,metrics.colors.logo],['rgb(245, 158, 11)','rgb(56, 189, 248)','rgb(45, 212, 191)','rgb(255, 209, 102)','rgb(251, 247, 239)','rgb(246, 238, 219)']);
      assert.ok(await page.locator('.official-logo').evaluate(img=>img.complete&&img.naturalWidth===1075));
      assert.deepEqual(await positive(page),[]);
      await page.screenshot({path:path.join(out,`${width}x${height}.png`)});report.screens.push(metrics);
      await context.close();
    }
    report.checks.push('Paleta computada exacta, logo transparente legible, cuatro resoluciones sin scroll y ningún pulso al cargar');
    const {page,context}=await create();
    await choose(page,'[data-wall]');assert.deepEqual(await positive(page),[12]);
    await page.reload();await idle(page);await settle(page);
    await enable(page,true);assert.deepEqual(await positive(page),[]);
    await choose(page,'[data-wall]');assert.deepEqual(await positive(page),[12]);
    await page.reload();await idle(page);await settle(page);assert.deepEqual(await positive(page),[]);
    await page.locator('#options').click();assert.equal(await page.locator('#vibration').isChecked(),true);
    await page.screenshot({path:path.join(out,'opcion-vibracion.png')});await page.locator('#optionsDialog .dialog-close').click();
    await choose(page,'[data-wall]');assert.deepEqual(await positive(page),[12]);
    assert.equal((await saved(page)).moves,3);
    await page.locator('#new').click();await page.locator('#startLocal').click();await idle(page);await settle(page);
    assert.deepEqual(await positive(page),[12,8]);assert.equal((await saved(page)).moves,0);
    // Estado de aislamiento real: una señal sustituye al muro y al cambio de turno.
    const isolated=engine.initialState();isolated.walls=[1,7,9].map(to=>engine.wallKey(8,to));isolated.moves=3;
    assert.ok(engine.verifyState(isolated));
    await page.evaluate(game=>localStorage.setItem('wallgo-league-v2',JSON.stringify({game})),isolated);
    await page.reload();await idle(page);await settle(page);
    await choose(page,'[data-wall="15"]');await settle(page);
    assert.deepEqual(await positive(page),[[12,35,12]]);assert.equal(await page.locator('.token-isolated').count(),1);
    assert.equal(await page.locator('[data-cell="8"]').evaluate(el=>getComputedStyle(el).fill),'rgb(252, 231, 178)');
    assert.equal(await page.locator('[data-edge="8-15"]').evaluate(el=>getComputedStyle(el).stroke),'rgb(71, 85, 105)');
    await page.screenshot({path:path.join(out,'territorio-y-muro.png')});
    const both=engine.initialState();
    both.walls=[...engine.adjacent(8).map(to=>engine.wallKey(8,to)),...engine.adjacent(12).map(to=>engine.wallKey(12,to)),engine.wallKey(0,1),engine.wallKey(0,7)];
    both.moves=both.walls.length;both.currentActor=engine.chooseActor(both,'A');assert.ok(engine.verifyState(both));
    await page.evaluate(game=>localStorage.setItem('wallgo-league-v2',JSON.stringify({game})),both);await page.reload();await idle(page);await settle(page);
    assert.equal(await page.locator('[data-cell="12"]').evaluate(el=>getComputedStyle(el).fill),'rgb(217, 241, 255)');
    assert.equal(await page.locator('.unit-A').count(),1);assert.equal(await page.locator('.unit-B').count(),1);assert.equal(await page.locator('.unit-empty').count(),1);assert.equal(await page.locator('.unit-mixed').count(),46);
    await page.screenshot({path:path.join(out,'territorios-ambos-equipos.png')});
    await page.emulateMedia({reducedMotion:'reduce'});const before=(await positive(page)).length;
    await choose(page,'[data-wall]');assert.equal((await positive(page)).length,before);
    await page.locator('#options').click();assert.match(await page.locator('#vibrationStatus').innerText(),/En pausa/);assert.equal(await page.locator('#vibration').isChecked(),true);await page.locator('#optionsDialog .dialog-close').click();
    await page.emulateMedia({reducedMotion:'no-preference'});await enable(page,false);
    const disabled=(await positive(page)).length;await choose(page,'[data-wall]');assert.equal((await positive(page)).length,disabled);
    await context.close();
    report.checks.push('Valor inicial activo, persistencia independiente, muro único, aislamiento sin pulsos duplicados, desactivación y pausa por movimiento reducido');
    for(const mode of ['absent','denied','throws']){
      const {context,page}=await create({mode});await page.locator('#options').click();
      if(mode==='absent'){
        assert.equal(await page.locator('#vibration').isDisabled(),true);assert.match(await page.locator('#vibrationStatus').innerText(),/no ofrece/);
      }else await page.locator('#vibration').check();
      await page.locator('#optionsDialog .dialog-close').click();
      await choose(page,'[data-to="9"]');await choose(page,'[data-wall]');assert.equal((await saved(page)).moves,1);
      await context.close();
    }
    report.checks.push('Navegador sin API, vibración rechazada y excepción: movimiento, muro y guardado siguen funcionando');
    // Paquete autónomo: misma marca y opción persistente, sin archivos auxiliares.
    const standalone=await create(),single=standalone.page;
    await single.goto(pathToFileURL(path.join(root,'Cerconexo_Premium_Listo_Para_Jugar.html')).href);await idle(single);await settle(single);
    assert.ok(await single.locator('.official-logo').evaluate(img=>img.src.startsWith('data:image/png;base64,')&&img.complete));
    await enable(single,true);await choose(single,'[data-wall]');assert.deepEqual(await positive(single),[12]);
    const state=await saved(single);await single.reload();await idle(single);assert.deepEqual(await saved(single),state);
    await single.locator('#options').click();assert.equal(await single.locator('#vibration').isChecked(),true);
    await standalone.context.close();report.checks.push('HTML autónomo: logo incrustado, vibración opcional, preferencia y partida conservadas al recargar');
    assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  }finally{await browser.close();await site.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
