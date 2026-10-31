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
 async function inputFailure(p,expected,error){
  const snapshot=await p.evaluate(K=>{const a=document.activeElement;return {active:{id:a?.id,tag:a?.tagName,kind:a?.getAttribute('data-kind'),cell:a?.getAttribute('data-cell')},dialog:document.querySelector('#newDialog').open,board:{...document.querySelector('#arenaBoard').dataset},raw:localStorage.getItem(K),events:window.arenaInputAudit??[]};},K);
  report.inputFailure={expected,...snapshot};await p.screenshot({path:path.join(out,'input-failure.png')});
  await p.context().tracing.stop({path:path.join(out,'input-failure.zip')}).catch(()=>{});
  throw new Error(`No se confirmó la acción ${JSON.stringify(expected)} en el diario (1500 ms). ${JSON.stringify(snapshot)}`,{cause:error});
 }
 async function confirmAction(p,expected){
  try{
   await p.waitForFunction(({K,expected})=>{const saved=JSON.parse(localStorage.getItem(K)||'{"commands":[]}');return saved.commands.length===1&&Object.entries(expected).every(([key,value])=>saved.commands[0][key]===value);},{K,expected},{timeout:1500});
   const saved=await state(p);assert.deepEqual(saved.commands,[expected]);return saved;
  }catch(error){
   await inputFailure(p,expected,error);
  }
 }
 async function nativeCloseFocusRegression(){
  for(const [policy,input] of [['piece','keyboard'],['team','keyboard'],['piece','touch']]){
   const ctx=await browser.newContext({viewport:{width:1280,height:560},hasTouch:input==='touch',reducedMotion:'reduce'});
   try{
    const p=await ctx.newPage();p.on('pageerror',e=>report.errors.push(e.message));await p.goto(site.url+'?new=1');await p.check('[name=opponent][value=cpu]');await p.check(`[name=policy][value=${policy}]`);await p.check('[name=humanTeam][value=A]');
    const focus=await p.evaluate(async policy=>{
     const dialog=document.querySelector('#newDialog'),closed=new Promise(resolve=>dialog.addEventListener('close',resolve,{once:true}));
     document.querySelector('#newForm').requestSubmit();
     const target=document.querySelector(policy==='piece'?'[data-kind=move]':'[data-kind=select]');target.focus();
     const before={connected:target.isConnected,visible:target.getBoundingClientRect().width>0,focused:document.activeElement===target};
     const expected=policy==='piece'?{type:'move',to:Number(target.dataset.cell)}:{type:'select',actor:'A1'};
     await closed;return {before,focusedAfterClose:document.activeElement===target,activeId:document.activeElement.id,expected};
    },policy);
    if(!focus.focusedAfterClose)await p.screenshot({path:path.join(out,'close-focus-failure.png')});
    assert.deepEqual(focus.before,{connected:true,visible:true,focused:true});assert.equal(focus.focusedAfterClose,true,JSON.stringify(focus));
    if(input==='touch')await p.locator('[data-kind=move]').first().tap();else await p.keyboard.press('Enter');
    await confirmAction(p,focus.expected);(report.closeFocus??=[]).push({policy,input,viewport:[1280,560],...focus});
    if(policy==='piece'&&input==='keyboard')await p.screenshot({path:path.join(out,'keyboard-confirmed-1280x560.png')});
    report.checks.push(`1280x560 ${policy}/${input}: close nativo tardío conserva foco y confirma una sola acción`);
   }finally{await ctx.close();}
  }
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
 async function manualDiscardChecks(){
  const {createArena,applyArena}=await import('../src/engine.mjs'),{arenaNeighbors,arenaWall,analyzeArena}=await import('../src/geometry.mjs');
  const engine=await fs.readFile(path.resolve('arena/src/engine.mjs'),'utf8');
  const scenarios=[];
  for(const [width,height] of [[1440,900],[1366,768],[1366,600],[1280,560],[390,844],[360,740],[740,360]])scenarios.push({name:'pickup-team',policy:'team',width,height});
  scenarios.push({name:'pickup-piece',policy:'piece',width:360,height:740},{name:'pickup-four',policy:'piece',mode:'ffa',width:390,height:844});
  for(const [width,height] of [[360,740],[740,360]])scenarios.push({name:'capacity-human',policy:'team',width,height});
  for(const cfg of scenarios){
   const {width,height,policy}=cfg,capacity=cfg.name==='capacity-human';
   let seed=createArena({policy,mode:cfg.mode??'duo'});
   if(capacity){
    seed.drops=[];seed.pieces=[{id:'A1',team:'A',pos:10},{id:'B1',team:'B',pos:9},{id:'A2',team:'A',pos:70},{id:'B2',team:'B',pos:64}];
    seed.walls=[...new Set([9,10].flatMap(c=>arenaNeighbors(c).filter(n=>![9,10].includes(n)).map(n=>arenaWall(c,n))))];
    seed.turn={team:'A',actor:'A1',steps:0,path:[10],committed:false,actions:0};seed.inventories.A=[{id:'j',type:'jump'}];seed.inventories.B=[{id:'keep',type:'jump'},{id:'other',type:'demolition'}];
    seed=applyArena(seed,{type:'jump',to:11,power:'j'});
   }else{
    const actor=seed.turn.actor??'A1',owner=policy==='team'?'A':actor;
    if(!seed.turn.actor){seed.turn.actor=actor;seed.turn.path=[10];}
    seed.inventories[owner]=[{id:'keep',type:'demolition'},...(policy==='team'?[{id:'other',type:'extraWall'}]:[])];
    seed.drops=[{id:'picked',type:'jump',cell:11}];seed=applyArena(seed,{type:'move',to:11});
   }
   assert.ok(seed.pending);const owner=seed.pending.owner,original=JSON.stringify(seed),view=analyzeArena(seed);
   const ctx=await browser.newContext({viewport:{width,height},hasTouch:width<800,isMobile:width<800,reducedMotion:width===360?'reduce':'no-preference'});
   try{
    await ctx.route('**/arena/src/engine.mjs',route=>route.fulfill({contentType:'text/javascript',body:engine.replace('export function createArena(','function fixtureOriginalCreateArena(')+`\nexport function createArena(options={}){fixtureOriginalCreateArena(options);return structuredClone(${JSON.stringify(seed)});}`}));
    const p=await ctx.newPage();p.on('pageerror',e=>report.errors.push(e.message));await p.goto(site.url+'?new=1');
    await p.check(`[name=opponent][value=${capacity?'cpu':'local'}]`);if(cfg.mode==='ffa')await p.check('[name=mode][value=ffa]');else await p.check(`[name=policy][value=${policy}]`);
    if(capacity)await p.check('[name=humanTeam][value=B]');await p.click('#startArena');
    await p.waitForFunction(()=>document.querySelector('.arena-app').classList.contains('manual-discard'));
    assert.equal(await p.locator('#discardNotice').innerText(),'¡Debes descartar un poder!');assert.equal(await p.locator('#decisionTitle').innerText(),`Decide ${owner}`);assert.equal(await p.locator('#decisionDescription').innerText(),'Selecciona qué poder deseas descartar para continuar jugando.');
    const panel=await p.locator('#decisionPanel').boundingBox(),box=await p.locator('#arenaBoard').boundingBox();assert.ok(panel.y>=0&&panel.y+panel.height<=height,JSON.stringify({cfg,panel}));
    for(const b of await p.locator('[data-discard]').all()){
     const r=await b.boundingBox();assert.ok(r.y>=0&&r.y+r.height<=height&&r.height>=44);assert.equal(await b.isEnabled(),true);
     assert.ok(await b.evaluate(n=>n.scrollWidth<=n.clientWidth&&n.scrollHeight<=n.clientHeight),'Texto de descarte completo');
    }
    assert.deepEqual(await p.evaluate(()=>[document.documentElement.scrollWidth,document.documentElement.scrollHeight]),[width,height],JSON.stringify(cfg));
    const saved=await raw(p);assert.equal((await state(p)).commands.length,0);assert.equal(await p.evaluate(()=>document.activeElement.id),'discardNotice');
    await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));assert.equal(await raw(p),saved,'No descartar automáticamente');
    if(width===360)assert.equal(await p.locator('#decisionPanel').evaluate(n=>n.getAnimations().length),0);
    await p.screenshot({path:path.join(out,`descarte-${cfg.name}-${width}x${height}.png`)});
    await p.reload();await p.waitForFunction(()=>document.querySelector('.arena-app').classList.contains('manual-discard'));assert.equal(await raw(p),saved);
    await p.keyboard.press('Tab');assert.equal(await p.evaluate(()=>document.activeElement.dataset.discard),'keep');await p.keyboard.press('Enter');
    await p.waitForFunction(()=>document.querySelector('#decisionPanel').hidden&&!document.querySelector('.arena-app').classList.contains('manual-discard'));
    if(capacity)await waitHuman(p);
    const after=await state(p);assert.deepEqual(after.commands[0],{type:'discard',owner,power:'keep'});assert.equal(after.commands.filter(a=>a.type==='discard').length,1);
    if(!capacity){assert.equal(after.commands.length,1);assert.equal(await p.evaluate(()=>!!document.activeElement.dataset.action||document.activeElement.id==='turnBanner'),true);}
    assert.equal((await p.locator('#arenaBoard').boundingBox()).width,box.width,'No reducir el tablero');
    assert.equal(JSON.stringify(seed),original);assert.equal(view.score.shared,analyzeArena(seed).score.shared);
    (report.manualDiscards??=[]).push({name:cfg.name,policy,viewport:[width,height],panel,board:box,owner,options:seed.inventories[owner].length,commands:after.commands,restored:true});
   }finally{await ctx.close();}
  }
 }
 try{
 await manualDiscardChecks();
 if(process.argv.includes('--discard')){assert.deepEqual(report.errors,[]);report.ok=true;await fs.writeFile(path.join(out,'discard-results.json'),JSON.stringify(report,null,2));console.log('PASS descarte manual: once vistas, recolección/capacidad, cuatro equipos, CPU interrumpida, teclado y recarga.');return;}
 await nativeCloseFocusRegression();
 await presentationChecks();
 for(const [width,height] of [[1440,900],[1366,768],[1366,600],[1280,560],[390,844],[360,740],[740,360]]){
  const ctx=await browser.newContext({viewport:{width,height},hasTouch:width<800,isMobile:width<800,reducedMotion:'reduce'}),p=await ctx.newPage();p.on('pageerror',e=>report.errors.push(e.message));
  if(width===1280)await ctx.tracing.start({screenshots:true,snapshots:true,sources:false});
  await ctx.addInitScript(()=>{window.arenaInputAudit=[];for(const type of ['focusin','focusout','keydown','keyup','close'])document.addEventListener(type,e=>{if(arenaInputAudit.length<80)arenaInputAudit.push({type,key:e.key,id:e.target.id,kind:e.target.getAttribute?.('data-kind'),cell:e.target.getAttribute?.('data-cell'),activeId:document.activeElement?.id});},true);});
  await ctx.addInitScript(()=>{window.cpuTimes=[];const Native=window.Worker;window.Worker=class extends Native{constructor(...args){const start=performance.now();super(...args);this.addEventListener('message',()=>cpuTimes.push(performance.now()-start));}};});
  await p.goto(site.url+'?new=1');await p.check('[name=opponent][value=cpu]');
  assert.equal(await p.locator('#humanTeamField').isVisible(),true);assert.equal(await p.locator('[name=mode][value=ffa]').isDisabled(),true);
  await p.screenshot({path:path.join(out,`selector-${width}x${height}.png`)});
  const start=await p.locator('#startArena').boundingBox();assert.ok(start.y+start.height<=height&&start.height>=44);
  const hint=await p.locator('#arenaCpuHint').boundingBox(),body=await p.locator('#newDialog .dialog-body').boundingBox();assert.ok(hint.y+hint.height<=body.y+body.height,'Inicio CPU legible sin recorte');
  await p.check('[name=humanTeam][value=A]');await p.click('#startArena');
  const baseline=await p.locator('#arenaBoard').boundingBox();
  await p.evaluate(()=>{window.framesCpu=[];window.samplingCpu=true;const sample=()=>{if(!samplingCpu)return;const b=document.querySelector('#arenaBoard').getBoundingClientRect();framesCpu.push([document.documentElement.scrollWidth,document.documentElement.scrollHeight,b.x,b.y,b.width,b.height]);requestAnimationFrame(sample);};requestAnimationFrame(sample);});
  const first=p.locator('[data-kind=move]').first(),to=Number(await first.getAttribute('data-cell'));
  try{
   assert.equal(await first.isVisible(),true);assert.equal(await first.isEnabled(),true);
   if(width<800)await first.tap();else{await first.focus();assert.equal(await first.evaluate(n=>n.isConnected&&document.activeElement===n),true,'El movimiento debe conservar el foco antes de Enter');await p.keyboard.press('Enter');}
   await confirmAction(p,{type:'move',to});
  }catch(error){if(!report.inputFailure)await inputFailure(p,{type:'move',to},error);throw error;}
  await p.reload();assert.deepEqual((await state(p)).commands,[{type:'move',to}]);
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
  report.workerTimings.push(...await p.evaluate(()=>cpuTimes));report.layouts.push({viewport:[width,height],board:rect,frames:frames.length});if(width===1280)await ctx.tracing.stop();await ctx.close();
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
