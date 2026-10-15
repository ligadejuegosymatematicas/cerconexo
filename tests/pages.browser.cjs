/* Comprobación opcional con navegador instalado; no añade dependencias al juego. */
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');

(async()=>{
  const {chromium}=require(process.env.CERCONEXO_PLAYWRIGHT_PATH||'playwright');
  const {startPagesServer,publicFiles}=await import('./pages-server.mjs');
  const site=await startPagesServer();
  const browser=await chromium.launch({headless:true,channel:process.env.CERCONEXO_BROWSER_CHANNEL||'msedge'});
  const root=path.resolve(__dirname,'..');
  const report={mount:'/cerconexo/',checks:[],screens:[],resources:[]};
  try{
    for(const [width,height] of [[1440,900],[390,844]]){
      const context=await browser.newContext({viewport:{width,height},isMobile:width<761,hasTouch:width<761,reducedMotion:'reduce'});
      const page=await context.newPage(),errors=[],failed=[],requests=[];
      page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>failed.push(r.url()));
      page.on('response',r=>requests.push({url:r.url(),status:r.status()}));
      await page.goto(site.url);await page.locator('.piece-token').first().waitFor();
      assert.equal(await page.title(),'Cerconexo · Liga de Juegos y Matemáticas');
      assert.equal(await page.locator('.piece-token').count(),4);
      assert.ok(await page.locator('.official-logo').evaluate(img=>img.complete&&img.naturalWidth>0));
      const reset=async()=>{await page.evaluate(()=>localStorage.clear());await page.reload();};
      const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('wallgo-league-v2'))?.game);
      const choose=async(selector)=>{const b=await page.locator(selector).first().boundingBox();if(width<761)await page.touchscreen.tap(b.x+b.width/2,b.y+b.height/2);else await page.mouse.click(b.x+b.width/2,b.y+b.height/2);await page.waitForFunction(()=>document.getElementById('board').getAttribute('aria-busy')==='false');};
      for(const route of [[],[9],[15,16],[9,8]]){
        await reset();for(const to of route)await choose(`[data-to="${to}"]`);
        await choose('[data-wall]');const committed=await saved();
        assert.equal(committed.moves,1);assert.equal(committed.currentActor,'B1');assert.equal(committed.pieces[0].pos,route.at(-1)??8);
        await page.reload();assert.deepEqual(await saved(),committed);assert.equal(await page.locator('#turnDisc').innerText(),'B1');
        await page.goto(site.url+'index.html');assert.deepEqual(await saved(),committed);
      }
      report.checks.push(`${width}px: 0/1/2 pasos, giro, regreso, muro y guardado restaurado desde raíz e index.html`);
      // Comparación visual exacta: misma posición y navegador, paquete frente a fuentes.
      await reset();
      await page.mouse.move(0,0);
      const packaged=await page.screenshot();
      const isolatedContext=await browser.newContext({viewport:{width,height},isMobile:width<761,hasTouch:width<761,reducedMotion:'reduce'});
      const source=await isolatedContext.newPage();
      // El servidor comparativo se limita a los mismos archivos públicos originales.
      await source.route('**/*',async route=>{
        const url=new URL(route.request().url());
        const name=url.pathname.slice('/cerconexo/'.length)||'index.html';
        if(!url.pathname.startsWith('/cerconexo/')||!(await publicFiles()).includes(name)){await route.abort();return;}
        const type=name.endsWith('.mjs')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.png')?'image/png':'text/html';
        await route.fulfill({status:200,contentType:type,body:await fs.readFile(path.join(root,name))});
      });
      await source.goto(site.url);await source.locator('.piece-token').first().waitFor();
      await source.mouse.move(0,0);
      assert.deepEqual(packaged,await source.screenshot(),'La preparación no debe modificar la interfaz');
      await isolatedContext.close();
      assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
      assert.ok(requests.every(r=>r.status===200&&r.url.startsWith(site.url)),JSON.stringify(requests));
      report.screens.push({width,height,identicalToSource:true});
      report.resources.push(...requests.filter((r,i,a)=>a.findIndex(other=>other.url===r.url)===i).map(r=>({path:new URL(r.url).pathname,status:r.status})));
      await context.close();
    }
    report.checks.push('Todos los recursos solicitados responden 200 bajo /cerconexo/; sin errores de JavaScript ni red');
    const evidence=path.join(root,'validation/pages');await fs.mkdir(evidence,{recursive:true});
    await fs.writeFile(path.join(evidence,'browser-results.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify(report,null,2));
  }finally{await browser.close();await site.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
