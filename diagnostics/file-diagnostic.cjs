// Instrumentación temporal: ejecución directa aislada o preload de la suite existente.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CERCONEXO_PLAYWRIGHT_PATH||'playwright');
const root=path.resolve(process.env.CERCONEXO_PROBE_ROOT||process.cwd()),out=path.resolve(process.env.CERCONEXO_FILE_AUDIT_OUT||'validation/m5a1-file');
const tag=process.env.CERCONEXO_FILE_AUDIT_TAG||'isolated',key='wallgo-league-v2';
const report={platform:process.platform,tag,cases:[],events:[],errors:[]};
process.on('exit',()=>{fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,tag+'.json'),JSON.stringify(report,null,2));});
function instrument(){
 const record=(kind,extra={})=>{if(location.protocol!=='file:')return;console.debug('__FILE_AUDIT__'+JSON.stringify({kind,time:performance.now(),url:location.href,ready:document.readyState,raw:localStorage.getItem('wallgo-league-v2'),seedBefore:window.historicalSeedBefore,label:document.getElementById('matchupLabel')?.textContent,busy:document.getElementById('board')?.getAttribute('aria-busy'),...extra}));};
 window.recordFileAudit=record;record('init');
 const put=Storage.prototype.setItem,remove=Storage.prototype.removeItem;
 Storage.prototype.setItem=function(k,v){const result=put.call(this,k,v);if(k==='wallgo-league-v2')record('set',{value:v,stack:new Error().stack});return result;};
 Storage.prototype.removeItem=function(k){const result=remove.call(this,k);if(k==='wallgo-league-v2')record('remove');return result;};
 const text=Object.getOwnPropertyDescriptor(HTMLElement.prototype,'innerText');
 Object.defineProperty(HTMLElement.prototype,'innerText',{...text,get(){const value=text.get.call(this);if(this.id==='matchupLabel')record('query-label',{value});return value;}});
 for(const type of ['pointerdown','click'])document.addEventListener(type,e=>record(type,{wall:e.target.closest?.('[data-wall]')?.getAttribute('data-wall'),active:document.activeElement?.id}),true);
 document.addEventListener('DOMContentLoaded',()=>{record('DOMContentLoaded');const n=document.getElementById('matchupLabel');if(n)new MutationObserver(()=>record('label-mutation')).observe(n,{childList:true,characterData:true,subtree:true});});
 window.addEventListener('load',()=>record('load'));window.addEventListener('pagehide',()=>record('pagehide'));
}
async function auditBrowser(browser){
 const create=browser.newContext.bind(browser);let count=0;
 browser.newContext=async options=>{
  const ctx=await create(options);await ctx.addInitScript(instrument);
  const newPage=ctx.newPage.bind(ctx);ctx.newPage=async()=>{
   const p=await newPage(),id=++count;
   p.on('console',m=>{if(m.text().startsWith('__FILE_AUDIT__')){try{report.events.push({page:id,...JSON.parse(m.text().slice('__FILE_AUDIT__'.length))});}catch(e){report.errors.push(String(e));}}});
   p.on('pageerror',e=>report.errors.push({page:id,error:e.message}));
   const reload=p.reload.bind(p);p.reload=async(...args)=>{
    if(p.url().startsWith('file:'))await p.evaluate(()=>window.recordFileAudit?.('test-before-reload'));
    const result=await reload(...args);
    if(p.url().startsWith('file:'))await p.evaluate(()=>window.recordFileAudit?.('test-after-native-reload'));
    return result;
   };return p;
  };return ctx;
 };return browser;
}
if(require.main!==module){
 const launch=chromium.launch.bind(chromium);chromium.launch=async(...args)=>auditBrowser(await launch(...args));
}else (async()=>{
 fs.mkdirSync(out,{recursive:true});
 const {participationFixture}=await import(pathToFileURL(path.join(root,'tests/participation-fixtures.mjs')).href),{decodeGameSave}=await import(pathToFileURL(path.join(root,'src/gameSave.mjs')).href);
 const fixture=participationFixture(),before=JSON.stringify({game:fixture.before});
 const native=await auditBrowser(await chromium.launch({headless:true,channel:process.env.CERCONEXO_BROWSER_CHANNEL||'chromium'}));
 const browser=await require(path.join(root,'tests/navigation.cjs')).historicalBrowser(native);report.browser=browser.version();
 try{
  for(let i=0;i<12;i++){
   const ctx=await browser.newContext({viewport:{width:360,height:740},hasTouch:true,reducedMotion:'reduce'}),p=await ctx.newPage();
   await ctx.tracing.start({screenshots:true,snapshots:true,sources:false});
   const snap=()=>p.evaluate(key=>({time:performance.now(),ready:document.readyState,raw:localStorage.getItem(key),seedBefore:window.historicalSeedBefore,label:document.getElementById('matchupLabel')?.textContent,busy:document.getElementById('board')?.getAttribute('aria-busy')}),key);
   await p.goto(pathToFileURL(path.join(root,'Cerconexo_Premium_Listo_Para_Jugar.html')).href);await p.locator('#help').click();await p.keyboard.press('Escape');
   await p.evaluate(({key,before})=>{localStorage.removeItem(key);localStorage.setItem(key,before);},{key,before});
   const seeded=await snap();await p.reload();await p.waitForFunction(()=>document.getElementById('board').getAttribute('aria-busy')==='false');await p.evaluate(()=>Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{}))));
   const reconstructed=await snap(),b=await p.locator(`[data-wall="${fixture.to}"]`).boundingBox();assert.ok(b);
   await p.touchscreen.tap(b.x+b.width/2,b.y+b.height/2);await p.waitForFunction(()=>document.getElementById('board').getAttribute('aria-busy')==='false');
   const queried=await p.locator('#matchupLabel').innerText(),after=await snap();
   await p.evaluate(()=>new Promise(requestAnimationFrame));const nextFrame=await snap();
   const decoded=decodeGameSave(after.raw),result={iteration:i,seeded,reconstructed,queried,after,nextFrame,loadExact:reconstructed.raw===before,gameExact:JSON.stringify(decoded.game)===JSON.stringify(fixture.after)};
   result.ok=result.loadExact&&result.gameExact&&queried==='1 vs. 2';report.cases.push(result);
   if(!result.ok||i===0){await p.screenshot({path:path.join(out,tag+'-'+i+'.png')});await ctx.tracing.stop({path:path.join(out,tag+'-'+i+'.zip')});}else await ctx.tracing.stop();
   await ctx.close();
  }
 }finally{await browser.close();}
 console.log(JSON.stringify({tag,cases:report.cases.length,passed:report.cases.filter(c=>c.ok).length,errors:report.errors,events:report.events.length}));
})().catch(e=>{report.errors.push(e.stack);console.error(e);process.exitCode=1;});
