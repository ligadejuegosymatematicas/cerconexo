const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.CERCONEXO_PLAYWRIGHT_PATH||'playwright');
(async()=>{
 const {startPagesServer}=await import('./pages-server.mjs'),{initialState}=await import('../src/engine.mjs'),{resultFixture}=await import('./result-fixtures.mjs'),{ArenaSession}=await import('../arena/src/session.mjs');
 const site=await startPagesServer({entry:''}),browser=await chromium.launch({channel:process.env.CERCONEXO_BROWSER_CHANNEL||'msedge',headless:true});
 const out=path.resolve('validation/m41/browser');await fs.mkdir(out,{recursive:true});const report={layouts:[],checks:[],errors:[],environment:{platform:process.platform,browser:browser.version()}};
 const ck='wallgo-league-v2',ak='cerconexo-arena-m3a-v1',arenaOld=JSON.parse(await fs.readFile(path.resolve('arena/tests/m3a-saves.json'),'utf8'));
 const save=async(p,classic=initialState(),arena=arenaOld.saves.find(f=>f.name==='duo-team').raw)=>{await p.goto(site.url);await p.evaluate(({ck,ak,classic,arena})=>{if(classic)localStorage.setItem(ck,JSON.stringify({game:classic}));else localStorage.removeItem(ck);if(arena)localStorage.setItem(ak,arena);else localStorage.removeItem(ak);},{ck,ak,classic,arena});};
 const stored=p=>p.evaluate(({ck,ak})=>[localStorage.getItem(ck),localStorage.getItem(ak)],{ck,ak});
 const ready=p=>p.waitForFunction(()=>document.documentElement.dataset.entry==='game');
 const bounds=(p,selector)=>p.locator(selector).evaluate(n=>{const b=n.getBoundingClientRect();return [b.x,b.y,b.width,b.height];});
 const observe=async p=>p.evaluate(()=>{window.m41frames=[];window.m41stop=false;const frame=()=>{const board=document.querySelector('#board,#arenaBoard'),r=board.getBoundingClientRect();m41frames.push({page:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],board:[r.x,r.y,r.width,r.height]});if(!m41stop)requestAnimationFrame(frame);};requestAnimationFrame(frame);});
 const closed=async(p,id)=>{await p.waitForFunction(id=>!document.getElementById(id.replace(/^#/,''))?.open,id);await p.evaluate(()=>new Promise(requestAnimationFrame));};
 const assertFrames=async(p,w,h,baseline)=>{const frames=await p.evaluate(()=>{m41stop=true;return m41frames;});for(const f of frames){assert.deepEqual(f.page,[w,h],`Scroll ${w}x${h}`);assert.deepEqual(f.board,baseline,`Tablero ${w}x${h}`);}return frames.length;};
 try{
 for(const [w,h] of [[1440,900],[1366,768],[1366,600],[1280,560],[390,844],[360,740],[740,360]]){
  const c=await browser.newContext({viewport:{width:w,height:h},hasTouch:true,isMobile:w<761,reducedMotion:'reduce'}),p=await c.newPage();p.on('pageerror',e=>report.errors.push(e.message));let resolveExit;await p.exposeFunction('m41ExitSnapshot',data=>resolveExit?.(data));await save(p);const original=await stored(p);
  for(const mode of ['clasico','arena']){
   // Bloqueo verificable del módulo: inspecciona la escena de parseo, antes de inicializar la aplicación.
   let release,requested;const gate=new Promise(r=>release=r),request=new Promise(r=>requested=r);const route=mode==='clasico'?'**/src/app.mjs':'**/arena/src/app.mjs';
   await p.route(route,async r=>{requested();await gate;await r.continue();});
   const navigation=p.goto(site.url+mode+'/?new=1');await request;await p.locator('#homeScreen').waitFor();assert.equal(await p.locator('.app,.arena-app').isVisible(),false);assert.equal(await p.locator('.mode-grid [data-mode]').count(),2);assert.equal(await p.locator('.mode-name,.home-menu').count(),0);
   await p.screenshot({path:path.join(out,`${mode}-primer-fotograma-${w}x${h}.png`)});release();await navigation;await p.unroute(route);await p.locator('#newDialog').waitFor();assert.equal(await p.locator('.app,.arena-app').isVisible(),false);assert.deepEqual(await stored(p),original);
   if(mode==='clasico'){await p.click('[data-control=cpu]');for(const difficulty of ['beginner','intermediate','advanced'])for(const team of ['A','B']){await p.check(`[name=difficulty][value=${difficulty}]`);await p.check(`[name=humanTeam][value=${team}]`);}await p.check('[name=humanTeam][value=A]');}
   for(const kind of ['x','escape','outside']){
    const help=p.locator('#newDialog [data-context-help]').first();await help.click();assert.ok(await p.locator('#contextHelp').isVisible());assert.ok(await p.locator('#newDialog').isVisible());
    if(kind==='x')await p.click('#contextHelp button');if(kind==='escape')await p.keyboard.press('Escape');if(kind==='outside')await p.mouse.click(1,1);
    await closed(p,'contextHelp');assert.ok(await help.evaluate(n=>n===document.activeElement));assert.ok(await p.locator('#newDialog').isVisible());assert.deepEqual(await stored(p),original);
   }
   assert.deepEqual(await p.evaluate(()=>[document.documentElement.scrollWidth,document.documentElement.scrollHeight]),[w,h]);await p.screenshot({path:path.join(out,`${mode}-selector-${w}x${h}.png`)});
   await p.keyboard.press('Escape');await p.waitForFunction(()=>document.documentElement.dataset.portalReady==='true');assert.deepEqual(await stored(p),original);
   await p.goto(site.url+mode+'/?continue=1');await ready(p);const selector=mode==='clasico'?'#board':'#arenaBoard',baseline=await bounds(p,selector);await observe(p);
   for(let cycle=0;cycle<3;cycle++){
    await p.click(mode==='clasico'?'#classicInspect':'#inspectToggle');assert.equal(await p.locator('[data-inspect]').count(),mode==='clasico'?49:81);await p.locator('[data-inspect="8"]').tap();assert.equal(await p.locator('.region-count text').textContent(),mode==='clasico'?'49':'81');await p.click(mode==='clasico'?'#classicInspect':'#inspectToggle');assert.equal(await p.locator('[data-inspect]').count(),0);
   }
   const guide=mode==='clasico'?'#helpDialog':'#guideDialog';await p.click(mode==='clasico'?'#help':'#guideOpen');assert.equal(await p.locator(guide+' .guide-steps li:visible').count(),4);await p.screenshot({path:path.join(out,`${mode}-guia-${w}x${h}.png`)});
   await p.click(guide+' [data-guide-tab=board]');assert.ok(await p.locator(guide+' [data-guide-pane=board]').isVisible());assert.ok(await p.locator(guide+' [data-guide-pane=board]').evaluate(n=>n.scrollWidth<=n.clientWidth+1),'Leyenda sin desbordamiento horizontal');if(mode==='arena'){await p.click(guide+' [data-guide-tab=powers]');assert.equal(await p.locator(guide+' .power-icon').count(),3);assert.ok(await p.locator(guide+' [data-guide-pane=powers]').evaluate(n=>n.scrollWidth<=n.clientWidth+1));}
   await p.click(guide+' [data-full-rules]');const rules=mode==='clasico'?'#completeRules':'#rulesDialog';await p.locator(rules).waitFor();await p.click(rules+' [data-manual-topic=turn]');assert.ok((await p.locator(rules).innerText()).includes('regresar al origen'));await p.keyboard.press('Escape');await p.locator(guide).waitFor();await p.keyboard.press('Escape');await closed(p,guide);
   assert.deepEqual(await stored(p),original);const frames=await assertFrames(p,w,h,baseline);await p.screenshot({path:path.join(out,`${mode}-juego-${w}x${h}.png`)});report.layouts.push({mode,viewport:[w,h],board:baseline,frames});
   await p.click(mode==='clasico'?'#new':'#newOpen');assert.ok(await p.locator('#replaceWarning').isVisible());
   // Red detenida: cerrar tampoco debe exponer el tablero mientras llega Inicio.
   let releaseHome;const homeGate=new Promise(r=>releaseHome=r),homeRequest=p.waitForRequest(site.url),exitSnapshot=new Promise(r=>resolveExit=r);
   // Capturar en el evento, antes de que Chromium cambie el contexto de ejecución.
   // Consultar un locator durante una navegación detenida esperaría al documento nuevo.
   await p.evaluate(()=>document.getElementById('newDialog').addEventListener('close',()=>window.m41ExitSnapshot({appHidden:document.querySelector('.app,.arena-app').hidden,homeHidden:document.getElementById('homeScreen').hidden,entry:document.documentElement.dataset.entry}),{once:true}));
   await p.route(site.url,async r=>{await homeGate;await r.continue();});const cancel=p.keyboard.press('Escape');await homeRequest;
   let timeout;const snapshot=await Promise.race([exitSnapshot,new Promise((_,reject)=>timeout=setTimeout(()=>reject(Error('No se capturó el cierre del selector')),30000))]);clearTimeout(timeout);
   assert.deepEqual(snapshot,{appHidden:true,homeHidden:false,entry:'portal'});
   releaseHome();await cancel;await p.waitForFunction(()=>document.documentElement.dataset.portalReady==='true');await p.unroute(site.url);assert.deepEqual(await stored(p),original);
  }
  // Alternancia final repetida, táctil y por teclado, conservando el resultado completo.
  await save(p,resultFixture().after);await p.goto(site.url+'clasico/?continue=1');await ready(p);const before=await stored(p);const scores=await p.locator('#scoreA,#scoreB,#winnerTitle').allTextContents();
  for(let cycle=0;cycle<4;cycle++){
   await p.locator('[data-explore-cell="0"]').waitFor();assert.equal(await p.locator('[data-explore-cell]').count(),49);await p.locator('[data-explore-cell="0"]').tap();assert.ok(await p.locator('.final-region-count text').isVisible());await p.click('#classicInspect');assert.equal(await p.locator('[data-explore-cell]').count(),0);await p.click('#classicInspect');
  }
  await p.locator('[data-explore-cell="1"]').focus();await p.keyboard.press('ArrowRight');await p.keyboard.press('Enter');assert.ok(await p.locator('.final-region-count text').isVisible());assert.deepEqual(await stored(p),before);assert.deepEqual(await p.locator('#scoreA,#scoreB,#winnerTitle').allTextContents(),scores);await p.screenshot({path:path.join(out,`clasico-final-reinspeccion-${w}x${h}.png`)});
  await p.reload();await ready(p);assert.deepEqual(await stored(p),before);await c.close();
 }
 // Cancelación de selector en los tres estados, por las tres vías, sin escrituras.
 for(const mode of ['clasico','arena']){
  const c=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,reducedMotion:'reduce'}),p=await c.newPage();await save(p,null,null);await p.goto(site.url+mode+'/?new=1');await p.locator('#newDialog').waitFor();await p.click(mode==='clasico'?'#startLocal':'#startArena');await ready(p);assert.equal(new URL(p.url()).search,'');const before=await stored(p);
  let release,requested;const gate=new Promise(r=>release=r),request=new Promise(r=>requested=r);const route=mode==='clasico'?'**/src/app.mjs':'**/arena/src/app.mjs';await p.route(route,async r=>{requested();await gate;await r.continue();});const reload=p.reload();await request;await p.waitForFunction(()=>!!document.getElementById('homeScreen'));
  assert.equal(await p.locator('#homeScreen').isVisible(),false,'La recarga del tablero no presenta una portada intermedia');assert.equal(await p.locator('.app,.arena-app').isVisible(),false,'El tablero sin inicializar sigue oculto');release();await reload;await ready(p);assert.deepEqual(await stored(p),before);await c.close();
 }
 for(const mode of ['clasico','arena'])for(const state of ['none','pending','finished'])for(const method of ['x','escape','outside']){
  const c=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,reducedMotion:'reduce'}),p=await c.newPage();await save(p,state==='none'?null:state==='finished'?resultFixture().after:initialState(),state==='none'?null:arenaOld.saves.find(f=>!!f.game.over===(state==='finished')).raw);const before=await stored(p);await p.goto(site.url+mode+'/?new=1');await p.locator('#newDialog').waitFor();
  assert.equal(await p.locator('.app,.arena-app').isVisible(),false);if(method==='x')await p.locator('#newDialog .dialog-close,#newDialog [data-close]').click();if(method==='escape')await p.keyboard.press('Escape');if(method==='outside')await p.mouse.click(1,1);await p.waitForFunction(()=>document.documentElement.dataset.portalReady==='true');assert.deepEqual(await stored(p),before);
  await p.goBack();await p.locator('#newDialog').waitFor();assert.deepEqual(await stored(p),before);await p.goForward();await p.waitForFunction(()=>document.documentElement.dataset.portalReady==='true');assert.deepEqual(await stored(p),before);await c.close();report.checks.push(`${mode}/${state}/${method}`);
 }
 assert.deepEqual(report.errors,[]);report.ok=true;
 }finally{await fs.writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2));await browser.close();await site.close();}
 console.log(JSON.stringify({ok:report.ok,layouts:report.layouts.length,cancellations:report.checks.length,errors:report.errors},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
