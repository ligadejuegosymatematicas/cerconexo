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
        display:s.display,overflow:s.overflow,overflowY:s.overflowY,tabIndex:n.tabIndex,visibility:s.visibility,gridRows:s.gridTemplateRows,padding:s.padding,text:n.textContent,textBoxes:textBox(n)}];
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
  const report={platform:process.platform,browser:browser.version(),diagnostic,complete:false,errors:[],geometry:[],restart:[],arena:[]};
  const create=async(width,height,reducedMotion='reduce')=>{
    const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:width<761,reducedMotion});
    await context.tracing.start({screenshots:true,snapshots:true,sources:true});const p=await context.newPage();p.on('pageerror',e=>report.errors.push({message:e.message,stack:e.stack}));return {context,p};
  };
  const seedClassic=async(p,game)=>{await p.goto(site.url);await p.evaluate(({ck,game})=>localStorage.setItem(ck,JSON.stringify({game})),{ck,game});await p.goto(site.url+'clasico/?continue=1');await idle(p);};
  try{
    for(const [width,height] of [[1440,900],[1366,768],[1366,600],[390,844],[360,740],[740,360],[1280,560]]){
      const {context,p}=await create(width,height),fixture=resultFixture();await seedClassic(p,fixture.before);
      const before=await geometry(p);await p.locator(`[data-wall="${fixture.to}"]`).click();await idle(p);const after=await geometry(p);
      await p.screenshot({path:path.join(out,`final-${width}x${height}.png`)});
      const direct=directDuelFixture();await seedClassic(p,direct.before);await p.locator(`[data-wall="${direct.to}"]`).click();await idle(p);
      const participation=await geometry(p);await p.screenshot({path:path.join(out,`participacion-${width}x${height}.png`)});
      const notice=participation.nodes['#recentEvent'],scrollableNotice=notice.scroll[1]>notice.client[1]+1&&notice.overflowY==='auto'&&notice.tabIndex===0;
      if(scrollableNotice){
        const boardBefore=participation.nodes['#board'].box,rawBefore=await p.evaluate(()=>localStorage.getItem('wallgo-league-v2'));
        await p.locator('#recentEvent').focus();await p.keyboard.press('End');
        await p.waitForFunction(()=>{const n=document.getElementById('recentEvent');return n.scrollTop+n.clientHeight>=n.scrollHeight-1;});
        assert.deepEqual((await geometry(p)).nodes['#board'].box,boardBefore);assert.equal(await p.evaluate(()=>localStorage.getItem('wallgo-league-v2')),rawBefore);
        await p.screenshot({path:path.join(out,`aviso-completo-${width}x${height}.png`)});
      }
      await seedClassic(p,engine.initialState({turnMode:'team'}));const teamInitial=await geometry(p);
      await p.screenshot({path:path.join(out,`equipo-${width}x${height}.png`)});
      report.geometry.push({width,height,before,after,participation,teamInitial});
      if(!diagnostic){
        assert.deepEqual(after.nodes['#board'].box,before.nodes['#board'].box,`Tablero estable ${width}×${height}`);
        assert.deepEqual(after.page,[width,height]);assert.deepEqual(participation.page,[width,height]);
        assert.deepEqual(teamInitial.page,[width,height],`Guía completa por equipo ${width}×${height}`);
        assert.deepEqual(teamInitial.nodes['#board'].box,before.nodes['#board'].box);
        for(const key of ['.context-slot',...(scrollableNotice?[]:['#recentEvent'])]){
          const n=participation.nodes[key];assert.ok(n.scroll[0]<=n.client[0]+1&&n.scroll[1]<=n.client[1]+1,`Texto completo ${key} ${width}×${height}`);
        }
        const slot=participation.nodes['.context-slot'].box;
        for(const key of ['.recent-heading','.recent-detail']){
          const n=participation.nodes[key];assert.ok(n.text.trim());
          if(!scrollableNotice)assert.ok(n.box[1]+n.box[3]<=slot[1]+slot[3]+1,`Aviso dentro de su reserva ${key} ${width}×${height}`);
        }
      }
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
      if(!diagnostic){assert.ok(report.restart.at(-1).legal9);await target.waitFor({state:'visible'});}
      if(await target.isVisible()){
        await target.click();await idle(p);const after=await classicSnapshot(p);report.restart.push({stage:'step9',...after});
        if(!diagnostic){const data=JSON.parse(after.raw);assert.deepEqual(data.pendingTurn.path,[8,9]);assert.equal(data.game.moves,0);}
      }
      await p.screenshot({path:path.join(out,'restart.png')});await context.tracing.stop({path:path.join(out,'restart.zip')});await context.close();
    }
    // Antes/después del poder: diario, estado oficial reconstruido y foco real.
    {
      const {context,p}=await create(390,844,'no-preference');
      await context.addInitScript(()=>{window.keyboardAudit=[];for(const type of ['focusin','keydown','close'])document.addEventListener(type,e=>keyboardAudit.push({type,key:e.key,id:e.target.id,kind:e.target.getAttribute?.('data-kind'),cell:e.target.getAttribute?.('data-cell')}),true);});
      await p.goto(site.url+'arena/');
      const experiment={initial:[{cell:11,type:'extraWall'},{cell:20,type:'jump'}],waves:[],symmetry:'vertical',placement:'center-first'};
      await p.locator('#experimentJson').evaluate((n,v)=>n.value=JSON.stringify(v),experiment);
      await p.locator('#newDialog').evaluate(d=>{d.closeObserved=false;d.addEventListener('close',()=>d.closeObserved=true,{once:true});});
      await p.click('#startArena');await p.waitForFunction(()=>{const d=document.getElementById('newDialog');return !d.open&&d.closeObserved;});
      const before=await arenaSnapshot(p);report.arena.push({stage:'new-game',...before});
      const expected=ArenaSession.restore({setItem(){}},before.raw);assert.ok(expected.ok);expected.session.dispatch({type:'move',to:11});
      await p.locator('[data-kind="move"][data-cell="11"]').focus();report.arena.push({stage:'focus',...await arenaSnapshot(p)});
      await p.keyboard.press('Tab');report.arena.push({stage:'Tab',...await arenaSnapshot(p)});
      await p.keyboard.press('Shift+Tab');report.arena.push({stage:'Shift+Tab',...await arenaSnapshot(p)});
      if(!diagnostic)assert.ok(await p.locator('[data-kind="move"][data-cell="11"]').evaluate(n=>n===document.activeElement&&n.matches(':focus-visible')));
      await p.keyboard.press('Enter');
      const after=await arenaSnapshot(p);report.arena.push({stage:'Enter',...after,game:replayArenaSave(after.raw).game,expectedGame:expected.session.game});
      if(!diagnostic){
        assert.deepEqual(replayArenaSave(after.raw).game,expected.session.game);assert.match(after.inventory,/1\/1/);
        assert.equal(expected.session.game.pieces.find(p=>p.id==='A1').pos,11);assert.equal(expected.session.game.drops.some(p=>p.cell===11),false);
        await p.reload();assert.equal((await arenaSnapshot(p)).raw,after.raw);assert.match(await p.locator('#inventoryTitle').innerText(),/1\/1/);
        // La misma recogida con ratón y tacto debe producir el mismo diario que Enter.
        for(const method of ['click','tap']){
          await p.evaluate(({ak,raw})=>localStorage.setItem(ak,raw),{ak,raw:before.raw});await p.reload();
          await p.locator('[data-kind="move"][data-cell="11"]')[method]();
          const selected=await arenaSnapshot(p);assert.deepEqual(replayArenaSave(selected.raw).game,expected.session.game);
          assert.equal(JSON.parse(selected.raw).commands.length,1);assert.match(selected.inventory,/1\/1/);
        }
        await p.click('#arenaHome');await p.waitForFunction(()=>document.documentElement.dataset.portalReady==='true');
        await p.locator('[data-mode=arena] [data-continue]').click();assert.equal((await arenaSnapshot(p)).raw,after.raw);
      }
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
    report.complete=true;
  }finally{
    report.ok=!diagnostic&&report.complete&&report.errors.length===0;
    await fs.writeFile(path.join(out,diagnostic?'diagnosis-extra.json':'diagnosis.json'),JSON.stringify(report,null,2));await browser.close();await site.close();
  }
  console.log(JSON.stringify({ok:report.ok,platform:report.platform,browser:report.browser,geometryCases:report.geometry.length,
    restart:report.restart.map(s=>({stage:s.stage,legal9:s.legal9,path:JSON.parse(s.raw).pendingTurn?.path})),
    arena:report.arena.map(s=>({stage:s.stage,active:s.active,dialog:s.dialog,inventory:s.inventory,commands:JSON.parse(s.raw).commands})),errors:report.errors},null,2));
  assert.deepEqual(report.errors,[]);
})().catch(e=>{console.error(e);process.exitCode=1;});
