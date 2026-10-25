const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.CERCONEXO_PLAYWRIGHT_PATH||'playwright');
(async()=>{
 const {startPagesServer}=await import('./pages-server.mjs'),{initialState}=await import('../src/engine.mjs'),{resultFixture}=await import('./result-fixtures.mjs');
 const old=JSON.parse(await fs.readFile(path.resolve('arena/tests/m3a-saves.json'),'utf8'));
 const ck='wallgo-league-v2',ak='cerconexo-arena-m3a-v1',site=await startPagesServer({entry:''}),browser=await chromium.launch({channel:process.env.CERCONEXO_BROWSER_CHANNEL||'msedge'});
 const out=path.resolve('validation/m42/browser');await fs.mkdir(out,{recursive:true});const report={environment:{platform:process.platform,browser:browser.version()},layouts:[],checks:[],errors:[]};
 const ready=p=>p.waitForFunction(()=>document.documentElement.dataset.portalReady==='true');
 const raw=p=>p.evaluate(({ck,ak})=>[localStorage.getItem(ck),localStorage.getItem(ak)],{ck,ak});
 const seed=(p,c,a)=>p.evaluate(({ck,ak,c,a})=>{for(const [k,v] of [[ck,c],[ak,a]])if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,v);},{ck,ak,c,a});
 const shot=(p,n)=>p.screenshot({path:path.join(out,n+'.png')});
 const pageSize=p=>p.evaluate(()=>[document.documentElement.scrollWidth,document.documentElement.scrollHeight]);
 const bounds=(p,sel)=>p.locator(sel).evaluate(n=>{const r=n.getBoundingClientRect();return [r.x,r.y,r.width,r.height];});
 const close=async(p,dialog)=>{await p.keyboard.press('Escape');await p.waitForFunction(id=>!document.getElementById(id).open,dialog);await p.evaluate(()=>new Promise(requestAnimationFrame));};
 try{
 for(const [w,h] of [[1440,900],[1366,768],[1366,600],[1280,560],[390,844],[360,740],[740,360]]){
  const context=await browser.newContext({viewport:{width:w,height:h},hasTouch:true,isMobile:w<761,reducedMotion:'reduce'}),p=await context.newPage();p.on('pageerror',e=>report.errors.push(e.message));
  await p.goto(site.url);await ready(p);assert.equal(await p.locator('[data-new]:visible').count(),2);assert.equal(await p.locator('[data-continue]:visible').count(),0);assert.equal(await p.locator('.mode-description').count(),0);assert.deepEqual(await pageSize(p),[w,h]);await shot(p,`portada-sin-partidas-${w}x${h}`);
  const arena=old.saves.find(s=>s.name==='duo-team').raw,classic=JSON.stringify({game:initialState({turnMode:'team'})});await seed(p,classic,arena);await p.reload();await ready(p);const original=await raw(p);
  for(const mode of ['classic','arena']){
   const card=p.locator(`[data-mode=${mode}]`);assert.match(await card.locator('[data-continue]').innerText(),/Continuar/);
   const first=await bounds(p,`[data-mode=${mode}] [data-new]`),second=await bounds(p,`[data-mode=${mode}] [data-continue]`);assert.ok(first[1]<second[1]);
  }
  await shot(p,`portada-pendientes-${w}x${h}`);
  for(const mode of ['clasico','arena']){
   await p.goto(site.url+mode+'/?new=1');await p.locator('#newDialog').waitFor();assert.equal(await p.locator('.app,.arena-app').isVisible(),false);assert.deepEqual(await raw(p),original);
   await shot(p,`${mode}-selector-local-${w}x${h}`);
   if(mode==='clasico'){
    await p.click('[data-control=cpu]');
    for(const difficulty of ['beginner','intermediate','advanced'])for(const team of ['A','B']){await p.check(`[name=difficulty][value=${difficulty}]`);await p.check(`[name=humanTeam][value=${team}]`);assert.match(await p.locator('#humanTeamDescription').textContent(),team==='A'?/comienzas/:/y comienza/);}
    await p.check('[name=difficulty][value=intermediate]');await p.check('[name=humanTeam][value=A]');await shot(p,`${mode}-selector-cpu-${w}x${h}`);
   }else{
    assert.equal(await p.locator('[data-control=cpu],[data-control=online]').count(),0);
    await p.check('[name=mode][value=ffa]');assert.equal(await p.locator('#policyField').isVisible(),false);await p.check('[name=mode][value=duo]');assert.ok(await p.locator('#policyField').isVisible());
   }
   const helpers=await p.locator('#newDialog [data-context-help]').all();
   for(const helper of helpers){
    if(!await helper.isVisible())continue;
    const r=await helper.boundingBox();assert.ok(r.width>=44&&r.height>=44);
    for(const method of ['x','escape','outside']){
     await helper.click();await p.locator('#contextHelp').waitFor();assert.ok(await p.locator('#contextHelp li').count()>=2);assert.equal(await p.locator('#contextHelp p').count(),0);
     if(method==='x')await p.click('#contextHelp .dialog-close');else if(method==='escape')await p.keyboard.press('Escape');else await p.mouse.click(1,1);
     await p.waitForFunction(()=>!document.getElementById('contextHelp').open);await p.waitForFunction(()=>document.activeElement?.matches('[data-context-help]'));assert.ok(await helper.evaluate(n=>n===document.activeElement));
    }
   }
   await p.locator('#newDialog [data-context-help]').first().click();await shot(p,`${mode}-ayuda-${w}x${h}`);await close(p,'contextHelp');
   assert.deepEqual(await raw(p),original);assert.deepEqual(await pageSize(p),[w,h]);
   const start=p.locator(mode==='clasico'?'#startLocal':'#startArena'),button=await start.boundingBox();assert.ok(button.y+button.height<=h&&button.height>=44);
   await p.keyboard.press('Escape');await ready(p);assert.deepEqual(await raw(p),original);
   await p.goto(site.url+mode+'/?continue=1');await p.waitForFunction(()=>document.documentElement.dataset.entry==='game');
   const board=mode==='clasico'?'#board':'#arenaBoard',baseline=await bounds(p,board);await shot(p,`${mode}-juego-${w}x${h}`);
   await p.evaluate(()=>{window.m42frames=[];window.m42sampling=true;const sample=()=>{const b=document.querySelector('#board,#arenaBoard').getBoundingClientRect();m42frames.push({page:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],board:[b.x,b.y,b.width,b.height]});if(m42sampling)requestAnimationFrame(sample);};requestAnimationFrame(sample);});
   await p.click(mode==='clasico'?'#help':'#guideOpen');const guide=mode==='clasico'?'#helpDialog':'#guideDialog';
   assert.deepEqual(await p.locator(guide+' .guide-steps h3').allTextContents(),['MUÉVETE','CONSTRUYE','ASEGURA TERRITORIO','GANA']);await shot(p,`${mode}-guia-${w}x${h}`);
   if(mode==='arena'){await p.click(guide+' [data-guide-tab=powers]');assert.equal(await p.locator(guide+' .power-icon').count(),3);await shot(p,`arena-poderes-${w}x${h}`);}
   await p.click(guide+' [data-full-rules]');const rules=mode==='clasico'?'#completeRules':'#rulesDialog';await p.locator(rules).waitFor();
   for(const topic of await p.locator(rules+' [data-manual-topic]').all()){
    await topic.click();const id=await topic.getAttribute('data-manual-topic');assert.ok(await p.locator(rules+` [data-manual-page=${id}]`).isVisible());
    assert.equal(await p.locator(rules+' [data-manual-page]:visible').count(),1);
    const content=p.locator(rules+' .manual-pages');assert.ok(await content.evaluate(n=>n.scrollWidth<=n.clientWidth));
    for(const item of await p.locator(rules+' [data-manual-page]:visible li').all()){await item.scrollIntoViewIfNeeded();assert.ok(await item.evaluate(n=>{const r=n.getBoundingClientRect(),p=n.closest('.manual-pages').getBoundingClientRect();return r.left>=p.left&&r.right<=p.right;}));}
    await content.evaluate(n=>n.scrollTop=0);await shot(p,`${mode}-manual-${id}-${w}x${h}`);
   }
   await close(p,rules.slice(1));await p.locator(guide).waitFor();assert.ok(await p.locator(guide+' [data-full-rules]').evaluate(n=>n===document.activeElement));await close(p,guide.slice(1));
   const frames=await p.evaluate(()=>{m42sampling=false;return m42frames;});for(const frame of frames){assert.deepEqual(frame.page,[w,h]);assert.deepEqual(frame.board,baseline);}
   assert.deepEqual(await raw(p),original);report.layouts.push({mode,viewport:[w,h],board:baseline,frames:frames.length});
  }
  await seed(p,JSON.stringify({game:resultFixture().after}),old.saves.find(s=>s.game.over).raw);await p.goto(site.url);await ready(p);for(const mode of ['classic','arena'])assert.equal(await p.locator(`[data-mode=${mode}] [data-continue]`).textContent(),'Ver resultado');await shot(p,`portada-resultados-${w}x${h}`);assert.deepEqual(await pageSize(p),[w,h]);await context.close();
 }
 assert.deepEqual(report.errors,[]);report.checks.push('Portada sin guardados/pendientes/finales, jerarquía y ambos accesos','Selectores Local/CPU/3 dificultades/A-B y Arena duo/ffa','Ayudas itemizadas: X/Escape/exterior, foco y 44 px','Manuales completos: todos los temas y textos accesibles mediante scroll interno','Conservación literal de guardados y tableros en cada fotograma de consulta');
 await fs.writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2));console.log('PASS M4.2: 14 distribuciones, siete resoluciones; portada, selectores, ayudas y manuales; sin cambios de guardado, tablero ni scroll principal.');
 }catch(e){await fs.writeFile(path.join(out,'failure.json'),JSON.stringify({error:e.stack,...report},null,2));throw e;}finally{await browser.close();await site.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
