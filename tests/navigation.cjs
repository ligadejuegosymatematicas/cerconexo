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
 const create=browser.newContext.bind(browser);
 browser.newContext=async options=>{
  const context=await create(options);
  await context.addInitScript(game=>{if(!localStorage.getItem('wallgo-league-v2'))localStorage.setItem('wallgo-league-v2',JSON.stringify({game}));},initial);
  const newPage=context.newPage.bind(context);
  context.newPage=async()=>{
   const page=await newPage();
   page.historicalErrors=[];page.on('pageerror',error=>page.historicalErrors.push(String(error)));page.on('requestfailed',request=>page.historicalErrors.push(request.url()+': '+request.failure()?.errorText));
   page.on('response',response=>{if(response.status()>=400)page.historicalErrors.push(`${response.status()} ${response.url()}`);});
   page.on('console',message=>{if(message.type()==='error')page.historicalErrors.push(message.text());});
   for(const method of ['goto','reload']){
    const original=page[method].bind(page);
    page[method]=async(...args)=>{
     const response=await original(...args);
     await continueHistorical(page);
     return response;
    };
   }
   return page;
  };
  return context;
 };
 return browser;
};
