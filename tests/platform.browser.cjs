/* Observación del DOM y del guardado real en Edge/Windows y Chromium/Ubuntu. */
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.CERCONEXO_PLAYWRIGHT_PATH||'playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'validation/platform');
const diagnostic=process.argv.includes('--diagnose');
const ck='wallgo-league-v2',ak='cerconexo-arena-m3a-v1';
const idle=p=>p.waitForFunction(()=>document.getElementById('board')?.getAttribute('aria-busy')==='false');
async function geometry(p){return p.evaluate(()=>{
  const box=n=>{const b=n.getBoundingClientRect();return [b.x,b.y,b.width,b.height];};
  const textBox=n=>{const range=document.createRange();range.selectNodeContents(n);return [...range.getClientRects()].map(r=>[r.x,r.y,r.width,r.height]);};
  return {viewport:[innerWidth,innerHeight],page:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],
    nodes:Object.fromEntries(['#board','.arena','.board-wrap','.score-panel','#turnBanner','.context-slot','#recentEvent','.recent-heading','.recent-detail','.team-heading','.team-roster','.player'].map(sel=>{
      const n=document.querySelector(sel);if(!n)return [sel,null];const s=getComputedStyle(n);
      return [sel,{box:box(n),scroll:[n.scrollWidth,n.scrollHeight],client:[n.clientWidth,n.clientHeight],font:s.font,lineHeight:s.lineHeight,
        display:s.display,overflow:s.overflow,visibility:s.visibility,gridRows:s.gridTemplateRows,padding:s.padding,text:n.textContent,textBoxes:textBox(n)}];
    }))};
});}
async function classicSnapshot(p){return p.evaluate(()=>({raw:localStorage.getItem('wallgo-league-v2'),active:{id:document.activeElement?.id,action:document.activeElement?.getAttribute('data-to')},
  dialog:document.getElementById('newDialog')?.open,appHidden:document.querySelector('.app')?.hidden,busy:document.getElementById('board')?.getAttribute('aria-busy'),
  target9:[...document.querySelectorAll('[data-to="9"]')].map(n=>{const b=n.getBoundingClientRect();return {rect:[b.x,b.y,b.width,b.height],display:getComputedStyle(n).display};}),
  turn:document.getElementById('turnName')?.textContent,animations:document.getAnimations().map(a=>({target:a.effect.target?.className?.baseVal??a.effect.target?.id,state:a.playState}))}));}
async function arenaSnapshot(p){return p.evaluate(()=>({raw:localStorage.getItem('cerconexo-arena-m3a-v1'),inventory:document.getElementById('inventoryTitle').textContent,
  problem:document.getElementById('problem').textContent,dialog:document.getElementById('newDialog').open,
  active:{id:document.activeElement?.id,kind:document.activeElement?.getAttribute('data-kind'),cell:document.activeElement?.getAttribute('data-cell')},
  events:window.keyboardAudit??[]}));}
(async()=>{
  await fs.mkdir(out,{recursive:true});
  const {startPagesServer}=await import('./pages-server.mjs'),engine=await import('../src/engine.mjs'),{decodeGameSave}=await import('../src/gameSave.mjs');
  const {resultFixture}=await import('./result-fixtures.mjs'),{directDuelFixture}=await import('./participation-fixtures.mjs');
  const {ArenaSession,replayArenaSave}=await import('../arena/src/session.mjs');
  const site=await startPagesServer({entry:''}),browser=await chromium.launch({headless:true,channel:process.env.CERCONEXO_BROWSER_CHANNEL||'msedge'});
  const report={platform:process.platform,browser:browser.version(),diagnostic,errors:[],geometry:[],restart:[],arena:[],monitor:[]};
  const create=async(width,height,reducedMotion='reduce')=>{
    const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:width<761,reducedMotion});
    await context.tracing.start({screenshots:true,snapshots:true,sources:true});const p=await context.newPage();p.on('pageerror',e=>report.errors.push({message:e.message,stack:e.stack}));return {context,p};
  };
  const seedClassic=async(p,game)=>{await p.goto(site.url);await p.evaluate(({ck,game})=>localStorage.setItem(ck,JSON.stringify({game})),{ck,game});await p.goto(site.url+'clasico/?continue=1');await idle(p);};
  try{
    if(diagnostic){
      // Reproducir el monitor original en la portada: el fallo pertenece al callback del ensayo.
      const c=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
      await c.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{
        const frame=()=>{document.getElementById('board').getBoundingClientRect();requestAnimationFrame(frame);};requestAnimationFrame(frame);
      }));
      const p=await c.newPage();p.on('pageerror',e=>report.monitor.push({message:e.message,stack:e.stack}));
      await seedClassic(p,engine.initialState());await p.click('#home');await p.waitForFunction(()=>document.documentElement.dataset.portalReady==='true');
      await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      await p.screenshot({path:path.join(out,'monitor-home.png')});await c.close();
    }
    for(const [width,height] of [[1440,900],[1366,768],[1366,600],[390,844],[360,740],[740,360],[1280,560]]){
      const {context,p}=await create(width,height),fixture=resultFixture();await seedClassic(p,fixture.before);
      const before=await geometry(p);await p.locator(`[data-wall="${fixture.to}"]`).click();await idle(p);const after=await geometry(p);
      await p.screenshot({path:path.join(out,`final-${width}x${height}.png`)});
      const direct=directDuelFixture();await seedClassic(p,direct.before);await p.locator(`[data-wall="${direct.to}"]`).click();await idle(p);
      const participation=await geometry(p);await p.screenshot({path:path.join(out,`participacion-${width}x${height}.png`)});
      report.geometry.push({width,height,before,after,participation});
      await context.tracing.stop({path:path.join(out,`layout-${width}x${height}.zip`)});await context.close();
    }
    // Secuencia exacta que falló al reiniciar después de terminar una partida.
    {
      const {context,p}=await create(390,844),fixture=resultFixture();await seedClassic(p,fixture.after);
      await p.locator('#new').click();await p.locator('#startLocal').click();await idle(p);
      report.restart.push({stage:'new-game',...await classicSnapshot(p)});
      await p.emulateMedia({reducedMotion:'no-preference'});
      const snapshot=await classicSnapshot(p),decoded=decodeGameSave(snapshot.raw);
      report.restart.push({stage:'motion-preference-changed',...snapshot,legal9:engine.availableMoves(decoded.game,decoded.draft.actor,decoded.draft.path.at(-1)).includes(9)});
      const target=p.locator('[data-to="9"]');
      if(await target.isVisible()){await target.click();await idle(p);report.restart.push({stage:'step9',...await classicSnapshot(p)});}
      await p.screenshot({path:path.join(out,'restart.png')});await context.tracing.stop({path:path.join(out,'restart.zip')});await context.close();
    }
    // Antes/después del poder: diario, estado oficial reconstruido y foco real.
    {
      const {context,p}=await create(390,844,'no-preference');
      await context.addInitScript(()=>{window.keyboardAudit=[];for(const type of ['focusin','keydown','close'])document.addEventListener(type,e=>keyboardAudit.push({type,key:e.key,id:e.target.id,kind:e.target.getAttribute?.('data-kind'),cell:e.target.getAttribute?.('data-cell')}),true);});
      await p.goto(site.url+'arena/');
      const experiment={initial:[{cell:11,type:'extraWall'},{cell:20,type:'jump'}],waves:[],symmetry:'vertical',placement:'center-first'};
      await p.locator('#experimentJson').evaluate((n,v)=>n.value=JSON.stringify(v),experiment);await p.click('#startArena');await p.waitForFunction(()=>!document.getElementById('newDialog').open);
      const before=await arenaSnapshot(p);report.arena.push({stage:'new-game',...before});
      const expected=ArenaSession.restore({setItem(){}},before.raw);assert.ok(expected.ok);expected.session.dispatch({type:'move',to:11});
      await p.locator('[data-kind="move"][data-cell="11"]').focus();report.arena.push({stage:'focus',...await arenaSnapshot(p)});
      await p.keyboard.press('Tab');report.arena.push({stage:'Tab',...await arenaSnapshot(p)});
      await p.keyboard.press('Shift+Tab');report.arena.push({stage:'Shift+Tab',...await arenaSnapshot(p)});
      await p.keyboard.press('Enter');
      const after=await arenaSnapshot(p);report.arena.push({stage:'Enter',...after,game:replayArenaSave(after.raw).game,expectedGame:expected.session.game});
      await p.screenshot({path:path.join(out,'inventory-original-sequence.png')});
      // Selección explícita y verificada: no confundir el estado de foco con el motor.
      if(await p.locator('#newDialog').evaluate(n=>n.open))await p.keyboard.press('Escape');
      if(!JSON.parse(after.raw).commands.length){
        await p.locator('[data-kind="move"][data-cell="11"]').focus();await p.waitForFunction(()=>document.activeElement?.getAttribute('data-cell')==='11');
        await p.keyboard.press('Enter');const verified=await arenaSnapshot(p);
        report.arena.push({stage:'verified-Enter',...verified,game:replayArenaSave(verified.raw).game,equalToEngine:verified.raw===expected.session.encode()});
      }
      await p.screenshot({path:path.join(out,'inventory-verified-focus.png')});await context.tracing.stop({path:path.join(out,'inventory.zip')});await context.close();
    }
  }finally{
    await fs.writeFile(path.join(out,'diagnosis.json'),JSON.stringify(report,null,2));await browser.close();await site.close();
  }
  console.log(JSON.stringify({platform:report.platform,browser:report.browser,geometryCases:report.geometry.length,restart:report.restart,arena:report.arena.map(s=>({stage:s.stage,active:s.active,dialog:s.dialog,inventory:s.inventory,commands:JSON.parse(s.raw).commands,equalToEngine:s.equalToEngine})),errors:report.errors},null,2));
  if(!diagnostic)assert.equal(report.errors.length,0);
})().catch(e=>{console.error(e);process.exitCode=1;});
