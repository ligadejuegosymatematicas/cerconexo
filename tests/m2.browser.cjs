const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url'),{chromium}=require(process.env.CERCONEXO_PLAYWRIGHT_PATH||'playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'validation/m2/browser');
const raw=p=>p.evaluate(()=>localStorage.getItem('wallgo-league-v2')),state=async p=>JSON.parse(await raw(p));
const idle=p=>p.waitForFunction(()=>document.getElementById('board').getAttribute('aria-busy')==='false');
const done=(p,moves)=>p.waitForFunction(moves=>{const v=JSON.parse(localStorage.getItem('wallgo-league-v2'));return v?.game.moves===moves&&document.getElementById('board').getAttribute('aria-busy')==='false';},moves);
async function hit(p,selector,keyboard=false){const node=p.locator(selector).first();if(keyboard){await node.focus();await p.keyboard.press('Enter');}else{const b=await node.boundingBox();assert.ok(b,selector);await p.touchscreen.tap(b.x+b.width/2,b.y+b.height/2);}}
async function continueGame(p){await p.locator('#continueGame').click();await p.waitForFunction(()=>document.getElementById('homeScreen').hidden);}
async function fixture(p,value,{enter=false}={}){await p.evaluate(value=>localStorage.setItem('wallgo-league-v2',value),value);await p.reload();await p.locator('#continueGame').waitFor();if(enter)await continueGame(p);}
async function instrument(context,{fake=false,noWorker=false}={}){
 await context.addInitScript(({fake,noWorker})=>{
  window.m2={writes:[],animations:[],workers:[],responses:[],pointers:[],blocked:[],frames:[],haptics:[],fakeTerminated:0};
  Object.defineProperty(navigator,'vibrate',{configurable:true,value:pattern=>{m2.haptics.push(pattern);return true;}});
  const store=Storage.prototype.setItem;
  Storage.prototype.setItem=function(key,value){
   const v=key==='wallgo-league-v2'?JSON.parse(value):null;
   if(v?.control&&((window.failAt==='plan'&&v.cpuPlan&&!v.pendingTurn)||(window.failAt==='step1'&&v.pendingTurn?.steps===1)||(window.failAt==='step2'&&v.pendingTurn?.steps===2)||(window.failAt==='wall'&&v.game.moves>0&&!v.pendingTurn)))throw new DOMException('Sin espacio','QuotaExceededError');
   store.call(this,key,value);
   if(v){
    m2.writes.push({value:v,at:performance.now()});
    // Acción humana reentrante durante el turno CPU: debe rechazarse incluso
    // antes de comenzar la animación y aunque se inyecte un objetivo inexistente.
    const board=document.getElementById('board');
    if(board&&document.getElementById('turnName').textContent.startsWith('CPU')){
     const before=this.getItem(key),node=document.createElementNS('http://www.w3.org/2000/svg','g');node.dataset.wall='1';board.append(node);node.dispatchEvent(new MouseEvent('click',{bubbles:true}));node.remove();m2.blocked.push(before===this.getItem(key));
    }
    if(window.reloadAt&&((reloadAt==='plan'&&v.cpuPlan&&!v.pendingTurn)||(reloadAt==='step1'&&v.pendingTurn?.steps===1)||(reloadAt==='step2'&&v.pendingTurn?.steps===2)||(reloadAt==='wall'&&v.game.moves>0&&!v.pendingTurn))){if(reloadAt==='plan')store.call(this,'m2-test-selected',JSON.stringify(v.cpuPlan));window.reloadAt=null;location.reload();}
   }
  };
  const animate=Element.prototype.animate;Element.prototype.animate=function(...args){m2.animations.push({duration:args[1]?.duration,piece:this.dataset?.piece,frames:args[0],at:performance.now()});return animate.apply(this,args);};
  const NativeWorker=window.Worker;
  if(noWorker)window.Worker=undefined;
  else if(fake)window.Worker=class{
   constructor(){m2.workers.push({url:'fixture retardado',at:performance.now()});}
   postMessage(message){setTimeout(()=>this.onmessage?.({data:{id:message.id,result:{turn:window.fakeTurn||{actor:'A1',path:[8,9,8],to:15},stats:{fixture:true}}}}),window.fakeDelay??300);}
   terminate(){m2.fakeTerminated++;} // mensaje atrasado deliberado para probar generación
  };
  else window.Worker=class extends NativeWorker{
   constructor(url,options){super(url,options);m2.workers.push({url:String(url),at:performance.now()});this.addEventListener('message',event=>m2.responses.push({data:event.data,at:performance.now()}));}
  };
  document.addEventListener('pointerdown',e=>m2.pointers.push(e.pointerType),true);
  document.addEventListener('DOMContentLoaded',()=>{
   const tick=()=>{const board=document.getElementById('board'),b=board.getBoundingClientRect();m2.frames.push({at:performance.now(),page:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],scene:document.getElementById('homeScreen').hidden?'game':'home',board:[b.x,b.y,b.width,b.height]});if(m2.frames.length<7000)requestAnimationFrame(tick);};requestAnimationFrame(tick);
  });
 },{fake,noWorker});
}
(async()=>{
 await fs.mkdir(out,{recursive:true});
 const engine=await import('../src/engine.mjs'),{encodeGameSave}=await import('../src/gameSave.mjs'),{beginDraft,advanceDraft}=await import('../src/turnDraft.mjs'),{makeCpuPlan}=await import('../src/cpuSession.mjs'),{resultFixture}=await import('./result-fixtures.mjs'),{participationFixture}=await import('./participation-fixtures.mjs'),{startPagesServer}=await import('./pages-server.mjs');
 const site=await startPagesServer(),browser=await chromium.launch({channel:'msedge',headless:true}),errors=[],report={suites:[],viewports:[],performance:[],reloads:[],storage:[],frames:0,environment:{browser:browser.version(),platform:process.platform,arch:process.arch,node:process.version,cpu:require('node:os').cpus()[0]?.model}};
 const control=(level='intermediate',humanTeam='B')=>({version:1,type:'cpu',humanTeam,difficulty:level,seed:6711});
 const create=async(width=390,height=844,{motion='no-preference',...options}={})=>{
  const context=await browser.newContext({viewport:{width,height},hasTouch:true,reducedMotion:motion});await instrument(context,options);const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(site.url);return {context,p};
 };
 const screenshot=(p,name)=>p.screenshot({path:path.join(out,name+'.png')});
 const checkFrames=async(p,width,height,baseline=null)=>{
  const frames=await p.evaluate(()=>m2.frames);for(const f of frames){assert.deepEqual(f.page,[width,height]);if(baseline&&f.scene==='game')assert.deepEqual(f.board,baseline);}
  report.frames+=frames.length;
 };
 try{
  for(const [width,height,size] of [[1440,900,734],[1366,768,602],[1366,600,440],[390,844,366],[360,740,336],[740,360,240],[1440,700,540],[1366,650,490],[1280,560,400]]){
   const {p,context}=await create(width,height,{motion:'reduce'});assert.equal(await raw(p),null);assert.ok(await p.locator('.home-logo').evaluate(img=>img.complete&&img.naturalWidth>1000));assert.equal(await p.locator('#continueGame').isVisible(),false);
   assert.match(await p.locator('#homeScreen').innerText(),/^Jugar\s+Reglas\s+Opciones$/);assert.ok((await p.locator('.home-logo').boundingBox()).width>=280);await screenshot(p,`portada-${width}x${height}`);
   for(const [opener,dialog] of [['#homeRules','#helpDialog'],['#homeOptions','#optionsDialog']]){
    await p.locator(opener).click();assert.ok(await p.locator(dialog).isVisible());if(dialog==='#helpDialog')assert.equal(await p.locator('.quick-rules li').count(),4);await p.keyboard.press('Escape');await p.waitForFunction(dialog=>!document.querySelector(dialog).open,dialog);assert.ok(await p.locator(opener).evaluate(n=>document.activeElement===n));
   }
   await p.locator('#play').click();assert.equal(await p.locator('[data-control=local]').getAttribute('aria-pressed'),'true');assert.equal(await p.locator('[name=turnMode]:checked').inputValue(),'piece');assert.ok(await p.locator('#cpuOptions').isHidden());await screenshot(p,`selector-local-${width}x${height}`);
   await p.locator('[data-control=cpu]').click();assert.ok(await p.locator('#cpuOptions').isVisible());assert.equal(await p.locator('[name=difficulty]:checked').inputValue(),'intermediate');assert.equal(await p.locator('[name=humanTeam]:checked').inputValue(),'A');await screenshot(p,`selector-cpu-${width}x${height}`);
   await p.locator('[data-control=local]').click();await p.locator('#startLocal').click();await idle(p);const box=await p.locator('#board').boundingBox(),baseline=[box.x,box.y,box.width,box.height];assert.equal(box.width,size);assert.ok(await p.locator('#cpuIdentity').isHidden());assert.equal((await state(p)).control,undefined);
   const header=await p.evaluate(()=>{const rect=n=>{const b=n.getBoundingClientRect();return {x:b.x,right:b.right,width:b.width,height:b.height};};return {logo:rect(document.querySelector('.branding h1')),buttons:[...document.querySelectorAll('.header-actions button')].map(rect)};});assert.ok(header.logo.right<=header.buttons[0].x);for(const b of header.buttons){assert.ok(b.width>=44&&b.height>=44);assert.ok(b.right<=width);}
   await hit(p,'[data-to="9"]',true);await idle(p);const partial=await raw(p);await p.locator('#home').click();assert.equal(await raw(p),partial);assert.ok(await p.locator('#continueGame').isVisible());await continueGame(p);assert.equal(await raw(p),partial);assert.equal(await p.locator('[data-to="8"]').count(),1);
   await p.locator('#new').click();assert.ok(await p.locator('#replaceWarning').isVisible());await p.locator('[data-control=cpu]').click();await p.locator('#newDialog .dialog-close').click();assert.equal(await raw(p),partial);await idle(p);
   await p.locator('#new').click();await p.locator('[name=turnMode][value=team]').check();await p.locator('#startLocal').click();await idle(p);assert.equal((await state(p)).game.turnMode,'team');assert.equal((await state(p)).control,undefined);assert.equal(await p.locator('[data-actor]').count(),2);await screenshot(p,`local-equipo-${width}x${height}`);
   await checkFrames(p,width,height,baseline);report.viewports.push({width,height,boardWidth:box.width});await context.close();
  }
  {
   const {p,context}=await create(320,480,{motion:'reduce'});await p.locator('#play').click();await p.locator('#startLocal').click();await idle(p);const metrics=await p.evaluate(()=>{const logo=document.querySelector('.branding h1').getBoundingClientRect(),button=document.getElementById('home').getBoundingClientRect();return {page:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],board:document.getElementById('board').getBoundingClientRect().width,logoRight:logo.right,buttonLeft:button.x};});assert.equal(metrics.page[0],320);assert.ok(metrics.page[1]>480);assert.ok(metrics.board>=240);assert.ok(metrics.logoRight<=metrics.buttonLeft);report.smallWindow=metrics;await context.close();
  }
  report.suites.push({name:'Portada y selector',passed:true,checks:'Nueve resoluciones y ventana pequeña accesible; marca original sin lema, reglas/opciones, selección progresiva, cuatro controles cómodos, ambas modalidades locales, confirmación única y continuidad sin escritura'});
  for(const level of ['beginner','intermediate','advanced']){
   const results=[];
   for(const mode of ['piece','team']){
    const {p,context}=await create(390,844);await p.locator('#play').click();await p.locator('[data-control=cpu]').click();await p.locator(`[name=difficulty][value=${level}]`).check();await p.locator('[name=humanTeam][value=B]').check();await p.locator(`[name=turnMode][value=${mode}]`).check();await p.locator('#startLocal').click();await done(p,1);
    let saved=await state(p);assert.equal(saved.game.turnTeam,'B');assert.equal(saved.control.difficulty,level);assert.equal(saved.control.humanTeam,'B');assert.equal(saved.cpuPlan,undefined);assert.equal(saved.pendingTurn,undefined);assert.equal(saved.game.lastMove.actor[0],'A');assert.ok(engine.verifyState(saved.game));
    if(mode==='piece')assert.equal(saved.game.lastMove.actor,'A1');
    const audit=await p.evaluate(()=>m2);assert.ok(audit.workers.length>0);assert.ok(audit.blocked.length>0&&audit.blocked.every(Boolean));assert.ok(audit.animations.some(a=>a.duration===280));const response=audit.responses.find(r=>r.data.result?.stats);assert.ok(response);assert.equal(response.data.result.stats.level,level);report.performance.push({level,mode,...response.data.result.stats,roundTripMs:response.at-audit.workers[0].at});
    await screenshot(p,`${level}-${mode}-turno-humano`);
    if(mode==='team')await hit(p,'[data-actor=B2]');const first=Number(await p.locator('[data-to]').first().getAttribute('data-to'));await hit(p,`[data-to="${first}"]`);await idle(p);const partial=await raw(p);await p.reload();assert.equal(await raw(p),partial);await continueGame(p);assert.equal(await raw(p),partial);assert.equal(await p.locator('[data-actor]').count(),0);
    await hit(p,'[data-wall]');await done(p,3);saved=await state(p);assert.equal(saved.game.turnTeam,'B');assert.equal(saved.game.moves,3);assert.equal(saved.cpuPlan,undefined);assert.equal(saved.pendingTurn,undefined);assert.ok(await p.locator('#cpuIdentity').isVisible());assert.deepEqual(engine.territory(saved.game).score.A+engine.territory(saved.game).score.B+engine.territory(saved.game).score.empty+engine.territory(saved.game).score.mixed,49);
    const gameState=await raw(p);await p.locator('#home').click();await p.locator('#homeRules').click();await p.keyboard.press('Escape');await continueGame(p);assert.equal(await raw(p),gameState);results.push({mode,legalTurns:3,blocked:audit.blocked.length});await context.close();
   }
   report.suites.push({name:`CPU ${level}`,passed:true,results});
  }
  {
   const {p,context}=await create(360,740,{motion:'reduce'});await p.keyboard.press('Tab');assert.ok(await p.locator('#play').evaluate(n=>n===document.activeElement));await p.keyboard.press('Enter');await p.locator('[data-control=cpu]').focus();await p.keyboard.press('Enter');await p.locator('[name=difficulty][value=intermediate]').focus();await p.keyboard.press('ArrowRight');assert.equal(await p.locator('[name=difficulty]:checked').inputValue(),'advanced');await p.locator('[name=humanTeam][value=A]').focus();await p.keyboard.press('ArrowRight');await p.locator('[name=turnMode][value=piece]').focus();await p.keyboard.press('ArrowRight');await p.locator('#startLocal').focus();await p.keyboard.press('Enter');await done(p,1);assert.equal((await state(p)).control.humanTeam,'B');assert.equal((await state(p)).control.difficulty,'advanced');assert.equal((await state(p)).game.turnMode,'team');assert.equal(await p.evaluate(()=>document.getAnimations().length),0);await context.close();
  }
  {
   const {p,context}=await create(360,740,{motion:'reduce'});await p.locator('#play').click();await p.locator('[data-control=cpu]').click();await p.locator('[name=difficulty][value=beginner]').check();await p.locator('#startLocal').click();await idle(p);await hit(p,'[data-wall]',true);await done(p,2);assert.ok(await p.evaluate(()=>!!document.activeElement.closest('#interactionLayer')&&document.activeElement.matches(':focus-visible')));assert.equal((await state(p)).game.currentActor,'A2');await screenshot(p,'foco-humano-despues-cpu');await context.close();
  }
  // Un plan fijo válido permite cubrir cada punto de recarga, incluidos dos
  // pasos que regresan al origen, independientemente de la elección heurística.
  for(const mode of ['piece','team'])for(const reloadAt of ['step1','step2','wall']){
   const {p,context}=await create(360,740),game=engine.initialState({turnMode:mode}),turn=mode==='team'?{actor:'A2',path:[40,39,40],to:33}:{actor:'A1',path:[8,9,8],to:15},plan=makeCpuPlan(game,turn),configuration=control();
   await fixture(p,encodeGameSave(game,beginDraft(game),{control:configuration,cpuPlan:plan}));await p.evaluate(value=>window.reloadAt=value,reloadAt);const loaded=p.waitForEvent('domcontentloaded');await p.locator('#continueGame').click();await loaded;await p.locator('#continueGame').waitFor();
   const recovered=await state(p);assert.deepEqual(recovered.control,configuration);
   if(reloadAt==='wall'){assert.equal(recovered.game.moves,1);assert.equal(recovered.cpuPlan,undefined);assert.equal(recovered.pendingTurn,undefined);}else{assert.equal(recovered.game.moves,0);assert.equal(recovered.pendingTurn.steps,reloadAt==='step1'?1:2);assert.deepEqual(recovered.pendingTurn.path,turn.path.slice(0,reloadAt==='step1'?2:3));assert.deepEqual(recovered.cpuPlan,plan);}
   await screenshot(p,`recarga-${mode}-${reloadAt}-portada`);await continueGame(p);await done(p,1);const final=await state(p);assert.deepEqual(final.game,engine.applyTurn(game,turn));assert.equal(final.cpuPlan,undefined);assert.equal(final.pendingTurn,undefined);assert.equal(await p.evaluate(()=>m2.workers.length),0);await screenshot(p,`recarga-${mode}-${reloadAt}-recuperada`);report.reloads.push({mode,reloadAt,moves:1,path:final.game.lastMove.path});await context.close();
  }
  // Decisión real persistida antes del primer paso: recargar no vuelve a elegir.
  {
   const {p,context}=await create(),game=engine.initialState({turnMode:'team'});await fixture(p,encodeGameSave(game,beginDraft(game),{control:control('advanced')}));await p.evaluate(()=>window.reloadAt='plan');const loaded=p.waitForEvent('domcontentloaded');await p.locator('#continueGame').click();await loaded;await p.locator('#continueGame').waitFor();const selected=await p.evaluate(()=>JSON.parse(localStorage.getItem('m2-test-selected'))),recovered=await state(p);assert.ok(selected);
   // location.reload no interrumpe el JavaScript en curso: cualquier paso ya
   // aceptado antes de descargar el documento debe conservarse, nunca borrarse.
   if(recovered.cpuPlan){assert.deepEqual(recovered.cpuPlan,selected);if(recovered.pendingTurn)assert.deepEqual(recovered.pendingTurn.path,selected.turn.path.slice(0,recovered.pendingTurn.steps+1));}else assert.deepEqual(recovered.game,engine.applyTurn(game,selected.turn));
   await continueGame(p);await done(p,1);assert.deepEqual((await state(p)).game,engine.applyTurn(game,selected.turn));assert.equal(await p.evaluate(()=>m2.workers.length),0);
   // Estado persistido exactamente antes del primer paso: dos cargas lo dejan
   // intacto en la portada y Continuar ejecuta esa decisión sin nueva búsqueda.
   const beforeFirst=encodeGameSave(game,beginDraft(game),{control:control('advanced'),cpuPlan:selected});await fixture(p,beforeFirst);await p.reload();assert.equal(await raw(p),beforeFirst);assert.equal((await state(p)).pendingTurn,undefined);await continueGame(p);await done(p,1);assert.deepEqual((await state(p)).game,engine.applyTurn(game,selected.turn));assert.equal(await p.evaluate(()=>m2.workers.length),0);await context.close();report.reloads.push({reloadAt:'plan',sameDecision:true,beforeFirstStep:true});
  }
  for(const failAt of ['plan','step1','step2','wall']){
   const {p,context}=await create(360,740),game=engine.initialState(),configuration=control(),plan=makeCpuPlan(game,{actor:'A1',path:[8,9,8],to:15});await fixture(p,encodeGameSave(game,beginDraft(game),{control:configuration,...(failAt==='plan'?{}:{cpuPlan:plan})}));await p.evaluate(value=>window.failAt=value,failAt);await continueGame(p);await p.waitForFunction(()=>document.getElementById('prompt').textContent.includes('No se pudo guardar'));
   const blocked=await state(p);assert.equal(blocked.game.moves,0);assert.equal(blocked.pendingTurn?.steps??0,failAt==='step2'?1:failAt==='wall'?2:0);assert.match(await p.locator('#prompt').innerText(),/Inicio/);await p.waitForTimeout(150);assert.deepEqual(await state(p),blocked);
   await p.evaluate(()=>window.failAt=null);await p.locator('#home').click();await continueGame(p);await done(p,1);assert.equal((await state(p)).game.moves,1);assert.equal((await state(p)).pendingTurn,undefined);if(failAt!=='plan')assert.deepEqual((await state(p)).game,engine.applyTurn(game,plan.turn));report.storage.push({failAt,savedSteps:blocked.pendingTurn?.steps??0,recovered:true});await context.close();
  }
  // Plan inválido conserva el primer paso y se vuelve a calcular solo su sufijo.
  {
   const {p,context}=await create(),game=engine.initialState(),draft=advanceDraft(game,beginDraft(game),9),plan=makeCpuPlan(game,{actor:'A1',path:[8,9,16],to:23}),encoded=JSON.parse(encodeGameSave(game,draft,{control:control(),cpuPlan:plan}));encoded.cpuPlan.base='obsoleto';await fixture(p,JSON.stringify(encoded));assert.deepEqual((await state(p)).pendingTurn.path,[8,9]);assert.equal((await state(p)).cpuPlan,undefined);assert.match(await p.locator('#homeStatus').innerText(),/dañado/);await continueGame(p);await done(p,1);assert.deepEqual((await state(p)).game.lastMove.path.slice(0,2),[8,9]);await context.close();
  }
  report.suites.push({name:'Persistencia automática',passed:true,reloads:report.reloads,storage:report.storage});
  // Respuestas retardadas deliberadas: volver a Inicio o reemplazar la partida
  // invalida la búsqueda, aunque el mensaje antiguo llegue después.
  for(const action of ['home','new']){
   const {p,context}=await create(390,844,{fake:true});await fixture(p,encodeGameSave(engine.initialState(),beginDraft(engine.initialState()),{control:control()}));await p.evaluate(()=>window.fakeDelay=450);await continueGame(p);await p.waitForFunction(()=>m2.workers.length===1);await screenshot(p,`cpu-preparando-${action}`);
   if(action==='home'){
    await p.locator('#home').click();const before=await raw(p);await p.waitForTimeout(550);assert.equal(await raw(p),before);assert.equal((await state(p)).game.moves,0);assert.ok(await p.locator('#homeScreen').isVisible());await p.evaluate(()=>window.fakeDelay=0);await continueGame(p);await done(p,1);
   }else{
    await p.locator('#new').click();await p.locator('[data-control=local]').click();await p.locator('#startLocal').click();await idle(p);const before=await raw(p);await p.waitForTimeout(550);assert.equal(await raw(p),before);assert.equal((await state(p)).game.moves,0);assert.equal((await state(p)).control,undefined);
   }
   assert.ok(await p.evaluate(()=>m2.fakeTerminated>=1));await context.close();
  }
  {
   const {p,context}=await create(360,740,{fake:true}),game=engine.initialState();await fixture(p,encodeGameSave(game,beginDraft(game),{control:control()}));await p.evaluate(()=>window.fakeDelay=200);await continueGame(p);await p.waitForFunction(()=>m2.workers.length===1);await p.locator('#board').dispatchEvent('pointerdown',{clientX:150,clientY:300,pointerType:'touch'});await done(p,1);const saved=await raw(p);await p.locator('[data-wall]').first().dispatchEvent('click');assert.equal(await raw(p),saved);await context.close();
  }
  // Interrumpir una animación ya comprometida conserva su avance al ir a Inicio.
  {
   const {p,context}=await create(),game=engine.initialState(),turn={actor:'A1',path:[8,9,8],to:15};await fixture(p,encodeGameSave(game,beginDraft(game),{control:control(),cpuPlan:makeCpuPlan(game,turn)}));
   await p.evaluate(()=>document.addEventListener('DOMContentLoaded',()=>{}));
   await p.evaluate(()=>{const observer=new MutationObserver(()=>{if(JSON.parse(localStorage.getItem('wallgo-league-v2'))?.pendingTurn?.steps===1){observer.disconnect();document.getElementById('home').click();}});observer.observe(document.getElementById('board'),{subtree:true,attributes:true});});
   await p.locator('#continueGame').click();await p.locator('#homeScreen').waitFor();assert.equal((await state(p)).pendingTurn.steps,1);await p.waitForTimeout(250);assert.equal((await state(p)).pendingTurn.steps,1);await continueGame(p);await done(p,1);assert.deepEqual((await state(p)).game,engine.applyTurn(game,turn));await context.close();
  }
  // Alternativa cooperativa real, sin Worker y con movimiento reducido.
  {
   const {p,context}=await create(360,740,{noWorker:true,motion:'reduce'});await fixture(p,encodeGameSave(engine.initialState({turnMode:'team'}),beginDraft(engine.initialState({turnMode:'team'})),{control:control('advanced')}),{enter:true});await done(p,1);assert.equal(await p.evaluate(()=>document.getAnimations().length),0);assert.equal(await p.evaluate(()=>m2.workers.length),0);await context.close();
  }
  // Ayuda cerrada antes de terminar el paso: no deja el turno automático atascado.
  for(const opener of ['help','options']){
   const {p,context}=await create(),game=engine.initialState(),turn={actor:'A1',path:[8,9,16],to:23};await fixture(p,encodeGameSave(game,beginDraft(game),{control:control(),cpuPlan:makeCpuPlan(game,turn)}));
   await p.evaluate(opener=>{const observer=new MutationObserver(()=>{if(JSON.parse(localStorage.getItem('wallgo-league-v2'))?.pendingTurn?.steps===1){observer.disconnect();document.getElementById(opener).click();setTimeout(()=>document.getElementById(opener+'Dialog').close(),20);}});observer.observe(document.getElementById('board'),{subtree:true,attributes:true});},opener);
   await p.locator('#continueGame').click();await done(p,1);assert.deepEqual((await state(p)).game,engine.applyTurn(game,turn));await context.close();
  }
  {
   const {p,context}=await create(390,844),session=await context.newCDPSession(p);await session.send('Emulation.setCPUThrottlingRate',{rate:4});const game=engine.initialState({turnMode:'team'});await fixture(p,encodeGameSave(game,beginDraft(game),{control:control('advanced')}),{enter:true});await done(p,1);
   const audit=await p.evaluate(()=>m2),response=audit.responses.find(r=>r.data.result?.stats),start=audit.workers[0].at,frames=audit.frames.filter(f=>f.at>=start&&f.at<=response.at);assert.ok(frames.length>0);report.performance.push({level:'advanced',mode:'team',throttle:4,calculationMs:response.data.result.stats.calculationMs,roundTripMs:response.at-start,mainThreadFramesDuringCalculation:frames.length});await context.close();
  }
  report.suites.push({name:'Rendimiento y cancelación',passed:true,checks:'Cálculo real en Worker, respaldo cooperativo, descarte de mensajes atrasados, abandono/reinicio y pausa durante paso irreversible'});
  // Conquista real CPU, resultado humano/CPU/empate y exploración sin modificar guardado.
  {
   const {p,context}=await create(390,844),fixtureState=participationFixture(),turn={actor:fixtureState.before.currentActor,path:[engine.pieceById(fixtureState.before,fixtureState.before.currentActor).pos],to:fixtureState.to};
   await fixture(p,encodeGameSave(fixtureState.before,beginDraft(fixtureState.before),{control:control(),cpuPlan:makeCpuPlan(fixtureState.before,turn)}),{enter:true});await done(p,fixtureState.before.moves+1);assert.ok(await p.locator('[data-piece=A1] .marker-check').isVisible());assert.match(await p.locator('#recentEvent').innerText(),/ASEGURÓ SU TERRITORIO/);await screenshot(p,'cpu-territorio-asegurado');
   for(const [label,options] of [['victoria-cpu',{A:28,B:16}],['victoria-humana',{A:16,B:28}],['empate',{A:23,B:23}]]){
    const value=resultFixture(options),move=value.after.lastMove,turn={actor:move.actor,path:move.path,to:move.wall[1]};await fixture(p,encodeGameSave(value.before,beginDraft(value.before),{control:control(),cpuPlan:makeCpuPlan(value.before,turn)}),{enter:true});await p.waitForFunction(()=>!document.getElementById('endScreen').hidden&&document.getElementById('board').getAttribute('aria-busy')==='false');assert.deepEqual((await state(p)).game,value.after);assert.equal(await p.locator('#boardMeta').innerText(),'Tú B · CPU A');assert.equal(await p.locator('[data-explore-cell]').count(),49);assert.equal(await p.locator('[data-to],[data-wall],[data-actor]').count(),0);const saved=await raw(p);await hit(p,'[data-explore-cell="8"]',true);assert.equal(await raw(p),saved);await screenshot(p,label);await p.reload();assert.equal(await raw(p),saved);await continueGame(p);assert.equal(await raw(p),saved);assert.equal(await p.evaluate(()=>m2.workers.length),0);assert.equal(await p.evaluate(()=>document.getAnimations().length),0);
   }
   await context.close();
  }
  {
   const {p,context}=await create(740,360,{motion:'reduce'}),game=resultFixture().after;await fixture(p,encodeGameSave(game,beginDraft(game),{control:control('advanced')}),{enter:true});assert.deepEqual(await p.evaluate(()=>[document.documentElement.scrollWidth,document.documentElement.scrollHeight]),[740,360]);const layout=await p.evaluate(()=>{const guide=document.getElementById('guide').getBoundingClientRect(),meta=document.getElementById('boardMeta').getBoundingClientRect();return {guideRight:guide.right,metaLeft:meta.x,board:document.getElementById('board').getBoundingClientRect().width};});assert.ok(layout.guideRight<=layout.metaLeft);assert.equal(layout.board,240);await screenshot(p,'resultado-cpu-horizontal');await context.close();
  }
  // Autónomo: Worker Blob real sin servidor, decisión y recarga conservadas.
  {
   const {p,context}=await create(360,740);await p.goto(pathToFileURL(path.join(root,'Cerconexo_Premium_Listo_Para_Jugar.html')).href);await p.locator('#play').click();await p.locator('[data-control=cpu]').click();await p.locator('[name=humanTeam][value=B]').check();await p.locator('#startLocal').click();await done(p,1);assert.ok(await p.evaluate(()=>m2.workers[0].url.startsWith('blob:')));const saved=await raw(p);await p.reload();await continueGame(p);assert.equal(await raw(p),saved);await context.close();
  }
  report.suites.push({name:'Resultado, accesibilidad y autónomo',passed:true,checks:'Conquista, fichas aseguradas, victoria humana/CPU/empate, exploración y recarga sin animaciones antiguas; teclado/tacto y Worker Blob real file://'});
  assert.deepEqual(errors,[]);report.errors=errors;await fs.writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{await browser.close();await site.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
