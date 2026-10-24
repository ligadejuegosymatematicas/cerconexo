const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
(async()=>{
  const {chromium}=require(process.env.CERCONEXO_PLAYWRIGHT_PATH||'playwright');
  const arena=path.resolve(__dirname,'..'),stage=path.join(arena,'staging/unified'),out=path.join(arena,'evidence/m3b');await fs.mkdir(out,{recursive:true});
  const saves=JSON.parse(await fs.readFile(path.join(__dirname,'m3a-saves.json'),'utf8'));
  const report={checks:[],screens:[],viewports:[],errors:[],resources:[]};
  const server=http.createServer(async(req,res)=>{
    try{
      const pathname=new URL(req.url,'http://local').pathname;
      if(pathname==='/cerconexo/arena'){res.writeHead(301,{Location:'/cerconexo/arena/'});return res.end();}
      if(!pathname.startsWith('/cerconexo/'))throw new Error('Fuera de ruta');
      let relative=decodeURIComponent(pathname.slice('/cerconexo/'.length));if(relative.endsWith('/')||!relative)relative+='index.html';
      const file=path.resolve(stage,relative);if(!file.startsWith(stage+path.sep))throw new Error('Ruta no válida');
      const bytes=await fs.readFile(file);res.writeHead(200,{'Content-Type':file.endsWith('.mjs')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':'text/html'});res.end(bytes);
    }catch{res.writeHead(404);res.end('404');}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}/cerconexo/`,url=base+'arena/';
  const browser=await chromium.launch({headless:true,channel:process.env.CERCONEXO_BROWSER_CHANNEL||'msedge'});
  const shot=async(p,name)=>{
    // La carga y las fuentes pueden terminar antes de que Chromium presente el
    // primer frame tras una navegación/redirección. Esperar pintado, sin retardo fijo.
    await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    // FullPage puede redimensionar temporalmente a 4x4 en emulación móvil.
    // Durante el muestreo se captura el viewport real, sin filtrar ningún frame.
    const sampling=await p.evaluate(()=>window.__sampling===true);
    await p.screenshot({path:path.join(out,name+'.png'),fullPage:!sampling});report.screens.push(name+'.png');
  };
  const attach=p=>{p.on('pageerror',e=>report.errors.push(e.message));p.on('response',r=>{if(r.status()>=400)report.errors.push(`${r.status()}: ${r.url()}`);});};
  const raw=p=>p.evaluate(()=>localStorage.getItem('cerconexo-arena-m3a-v1'));
  const tap=async(p,selector,touch)=>{const node=p.locator(selector).first();await node.scrollIntoViewIfNeeded();if(touch){const b=await node.boundingBox();await p.touchscreen.tap(b.x+b.width/2,b.y+b.height/2);}else await node.click();};
  const measure=p=>p.evaluate(()=>{const b=document.getElementById('arenaBoard').getBoundingClientRect();return {width:innerWidth,height:innerHeight,pageWidth:document.documentElement.scrollWidth,pageHeight:document.documentElement.scrollHeight,board:[b.x,b.y,b.width,b.height]};});
  try{
    for(const [width,height] of [[1440,900],[1366,768],[1366,600],[390,844],[360,740],[740,360],[320,568]]){
      const touch=width<800;
      const ctx=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch,reducedMotion:'reduce',...(touch?{userAgent:'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36'}:{})});
      const fixture=saves.saves.find(s=>s.name==='duo-piece');await ctx.addInitScript(data=>{
        localStorage.setItem('cerconexo-arena-m3a-v1',data);localStorage.setItem('wallgo-league-v2','premium-intacto');localStorage.setItem('cerconexo-preferences-v1','preferencias-intactas');
      },fixture.raw);
      const p=await ctx.newPage();attach(p);await p.goto(url.slice(0,-1));assert.equal(p.url(),url);const before=await raw(p),size=await measure(p);
      await shot(p,`juego-${width}x${height}`);assert.equal(size.pageWidth,width);
      if(width===390||width===360||width>=1000)assert.equal(size.pageHeight,height,`scroll normal ${width}x${height}`);
      if(width===390)assert.equal(size.board[2],358);if(width===360)assert.equal(size.board[2],328);
      await p.evaluate(()=>{window.__frames=[];window.__sampling=true;const sample=()=>{if(!window.__sampling)return;const b=document.getElementById('arenaBoard').getBoundingClientRect();window.__frames.push({width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,board:[b.x,b.y,b.width,b.height]});requestAnimationFrame(sample);};requestAnimationFrame(sample);});
      await tap(p,'#inspectToggle',touch);assert.equal(await p.locator('[data-inspect]').count(),81);assert.equal(await p.locator('[data-action]').count(),0);
      assert.equal(await p.locator('[data-inspect][tabindex="0"]').count(),1);
      await tap(p,'[data-inspect="10"]',touch);assert.equal(await p.locator('.region-highlight').count(),81);assert.equal(await p.locator('.region-count text').textContent(),'81');
      assert.match(await p.locator('#inspectionInfo').innerText(),/compartida.*81 casillas/);assert.equal(await raw(p),before);
      const anchor=+(await p.locator('.region-count').getAttribute('data-anchor'));assert.ok(anchor>=0&&anchor<81);
      await tap(p,'[data-inspect="16"]',touch);assert.equal(await p.locator('.region-count').count(),0);assert.equal(await raw(p),before);
      await p.locator('[data-inspect="0"]').focus();await p.keyboard.press('ArrowRight');await p.keyboard.press('ArrowDown');
      assert.equal(await p.locator('[data-inspect="10"]').evaluate(e=>document.activeElement===e),true);
      await p.keyboard.press('Enter');assert.equal(await p.locator('.region-count text').textContent(),'81');
      await p.click('#guideOpen');assert.equal(await p.locator('#guideDialog [data-icon]').count(),3);await shot(p,`guia-${width}x${height}`);await p.keyboard.press('Escape');
      assert.equal(await p.locator('#guideOpen').evaluate(e=>document.activeElement===e),true);
      const during=await measure(p);assert.deepEqual(during.board,size.board,`salto al inspeccionar ${width}`);assert.equal(during.pageHeight,size.pageHeight);
      await shot(p,`inspeccion-${width}x${height}`);await p.click('#inspectToggle');assert.equal(await p.locator('[data-inspect]').count(),0);assert.ok(await p.locator('[data-action]').count()>0);
      const frames=await p.evaluate(()=>{window.__sampling=false;return window.__frames;});assert.ok(frames.length);
      for(const frame of frames){assert.equal(frame.width,width);assert.equal(frame.height,size.pageHeight);assert.equal(frame.board[2],size.board[2]);assert.equal(frame.board[3],size.board[3]);}
      during.frames=frames.length;
      await p.reload();assert.equal(await raw(p),before);assert.equal(await p.locator('#inspectToggle').getAttribute('aria-pressed'),'false');
      assert.equal(await p.evaluate(()=>localStorage.getItem('wallgo-league-v2')),'premium-intacto');assert.equal(await p.evaluate(()=>localStorage.getItem('cerconexo-preferences-v1')),'preferencias-intactas');
      report.viewports.push(during);report.checks.push(`${width}×${height}: ruta directa, ratón/tacto Android emulado, inspección/teclado, guía/foco, medidas estables, guardado sin escrituras`);await ctx.close();
    }
    // Guardados históricos para cada política, pendiente y terminado.
    for(const fixture of saves.saves){
      const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
      await ctx.addInitScript(s=>{if(!localStorage.getItem('cerconexo-arena-m3a-v1'))localStorage.setItem('cerconexo-arena-m3a-v1',s);},fixture.raw);
      const p=await ctx.newPage();attach(p);await p.goto(url);const before=await raw(p);
      await p.click('#inspectToggle');await tap(p,'[data-inspect="0"]',true);assert.equal(await raw(p),before);assert.equal(await p.locator('[data-action]').count(),0);
      if(fixture.game.pending)assert.equal(await p.locator('#discardOptions button:enabled').count(),0);
      if(fixture.game.over){
        assert.match(await p.locator('#turnTitle').innerText(),/Victoria|Empate/);
        for(let cell=0;cell<81;cell++){await p.locator(`[data-inspect="${cell}"]`).dispatchEvent('click');}
        await shot(p,'final-inspeccion');
      }
      await p.click('#inspectToggle');assert.equal(await raw(p),before);
      for(const team of fixture.game.teams){const score=await import('../src/geometry.mjs').then(m=>m.analyzeArena(fixture.game).score[team]);assert.equal(+(await p.locator(`[data-score="${team}"]`).innerText()),score);}
      await p.click('#newOpen');await p.click('#startArena');assert.equal(await p.locator('#inspectToggle').getAttribute('aria-pressed'),'false');assert.equal(await p.locator('.region-count').count(),0);assert.equal(await p.locator('[data-wall]').count(),0);
      report.checks.push(`M3-A ${fixture.name}: resultado/turno/inventario recuperados, consulta sin escrituras y reinicio`);await ctx.close();
    }
    for(const [width,height] of [[390,844],[360,740],[740,360]]){
      const ctx=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true});
      await ctx.addInitScript(s=>localStorage.setItem('cerconexo-arena-m3a-v1',s),saves.saves.find(s=>s.name==='pending').raw);
      const p=await ctx.newPage();attach(p);await p.goto(url);assert.equal(await p.locator('#decisionPanel').isVisible(),true);
      const pendingSize=await measure(p);assert.equal(pendingSize.pageWidth,width);assert.equal(pendingSize.pageHeight,height,`descarte ${width}`);
      await p.locator('#discardOptions button').filter({hasText:'Salto'}).click();await p.locator('[data-power]').click();
      const toolSize=await measure(p);assert.equal(toolSize.pageHeight,height,`poder seleccionado ${width}`);assert.equal(toolSize.board[2],pendingSize.board[2]);
      await shot(p,`poder-disponible-${width}x${height}`);await ctx.close();report.checks.push(`${width}×${height}: descartes e inventario con poder seleccionado sin scroll principal ni reducción del tablero`);
    }
    // Fixture estructural para regiones pequeñas, irregulares, exclusivas y vacías, sin alterar el motor distribuido.
    const {createArena}=await import('../src/engine.mjs'),{arenaWall,arenaNeighbors,analyzeArena}=await import('../src/geometry.mjs');
    const enclosed=cells=>cells.flatMap(c=>arenaNeighbors(c).filter(to=>!cells.includes(to)).map(to=>arenaWall(c,to)));
    for(const [mode,policy] of [['duo','piece'],['duo','team'],['ffa','piece']]){
      const s=createArena({mode,policy});s.walls=[...new Set([...enclosed([0]),...enclosed([10]),...enclosed([30,31,40]),...enclosed([16,17])])];
      const actor=mode==='ffa'?'C':'A2';s.turn={team:actor[0],actor,steps:0,path:[70],committed:false,actions:0};
      const engine=await fs.readFile(path.join(arena,'src/engine.mjs'),'utf8');const body=engine.replace('export function createArena(','function originalCreateArena(')+`\nexport function createArena(options={}){originalCreateArena(options);return structuredClone(${JSON.stringify(s)});}`;
      const ctx=await browser.newContext({viewport:{width:360,height:740},hasTouch:true,isMobile:true,reducedMotion:'reduce'});
      await ctx.route('**/arena/src/engine.mjs',route=>route.fulfill({contentType:'text/javascript',body}));const p=await ctx.newPage();attach(p);await p.goto(url);await p.click('#startArena');
      const before=await raw(p),view=analyzeArena(s);await p.click('#inspectToggle');
      for(const cell of [10,16,0,30,64]){
        await tap(p,`[data-inspect="${cell}"]`,true);const component=view.components[view.byCell[cell]];
        assert.equal(await p.locator('.region-count text').textContent(),String(component.cells.length));
        assert.equal(await p.locator('.region-highlight').count(),component.cells.length);
        assert.ok(component.cells.includes(+(await p.locator('.region-count').getAttribute('data-anchor'))));
        const label=await p.locator('.region-count').evaluate(e=>{const b=e.getBBox(),c=+e.dataset.anchor;return {left:b.x/100,top:b.y/100,right:(b.x+b.width)/100,bottom:(b.y+b.height)/100,c};});
        await shot(p,`${mode}-${policy}-region-${cell}`);
        assert.ok(label.left>=label.c%9&&label.right<=(label.c%9)+1&&label.top>=Math.floor(label.c/9)&&label.bottom<=Math.floor(label.c/9)+1,JSON.stringify({mode,policy,cell,label}));
      }
      assert.equal(await raw(p),before);await p.click('#inspectToggle');await p.click('#guideOpen');await p.keyboard.press('Escape');
      report.checks.push(`${mode}/${policy}: regiones exclusivas, compartidas, vacías, L y casilla única con etiqueta interior y sin acciones ni cambios de datos`);await ctx.close();
    }
    // Verificación de todos los recursos del ensayo, incluidos Premium y raíz.
    const resources=await fs.readdir(stage,{recursive:true});
    for(const relative of resources){const file=path.join(stage,relative);if(!(await fs.stat(file)).isFile()||relative==='.nojekyll')continue;
      const response=await fetch(base+relative.replaceAll(path.sep,'/'));assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),await fs.readFile(file));report.resources.push(relative);
    }
    const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true}),p=await ctx.newPage();attach(p);
    await p.goto(pathToFileURL(path.join(arena,'Cerconexo_Arena_M3B.html')).href);await p.click('#startArena');await p.click('#inspectToggle');await tap(p,'[data-inspect="0"]',true);assert.equal(await p.locator('.region-count text').textContent(),'81');await ctx.close();
    report.checks.push('HTML autónomo file:// y recursos HTTP idénticos; las modalidades comparten origen sin cambios de guardado');assert.deepEqual(report.errors,[]);report.ok=true;
  }finally{await fs.writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2));await browser.close();await new Promise(r=>server.close(r));}
  console.log(JSON.stringify({ok:report.ok,checks:report.checks.length,screens:report.screens.length,viewports:report.viewports},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
