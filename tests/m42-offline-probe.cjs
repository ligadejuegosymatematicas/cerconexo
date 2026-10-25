const fs=require('node:fs/promises'),path=require('node:path'),{pathToFileURL}=require('node:url'),{chromium}=require(process.env.CERCONEXO_PLAYWRIGHT_PATH||'playwright');
(async()=>{const out=path.resolve('validation/m42/browser/offline-probe');await fs.mkdir(out,{recursive:true});const report=[],channel=process.env.CERCONEXO_BROWSER_CHANNEL||'msedge';
const minimal=path.join(out,'minimal.html');await fs.writeFile(minimal,'<!doctype html><meta charset="utf-8"><title>Storage probe</title><p>Sin motor ni interfaz de juego</p>');
for(const persistent of [false,true]){
 let browser,context;const options={viewport:{width:390,height:844},hasTouch:true,reducedMotion:'reduce',channel,headless:true};
 if(persistent)context=await chromium.launchPersistentContext(await fs.mkdtemp(path.join(out,'profile-')),options);else{browser=await chromium.launch({channel});context=await browser.newContext(options);}
 try{const p=await context.newPage();
 for(const kind of ['minimal','game']){
  const url=pathToFileURL(kind==='minimal'?minimal:path.resolve('Cerconexo_Premium_Listo_Para_Jugar.html')).href;await p.goto(url);const key='wallgo-league-v2',events=[];
  if(kind==='minimal'){
   for(let i=0;i<20;i++){const value=JSON.stringify({game:{moves:i+1}});await p.evaluate(({key,value})=>{localStorage.clear();localStorage.setItem(key,value);},{key,value});await p.reload();const raw=await p.evaluate(key=>localStorage.getItem(key),key);events.push({i,expected:value,raw});if(raw!==value)break;}
  }else{
   await p.locator('#play').click();await p.locator('#startLocal').click();await p.waitForFunction(()=>document.getElementById('board').getAttribute('aria-busy')==='false');
   for(let i=0;i<5;i++){const wall=p.locator('[data-wall]').first(),r=await wall.boundingBox();await p.touchscreen.tap(r.x+r.width/2,r.y+r.height/2);await p.waitForFunction(()=>document.getElementById('board').getAttribute('aria-busy')==='false');const before=await p.evaluate(key=>localStorage.getItem(key),key);await p.reload();await p.waitForFunction(()=>document.getElementById('board').hasAttribute('aria-busy'));const raw=await p.evaluate(key=>localStorage.getItem(key),key);events.push({i,expected:before,raw});if(raw!==before)break;if(!await p.locator('#homeScreen').evaluate(n=>n.hidden))await p.locator('#continueGame').click();}
  }
  report.push({kind,persistent,browser:context.browser()?.version(),events,ok:events.every(e=>e.raw===e.expected)});
 }
 }finally{await context.close();await browser?.close();}
}
await fs.writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report.map(({events,...r})=>({...r,cycles:events.length,failure:events.find(e=>e.raw!==e.expected)})),null,2));})().catch(e=>{console.error(e);process.exitCode=1;});
