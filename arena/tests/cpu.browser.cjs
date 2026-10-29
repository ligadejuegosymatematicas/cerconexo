const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CERCONEXO_PLAYWRIGHT_PATH||'playwright');
(async()=>{
 const {startPagesServer}=await import('../../tests/pages-server.mjs'),{ARENA_SAVE_KEY:K}=await import('../src/session.mjs');
 const {ARENA_CPU_KEY:C}=await import('../src/cpuConfig.mjs');
 const site=await startPagesServer({entry:'arena/'}),browser=await chromium.launch({channel:process.env.CERCONEXO_BROWSER_CHANNEL||'msedge'});
 const out=path.resolve('validation/m5a/browser');await fs.mkdir(out,{recursive:true});const report={checks:[],layouts:[],errors:[],workerTimings:[]};
 const raw=p=>p.evaluate(k=>localStorage.getItem(k),K);
 const state=async p=>JSON.parse(await raw(p));
 const waitHuman=p=>p.waitForFunction(({K,C})=>{const r=localStorage.getItem(K),m=JSON.parse(localStorage.getItem(C)||'null');if(!r||!m)return false;const last=JSON.parse(r).commands.at(-1);return document.querySelector('[data-action]')&&document.querySelector('#arenaBoard').dataset.cpuThinking!=='true'&&last;},{K,C});
 async function begin(p,policy,human){
  await p.goto(site.url+'?new=1');await p.check('[name=opponent][value=cpu]');await p.check(`[name=policy][value=${policy}]`);await p.check(`[name=humanTeam][value=${human}]`);
  assert.equal(await p.locator('[name=mode][value=ffa]').isDisabled(),true);await p.click('#startArena');
 }
 async function keyboardDiagnosis(){
  const {execFileSync}=require('node:child_process'),{createHash}=require('node:crypto');
  const dir=path.join(out,'keyboard-diagnostic');await fs.mkdir(dir,{recursive:true});
  const refs=(process.env.CERCONEXO_KEYBOARD_REFS||'72d3abc,06416bd,5afd939').split(','),count=Number(process.env.CERCONEXO_KEYBOARD_REPEATS||24);
  const deferClose=process.env.CERCONEXO_KEYBOARD_DEFER_CLOSE==='1';
  const nativeClose=process.env.CERCONEXO_KEYBOARD_NATIVE_CLOSE==='1';
  const results={platform:process.platform,browser:browser.version(),viewport:[1280,560],deferClose,nativeClose,cases:[]};
  const instrumentation=`\nconst auditedArenaDispatch=ArenaSession.prototype.dispatch;ArenaSession.prototype.dispatch=function(action){window.arenaKeyboardRecord?.('session-enter',{action});try{const result=auditedArenaDispatch.call(this,action);window.arenaKeyboardRecord?.('session-exit',{action,revision:this.game.revision});return result;}catch(error){window.arenaKeyboardRecord?.('session-error',{error:error.message});throw error;}};`;
  for(const ref of refs){
   let app=execFileSync('git',['show',ref+':arena/src/app.mjs'],{encoding:'utf8'});
   const originalHash=createHash('sha256').update(app).digest('hex');
   app=app.replace('function dispatch(action,keyboard=false,automated=false){',`function dispatch(action,keyboard=false,automated=false){window.arenaKeyboardRecord?.('ui-dispatch',{action,keyboard,automated,busy,presentation:typeof presentation==='undefined'?false:presentation.active,loadBlocked,inspection:inspection.enabled,dialog:!!document.querySelector('dialog[open]'),owns:cpu.owns(session.game)});`);
   for(let iteration=0;iteration<count;iteration++){
    const ctx=await browser.newContext({viewport:{width:1280,height:560},hasTouch:false,isMobile:false,reducedMotion:'reduce'});
    const errors=[];let p;
    try{
     await ctx.tracing.start({screenshots:true,snapshots:true,sources:false});
     await ctx.route('**/arena/src/app.mjs',r=>r.fulfill({contentType:'text/javascript',body:app}));
     await ctx.route('**/arena/src/session.mjs',async r=>r.fulfill({contentType:'text/javascript',body:await fs.readFile('arena/src/session.mjs','utf8')+instrumentation}));
     await ctx.addInitScript(deferClose=>{
      const K='cerconexo-arena-m3a-v1';window.arenaKeyboardEvents=[];
      const describe=n=>{if(!n)return null;const r=n.getBoundingClientRect?.(),s=n.nodeType===1?getComputedStyle(n):null;return {tag:n.tagName,id:n.id,kind:n.getAttribute?.('data-kind'),cell:n.getAttribute?.('data-cell'),action:n.getAttribute?.('data-action'),connected:n.isConnected,visible:!!r&&r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none',disabled:n.disabled??n.getAttribute?.('aria-disabled'),rect:r?[r.x,r.y,r.width,r.height]:null};};
      window.arenaKeyboardRecord=(kind,extra={})=>{if(arenaKeyboardEvents.length>=160)return;const target=window.arenaKeyboardTarget;arenaKeyboardEvents.push({kind,at:performance.now(),active:describe(document.activeElement),target:describe(target),targetFocused:!!target&&document.activeElement===target,dialog:document.querySelector('#newDialog')?.open,visibility:document.visibilityState,raw:localStorage.getItem(K),...extra});};
      for(const type of ['focusin','focusout','keydown','keyup','close','visibilitychange'])document.addEventListener(type,e=>arenaKeyboardRecord(type,{key:e.key,isTrusted:e.isTrusted,eventTarget:describe(e.target)}),true);
      const set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){const result=set.call(this,k,v);if(k===K)arenaKeyboardRecord('saved',{value:v});return result;};
      if(deferClose){const add=EventTarget.prototype.addEventListener;EventTarget.prototype.addEventListener=function(type,listener,options){if(this.id==='newDialog'&&type==='close'){const dialog=this;return add.call(this,type,event=>{arenaKeyboardRecord('deferred-close');window.arenaPendingClose=()=>listener.call(dialog,event);},options);}return add.call(this,type,listener,options);};}
     },deferClose);
     p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(site.url+'?new=1');await p.check('[name=opponent][value=cpu]');
     await p.screenshot({path:path.join(dir,'latest-selector.png')});
     await p.locator('#startArena').boundingBox();await p.locator('#arenaCpuHint').boundingBox();await p.locator('#newDialog .dialog-body').boundingBox();
     await p.check('[name=humanTeam][value=A]');
     if(nativeClose)await p.evaluate(async()=>{const closed=new Promise(resolve=>document.querySelector('#newDialog').addEventListener('close',resolve,{once:true}));document.querySelector('#newForm').requestSubmit();window.arenaKeyboardTarget=document.querySelector('[data-kind=move]');arenaKeyboardTarget.focus();arenaKeyboardRecord('native-focused-before-close');await closed;arenaKeyboardRecord('native-close-complete');});
     else await p.click('#startArena');
     await p.locator('#arenaBoard').boundingBox();
     const to=await p.evaluate(()=>{window.framesCpu=[];window.samplingCpu=true;const sample=()=>{if(!samplingCpu)return;const b=document.querySelector('#arenaBoard').getBoundingClientRect();framesCpu.push([b.x,b.y,b.width,b.height]);requestAnimationFrame(sample);};requestAnimationFrame(sample);window.arenaKeyboardTarget=document.querySelector('[data-kind=move]');arenaKeyboardRecord('before-focus');return Number(arenaKeyboardTarget.dataset.cell);});
     const first=p.locator('[data-kind=move]').first();
     // Mismo orden de comandos que el caso original: ningún evaluate extra
     // entre focus y Enter. focusin/keydown registran el foco sin otra espera.
     if(!nativeClose)await first.focus();
     if(deferClose)await p.evaluate(()=>{arenaKeyboardRecord('release-close');const close=window.arenaPendingClose;window.arenaPendingClose=null;close?.();});
     await p.keyboard.press('Enter');const immediate=await state(p);await p.evaluate(()=>arenaKeyboardRecord('immediate-read'));
     let confirmed=true;
     try{await p.waitForFunction(({K,to})=>{const commands=JSON.parse(localStorage.getItem(K)||'null')?.commands;return commands?.length===1&&commands[0].type==='move'&&commands[0].to===to;},{K,to},{timeout:1500});}catch{confirmed=false;}
     const final=await state(p);await p.evaluate(()=>arenaKeyboardRecord('final-read'));
     const events=await p.evaluate(()=>arenaKeyboardEvents),outcome=immediate.commands.length===1?'immediate':confirmed?'delayed':'missing';
     const row={ref,originalHash,iteration,to,outcome,immediate,final,events,errors};results.cases.push(row);
     const name=`${ref}-${iteration}`;
     if(outcome!=='immediate'||errors.length){await p.screenshot({path:path.join(dir,name+'.png')});await ctx.tracing.stop({path:path.join(dir,name+'.zip')});await fs.writeFile(path.join(dir,name+'.json'),JSON.stringify(row,null,2));}
     else await ctx.tracing.stop();
    }finally{await ctx.close();}
   }
  }
  const summary=refs.map(ref=>({ref,cases:results.cases.filter(c=>c.ref===ref).length,immediate:results.cases.filter(c=>c.ref===ref&&c.outcome==='immediate').length,delayed:results.cases.filter(c=>c.ref===ref&&c.outcome==='delayed').length,missing:results.cases.filter(c=>c.ref===ref&&c.outcome==='missing').length}));
  results.summary=summary;await fs.writeFile(path.join(dir,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({platform:results.platform,browser:results.browser,viewport:results.viewport,summary},null,2));
 }
 async function presentationChecks(){
  const {createArena}=await import('../src/engine.mjs'),{arenaNeighbors,arenaWall}=await import('../src/geometry.mjs');
  const engine=await fs.readFile(path.resolve('arena/src/engine.mjs'),'utf8');
  for(const [width,height] of [[390,844],[360,740],[740,360]]){
   const seed=createArena({policy:'team'});seed.turn.actor='A1';seed.turn.path=[10];seed.walls=[arenaWall(10,11)];
   seed.inventories.A=[{id:'d',type:'demolition'},{id:'e',type:'extraWall'}];seed.drops=[{id:'j',type:'jump',cell:11}];
   const plan=[{type:'demolition',to:11,power:'d'},{type:'move',to:11},{type:'extraWall',to:12,power:'e'},{type:'jump',to:12,power:'j'},{type:'wall',to:21}];
   const ctx=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true});
   try{
    await ctx.route('**/arena/src/engine.mjs',route=>route.fulfill({contentType:'text/javascript',body:engine.replace('export function createArena(','function fixtureOriginalCreateArena(')+`\nexport function createArena(options={}){fixtureOriginalCreateArena(options);return structuredClone(${JSON.stringify(seed)});}`}));
    await ctx.addInitScript(plan=>{
     window.Worker=class{postMessage(r){setTimeout(()=>this.onmessage?.({data:{id:r.id,revision:r.game.revision,action:plan[r.game.revision]}}),0);}terminate(){}};
     window.cpuPresentationFrames=[];window.cpuPresentationEvents=[];
     const sample=()=>{const b=document.querySelector('#arenaBoard');if(b&&!document.querySelector('.arena-app').hidden){const r=b.getBoundingClientRect();cpuPresentationFrames.push([innerWidth,innerHeight,document.documentElement.scrollWidth,document.documentElement.scrollHeight,r.x,r.y,r.width,r.height,b.dataset.presentation,document.getAnimations().length]);}requestAnimationFrame(sample);};requestAnimationFrame(sample);
     document.addEventListener('DOMContentLoaded',()=>{const n=document.querySelector('#eventNotice');new MutationObserver(()=>cpuPresentationEvents.push({text:n.textContent,at:performance.now(),commands:JSON.parse(localStorage.getItem('cerconexo-arena-m3a-v1')||'{"commands":[]}').commands.length})).observe(n,{childList:true,subtree:true,characterData:true});});
    },plan);
    const p=await ctx.newPage();p.on('pageerror',e=>report.errors.push(e.message));await begin(p,'team','B');
    await p.waitForFunction(()=>document.querySelector('#arenaBoard').dataset.presentation==='demolition');
    assert.equal((await state(p)).commands.length,1,'Acción oficial guardada antes de animar');
    await p.waitForFunction(()=>document.querySelector('#arenaBoard').dataset.presentation==='pickup');
    assert.match(await p.locator('#eventNotice').textContent(),/recoge Salto/);assert.equal((await state(p)).commands.length,2);
    await p.screenshot({path:path.join(out,`presentacion-recogida-${width}x${height}.png`)});
    await waitHuman(p);
    const saved=await raw(p),events=await p.evaluate(()=>cpuPresentationEvents),frames=await p.evaluate(()=>cpuPresentationFrames);
    for(const text of [/usa Demolición/,/recoge Salto/,/usa Muro adicional/,/usa Salto/,/muro final/])assert.ok(events.some(e=>text.test(e.text)),text.toString());
    const stages=frames.map(f=>f[8]);for(const kind of ['demolition','move','pickup','extraWall','jump','wall'])assert.ok(stages.includes(kind));
    for(const f of frames){assert.deepEqual(f.slice(0,4),[width,height,width,height]);assert.deepEqual(f.slice(4,8),frames[0].slice(4,8));}
    const firstPerCommand=events.filter((e,i)=>i===0||e.commands!==events[i-1].commands);
    for(let i=1;i<firstPerCommand.length;i++)assert.ok(firstPerCommand[i].at-firstPerCommand[i-1].at>=340,'Acciones consecutivas distinguibles');
    report.checks.push({presentation:[width,height],events,frames:frames.length});
    await p.reload();await waitHuman(p);assert.equal(await raw(p),saved);
   }catch(error){
    const page=ctx.pages()[0];report.presentationFailure=page?await page.evaluate(()=>({board:{...document.querySelector('#arenaBoard').dataset},notice:document.querySelector('#eventNotice').textContent,problem:document.querySelector('#problem').textContent,events:window.cpuPresentationEvents,raw:localStorage.getItem('cerconexo-arena-m3a-v1')})):null;
    throw error;
   }finally{await ctx.close();}
  }
  // Descarte CPU: se nombra el poder que desaparece, no solo «inventario resuelto».
  const seed=createArena();seed.inventories.A1=[{id:'d',type:'demolition'}];seed.drops=[{id:'j',type:'jump',cell:11}];
  const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,reducedMotion:'reduce'});
  try{
   await ctx.route('**/arena/src/engine.mjs',route=>route.fulfill({contentType:'text/javascript',body:engine.replace('export function createArena(','function fixtureOriginalCreateArena(')+`\nexport function createArena(options={}){fixtureOriginalCreateArena(options);return structuredClone(${JSON.stringify(seed)});}`}));
   await ctx.addInitScript(()=>{const plan=[{type:'move',to:11},{type:'discard',owner:'A1',power:'d'},{type:'wall',to:12}];window.Worker=class{postMessage(r){setTimeout(()=>this.onmessage?.({data:{id:r.id,revision:r.game.revision,action:plan[r.game.revision]}}),0);}terminate(){}};});
   const p=await ctx.newPage();p.on('pageerror',e=>report.errors.push(e.message));await begin(p,'piece','B');
   await p.waitForFunction(()=>document.querySelector('#arenaBoard').dataset.presentation==='discard');
   assert.match(await p.locator('#eventNotice').textContent(),/A1 descarta Demolición/);
   assert.equal(await p.evaluate(()=>document.getAnimations().length),0);
   const saved=await raw(p);await p.click('#inspectToggle');await p.locator('[data-inspect="11"]').tap();assert.equal(await raw(p),saved);
   await p.click('#inspectToggle');await waitHuman(p);report.checks.push('Descarte con nombre, movimiento reducido, cancelación al inspeccionar sin deshacer');
  }finally{await ctx.close();}
  // Cierre territorial: turno humano bloqueado solo mientras se presenta el efecto.
  const closed=createArena();closed.drops=[];closed.walls=arenaNeighbors(11).map(n=>arenaWall(11,n));closed.inventories.A1=[{id:'j',type:'jump'}];
  for(const interrupt of ['guide','reload','new']){
  const c=await browser.newContext({viewport:{width:360,height:740}});
  try{
   await c.route('**/arena/src/engine.mjs',route=>route.fulfill({contentType:'text/javascript',body:engine.replace('export function createArena(','function fixtureOriginalCreateArena(')+`\nexport function createArena(options={}){fixtureOriginalCreateArena(options);return structuredClone(${JSON.stringify(closed)});}`}));
   await c.addInitScript(()=>{window.Worker=class{postMessage(r){setTimeout(()=>this.onmessage?.({data:{id:r.id,revision:r.game.revision,action:{type:'jump',to:11,power:'j'}}}),0);}terminate(){}};});
   const p=await c.newPage();p.on('pageerror',e=>report.errors.push(e.message));await begin(p,'piece','B');
   await p.waitForFunction(()=>document.querySelector('#arenaBoard').dataset.presentation==='territory');
   assert.match(await p.locator('#eventNotice').textContent(),/A1 asegura su territorio/);assert.equal(await p.locator('[data-action]').count(),0);
   const saved=await raw(p);if(interrupt==='guide')await p.screenshot({path:path.join(out,'presentacion-territorio-360x740.png')});
   if(interrupt==='guide'){await p.click('#guideOpen');await p.keyboard.press('Escape');assert.equal(await raw(p),saved);assert.ok(await p.locator('[data-action]').count()>0);}
   else if(interrupt==='reload'){await p.reload();await waitHuman(p);assert.equal(await raw(p),saved);}
   else {await p.click('#newOpen');assert.equal(await raw(p),saved);await p.check('[name=opponent][value=local]');await p.click('#startArena');assert.equal((await state(p)).commands.length,0);}
   assert.equal(await p.locator('[data-cpu-effect]').count(),0);assert.equal(await p.locator('#arenaBoard').getAttribute('data-presentation'),null);
   report.checks.push(`Territorio visible; ${interrupt} durante presentación no repite acciones ni deja efectos`);
  }finally{await c.close();}
  }
 }
 try{
 if(process.argv.includes('--keyboard-diagnostic')){await keyboardDiagnosis();return;}
 await presentationChecks();
 for(const [width,height] of [[1440,900],[1366,768],[1366,600],[1280,560],[390,844],[360,740],[740,360]]){
  const ctx=await browser.newContext({viewport:{width,height},hasTouch:width<800,isMobile:width<800,reducedMotion:'reduce'}),p=await ctx.newPage();p.on('pageerror',e=>report.errors.push(e.message));
  await ctx.addInitScript(()=>{window.cpuTimes=[];const Native=window.Worker;window.Worker=class extends Native{constructor(...args){const start=performance.now();super(...args);this.addEventListener('message',()=>cpuTimes.push(performance.now()-start));}};});
  await p.goto(site.url+'?new=1');await p.check('[name=opponent][value=cpu]');
  assert.equal(await p.locator('#humanTeamField').isVisible(),true);assert.equal(await p.locator('[name=mode][value=ffa]').isDisabled(),true);
  await p.screenshot({path:path.join(out,`selector-${width}x${height}.png`)});
  const start=await p.locator('#startArena').boundingBox();assert.ok(start.y+start.height<=height&&start.height>=44);
  const hint=await p.locator('#arenaCpuHint').boundingBox(),body=await p.locator('#newDialog .dialog-body').boundingBox();assert.ok(hint.y+hint.height<=body.y+body.height,'Inicio CPU legible sin recorte');
  await p.check('[name=humanTeam][value=A]');await p.click('#startArena');
  const baseline=await p.locator('#arenaBoard').boundingBox();
  await p.evaluate(()=>{window.framesCpu=[];window.samplingCpu=true;const sample=()=>{if(!samplingCpu)return;const b=document.querySelector('#arenaBoard').getBoundingClientRect();framesCpu.push([document.documentElement.scrollWidth,document.documentElement.scrollHeight,b.x,b.y,b.width,b.height]);requestAnimationFrame(sample);};requestAnimationFrame(sample);});
  const first=p.locator('[data-kind=move]').first();if(width<800)await first.tap();else{await first.focus();await p.keyboard.press('Enter');}
  const steps=await state(p);assert.equal(steps.commands.at(-1).type,'move');await p.reload();assert.equal((await state(p)).commands.at(-1).type,'move');
  await p.evaluate(()=>{window.framesCpu=[];window.samplingCpu=true;const sample=()=>{if(!samplingCpu)return;const b=document.querySelector('#arenaBoard').getBoundingClientRect();framesCpu.push([document.documentElement.scrollWidth,document.documentElement.scrollHeight,b.x,b.y,b.width,b.height]);requestAnimationFrame(sample);};requestAnimationFrame(sample);});
  await p.click('[data-kind=wall]');
  // Pausa explícita durante el turno CPU; ninguna acción avanza al consultar.
  await p.click('#inspectToggle');const paused=await raw(p);await p.locator('[data-inspect="10"]').click();
  await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));assert.equal(await raw(p),paused);
  await p.click('#guideOpen');await p.keyboard.press('Escape');assert.equal(await raw(p),paused);
  await p.click('#inspectToggle');await waitHuman(p);
  assert.match(await p.locator('#turnTitle').textContent(),/Equipo A/);assert.ok((await state(p)).commands.some(a=>a.type==='wall'));
  const rect=await p.locator('#arenaBoard').boundingBox();assert.equal(rect.width,baseline.width);assert.equal(rect.height,baseline.height);
  const size=await p.evaluate(()=>[document.documentElement.scrollWidth,document.documentElement.scrollHeight]);assert.deepEqual(size,[width,height]);
  const frames=await p.evaluate(()=>{samplingCpu=false;return framesCpu;});assert.ok(frames.length);
  for(const f of frames){assert.deepEqual(f.slice(0,2),[width,height]);assert.deepEqual(f.slice(2),[baseline.x,baseline.y,baseline.width,baseline.height]);}
  await p.screenshot({path:path.join(out,`arena-cpu-${width}x${height}.png`)});
  report.workerTimings.push(...await p.evaluate(()=>cpuTimes));report.layouts.push({viewport:[width,height],board:rect,frames:frames.length});await ctx.close();
 }
 for(const policy of ['piece','team'])for(const human of ['A','B']){
  const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true}),p=await ctx.newPage();p.on('pageerror',e=>report.errors.push(e.message));
  await begin(p,policy,human);
  if(human==='A'){
   if(policy==='team'){await p.locator('[data-kind=select][data-cell="70"]').focus();await p.keyboard.press('Enter');}
   await p.locator('[data-kind=wall]').first().tap();
  }
  await waitHuman(p);assert.match(await p.locator('#turnTitle').innerText(),new RegExp('Equipo '+human));
  const previous=await raw(p);await p.reload();await waitHuman(p);assert.equal(await raw(p),previous);assert.match(await p.locator('#turnTitle').innerText(),new RegExp('Equipo '+human));
  await p.click('#newOpen');assert.equal(await p.locator(`[name=opponent][value=cpu]`).isChecked(),true);assert.equal(await p.locator(`[name=humanTeam][value=${human}]`).isChecked(),true);assert.equal(await raw(p),previous);
  await p.keyboard.press('Escape');await p.waitForFunction(()=>document.documentElement.dataset.portalReady==='true');assert.equal(await raw(p),previous);
  report.checks.push(`${policy}, humano ${human}: turno CPU, recuperación, configuración, cancelación sin reemplazo`);await ctx.close();
 }
 // Fixture de resolución del motor: una CPU A no puede resolver el descarte de B.
 const {createArena,applyArena}=await import('../src/engine.mjs'),{arenaNeighbors,arenaWall}=await import('../src/geometry.mjs');
 let pending=createArena({policy:'team'});pending.drops=[];pending.pieces=[{id:'A1',team:'A',pos:10},{id:'B1',team:'B',pos:9},{id:'A2',team:'A',pos:70},{id:'B2',team:'B',pos:64}];
 pending.walls=[...new Set([9,10].flatMap(c=>arenaNeighbors(c).filter(n=>![9,10].includes(n)).map(n=>arenaWall(c,n))))];
 pending.turn={team:'A',actor:'A1',steps:0,path:[10],committed:false,actions:0};pending.inventories.A=[{id:'j',type:'jump'}];pending.inventories.B=[{id:'b1',type:'jump'},{id:'b2',type:'demolition'}];pending=applyArena(pending,{type:'jump',to:11,power:'j'});
 for(const human of ['A','B']){
  const ctx=await browser.newContext({viewport:{width:390,height:844}});
  // Solo cambia la fábrica de fixtures en la respuesta del servidor de prueba; motor del paquete intacto.
  const engine=await fs.readFile(path.resolve('arena/src/engine.mjs'),'utf8');
  await ctx.route('**/arena/src/engine.mjs',route=>route.fulfill({contentType:'text/javascript',body:engine.replace('export function createArena(','function fixtureOriginalCreateArena(')+`\nexport function createArena(options={}){fixtureOriginalCreateArena(options);return structuredClone(${JSON.stringify(pending)});}`}));
  const p=await ctx.newPage();p.on('pageerror',e=>report.errors.push(e.message));await begin(p,'team',human);
  if(human==='B'){
   await p.locator('[data-discard=b1]').waitFor();assert.equal(await p.locator('[data-discard=b1]').isEnabled(),true);const before=await raw(p);
   await p.click('#inspectToggle');await p.locator('[data-inspect="11"]').click();assert.equal(await raw(p),before);await p.click('#inspectToggle');
   await p.click('[data-discard=b1]');await waitHuman(p);assert.match(await p.locator('#turnTitle').textContent(),/Equipo B/);
  }else{
   await p.waitForFunction(()=>document.querySelector('#arenaBoard').dataset.presentation==='discard');
   assert.equal(await p.locator('#turnTitle').textContent(),'Equipo B');
   await p.waitForFunction(k=>JSON.parse(localStorage.getItem(k)).commands.some(a=>a.type==='discard'),K);
   await waitHuman(p);assert.match(await p.locator('#turnTitle').textContent(),/Equipo A/);
  }
  report.checks.push(`Descarte del equipo B: ${human==='B'?'decisión humana y reanudación CPU A':'decisión CPU B y retorno al humano A'}`);await ctx.close();
 }
 // El mismo HTML autónomo usa Worker Blob y dispone de alternativa sin Worker.
 for(const worker of [true,false]){
  const dir=path.join(out,'profile-'+worker);const ctx=await chromium.launchPersistentContext(dir,{channel:process.env.CERCONEXO_BROWSER_CHANNEL||'msedge',viewport:{width:390,height:844}});
  if(!worker)await ctx.addInitScript(()=>{window.Worker=class{constructor(){throw Error('Worker no disponible en esta prueba');}};});
  const p=await ctx.newPage();p.on('pageerror',e=>report.errors.push(e.message));await p.goto(pathToFileURL(path.resolve('offline/Cerconexo_Arena.html')).href+'?new=1');
  await p.check('[name=opponent][value=cpu]');await p.check('[name=humanTeam][value=B]');await p.click('#startArena');await waitHuman(p);
  assert.match(await p.locator('#turnTitle').innerText(),/Equipo B/);const before=await raw(p);await p.reload();await waitHuman(p);assert.equal(await raw(p),before);
  report.checks.push(`HTML file:// perfil persistente, Worker ${worker?'Blob':'alternativa acotada'} y recarga`);await ctx.close();
 }
 assert.deepEqual(report.errors,[]);report.ok=true;await fs.writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2));console.log('PASS M5-A: selector y CPU, siete resoluciones, A/B y políticas, pausa, recarga, HTML con/sin Worker.');
 }catch(e){report.error=e.stack;await fs.writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2));throw e;}finally{await browser.close();await site.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
