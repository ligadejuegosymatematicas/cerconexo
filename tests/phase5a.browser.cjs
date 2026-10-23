const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CERCONEXO_PLAYWRIGHT_PATH||'playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'validation/phase5a');
const idle=p=>p.waitForFunction(()=>document.getElementById('board').getAttribute('aria-busy')==='false');
const saved=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('wallgo-league-v2'))?.game);
async function load(page,game){await page.evaluate(game=>{localStorage.removeItem('wallgo-league-v2');if(game)localStorage.setItem('wallgo-league-v2',JSON.stringify({game}));},game);await page.reload();await idle(page);await page.evaluate(()=>Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{}))));}
async function choose(page,to){const b=await page.locator(`[data-wall="${to}"]`).boundingBox();assert.ok(b);await page.touchscreen.tap(b.x+b.width/2,b.y+b.height/2);await idle(page);}
async function metrics(page){return page.evaluate(()=>{
  const box=n=>{const r=n.getBoundingClientRect();return [r.x,r.y,r.width,r.height];};
  const visible=n=>n.getClientRects().length&&getComputedStyle(n).visibility!=='hidden';
  return {viewport:[innerWidth,innerHeight],page:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],scale:visualViewport.scale,
    board:box(document.getElementById('board')),banner:box(document.getElementById('turnBanner')),
    clipped:[...document.querySelectorAll('.header-actions,.team-heading,.team-roster,.matchup-state,.context-slot,#recentEvent')].filter(n=>visible(n)&&(n.scrollWidth>n.clientWidth+1||n.scrollHeight>n.clientHeight+1)).map(n=>n.id||n.className),
    controls:[...document.querySelectorAll('.header-actions button,#guide')].filter(visible).map(n=>({id:n.id,box:box(n)})),
    logo:{loaded:document.querySelector('.official-logo').complete,width:document.querySelector('.official-logo').naturalWidth,box:box(document.querySelector('.official-logo'))}};
});}
async function instrument(context){await context.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{
  window.usability={frames:[],announcements:[],territory:0,attention:[]};
  const announcement=document.getElementById('participationAnnouncement');
  new MutationObserver(()=>{if(announcement.textContent){window.usability.announcements.push(announcement.textContent);const n=document.getElementById('recentEvent');window.usability.attention.push({busy:document.getElementById('board').getAttribute('aria-busy'),durations:[...n.getAnimations(),...n.querySelector('.recent-heading').getAnimations()].map(a=>a.effect.getTiming().duration)});}}).observe(announcement,{childList:true,subtree:true,characterData:true});
  new MutationObserver(()=>{if(!document.getElementById('territoryNotice').hidden)window.usability.territory++;}).observe(document.getElementById('territoryNotice'),{attributes:true,attributeFilter:['hidden']});
  const frame=()=>{
    const r=document.getElementById('board').getBoundingClientRect();
    if(r.width)window.usability.frames.push({page:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],board:[r.x,r.y,r.width,r.height]});
    if(window.usability.frames.length<6000)requestAnimationFrame(frame);
  };requestAnimationFrame(frame);
}));}
(async()=>{
  await fs.mkdir(out,{recursive:true});const {startPagesServer}=await import('./pages-server.mjs');
  const engine=await import('../src/engine.mjs'),fixtures=await import('./participation-fixtures.mjs'),{resultFixture}=await import('./result-fixtures.mjs');
  const site=await startPagesServer(),browser=await require('./navigation.cjs').historicalBrowser(await chromium.launch({headless:true,channel:'msedge'})),report={checks:[],screens:[]},errors=[];
  async function create(width=390,height=844,{preference,api=true,motion='no-preference'}={}){
    const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:width<761,deviceScaleFactor:1,reducedMotion:motion});
    await context.addInitScript(({preference,api})=>{
      window.hapticCalls=[];Object.defineProperty(navigator,'vibrate',{configurable:true,value:api?p=>{window.hapticCalls.push(p);return true;}:undefined});
      if(preference!==undefined&&!localStorage.getItem('cerconexo-preferences-v1'))localStorage.setItem('cerconexo-preferences-v1',JSON.stringify({vibration:preference}));
    },{preference,api});
    await instrument(context);const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>errors.push(r.url()));await page.goto(site.url);await idle(page);await page.evaluate(()=>Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{}))));return {page,context};
  }
  async function checkDialog(page,opener,id){
    const baseline=await metrics(page);await page.locator(opener).click();const dialog=page.locator(id);
    assert.ok(await dialog.isVisible());assert.equal(await page.evaluate(()=>document.activeElement?.className),'dialog-close');
    await dialog.locator('h2').first().click();assert.ok(await dialog.isVisible());
    const state=await saved(page);await page.evaluate(()=>document.querySelector('[data-wall]')?.dispatchEvent(new MouseEvent('click',{bubbles:true})));assert.deepEqual(await saved(page),state);
    // El foco vuelve del primero al último y queda dentro del modal.
    await dialog.locator('.dialog-close').focus();await page.keyboard.press('Shift+Tab');assert.ok(await page.evaluate(id=>document.querySelector(id).contains(document.activeElement),id));
    await page.keyboard.press('Tab');assert.ok(await dialog.locator('.dialog-close').evaluate(n=>document.activeElement===n));
    assert.deepEqual((await metrics(page)).board,baseline.board);assert.deepEqual((await metrics(page)).page,baseline.page);
    await page.keyboard.press('Escape');await page.waitForFunction(id=>!document.querySelector(id).open,id);
    assert.ok(await page.locator(opener).evaluate(n=>document.activeElement===n));
    await page.locator(opener).click();await dialog.locator('.dialog-close').click();assert.ok(await dialog.isHidden());
    await page.locator(opener).click();await page.touchscreen.tap(2,2);assert.ok(await dialog.isHidden());
    assert.ok(await page.locator(opener).evaluate(n=>document.activeElement===n));assert.deepEqual((await metrics(page)).board,baseline.board);
  }
  try{
    for(const [width,height] of [[1440,900],[1366,768],[390,844],[360,740],[740,360],[1440,700],[1366,650],[1366,600],[1280,560]]){
      const {page,context}=await create(width,height);
      const baseline=await metrics(page);assert.deepEqual(baseline.page,[width,height],`Scroll inicial ${width}x${height}`);assert.deepEqual(baseline.clipped,[]);assert.equal(baseline.scale,1);
      let checkedFrames=0;
      const checkFrames=async label=>{
        const frames=await page.evaluate(()=>{const frames=window.usability.frames;window.usability.frames=[];return frames;});
        checkedFrames+=frames.length;
        for(const f of frames){assert.deepEqual(f.page,[width,height],`Scroll transitorio ${label} ${width}x${height}`);assert.deepEqual(f.board,baseline.board,`Salto del tablero ${label} ${width}x${height}`);}
      };
      assert.ok(baseline.logo.loaded&&baseline.logo.width===1075);
      for(const c of baseline.controls){assert.ok(c.box[2]>=44&&c.box[3]>=44,c.id);assert.ok(c.box[0]>=0&&c.box[0]+c.box[2]<=width&&c.box[1]+c.box[3]<=height,c.id);}
      if(width===360||width===390)assert.equal(baseline.board[2],width-24,'Conservar tablero móvil');
      assert.equal(await page.locator('.brand-copy,.bottom-note').count(),0);assert.equal(await page.locator('#matchupLabel').innerText(),'2 vs. 2');
      await page.screenshot({path:path.join(out,`inicial-${width}x${height}.png`)});
      await checkDialog(page,'#help','#helpDialog');
      await page.locator('#help').click();assert.equal(await page.locator('.quick-rules li').count(),4);assert.equal(await page.locator('#helpDialog #vibration,#helpDialog .legend-panel').count(),0);
      await page.screenshot({path:path.join(out,`reglas-${width}x${height}.png`)});
      assert.equal(await page.locator('.full-rules').count(),0,'Reglas completas retiradas según el ajuste aprobado');
      const closeBox=await page.locator('#helpDialog .dialog-close').boundingBox(),titleBox=await page.locator('#rulesTitle').boundingBox();
      assert.ok(closeBox.y>=0&&closeBox.y+closeBox.height<=height);assert.ok(titleBox.y>=0&&titleBox.y+titleBox.height<=height);
      assert.deepEqual((await metrics(page)).page,[width,height]);await page.screenshot({path:path.join(out,`reglas-breves-${width}x${height}.png`)});await page.keyboard.press('Escape');
      await checkDialog(page,'#options','#optionsDialog');
      await page.locator('#options').click();assert.ok(await page.locator('#vibration').isChecked());await page.screenshot({path:path.join(out,`opciones-${width}x${height}.png`)});await page.keyboard.press('Escape');
      if(await page.locator('#guide').isVisible()){
        await checkDialog(page,'#guide','#guideDialog');await page.locator('#guide').click();
        assert.equal(await page.locator('#guideDialog .legend-content>div:visible').count(),6);await page.screenshot({path:path.join(out,`guia-${width}x${height}.png`)});await page.keyboard.press('Escape');
      }else assert.ok(await page.locator('.turn-panel .legend-panel').isVisible());
      await checkFrames('diálogos');
      const fixture=fixtures.participationFixture();await load(page,fixture.before);await choose(page,fixture.to);
      assert.deepEqual(await saved(page),fixture.after);assert.equal(await page.locator('#matchupLabel').innerText(),'1 vs. 2');assert.equal(await page.locator('#matchupPlayers').innerText(),'A2 vs. B1 y B2');
      const recent=await page.locator('#recentEvent').innerText();assert.match(recent,/A1 ASEGURÓ SU TERRITORIO/);assert.match(recent,/A2 jugará todos los turnos del equipo A/);
      await page.waitForTimeout(1600);assert.equal(await page.locator('#recentEvent').innerText(),recent);assert.ok(await page.locator('#recentEvent').isVisible());
      assert.equal(await page.evaluate(()=>window.usability.announcements.length),1);
      const actor=fixture.after.currentActor,to=engine.wallOptions(fixture.after,engine.pieceById(fixture.after,actor).pos)[0];
      await choose(page,to);assert.equal((await saved(page)).currentActor,'A2');assert.equal(await page.locator('#recentEvent').innerText(),recent);assert.equal(await page.evaluate(()=>window.usability.announcements.length),1);
      await page.evaluate(()=>Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{}))));await page.screenshot({path:path.join(out,`uno-vs-dos-${width}x${height}.png`)});
      await checkFrames('conquista y continuación 1 vs. 2');
      const direct=fixtures.directDuelFixture();await load(page,direct.before);await choose(page,direct.to);
      assert.equal(await page.locator('#matchupLabel').innerText(),'1 vs. 1 · Última disputa');assert.equal(await page.locator('#matchupPlayers').innerText(),'A2 vs. B2');assert.equal(await page.locator('.token-isolated').count(),2);
      assert.match(await page.locator('#recentEvent').innerText(),/A1 Y B1 ASEGURARON TERRITORIO/);
      const measured=await metrics(page);assert.deepEqual(measured.page,[width,height]);assert.deepEqual(measured.clipped,[]);assert.deepEqual(measured.board,baseline.board);
      await page.screenshot({path:path.join(out,`uno-vs-uno-${width}x${height}.png`)});
      await checkFrames('1 vs. 1');
      await page.reload();await idle(page);assert.equal(await page.locator('#matchupPlayers').innerText(),'A2 vs. B2');assert.ok(await page.locator('#recentEvent').isHidden());assert.equal(await page.evaluate(()=>window.usability.announcements.length),0);
      const final=resultFixture();await load(page,final.before);await choose(page,final.to);await page.waitForTimeout(500);
      assert.ok(await page.locator('#endScreen').isVisible());assert.equal(await page.locator('#matchup').getAttribute('aria-hidden'),'true');assert.ok(await page.locator('#recentEvent').isHidden());
      assert.deepEqual((await metrics(page)).page,[width,height]);assert.deepEqual((await metrics(page)).board,baseline.board);
      await page.screenshot({path:path.join(out,`resultado-${width}x${height}.png`)});
      await checkFrames('resultado');
      await page.locator('#new').focus();await page.keyboard.press('Enter');await page.locator('#startLocal').click();await idle(page);assert.deepEqual(await saved(page),engine.initialState());assert.equal(await page.locator('#matchupLabel').innerText(),'2 vs. 2');assert.ok(await page.locator('#recentEvent').isHidden());
      await checkFrames('reinicio');
      report.screens.push({viewport:[width,height],board:baseline.board,scale:baseline.scale,framesChecked:checkedFrames});await context.close();
    }
    report.checks.push('Nueve resoluciones a escala 1, incluidas alturas útiles 700/650/600/560: diálogos sin reorganizar tablero, controles 44px, guía independiente, mensajes persistentes, recarga, final y reinicio; transiciones muestreadas por frame');
    const {finishFixture}=await import('./territory-fixtures.mjs');
    for(const [width,height] of [[360,740],[740,360]])for(const team of ['A','B'])for(const number of [1,2]){
      const {page,context}=await create(width,height),{before}=fixtures.participationFixture({team});
      if(number===2){const one=before.pieces.find(p=>p.id===team+'1'),two=before.pieces.find(p=>p.id===team+'2');[one.pos,two.pos]=[two.pos,one.pos];before.lastActed[team]=team+'1';finishFixture(before);}
      const actor=team+number,pos=engine.pieceById(before,actor).pos,to=team==='A'?15:19,after=engine.applyTurn(before,{actor,path:[pos],to});
      await load(page,before);await choose(page,to);assert.deepEqual(await saved(page),after);
      assert.equal(await page.locator('.recent-heading').textContent(),`✓ ${actor} ASEGURÓ SU TERRITORIO`);
      assert.equal(await page.locator('.recent-detail').textContent(),`${team}${number===1?2:1} jugará todos los turnos del equipo ${team}.`);
      const probe=await page.evaluate(()=>window.usability.attention);assert.equal(probe.length,1);assert.equal(probe[0].busy,'false');assert.deepEqual(probe[0].durations,[280,280]);
      await page.waitForTimeout(350);assert.ok(await page.locator('#recentEvent').isVisible());assert.deepEqual((await metrics(page)).clipped,[]);
      await page.screenshot({path:path.join(out,`aviso-${actor}-${width}x${height}.png`)});
      await page.reload();await idle(page);assert.ok(await page.locator('#recentEvent').isHidden());assert.equal(await page.evaluate(()=>window.usability.attention.length),0);
      await load(page,before);
      await page.evaluate(()=>{const n=document.getElementById('recentEvent'),observer=new MutationObserver(()=>{if(n.hidden)return;observer.disconnect();window.resetDuringAttention=n.getAnimations().length;document.getElementById('new').click();document.getElementById('startLocal').click();});observer.observe(n,{attributes:true,childList:true,subtree:true});});
      await choose(page,to);await page.waitForTimeout(350);assert.equal(await page.evaluate(()=>window.resetDuringAttention),1);assert.deepEqual(await saved(page),engine.initialState());assert.ok(await page.locator('#recentEvent').isHidden());await context.close();
    }
    report.checks.push('Avisos de A1/A2/B1/B2: encabezado y redistribución separados; atención 280 ms sin bloquear ni duplicar; mensaje persistente, reinicio y ausencia de recortes en vertical/horizontal');
    for(const preference of [undefined,false,true]){
      const {page,context}=await create(390,844,{preference});await page.locator('#options').click();assert.equal(await page.locator('#vibration').isChecked(),preference??true);
      await page.locator('#vibration').setChecked(false);await page.keyboard.press('Escape');await page.reload();await idle(page);await page.locator('#options').click();assert.equal(await page.locator('#vibration').isChecked(),false);await page.keyboard.press('Escape');
      await choose(page,9);const game=await saved(page);await page.reload();await idle(page);assert.deepEqual(await saved(page),game);await context.close();
    }
    const absent=await create(360,740,{api:false});await absent.page.locator('#options').click();assert.ok(await absent.page.locator('#vibration').isDisabled());assert.match(await absent.page.locator('#vibrationStatus').innerText(),/no ofrece/);await absent.page.keyboard.press('Escape');await choose(absent.page,9);await absent.context.close();
    const reduced=await create(360,740,{motion:'reduce'}),b=fixtures.participationFixture({team:'B'});await load(reduced.page,b.before);await choose(reduced.page,b.to);assert.equal(await reduced.page.locator('#matchupLabel').innerText(),'2 vs. 1');assert.equal(await reduced.page.evaluate(()=>document.getAnimations().length),0);assert.ok(await reduced.page.locator('#recentEvent').isVisible());
    await load(reduced.page,engine.initialState());await reduced.page.locator('[data-to="9"]').focus();await reduced.page.keyboard.press('Enter');await idle(reduced.page);
    await reduced.page.locator('#help').click();await reduced.page.keyboard.press('Escape');assert.equal(await reduced.page.locator('#stepsPill').textContent(),'1 paso');
    // Escape cierra diálogos, pero ya no puede borrar un paso ejecutado.
    await reduced.page.keyboard.press('Escape');await idle(reduced.page);assert.equal(await reduced.page.locator('#stepsPill').textContent(),'1 paso');await reduced.context.close();
    report.checks.push('Nuevo valor por defecto, preferencias false/true intactas, persistencia, navegador sin API y movimiento reducido simétrico');
    for(const [w,h] of [[1280,280],[320,480]]){
      const tiny=await create(w,h),t=await metrics(tiny.page);assert.ok(t.page[1]>h);assert.equal(t.page[0],w);assert.ok(t.board[2]>=240);assert.equal(await tiny.page.locator('.app').evaluate(n=>getComputedStyle(n).overflowY),'visible');await tiny.context.close();
    }
    report.checks.push('Ventanas excepcionales 1280×280 y 320×480: desplazamiento accesible y tablero de al menos 240px, sin ocultación artificial ni scroll horizontal');
    // Fotogramas reales de la conquista, redistribución persistente y continuación.
    const demo=await create(390,844),fixture=fixtures.participationFixture(),dir=path.join(out,'frames');await fs.mkdir(dir,{recursive:true});await load(demo.page,fixture.before);
    await demo.page.screenshot({path:path.join(dir,'000.png')});const action=choose(demo.page,fixture.to);let i=1,start=performance.now();while(performance.now()-start<2200){await demo.page.screenshot({path:path.join(dir,`${String(i++).padStart(3,'0')}.png`)});await demo.page.waitForTimeout(90);}await action;
    const next=fixture.after.currentActor,to=engine.wallOptions(fixture.after,engine.pieceById(fixture.after,next).pos)[0];await choose(demo.page,to);await demo.page.screenshot({path:path.join(dir,`${String(i).padStart(3,'0')}.png`)});await demo.context.close();
    const offline=await browser.newContext({viewport:{width:360,height:740},hasTouch:true,reducedMotion:'reduce'}),p=await offline.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(pathToFileURL(path.join(root,'Cerconexo_Premium_Listo_Para_Jugar.html')).href);await idle(p);await p.locator('#help').click();assert.equal(await p.locator('.quick-rules li').count(),4);await p.keyboard.press('Escape');await load(p,fixture.before);await choose(p,fixture.to);assert.equal(await p.locator('#matchupLabel').innerText(),'1 vs. 2');await offline.close();
    report.checks.push('HTML autónomo sin recursos externos: reglas, modalidad, conquista y estado permanente');
    assert.deepEqual(errors,[]);report.errors=errors;await fs.writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  }finally{await browser.close();await site.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
