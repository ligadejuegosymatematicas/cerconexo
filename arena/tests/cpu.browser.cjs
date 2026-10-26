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
 try{
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
