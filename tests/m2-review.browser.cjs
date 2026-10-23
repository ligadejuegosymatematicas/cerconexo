const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.CERCONEXO_PLAYWRIGHT_PATH||'playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'validation/m2-review/browser');
(async()=>{
 const {startPagesServer}=await import('./pages-server.mjs'),engine=await import('../src/engine.mjs'),{beginDraft,advanceDraft}=await import('../src/turnDraft.mjs'),{encodeGameSave}=await import('../src/gameSave.mjs');
 const site=await startPagesServer(),browser=await chromium.launch({headless:true,channel:'msedge'}),report={viewports:[],haptics:[],errors:[],checks:[]};await fs.mkdir(out,{recursive:true});
 const idle=p=>p.waitForFunction(()=>document.getElementById('board').getAttribute('aria-busy')==='false'),raw=p=>p.evaluate(()=>localStorage.getItem('wallgo-league-v2'));
 async function page(width=390,height=844,options={}){const context=await browser.newContext({viewport:{width,height},hasTouch:true,reducedMotion:options.reduce?'reduce':'no-preference'});await context.addInitScript(options=>{
  window.selectorAudit={pulses:[],frames:[]};
  Object.defineProperty(navigator,'vibrate',{configurable:true,value:options.api==='absent'?undefined:pattern=>{selectorAudit.pulses.push(pattern);if(options.api==='throw')throw Error('API rechazada');return true;}});
  if(options.disabled)localStorage.setItem('cerconexo-preferences-v1',JSON.stringify({vibration:false}));
  document.addEventListener('DOMContentLoaded',()=>{const frame=()=>{const b=document.getElementById('board').getBoundingClientRect();selectorAudit.frames.push({page:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],board:b.width?[b.x,b.y,b.width,b.height]:null});if(selectorAudit.frames.length<4000)requestAnimationFrame(frame);};requestAnimationFrame(frame);});
 },options);const p=await context.newPage();p.on('pageerror',e=>report.errors.push(e.message));await p.goto(site.url);return {p,context};}
 async function capture(p,name){await p.waitForTimeout(180);await p.screenshot({path:path.join(out,name+'.png')});}
 try{
  for(const [width,height,size] of [[1440,900,734],[1366,768,602],[1366,600,440],[390,844,366],[360,740,336],[740,360,240],[1440,700,540],[1366,650,490],[1280,560,400]]){
   const {p,context}=await page(width,height);await p.locator('#play').click();assert.equal(await p.locator('.control-icon').count(),2);await capture(p,`local-${width}x${height}`);
   await p.locator('[data-control=cpu]').click();assert.equal(await p.locator('[name=difficulty]:checked').inputValue(),'intermediate');await capture(p,`cpu-${width}x${height}`);
   await p.locator('.selector-content').evaluate(n=>n.scrollTop=n.scrollHeight);await capture(p,`cpu-opciones-${width}x${height}`);
   const metrics=await p.evaluate(()=>{const d=document.getElementById('newDialog').getBoundingClientRect(),r=document.querySelector('.selector-content').getBoundingClientRect(),b=document.getElementById('startLocal').getBoundingClientRect();return {page:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],dialog:[d.x,d.y,d.width,d.height],contentBottom:r.bottom,buttonTop:b.y,buttonBottom:b.bottom};});assert.deepEqual(metrics.page,[width,height]);assert.ok(metrics.contentBottom<=metrics.buttonTop);assert.ok(metrics.buttonBottom<=height);
   for(const selector of ['.control-options button','.mode-choice','.compact-options label','#startLocal','.dialog-close'])for(const box of await p.locator('#newDialog '+selector).evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length).map(n=>{const b=n.getBoundingClientRect();return [b.width,b.height];})))assert.ok(box[0]>=44&&box[1]>=44,selector);
   await p.keyboard.press('Tab');await p.locator('[name=difficulty][value=advanced]').focus();assert.equal(await p.locator('[name=difficulty][value=advanced]').evaluate(n=>getComputedStyle(n.closest('label')).outlineStyle),'solid');await p.keyboard.press('ArrowLeft');assert.equal(await p.locator('[name=difficulty]:checked').inputValue(),'intermediate');await p.keyboard.press('Escape');await p.waitForFunction(()=>!document.getElementById('newDialog').open&&document.getElementById('play')===document.activeElement);
   await p.locator('#play').click();assert.equal(await p.locator('.selector-content').evaluate(n=>n.scrollTop),0);await p.locator('#startLocal').click();await idle(p);assert.equal((await p.locator('#board').boundingBox()).width,size);await p.locator('[data-to="9"]').click();await idle(p);const saved=await raw(p),box=await p.locator('#board').boundingBox();
   await p.locator('#new').click();assert.ok(await p.locator('#replaceWarning').isVisible());await p.locator('[data-control=cpu]').click();await p.locator('[name=difficulty][value=advanced]').check();await p.locator('[name=humanTeam][value=B]').check();assert.equal(await raw(p),saved);await p.locator('#newDialog .dialog-close').click();await idle(p);assert.equal(await raw(p),saved);assert.equal(await p.locator('[data-to="8"]').count(),1);
   const frames=await p.evaluate(()=>selectorAudit.frames);for(const f of frames){assert.deepEqual(f.page,[width,height]);if(f.board)assert.deepEqual(f.board,[box.x,box.y,box.width,box.height]);}report.viewports.push({width,height,board:size,frames:frames.length,...metrics});await context.close();
  }
  report.checks.push('Nueve resoluciones: selector Local/CPU, desplazamiento interno accesible sin solapar CTA, objetivos >=44px, teclado/foco y cancelación sin escrituras; tablero y página estables cada frame');
  for(const options of [{api:'supported'},{disabled:true},{api:'absent'},{api:'throw'},{reduce:true}]){
   const {p,context}=await page(360,740,options);await p.locator('#play').click();await p.evaluate(()=>selectorAudit.pulses=[]);
   for(const selector of ['[data-control=cpu]','[name=difficulty][value=beginner]','[name=humanTeam][value=B]']){await p.locator(selector).click();await p.waitForTimeout(180);}
   const expected=options.disabled||options.reduce||options.api==='absent'?[]:[8,8,8];assert.deepEqual(await p.evaluate(()=>selectorAudit.pulses.filter(p=>p!==0)),expected);
   if(options.reduce)assert.equal(await p.locator('#startLocal').evaluate(n=>getComputedStyle(n).transitionDuration),'0s');
   await p.locator('#startLocal').click();await p.waitForFunction(()=>{const s=JSON.parse(localStorage.getItem('wallgo-league-v2'));return s.game.moves===1&&document.getElementById('board').getAttribute('aria-busy')==='false';});const saved=JSON.parse(await raw(p));assert.equal(saved.control.difficulty,'beginner');assert.equal(saved.control.humanTeam,'B');assert.equal(saved.game.turnTeam,'B');
   await p.locator('#new').click();assert.equal(await p.locator('[data-control=cpu]').getAttribute('aria-pressed'),'true');assert.equal(await p.locator('[name=humanTeam]:checked').inputValue(),'B');await p.keyboard.press('Escape');await p.locator('#home').click();await p.locator('#continueGame').click();await idle(p);assert.deepEqual(JSON.parse(await raw(p)),saved);report.haptics.push({options,selectorPulses:expected,configurationPreserved:true});await context.close();
  }
  report.checks.push('Feedback reutilizado de 8ms, preferencia desactivada, API ausente/rechazada y movimiento reducido; configuración CPU conservada en reinicio cancelado e Inicio/Continuar');
  {
   const {p,context}=await page(390,844),game=engine.initialState(),draft=advanceDraft(game,beginDraft(game),9),control={version:1,type:'cpu',humanTeam:'B',difficulty:'beginner',seed:71};
   await p.evaluate(raw=>localStorage.setItem('wallgo-league-v2',raw),encodeGameSave(game,draft,{control}));await context.addInitScript(()=>{window.Worker=class{postMessage(m){queueMicrotask(()=>this.onmessage({data:{id:m.id,result:{turn:{actor:'A1',path:[8,15],to:22}}}}));}terminate(){}};});await p.reload();await p.locator('#continueGame').click();await p.waitForFunction(()=>JSON.parse(localStorage.getItem('wallgo-league-v2')).game.moves===1&&document.getElementById('board').getAttribute('aria-busy')==='false');const saved=JSON.parse(await raw(p));assert.deepEqual(saved.game.lastMove.path.slice(0,2),[8,9]);assert.equal(saved.pendingTurn,undefined);assert.equal(saved.cpuPlan,undefined);await capture(p,'recuperacion-prefijo-worker-incompatible');await context.close();
  }
  report.checks.push('Worker devuelve jugada legal con prefijo incorrecto: respaldo respeta el paso irreversible, sin doble muro ni turno');
  assert.deepEqual(report.errors,[]);await fs.writeFile(path.join(root,'validation/m2-review/browser-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{await browser.close();await site.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
