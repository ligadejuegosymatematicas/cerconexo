const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.CERCONEXO_PLAYWRIGHT_PATH||'playwright');
(async()=>{
 const {startPagesServer}=await import('./pages-server.mjs'),{initialState}=await import('../src/engine.mjs'),{resultFixture}=await import('./result-fixtures.mjs'),{ArenaSession}=await import('../arena/src/session.mjs');
 const out=path.resolve(__dirname,'../validation/m4/browser');await fs.mkdir(out,{recursive:true});
 const site=await startPagesServer({entry:''}),browser=await chromium.launch({headless:true,channel:process.env.CERCONEXO_BROWSER_CHANNEL||'msedge'}),report={checks:[],layouts:[],errors:[]};
 const ck='wallgo-league-v2',ak='cerconexo-arena-m3a-v1';
 const fixtures=JSON.parse(await fs.readFile(path.resolve(__dirname,'../arena/tests/m3a-saves.json'),'utf8'));
 const shot=(p,n)=>p.screenshot({path:path.join(out,n+'.png'),fullPage:true});
 const measure=(p,sel)=>p.evaluate(sel=>{const b=document.querySelector(sel).getBoundingClientRect();return {page:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],board:[b.x,b.y,b.width,b.height]};},sel);
 try{
 for(const [w,h] of [[1440,900],[1366,768],[1366,600],[390,844],[360,740],[740,360],[1280,560]]){
  const c=await browser.newContext({viewport:{width:w,height:h},hasTouch:true,isMobile:w<761,reducedMotion:'reduce'}),p=await c.newPage();p.on('pageerror',e=>report.errors.push(e.message));
  await p.goto(site.url);const raw=JSON.stringify({game:initialState()}),arenaRaw=fixtures.saves.find(x=>x.name==='duo-team').raw;
  await p.evaluate(({ck,ak,raw,arenaRaw})=>{localStorage.setItem(ck,raw);localStorage.setItem(ak,arenaRaw);},{ck,ak,raw,arenaRaw});
  await p.goto(site.url+'clasico/?continue=1');await p.waitForFunction(()=>document.getElementById('board').getAttribute('aria-busy')==='false');
  assert.deepEqual(await p.locator('.header-actions button').allInnerTexts(),['Inicio','Guía','Nueva partida']);
  const before=await measure(p,'#board');assert.equal(before.board[2],({1440:734,1366:h===600?440:602,1280:400,390:366,360:336,740:294})[w]);await shot(p,`clasico-${w}x${h}`);
  await p.click('#classicInspect');assert.equal(await p.locator('[data-inspect]').count(),49);
  await p.locator('[data-inspect="8"]').tap();assert.equal(await p.locator('.live-inspection .region-count text').textContent(),'49');
  assert.equal(await p.locator('[data-to],[data-wall],[data-actor]').count(),0);assert.equal(await p.evaluate(k=>localStorage.getItem(k),ck),raw);
  await p.locator('[data-inspect="8"]').focus();await p.keyboard.press('ArrowRight');await p.keyboard.press('Enter');
  assert.equal(await p.locator('.live-inspection .region-count').count(),0);
  assert.deepEqual(await measure(p,'#board'),before);await p.click('#classicInspect');
  await p.locator('[data-to="9"]').tap();await p.waitForFunction(()=>document.getElementById('board').getAttribute('aria-busy')==='false');
  assert.equal(await p.locator('#classicInspect').isEnabled(),true);const partial=await p.evaluate(k=>localStorage.getItem(k),ck);
  await p.click('#classicInspect');await p.locator('[data-inspect="9"]').tap();await p.click('#classicInspect');assert.equal(await p.evaluate(k=>localStorage.getItem(k),ck),partial);
  await p.evaluate(({ck,raw})=>localStorage.setItem(ck,raw),{ck,raw});await p.goto(site.url+'clasico/?continue=1');
  await p.click('#help');await p.locator('#helpDialog .full-rules summary').click();await shot(p,`guia-clasico-${w}x${h}`);await p.keyboard.press('Escape');
  await p.click('#new');await p.locator('#newDialog .dialog-close').click();await p.waitForFunction(()=>document.documentElement.dataset.portalReady==='true');
  assert.equal(await p.evaluate(k=>localStorage.getItem(k),ck),raw);
  await p.goto(site.url+'arena/');assert.deepEqual(await p.locator('.header nav a,.header nav button').allInnerTexts(),['Inicio','Guía','Nueva partida']);const ab=await measure(p,'#arenaBoard');assert.equal(ab.board[2],({1440:778,1366:h===600?478:646,1280:438,390:358,360:328,740:338})[w]);await shot(p,`arena-${w}x${h}`);
  assert.equal(await p.locator('#experimentDetails').isVisible(),false);
  await p.click('#guideOpen');assert.equal(await p.locator('#guideDialog .guide-steps li').count(),4);await shot(p,`guia-arena-${w}x${h}`);await p.keyboard.press('Escape');
  await p.click('#inspectToggle');await p.locator('[data-inspect="10"]').tap();assert.equal(await p.locator('.region-count text').textContent(),'81');assert.equal(await p.locator('[data-action]').count(),0);await shot(p,`inspeccion-${w}x${h}`);
  assert.deepEqual(await measure(p,'#arenaBoard'),ab);assert.equal(await p.evaluate(k=>localStorage.getItem(k),ak),arenaRaw);
  await p.click('#newOpen');await p.locator('#newDialog [data-close]').click();await p.waitForFunction(()=>document.documentElement.dataset.portalReady==='true');
  assert.equal(await p.evaluate(k=>localStorage.getItem(k),ak),arenaRaw);
  report.layouts.push({viewport:[w,h],classic:before,arena:ab});
  assert.deepEqual(before.page,[w,h]);assert.deepEqual(ab.page,[w,h]);await c.close();
 }
 // Cancelar las tres formas de cierre con estados inicial, pendiente y terminado.
 for(const mode of ['classic','arena'])for(const state of ['none','pending','finished'])for(const close of ['x','outside','escape']){
  const c=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'}),p=await c.newPage();p.on('pageerror',e=>report.errors.push(e.message));await p.goto(site.url);
  const key=mode==='classic'?ck:ak;
  const value=state==='none'?null:mode==='classic'?JSON.stringify({game:state==='pending'?initialState():resultFixture().after}):fixtures.saves.find(f=>!!f.game.over===(state==='finished')).raw;
  if(value)await p.evaluate(({key,value})=>localStorage.setItem(key,value),{key,value});
  await p.goto(site.url+(mode==='classic'?'clasico/':'arena/')+'?new=1');await p.locator('#newDialog').waitFor();
  if(close==='x')await p.locator('#newDialog .dialog-close,#newDialog [data-close]').click();
  if(close==='escape')await p.keyboard.press('Escape');
  if(close==='outside')await p.mouse.click(1,1);
  await p.waitForFunction(()=>document.documentElement.dataset.portalReady==='true');assert.equal(await p.evaluate(k=>localStorage.getItem(k),key),value);await c.close();report.checks.push(`${mode}/${state}/${close}`);
 }
 // Inventarios públicos completos, incluidos poderes retenidos y compartidos.
 for(const f of fixtures.saves)for(const [iw,ih] of [[360,740],[1366,600],[740,360]]){const c=await browser.newContext({viewport:{width:iw,height:ih}}),p=await c.newPage();await p.goto(site.url);await p.evaluate(({ak,raw})=>localStorage.setItem(ak,raw),{ak,raw:f.raw});await p.goto(site.url+'arena/');
  const total=Object.values(f.game.inventories).flat().length;await shot(p,`inventarios-${f.name}-${iw}x${ih}`);assert.equal(await p.locator('#scores .public-power').count(),total,f.name);assert.equal(await p.evaluate(k=>localStorage.getItem(k),ak),f.raw);assert.deepEqual((await measure(p,'#arenaBoard')).page,[iw,ih]);await c.close();}
 // El resultado conserva la exploración anterior y añade el tamaño dentro de la región.
 {
  const c=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,reducedMotion:'reduce'}),p=await c.newPage();await p.goto(site.url);
  const final=resultFixture().after;await p.evaluate(({ck,final})=>localStorage.setItem(ck,JSON.stringify({game:final})),{ck,final});await p.goto(site.url+'clasico/?continue=1');
  const {territory}=await import('../src/engine.mjs');for(const component of territory(final).components){await p.locator(`[data-explore-cell="${component.cells[0]}"]`).tap();await p.waitForFunction(()=>!!document.querySelector('.final-region-count text'));assert.equal(await p.locator('.final-region-count text').textContent(),String(component.cells.length));}
  const raw=await p.evaluate(k=>localStorage.getItem(k),ck);await shot(p,'clasico-final-inspeccion');await p.click('#classicInspect');assert.equal(await p.locator('[data-explore-cell]').count(),0);assert.equal(await p.evaluate(k=>localStorage.getItem(k),ck),raw);await c.close();
 }
 // Región de una casilla ocupada: número dentro de la componente, sin perder la ficha.
 {
  const c=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,reducedMotion:'reduce'}),p=await c.newPage();p.on('pageerror',e=>report.errors.push(e.message));await p.goto(site.url);
  const {participationFixture}=await import('./participation-fixtures.mjs'),g=participationFixture().after;
  await p.evaluate(({ck,g})=>localStorage.setItem(ck,JSON.stringify({game:g})),{ck,g});await p.goto(site.url+'clasico/?continue=1');await p.click('#classicInspect');await p.locator('[data-inspect="8"]').tap();
  assert.equal(await p.locator('.live-inspection .region-count text').textContent(),'1');assert.equal(await p.locator('.live-inspection .region-count').getAttribute('data-anchor'),'8');assert.equal(await p.locator('[data-piece=A1]').count(),1);await shot(p,'clasico-region-una-casilla');
  const {beginDraft,advanceDraft}=await import('../src/turnDraft.mjs'),{encodeGameSave}=await import('../src/gameSave.mjs');const first=initialState(),raw=encodeGameSave(first,advanceDraft(first,beginDraft(first),9));
  await p.evaluate(({ck,raw})=>localStorage.setItem(ck,raw),{ck,raw});await p.goto(site.url+'clasico/?continue=1');await p.click('#classicInspect');await p.locator('[data-inspect="9"]').tap();await p.click('#help');await p.keyboard.press('Escape');assert.equal(await p.locator('[data-inspect]').count(),49);await p.click('#classicInspect');assert.equal(await p.evaluate(k=>localStorage.getItem(k),ck),raw);assert.equal(await p.locator('[data-piece=A1]').getAttribute('transform'),'translate(260 180)');await c.close();
 }
 {
  const c=await browser.newContext({viewport:{width:390,height:844}}),p=await c.newPage();await p.goto(site.url+'arena/?diagnostico=1');assert.equal(await p.locator('#experimentDetails').isVisible(),true);const {DEFAULT_EXPERIMENT}=await import('../arena/src/config.mjs');assert.deepEqual(JSON.parse(await p.locator('#experimentJson').inputValue()),DEFAULT_EXPERIMENT.duo);assert.equal(await p.evaluate(k=>localStorage.getItem(k),ak),null);await c.close();
 }
 assert.deepEqual(report.errors,[]);report.ok=true;
 }finally{await fs.writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2));await browser.close();await site.close();}
 console.log(JSON.stringify({ok:report.ok,cancellations:report.checks.length,layouts:report.layouts.length,errors:report.errors},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
