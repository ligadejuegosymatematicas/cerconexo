// Adaptación exclusiva de navegación para las diez suites históricas. Se abre
// un fixture inicial válido mediante Continuar, sin añadir un pulso de nueva
// partida a pruebas que históricamente medían únicamente la carga del juego.
async function continueHistorical(page){
 // Esperar el primer render y consultar el estado de navegación, no una
 // medida instantánea de visibilidad que puede saltarse una portada en carga.
 await page.waitForFunction(()=>document.getElementById('board')?.hasAttribute('aria-busy'));
 if(!await page.locator('#homeScreen').evaluate(n=>n.hidden)){
  if(await page.locator('#continueGame').isHidden()){
   const snapshot=await page.evaluate(()=>({url:location.href,ready:document.readyState,raw:localStorage.getItem('wallgo-league-v2'),home:document.getElementById('homeStatus').textContent,scripts:[...document.scripts].map(n=>n.src)}));
   const {decodeGameSave}=await import('../src/gameSave.mjs');snapshot.decoded=decodeGameSave(snapshot.raw);snapshot.errors=page.historicalErrors;
   console.error('DIAGNOSTICO DE NAVEGACION',JSON.stringify(snapshot));
  }
  await page.locator('#continueGame').click();
 }
 await page.waitForFunction(()=>document.getElementById('homeScreen').hidden&&!document.querySelector('.app').hidden&&document.getElementById('board').getAttribute('aria-busy')==='false');
}
exports.continueHistorical=continueHistorical;
exports.historicalBrowser=async browser=>{
 const {initialState}=await import('../src/engine.mjs'),initial=initialState();
 const audit=process.env.CERCONEXO_AUDIT_STORAGE==='1';let auditId=0;
 const create=browser.newContext.bind(browser);
 browser.newContext=async options=>{
  const context=await create(options);
  await context.addInitScript(game=>{window.historicalSeedBefore=localStorage.getItem('wallgo-league-v2');if(!window.historicalSeedBefore)localStorage.setItem('wallgo-league-v2',JSON.stringify({game}));},initial);
  const newPage=context.newPage.bind(context);
  context.newPage=async()=>{
   const page=await newPage();
   const events=[],id=++auditId;
   if(audit){
    await page.exposeFunction('historicalStorageEvent',e=>events.push(e));
    await page.addInitScript(()=>{
     const record=(kind,more={})=>window.historicalStorageEvent({kind,url:location.href,raw:localStorage.getItem('wallgo-league-v2'),history:history.state,...more});record('init');
     const set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){const result=set.call(this,k,v);if(k==='wallgo-league-v2')record('set',{value:v,stack:new Error().stack});return result;};
     window.addEventListener('pagehide',()=>record('pagehide'));
     document.addEventListener('click',e=>record('click',{target:e.target.closest('button')?.id,wall:e.target.closest('[data-wall]')?.dataset.wall}));
    });
    page.on('close',()=>{const fs=require('node:fs'),path=require('node:path'),dir=path.resolve('validation/m42/browser/storage-audit');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,path.basename(process.argv[1])+'-'+id+'.json'),JSON.stringify(events,null,2));});
   }
   page.historicalErrors=[];page.on('pageerror',error=>page.historicalErrors.push(String(error)));page.on('requestfailed',request=>page.historicalErrors.push(request.url()+': '+request.failure()?.errorText));
   page.on('response',response=>{if(response.status()>=400)page.historicalErrors.push(`${response.status()} ${response.url()}`);});
   page.on('console',message=>{if(message.type()==='error')page.historicalErrors.push(message.text());});
   for(const method of ['goto','reload']){
    const original=page[method].bind(page);
    page[method]=async(...args)=>{
     if(audit)events.push({kind:'before-'+method,url:page.url(),snapshot:await page.evaluate(()=>({raw:localStorage.getItem('wallgo-league-v2'),history:history.state})).catch(()=>null)});
     const response=await original(...args);
     await continueHistorical(page);
     if(audit)events.push({kind:'after-'+method,url:page.url(),snapshot:await page.evaluate(()=>({raw:localStorage.getItem('wallgo-league-v2'),seedBefore:window.historicalSeedBefore,history:history.state}))});
     return response;
    };
   }
   return page;
  };
  return context;
 };
 return browser;
};
