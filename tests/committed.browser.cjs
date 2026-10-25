const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CERCONEXO_PLAYWRIGHT_PATH||'playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'validation/m1-revision/browser');
const idle=p=>p.waitForFunction(()=>document.getElementById('board').getAttribute('aria-busy')==='false');
const raw=p=>p.evaluate(()=>localStorage.getItem('wallgo-league-v2'));
const envelope=async p=>JSON.parse(await raw(p));
let tracked=null,collected=[];
async function reload(p){if(p===tracked)collected.push(...await p.evaluate(()=>stepAudit.frames));await p.reload();await idle(p);}
async function hit(p,selector,{touch=false,keyboard=false,wait=true}={}){
 const node=p.locator(selector).first();
 if(keyboard){await node.focus();await p.keyboard.press('Enter');}
 else{const b=await node.boundingBox();assert.ok(b,selector);if(touch)await p.touchscreen.tap(b.x+b.width/2,b.y+b.height/2);else await p.mouse.click(b.x+b.width/2,b.y+b.height/2);}
 if(wait)await idle(p);
}
const transform=cell=>`translate(${100+cell%7*80} ${100+Math.floor(cell/7)*80})`;
async function instrument(context){await context.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{
 window.stepAudit={frames:[],pointers:[],animations:[],blocked:[]};
 const during=event=>{if(!event.target.closest?.('[data-to]')||document.getElementById('board').getAttribute('aria-busy')!=='true')return;const before=localStorage.getItem('wallgo-league-v2');document.querySelector('[data-wall]')?.dispatchEvent(new MouseEvent('click',{bubbles:true}));stepAudit.blocked.push(before===localStorage.getItem('wallgo-league-v2'));};document.addEventListener('click',during);document.addEventListener('keydown',during);
 document.addEventListener('pointerdown',e=>stepAudit.pointers.push(e.pointerType),true);
 const animate=Element.prototype.animate;Element.prototype.animate=function(...args){stepAudit.animations.push(args[1]?.duration);return animate.apply(this,args);};
 const frame=()=>{const b=document.getElementById('board')?.getBoundingClientRect();if(b?.width)stepAudit.frames.push({page:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],board:[b.x,b.y,b.width,b.height]});if(stepAudit.frames.length<6000)requestAnimationFrame(frame);};requestAnimationFrame(frame);
}));}
(async()=>{
 await fs.mkdir(out,{recursive:true});
 const engine=await import('../src/engine.mjs'),{encodeGameSave}=await import('../src/gameSave.mjs'),{beginDraft,advanceDraft,selectDraft}=await import('../src/turnDraft.mjs');
 const {resultFixture}=await import('./result-fixtures.mjs'),{startPagesServer}=await import('./pages-server.mjs'),site=await startPagesServer();
 const browser=await require('./navigation.cjs').historicalBrowser(await chromium.launch({headless:true,channel:process.env.CERCONEXO_BROWSER_CHANNEL||'msedge'})),errors=[],report={checks:[],screens:[],frames:0,focus:[],fullGames:[]};
 const load=async(p,game,draft=beginDraft(game))=>{await p.evaluate(value=>localStorage.setItem('wallgo-league-v2',value),encodeGameSave(game,draft));await reload(p);};
 const screenshot=(p,name)=>p.screenshot({path:path.join(out,name+'.png')});
 try{
  for(const [width,height,boardSize] of [[1440,900,734],[1366,768,602],[1366,600,440],[390,844,366],[360,740,336],[740,360,294],[1440,700,540],[1366,650,490],[1280,560,400]]){
   const context=await browser.newContext({viewport:{width,height},hasTouch:true}),p=await context.newPage();await instrument(context);p.on('pageerror',e=>errors.push(e.message));tracked=p;collected=[];
   await p.goto(site.url);await idle(p);const initial=await p.locator('#board').boundingBox(),baseline=[initial.x,initial.y,initial.width,initial.height];assert.equal(initial.width,boardSize);
   for(const mode of ['piece','team']){
    const game=engine.initialState({turnMode:mode}),actor=mode==='team'?'A2':'A1',start=engine.pieceById(game,actor).pos,first=mode==='team'?39:9,second=mode==='team'?32:16;
    const input={touch:width<800,keyboard:width===1366};await load(p,game);await screenshot(p,`inicio-${mode}-${width}x${height}`);
    assert.equal(await p.locator('#cancel,.reset-path,.game-controls').count(),0);
    if(mode==='team'){
     const saved=await raw(p);await hit(p,'[data-actor=A1]',input);await screenshot(p,`seleccion-A1-${width}x${height}`);await hit(p,'[data-actor=A2]',input);assert.equal(await raw(p),saved);await screenshot(p,`cambio-A2-${width}x${height}`);
     const available=await p.locator('[data-actor=A1]').evaluate(n=>({outline:getComputedStyle(n).outlineStyle,stroke:getComputedStyle(n.querySelector('.actor-hit')).stroke}));assert.equal(available.outline,'none');assert.equal(available.stroke,'none');
     await p.locator('#help').click();
     await p.click('#helpDialog [data-guide-tab=board]');assert.equal(await p.locator('.legend-content > div:visible').count(),8);assert.ok(await p.locator('[data-team-guide]').first().isVisible());await screenshot(p,`guia-${width}x${height}`);await require('./m4-navigation.cjs').escape(p);await p.waitForFunction(()=>!document.getElementById('helpDialog').open);
    }
    await hit(p,`[data-to="${first}"]`,{...input,wait:false});
    let saved=await envelope(p);assert.deepEqual(saved.game,game);assert.deepEqual(saved.pendingTurn.path,[start,first]);assert.equal(saved.pendingTurn.steps,1);
    // Los clics adicionales mientras se anima no confirman otra acción.
    assert.ok(await p.evaluate(()=>stepAudit.blocked.length>0&&stepAudit.blocked.every(Boolean)));assert.deepEqual((await envelope(p)).pendingTurn.path,[start,first]);
    await reload(p);assert.equal(await p.locator(`[data-piece=${actor}]`).getAttribute('transform'),transform(first));assert.equal(await p.locator('[data-actor]').count(),0);assert.equal(await p.locator('.token-candidate').count(),0);assert.equal(await p.evaluate(()=>document.getAnimations().length),0);
    const expectedMoves=engine.availableMoves(game,actor,first);assert.deepEqual((await p.locator('[data-to]').evaluateAll(ns=>ns.map(n=>Number(n.dataset.to)))).sort((a,b)=>a-b),expectedMoves.sort((a,b)=>a-b));
    const one=await raw(p);await require('./m4-navigation.cjs').escape(p);assert.equal(await raw(p),one);await screenshot(p,`primer-paso-recargado-${mode}-${width}x${height}`);
    // Un evento atrasado sobre una ficha ya no disponible tampoco altera el turno.
    await p.evaluate(()=>{const n=document.createElementNS('http://www.w3.org/2000/svg','g');n.dataset.actor='A1';document.getElementById('interactionLayer').append(n);n.dispatchEvent(new MouseEvent('click',{bubbles:true}));n.remove();});assert.equal(await raw(p),one);
    await hit(p,`[data-to="${start}"]`,input);saved=await envelope(p);assert.deepEqual(saved.pendingTurn.path,[start,first,start]);assert.equal(saved.pendingTurn.steps,2);assert.equal(await p.locator('[data-to],[data-actor]').count(),0);
    await screenshot(p,`regreso-origen-${mode}-${width}x${height}`);await reload(p);assert.equal((await envelope(p)).pendingTurn.steps,2);assert.equal(await p.locator('[data-to],[data-actor]').count(),0);
    const to=engine.wallOptions(game,start)[0],expected=engine.applyTurn(game,{actor,path:[start,first,start],to});await hit(p,`[data-wall="${to}"]`,{...input,wait:false});saved=await envelope(p);assert.deepEqual(saved.game,expected);assert.equal(Object.hasOwn(saved,'pendingTurn'),false);
    await reload(p);assert.deepEqual((await envelope(p)).game,expected);await screenshot(p,`turno-siguiente-${mode}-${width}x${height}`);
    // Giro: segundo paso definitivo y exactamente un muro, sin tercer desplazamiento.
    await load(p,game);if(mode==='team')await hit(p,'[data-actor=A2]',input);await hit(p,`[data-to="${first}"]`,input);await hit(p,`[data-to="${second}"]`,input);
    assert.equal(await p.locator('#turnBanner > h2').innerText(),'2 PASOS · CONSTRUYE');assert.equal(await p.locator('[data-to],[data-actor]').count(),0);await screenshot(p,`segundo-paso-${mode}-${width}x${height}`);
    const wall=engine.wallOptions(game,second)[0];await hit(p,`[data-wall="${wall}"]`,input);assert.deepEqual((await envelope(p)).game,engine.applyTurn(game,{actor,path:[start,first,second],to:wall}));
    // Reinicio de un primer paso todavía sin muro: confirmar rechazo y aceptación.
    await load(p,game);if(mode==='team')await hit(p,'[data-actor=A2]',input);await hit(p,`[data-to="${first}"]`,input);const incomplete=await raw(p);
    await p.locator('#new').click();assert.equal(await raw(p),incomplete);assert.ok(await p.locator('#replaceWarning').isVisible());await p.locator('#newDialog .dialog-close').click();await p.waitForFunction(()=>document.documentElement.dataset.portalReady==="true");assert.ok(await p.locator('#newDialog').isHidden());assert.equal(await raw(p),incomplete);await require('./m4-navigation.cjs').resumeClassic(p);
    await p.locator('#new').click();await p.locator('#startLocal').click();assert.deepEqual((await envelope(p)).game,game);assert.equal(Object.hasOwn(await envelope(p),'pendingTurn'),false);
   }
   const frames=[...collected,...await p.evaluate(()=>stepAudit.frames)];for(const frame of frames){assert.deepEqual(frame.page,[width,height]);assert.deepEqual(frame.board,baseline);}
   report.frames+=frames.length;report.screens.push({viewport:[width,height],board:baseline,frames:frames.length});await context.close();tracked=null;
  }
  report.checks.push('Nueve resoluciones, ambas modalidades: elección libre solo antes de mover, recarga durante paso/muro, retorno de dos pasos, giro, bloqueo, reinicio y guía; sin scroll ni cambios del tablero');
  // Matriz de foco: eventos de puntero reales y teclado para las cuatro fichas.
  for(const method of ['touch','mouse','keyboard']){
   const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,reducedMotion:'reduce'}),p=await context.newPage();await instrument(context);p.on('pageerror',e=>errors.push(e.message));await p.goto(site.url);
   for(const id of ['A1','A2','B1','B2']){
    if(id==='A1'||id==='B1'){const initial=engine.initialState({turnMode:'team'}),game=id==='A1'?initial:engine.applyTurn(initial,{actor:'A1',path:[8],to:1});await load(p,game);}
    await hit(p,`[data-actor=${id}]`,{touch:method==='touch',keyboard:method==='keyboard'});
    const selected=p.locator(`[data-actor=${id}]`);await selected.evaluate(n=>n.focus());
    const state=await selected.evaluate(n=>({outline:getComputedStyle(n).outlineStyle,focusVisible:n.matches(':focus-visible'),circle:getComputedStyle(n.querySelector('.actor-focus')).display,fill:getComputedStyle(n.querySelector('.actor-hit')).fill,stroke:getComputedStyle(n.querySelector('.actor-hit')).stroke}));
    assert.equal(state.outline,'none');assert.equal(state.stroke,'none');assert.equal(state.focusVisible,method==='keyboard');assert.equal(state.circle,method==='keyboard'?'block':'none');
    await screenshot(p,`foco-${method}-${id}`);report.focus.push({method,id,...state});
   }
   const pointers=await p.evaluate(()=>stepAudit.pointers);if(method!=='keyboard')assert.ok(pointers.includes(method==='touch'?'touch':'mouse'));
   else{await p.locator('#help').focus();assert.ok(await p.locator('#help').evaluate(n=>getComputedStyle(n).outlineStyle!=='none'&&parseFloat(getComputedStyle(n).outlineWidth)>=2));}
   await context.close();
  }
  report.checks.push('Foco de A1/A2/B1/B2 con tacto y ratón sin outline nativo; teclado con círculo explícito visible y superficies intactas');
  // Forzar la recarga desde la propia escritura: antes de que comience la animación.
  const immediateContext=await browser.newContext({viewport:{width:390,height:844},hasTouch:true}),i=await immediateContext.newPage();i.on('pageerror',e=>errors.push(e.message));
  await immediateContext.addInitScript(()=>{
   const original=Storage.prototype.setItem;
   Storage.prototype.setItem=function(key,value){
    original.call(this,key,value);
    if(key!=='wallgo-league-v2')return;
    const saved=JSON.parse(value);
    if((window.reloadAtStep&&saved.pendingTurn?.steps===window.reloadAtStep)||(window.reloadAtWall&&saved.game.moves===window.reloadAtWall&&!saved.pendingTurn)){
     window.reloadAtStep=0;window.reloadAtWall=0;location.reload();
    }
   };
  });
  await i.goto(site.url);
  for(const mode of ['piece','team']){
   const game=engine.initialState({turnMode:mode}),actor=mode==='team'?'A2':'A1',start=engine.pieceById(game,actor).pos,first=mode==='team'?39:9;await load(i,game);
   if(mode==='team')await hit(i,'[data-actor=A2]',{touch:true});
   for(const [to,count] of [[first,1],[start,2]]){
    await i.evaluate(count=>window.reloadAtStep=count,count);const loaded=i.waitForEvent('domcontentloaded');await hit(i,`[data-to="${to}"]`,{touch:true,wait:false});await loaded;await require('./navigation.cjs').continueHistorical(i);await idle(i);
    const saved=await envelope(i);assert.deepEqual(saved.game,game);assert.equal(saved.pendingTurn.steps,count);assert.deepEqual(saved.pendingTurn.path,count===1?[start,first]:[start,first,start]);
    assert.equal(await i.locator(`[data-piece=${actor}]`).getAttribute('transform'),transform(to));assert.equal(await i.locator('[data-actor]').count(),0);assert.equal(await i.evaluate(()=>document.getAnimations().length),0);await screenshot(i,`recarga-inmediata-${mode}-paso${count}`);
   }
   const to=engine.wallOptions(game,start)[0],expected=engine.applyTurn(game,{actor,path:[start,first,start],to});await i.evaluate(()=>window.reloadAtWall=1);const loaded=i.waitForEvent('domcontentloaded');await hit(i,`[data-wall="${to}"]`,{touch:true,wait:false});await loaded;await require('./navigation.cjs').continueHistorical(i);await idle(i);
   assert.deepEqual((await envelope(i)).game,expected);assert.equal(Object.hasOwn(await envelope(i),'pendingTurn'),false);assert.equal(await i.locator('.wall-confirmation').count(),0);assert.equal(await i.locator('.wall-built').count(),1);
  }
  await immediateContext.close();report.checks.push('Recarga disparada dentro de setItem antes de animar: pasos 1/2 y muro de ambas modalidades se recuperan exactamente una vez');
  // Errores de almacenamiento reales: ninguna acción se acepta si no puede persistirse.
  const failureContext=await browser.newContext({viewport:{width:360,height:740},hasTouch:true,reducedMotion:'reduce'}),f=await failureContext.newPage();f.on('pageerror',e=>errors.push(e.message));
  await failureContext.addInitScript(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(window.blockSave&&key==='wallgo-league-v2')throw new DOMException('Sin espacio','QuotaExceededError');return original.call(this,key,value);};});await f.goto(site.url);
  const initial=engine.initialState({turnMode:'team'});await load(f,initial);await hit(f,'[data-actor=A2]');const before=await raw(f);await f.evaluate(()=>window.blockSave=true);await hit(f,'[data-to="39"]');assert.equal(await raw(f),before);assert.equal(await f.locator('[data-piece=A2]').getAttribute('transform'),transform(40));assert.match(await f.locator('#prompt').innerText(),/No se pudo guardar/);
  await f.evaluate(()=>window.blockSave=false);await hit(f,'[data-to="39"]');const pending=await raw(f);await f.evaluate(()=>window.blockSave=true);await hit(f,'[data-wall]');assert.equal(await raw(f),pending);assert.equal((await envelope(f)).game.moves,0);
  await f.evaluate(()=>window.blockSave=false);await hit(f,'[data-wall]');assert.equal((await envelope(f)).game.moves,1);assert.equal(Object.hasOwn(await envelope(f),'pendingTurn'),false);
  const damaged=JSON.parse(encodeGameSave(initial,advanceDraft(initial,selectDraft(initial,beginDraft(initial),'A1'),9)));damaged.pendingTurn.base='obsoleta';await f.evaluate(value=>localStorage.setItem('wallgo-league-v2',value),JSON.stringify(damaged));await reload(f);
  assert.deepEqual((await envelope(f)).game,initial);assert.equal(Object.hasOwn(await envelope(f),'pendingTurn'),false);assert.match(await f.locator('#prompt').innerText(),/dañado/);assert.equal(await f.locator('[data-actor]').count(),2);await failureContext.close();
  report.checks.push('Cuota de almacenamiento: paso y muro rechazados sin alterar estado; recuperación documentada de avance incompatible conserva la partida oficial');
  // Partidas completas, con recargas intermedias y resultados reales.
  for(const mode of ['piece','team']){
   const context=await browser.newContext({viewport:{width:360,height:740},reducedMotion:'reduce',hasTouch:true}),p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(site.url);let game=engine.initialState({turnMode:mode}),seed=6711,steps=0;const rnd=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};await load(p,game);
   while(!game.over){
    const ids=engine.legalActors(game),actor=ids[rnd(ids.length)],route=[engine.pieceById(game,actor).pos];if(mode==='team'&&game.currentActor===null)await hit(p,`[data-actor=${actor}]`,{keyboard:true});
    for(let n=rnd(3);n>0;n--){const moves=engine.availableMoves(game,actor,route.at(-1));if(!moves.length)break;const to=moves[rnd(moves.length)];route.push(to);await hit(p,`[data-to="${to}"]`,{keyboard:true});assert.deepEqual((await envelope(p)).game,game);assert.deepEqual((await envelope(p)).pendingTurn.path,route);steps++;if(steps%4===0){await reload(p);assert.deepEqual((await envelope(p)).pendingTurn.path,route);}}
    const walls=engine.wallOptions(game,route.at(-1)),to=walls[rnd(walls.length)],next=engine.applyTurn(game,{actor,path:route,to});await hit(p,`[data-wall="${to}"]`,{keyboard:true});assert.deepEqual((await envelope(p)).game,next);assert.equal(Object.hasOwn(await envelope(p),'pendingTurn'),false);game=next;
   }
   assert.equal(await p.locator('[data-explore-cell]').count(),49);const official=await raw(p);await hit(p,'[data-explore-cell="8"]',{keyboard:true});assert.equal(await raw(p),official);await reload(p);assert.equal(await raw(p),official);assert.equal(await p.locator('[data-to],[data-wall],[data-actor]').count(),0);await screenshot(p,`partida-completa-${mode}`);report.fullGames.push({mode,moves:game.moves,steps,winner:game.winner,score:engine.territory(game).score});await context.close();
  }
  report.checks.push('Dos partidas completas por teclado y movimiento reducido, recargando pasos, conservan puntos, final, cuatro fichas y exploración directa');
  // Empate/victoria y compatibilidad de partidas terminadas sin datos parciales.
  const endContext=await browser.newContext({viewport:{width:740,height:360},reducedMotion:'reduce'}),e=await endContext.newPage();e.on('pageerror',x=>errors.push(x.message));await e.goto(site.url);
  for(const options of [{A:28,B:16},{A:16,B:28},{A:23,B:23}]){const game=resultFixture(options).after;await load(e,game);assert.ok(await e.locator('#winnerTitle').isVisible());assert.equal((await envelope(e)).game.winner,game.winner);assert.equal(await e.locator('[data-explore-cell]').count(),49);assert.equal(await e.evaluate(()=>document.getAnimations().length),0);}
  await endContext.close();assert.deepEqual(errors,[]);report.errors=errors;await fs.writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{await browser.close();await site.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
