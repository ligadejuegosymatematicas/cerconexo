const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CERCONEXO_PLAYWRIGHT_PATH||'playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'validation/m1/browser');
const idle=p=>p.waitForFunction(()=>document.getElementById('board').getAttribute('aria-busy')==='false');
const saved=p=>p.evaluate(()=>localStorage.getItem('wallgo-league-v2'));
const game=async p=>JSON.parse(await saved(p))?.game;
let trackedPage=null,collectedFrames=[];
async function reload(p){if(p===trackedPage)collectedFrames.push(...await p.evaluate(()=>m1Audit.frames));await p.reload();await idle(p);}
const frame=p=>p.evaluate(()=>{const b=document.getElementById('board').getBoundingClientRect();return {page:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],board:[b.x,b.y,b.width,b.height],scale:visualViewport.scale};});
async function hit(p,selector,{keyboard=false,touch=false}={}){
 const node=p.locator(selector).first();
 await node.waitFor({state:'visible'});
 if(keyboard){await node.focus();await p.keyboard.press('Enter');}
 else{const box=await node.boundingBox();assert.ok(box,selector);if(touch)await p.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);else await p.mouse.click(box.x+box.width/2,box.y+box.height/2);}
 await idle(p);
}
async function load(p,state){await p.evaluate(state=>localStorage.setItem('wallgo-league-v2',JSON.stringify({game:state})),state);await reload(p);}
(async()=>{
 await fs.mkdir(out,{recursive:true});
 const engine=await import('../src/engine.mjs'),{finishFixture}=await import('./territory-fixtures.mjs');
 const fixtures=await import('./participation-fixtures.mjs'),{resultFixture}=await import('./result-fixtures.mjs');
 const {startPagesServer}=await import('./pages-server.mjs'),site=await startPagesServer();
 const browser=await require('./navigation.cjs').historicalBrowser(await chromium.launch({headless:true,channel:process.env.CERCONEXO_BROWSER_CHANNEL||'msedge'})),errors=[],report={checks:[],screens:[],frames:0};
 const asTeam=g=>finishFixture({...structuredClone(g),turnMode:'team'});
 try{
  for(const [width,height] of [[1440,900],[1366,768],[1366,600],[390,844],[360,740],[740,360],[1440,700],[1366,650],[1280,560]]){
   const touch=width<800,context=await browser.newContext({viewport:{width,height},hasTouch:true}),p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
   await context.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{
    window.m1Audit={frames:[],writes:0,animations:[]};
    const store=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='wallgo-league-v2')m1Audit.writes++;return store.call(this,key,value);};
    const animate=Element.prototype.animate;Element.prototype.animate=function(...args){m1Audit.animations.push(args[1]?.duration);return animate.apply(this,args);};
    const tick=()=>{const b=document.getElementById('board')?.getBoundingClientRect();if(b?.width)m1Audit.frames.push({page:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],board:[b.x,b.y,b.width,b.height]});if(m1Audit.frames.length<6000)requestAnimationFrame(tick);};requestAnimationFrame(tick);
   }));
   trackedPage=p;collectedFrames=[];await p.goto(site.url);await idle(p);const baseline=await frame(p);assert.deepEqual(baseline.page,[width,height]);assert.equal(baseline.scale,1);
   const screenshot=async name=>p.screenshot({path:path.join(out,`${name}-${width}x${height}.png`)});
   await screenshot('clasico');assert.equal(await p.locator('#turnDisc').innerText(),'A1');
   await p.locator('#new').click();assert.equal(await p.locator('[name=turnMode]:checked').inputValue(),'piece');
   assert.ok(await p.locator('#newDialog .dialog-close').evaluate(n=>n===document.activeElement));
   await p.keyboard.press('Shift+Tab');assert.ok(await p.locator('#startLocal').evaluate(n=>n===document.activeElement));await p.keyboard.press('Tab');
   assert.equal(await p.locator('#newDialog input[name=turnMode]').count(),2);await screenshot('selector');
   await p.locator('#newDialog h2').click();assert.ok(await p.locator('#newDialog').isVisible());await p.keyboard.press('Escape');assert.ok(await p.locator('#new').evaluate(n=>n===document.activeElement));
   await p.locator('#new').click();await p.locator('[name=turnMode][value=team]').check();await p.locator('#startLocal').click();await idle(p);
   assert.equal((await game(p)).turnMode,'team');assert.equal((await game(p)).currentActor,null);assert.equal((await game(p)).moves,0);
   assert.equal(await p.locator('[data-actor]').count(),2);assert.equal(await p.locator('.token-candidate').count(),2);assert.equal(await p.locator('[data-wall],[data-to]').count(),0);
   assert.match(await p.locator('#prompt').innerText(),/Elige A1 o A2/);await screenshot('equipo-inicio');
   const official=await saved(p),writes=await p.evaluate(()=>m1Audit.writes);
   await hit(p,'[data-actor=A1]',{touch,keyboard:width===1366});assert.equal(await saved(p),official);assert.equal(await p.locator('[data-actor=A1]').getAttribute('aria-pressed'),'true');await screenshot('seleccion-A1');
   await hit(p,'[data-actor=A2]',{touch});assert.equal(await saved(p),official);assert.equal(await p.evaluate(()=>m1Audit.writes),writes);
   assert.equal(await p.locator('[data-piece=A1]').getAttribute('transform'),'translate(180 180)');assert.match(await p.locator('#prompt').innerText(),/Turno de A2/);await screenshot('cambio-A2');
   await hit(p,'[data-to="39"]',{touch});await hit(p,'[data-to="32"]',{touch});
   assert.equal(await p.locator('#turnBanner > h2').innerText(),'2 PASOS · CONSTRUYE');
   const to=Number(await p.locator('[data-wall]').first().getAttribute('data-wall')),expected=engine.applyTurn(JSON.parse(official).game,{actor:'A2',path:[40,39,32],to});
   // Una pulsación repetida durante la transición no confirma otro muro.
   await p.locator(`[data-wall="${to}"]`).dispatchEvent('click');await p.evaluate(()=>document.querySelector('[data-wall]')?.dispatchEvent(new MouseEvent('click',{bubbles:true})));await idle(p);
   assert.deepEqual(await game(p),expected);assert.equal((await game(p)).moves,1);assert.equal((await game(p)).turnTeam,'B');await screenshot('turno-B');
   const timings=await p.evaluate(()=>m1Audit.animations);for(const duration of [180,280,320])assert.ok(timings.includes(duration),`Animación compartida ${duration} ms`);
   await hit(p,'[data-actor=B2]',{touch});const bTo=Number(await p.locator('[data-wall]').first().getAttribute('data-wall'));await hit(p,`[data-wall="${bTo}"]`,{touch});
   assert.equal((await game(p)).lastMove.actor,'B2');assert.equal((await game(p)).turnTeam,'A');assert.deepEqual(engine.legalActors(await game(p)),['A1','A2']);
   await hit(p,'[data-actor=A2]',{touch});assert.match(await p.locator('#turnName').innerText(),/Ficha A2/);
   const confirmed=await saved(p);await reload(p);assert.equal(await saved(p),confirmed);assert.equal(await p.locator('[data-wall]').count(),0);assert.equal(await p.locator('[data-actor]').count(),2);
   await p.locator('#new').click();assert.ok(await p.locator('#replaceWarning').isVisible());await p.locator('#newDialog .dialog-close').click();assert.ok(await p.locator('#newDialog').isHidden());assert.equal(await saved(p),confirmed);
   await p.locator('#new').click();assert.equal(await p.locator('[name=turnMode]:checked').inputValue(),'team');await p.locator('#newDialog .dialog-close').click();assert.equal(await saved(p),confirmed);
   for(const opener of ['#help','#options','#guide'])if(await p.locator(opener).isVisible()){
    await p.locator(opener).click();await p.keyboard.press('Escape');assert.equal(await saved(p),confirmed);
   }
   // Fixture real: una única ficha pasa a estar asegurada. La elección restante es automática.
   const fixture=fixtures.participationFixture(),before=asTeam(fixture.before);await load(p,before);await hit(p,'[data-actor=A1]',{touch});await hit(p,'[data-wall="15"]',{touch});
   assert.ok(await p.locator('[data-piece=A1]').evaluate(n=>n.classList.contains('token-isolated')));assert.match(await p.locator('#recentEvent').innerText(),/A2 será la única ficha disponible/);await screenshot('uno-vs-dos');
   await hit(p,'[data-actor=B1]',{touch});await hit(p,'[data-wall]',{touch});assert.equal(await p.locator('#turnDisc').innerText(),'A2');assert.equal(await p.locator('[data-actor]').count(),1);await screenshot('unica-ficha');
   const duel=asTeam(fixtures.directDuelFixture().before);await load(p,duel);await hit(p,'[data-actor=A1]',{touch});await hit(p,'[data-wall="9"]',{touch});
   assert.equal(await p.locator('#matchupLabel').innerText(),'1 vs. 1 · Última disputa');assert.equal(await p.locator('.token-isolated').count(),2);assert.equal(await p.locator('#turnDisc').innerText(),'B2');assert.match(await p.locator('#recentEvent').innerText(),/Únicas fichas disponibles/);await screenshot('uno-vs-uno');
   const final=resultFixture(),start=asTeam(final.before),last=final.after.lastMove;await load(p,start);
   if(start.currentActor===null)await hit(p,`[data-actor=${last.actor}]`,{touch});
   await hit(p,`[data-wall="${last.wall[1]}"]`,{touch});assert.equal((await game(p)).winner,'A');assert.equal(await p.locator('[data-explore-cell]').count(),49);assert.equal(await p.locator('[data-actor],[data-wall],[data-to]').count(),0);await screenshot('resultado');
   const end=await saved(p);await hit(p,'[data-explore-cell="8"]',{touch});assert.equal(await saved(p),end);await reload(p);assert.equal(await saved(p),end);
   await p.evaluate(()=>localStorage.setItem('cerconexo-preferences-v1',JSON.stringify({vibration:false})));
   await p.locator('#new').click();assert.equal(await p.locator('[name=turnMode]:checked').inputValue(),'team');await p.locator('#startLocal').click();assert.deepEqual(await game(p),engine.initialState({turnMode:'team'}));
   await p.locator('#new').click();await p.locator('[name=turnMode][value=piece]').check();await p.locator('#startLocal').click();assert.deepEqual(await game(p),engine.initialState());
   assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('cerconexo-preferences-v1')).vibration),false);
   const audit=await p.evaluate(()=>m1Audit);audit.frames=[...collectedFrames,...audit.frames];for(const f of audit.frames){assert.deepEqual(f.page,[width,height]);assert.deepEqual(f.board,baseline.board);}
   report.frames+=audit.frames.length;report.screens.push({viewport:[width,height],board:baseline.board,frames:audit.frames.length});await context.close();
  }
  report.checks.push('Nueve resoluciones: selector accesible, selección de A/B, cambio de ficha antes de mover, giro, muro único, alternancia, recarga, aislamiento, 1 vs. 1, final, consulta y reinicio; sin cambios del tablero ni scroll transitorio');
  // Modo reducido, teclado, retorno al origen y cancelación de una transición pendiente.
  const context=await browser.newContext({viewport:{width:360,height:740},hasTouch:true,reducedMotion:'reduce'}),p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(site.url);
  await p.locator('#new').click();await p.locator('[name=turnMode][value=piece]').focus();await p.keyboard.press('ArrowRight');assert.equal(await p.locator('[name=turnMode]:checked').inputValue(),'team');await p.locator('#startLocal').focus();await p.keyboard.press('Enter');assert.deepEqual(await game(p),engine.initialState({turnMode:'team'}));
  await hit(p,'[data-actor=A1]',{keyboard:true});await hit(p,'[data-to="9"]',{keyboard:true});await hit(p,'[data-to="8"]',{keyboard:true});await hit(p,'[data-wall="15"]',{keyboard:true});
  assert.deepEqual((await game(p)).lastMove.path,[8,9,8]);assert.equal(await p.evaluate(()=>document.getAnimations().length),0);
  for(const options of [{A:16,B:28},{A:23,B:23},{A:25,B:24}]){
   const fixture=resultFixture(options),before=asTeam(fixture.before),move=fixture.after.lastMove;await load(p,before);if(!before.currentActor)await hit(p,`[data-actor=${move.actor}]`,{keyboard:true});await hit(p,`[data-wall="${move.wall[1]}"]`,{keyboard:true});assert.equal((await game(p)).winner,fixture.after.winner);
   assert.equal(await p.locator('[data-explore-cell]').count(),49);assert.ok(await p.locator('#winnerTitle').isVisible());await p.reload();assert.equal((await game(p)).winner,fixture.after.winner);
  }
  await context.close();report.checks.push('Teclado y movimiento reducido: retorno al origen, muro sin animación, victoria B, empate y cero vacías con recarga');
  const animated=await browser.newContext({viewport:{width:390,height:844},hasTouch:true}),q=await animated.newPage();await q.goto(site.url);
  await load(q,asTeam(fixtures.participationFixture().before));await hit(q,'[data-actor=A1]');await q.locator('[data-wall="15"]').dispatchEvent('click');await q.waitForFunction(()=>document.getElementById('board').getAttribute('aria-busy')==='true');
  await q.locator('#new').click();await q.locator('#startLocal').click();await q.waitForTimeout(1500);assert.deepEqual(await game(q),engine.initialState({turnMode:'team'}));assert.equal(await q.locator('.marker-check:visible,.wall-built').count(),0);assert.ok(await q.locator('#recentEvent').isHidden());await animated.close();
  report.checks.push('Reinicio durante conquista pendiente cancela confirmaciones y mensajes de la partida anterior');
  const fileContext=await browser.newContext({viewport:{width:360,height:740},reducedMotion:'reduce'}),f=await fileContext.newPage();f.on('pageerror',e=>errors.push(e.message));await f.goto(pathToFileURL(path.join(root,'Cerconexo_Premium_Listo_Para_Jugar.html')).href);await f.locator('#new').click();await f.locator('[name=turnMode][value=team]').check();await f.locator('#startLocal').click();await hit(f,'[data-actor=A2]');await hit(f,'[data-wall]');assert.equal((await game(f)).turnTeam,'B');await fileContext.close();
  assert.deepEqual(errors,[]);report.errors=errors;await fs.writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{await browser.close();await site.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
