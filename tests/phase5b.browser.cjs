const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CERCONEXO_PLAYWRIGHT_PATH||'playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,process.env.CERCONEXO_VALIDATION_DIR||'validation/phase5b-contour');
const idle=p=>p.waitForFunction(()=>document.getElementById('board').getAttribute('aria-busy')==='false');
const stored=p=>p.evaluate(()=>localStorage.getItem('wallgo-league-v2'));
async function load(p,game){await p.evaluate(game=>{localStorage.setItem('wallgo-league-v2',JSON.stringify({game}));},game);await p.reload();await idle(p);}
const layout=p=>p.evaluate(()=>{const r=document.getElementById('board').getBoundingClientRect();return {page:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],board:[r.x,r.y,r.width,r.height],zoom:visualViewport.scale};});
async function tap(p,selector,touch){const r=await p.locator(selector).boundingBox();assert.ok(r,selector);if(touch)await p.touchscreen.tap(r.x+r.width/2,r.y+r.height/2);else await p.mouse.click(r.x+r.width/2,r.y+r.height/2);}
(async()=>{
  await fs.mkdir(out,{recursive:true});
  const {startPagesServer}=await import('./pages-server.mjs'),engine=await import('../src/engine.mjs'),{resultFixture}=await import('./result-fixtures.mjs');
  const {finalRegions,regionDescription,componentBoundary}=await import('../src/explorationData.mjs');
  const {contourFixture}=await import('./contour-fixtures.mjs');
  const site=await startPagesServer(),browser=await chromium.launch({headless:true,channel:'msedge'}),errors=[],report={checks:[],screens:[],frames:0};
  try{
    const fixture=resultFixture({pockets:true}),model=finalRegions(fixture.after);
    async function contour(p,region){
      assert.equal(await p.locator('[data-region-boundary]').count(),1);
      assert.equal(await p.locator('[data-region-boundary]').getAttribute('d'),componentBoundary(region.cells).path);
      assert.equal(await p.locator('#exploration-clip').count(),1);
      const info=await p.locator('[data-region-boundary]').evaluate(n=>({pointer:getComputedStyle(n).pointerEvents,fill:getComputedStyle(n).fill,
        clip:n.getAttribute('clip-path'),beforeWalls:!!(n.parentElement.compareDocumentPosition(document.querySelector('[data-edge]'))&Node.DOCUMENT_POSITION_FOLLOWING)}));
      assert.equal(info.pointer,'none');assert.equal(info.fill,'none');assert.equal(info.clip,'url(#exploration-clip)');assert.ok(info.beforeWalls);
      assert.ok(await p.locator('.region-outline').evaluateAll(ns=>ns.every(n=>getComputedStyle(n).stroke==='none'&&getComputedStyle(n).pointerEvents==='none')));
      const visible=await p.locator('[data-exploration-page="region"]').evaluate(n=>{
        const frame=n.getBoundingClientRect();return [...n.querySelectorAll('h2,[data-region-size],[data-region-pieces]')].every(e=>{const r=e.getBoundingClientRect();return r.top>=frame.top&&r.bottom<=frame.bottom+1&&e.scrollWidth<=e.clientWidth+1;});
      });assert.ok(visible,'Nombre, tamaño y fichas legibles sin recortes');
    }
    for(const [width,height] of [[1440,900],[1366,768],[1366,600],[390,844],[360,740],[740,360],[1440,700],[1366,650],[1280,560]]){
      const touch=width<761,context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:touch,deviceScaleFactor:1});
      await context.addInitScript(()=>{
        window.explorationAudit={announcements:[],territory:0,haptics:[],writes:[],frames:[],propagations:[]};
        const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){window.explorationAudit.writes.push({key,value});return original.call(this,key,value);};
        Object.defineProperty(navigator,'vibrate',{configurable:true,value:p=>{window.explorationAudit.haptics.push(p);return true;}});
        document.addEventListener('DOMContentLoaded',()=>{
          document.addEventListener('click',event=>{
            if(!event.target.closest('[data-explore-cell]'))return;
            const timings=[...document.querySelectorAll('.region-outline')].flatMap(n=>n.getAnimations().map(a=>a.effect.getTiming()));
            if(timings.length)window.explorationAudit.propagations.push(timings.map(t=>({duration:t.duration,delay:t.delay})));
          });
          const a=document.getElementById('explorationAnnouncement');new MutationObserver(()=>{if(a.textContent)window.explorationAudit.announcements.push(a.textContent);}).observe(a,{subtree:true,childList:true,characterData:true});
          new MutationObserver(()=>{if(!document.getElementById('territoryNotice').hidden)window.explorationAudit.territory++;}).observe(document.getElementById('territoryNotice'),{attributes:true});
          const frame=()=>{const b=document.getElementById('board').getBoundingClientRect();window.explorationAudit.frames.push({page:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],board:[b.x,b.y,b.width,b.height]});if(window.explorationAudit.frames.length<6000)requestAnimationFrame(frame);};requestAnimationFrame(frame);
        });
      });
      const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(site.url);await idle(p);
      assert.ok(await p.locator('#explore').isHidden());const baseline=await layout(p);assert.equal(baseline.zoom,1);
      await load(p,fixture.after);const original=await stored(p),winner=await p.locator('#winnerTitle').innerText();
      assert.ok(await p.locator('#explore').isVisible());assert.deepEqual(await layout(p),baseline);
      await p.screenshot({path:path.join(out,`resultado-${width}x${height}.png`)});
      await p.evaluate(()=>{explorationAudit.frames=[];});
      await p.locator('#explore').click();assert.equal(await p.locator('#explore').innerText(),'Volver al resultado');
      assert.equal(await p.locator('[data-explore-cell]').count(),49);assert.equal(await p.locator('[data-to],[data-wall]').count(),0);
      assert.equal(await p.locator('[data-explore-cell][tabindex="0"]').count(),1);
      await p.screenshot({path:path.join(out,`intuitivo-${width}x${height}.png`)});
      for(const type of ['A','B','empty']){
        const region=model.regions.filter(r=>r.type===type).sort((a,b)=>b.cells.length-a.cells.length)[0],cell=region.cells[0];await tap(p,`[data-explore-cell="${cell}"]`,touch);
        assert.equal(await p.locator('[data-region-title]').innerText(),regionDescription(region).title);
        assert.equal(await p.locator('[data-region-size]').innerText(),regionDescription(region).size);
        assert.equal(await p.locator('[data-region-pieces]').innerText(),regionDescription(region).pieces);
        assert.deepEqual((await p.locator('[data-region-cell]').evaluateAll(ns=>ns.map(n=>Number(n.dataset.regionCell)))).sort((a,b)=>a-b),[...region.cells].sort((a,b)=>a-b));
        await contour(p,region);assert.equal(await stored(p),original);await p.screenshot({path:path.join(out,`region-${type}-${width}x${height}.png`)});
      }
      await p.locator('[data-exploration-tab="summary"]').click();assert.ok(await p.locator('[data-region-summary]').innerText());
      assert.equal(await p.locator('[data-region-scores]').innerText(),`Casillas: A ${model.score.A} + B ${model.score.B} + vacías ${model.score.empty} = 49.`);
      await p.screenshot({path:path.join(out,`resumen-${width}x${height}.png`)});
      await p.locator('[data-exploration-tab="math"]').click();assert.match(await p.locator('[data-exploration-page="math"]').innerText(),/Construir un muro no siempre divide una región/);
      await p.locator('[data-exploration-page="math"]').evaluate(n=>n.scrollTop=n.scrollHeight);await p.screenshot({path:path.join(out,`matematica-${width}x${height}.png`)});
      for(const name of ['help','options','guide']){
        if(await p.locator('#'+name).isVisible()){await p.locator('#'+name).click();await p.keyboard.press('Escape');assert.equal(await p.evaluate(()=>document.activeElement.id),name);}
      }
      // Todas las casillas, incluidas las cuatro fichas: selección táctil o de ratón real.
      if(width===360){
        await p.emulateMedia({reducedMotion:'reduce'});
        for(let cell=0;cell<49;cell++){
          await tap(p,`[data-explore-cell="${cell}"]`,true);
          assert.equal(await p.locator('[data-region-size]').innerText(),regionDescription(model.byCell[cell]).size);
        }
        await p.emulateMedia({reducedMotion:'no-preference'});
      }
      // Cambio rápido: solo la última selección puede mantener efectos.
      for(const r of [...model.regions].reverse())await p.locator(`[data-explore-cell="${r.cells[0]}"]`).dispatchEvent('click');
      const last=model.regions[0];await p.waitForTimeout(400);
      assert.equal(await p.locator('[data-region-cell]').count(),last.cells.length);await contour(p,last);
      const audit=await p.evaluate(()=>explorationAudit);assert.ok(audit.propagations.length);for(const wave of audit.propagations)for(const t of wave){assert.equal(t.duration,120);assert.ok(t.delay>=0&&t.delay+t.duration<=320.001);}assert.equal(audit.territory,0);assert.deepEqual(audit.haptics.filter(p=>p!==0),[]);assert.deepEqual(audit.writes,[]);
      assert.equal(await stored(p),original);assert.equal(await p.locator('#winnerTitle').textContent(),winner);
      assert.equal(await p.locator('.piece-token').count(),4);assert.equal(await p.locator('.marker-check:visible').count(),4);
      // Una misma componente no vuelve a anunciarse ni animarse.
      const count=audit.announcements.length;await p.locator(`[data-explore-cell="${last.cells.at(-1)}"]`).dispatchEvent('click');
      assert.equal(await p.evaluate(()=>explorationAudit.announcements.length),count);
      assert.equal(await p.locator('.region-outline').evaluateAll(ns=>ns.flatMap(n=>n.getAnimations()).length),0);
      // Navegación roving: solo un punto de tabulación, flechas ortogonales.
      await p.locator('[data-explore-cell="0"]').focus();await p.keyboard.press('ArrowRight');await p.keyboard.press('ArrowDown');
      assert.equal(await p.evaluate(()=>document.activeElement.dataset.exploreCell),'8');await p.keyboard.press('Space');
      assert.equal(await p.locator('[data-region-size]').innerText(),regionDescription(model.byCell[8]).size);
      await p.keyboard.press('Escape');assert.ok(await p.locator('#explorationPanel').isHidden());assert.equal(await p.evaluate(()=>document.activeElement.id),'explore');
      assert.equal(await p.locator('[data-region-cell],[data-region-boundary],#exploration-clip').count(),0);assert.equal(await stored(p),original);
      // Recarga: vuelve al resultado, no restaura selección ni celebraciones.
      await p.locator('#explore').click();await tap(p,'[data-explore-cell="8"]',touch);const beforeReloadFrames=await p.evaluate(()=>explorationAudit.frames);await p.reload();await idle(p);
      assert.ok(await p.locator('#explorationPanel').isHidden());assert.equal(await stored(p),original);assert.ok(await p.locator('#explore').isVisible());
      // Reinicio durante la propagación: no sobreviven efectos pendientes.
      await p.locator('#explore').click();await p.locator('[data-explore-cell="8"]').dispatchEvent('click');await p.locator('#new').click();await idle(p);await p.waitForTimeout(400);
      assert.ok(await p.locator('#explore').isHidden());assert.equal(await p.locator('[data-region-cell],[data-explore-cell],[data-region-boundary],#exploration-clip').count(),0);
      assert.deepEqual(JSON.parse(await stored(p)).game,engine.initialState());
      const frames=[...beforeReloadFrames,...await p.evaluate(()=>explorationAudit.frames)];
      for(const frame of frames){assert.deepEqual(frame.page,[width,height]);assert.deepEqual(frame.board,baseline.board);}
      // Formas reales exclusivas: casilla pequeña, entrantes, agujero y región grande.
      for(const name of ['small','irregular','hole','large']){
        const game=contourFixture(name);await load(p,game);await p.locator('#explore').click();
        const region=finalRegions(game).byCell[game.pieces[0].pos];await tap(p,`[data-explore-cell="${region.cells[0]}"]`,touch);await contour(p,region);
        if(name==='hole'){
          const hole=p.locator('#exploration-clip path');assert.ok(!(await hole.evaluate(n=>n.isPointInFill(new DOMPoint(340,340)))),'El agujero central no pertenece al área recortada');
        }
        await p.waitForTimeout(350);await p.screenshot({path:path.join(out,`contorno-${name}-${width}x${height}.png`)});
        assert.deepEqual(await layout(p),baseline);
        const shapeFrames=await p.evaluate(()=>explorationAudit.frames);
        for(const frame of shapeFrames){assert.deepEqual(frame.page,[width,height]);assert.deepEqual(frame.board,baseline.board);}
        frames.push(...shapeFrames);
      }
      report.frames+=frames.length;report.screens.push({viewport:[width,height],board:baseline.board,frames:frames.length});await context.close();
    }
    report.checks.push('Nueve resoluciones a zoom 100%, sin scroll ni saltos durante consulta, diálogos, selección, retorno y reinicio; 49 casillas seleccionables con tacto, ratón y teclado');
    // Última jugada real: acceso solo después de la secuencia previa, para A/B/empate.
    for(const options of [{A:28,B:16},{A:16,B:28},{A:23,B:23},{A:25,B:24}]){
      const f=resultFixture(options),context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true}),p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(site.url);await load(p,f.before);
      await p.locator(`[data-wall="${f.to}"]`).dispatchEvent('click');assert.ok(await p.locator('#explore').isHidden());await idle(p);assert.ok(await p.locator('#explore').isVisible());
      assert.deepEqual(JSON.parse(await stored(p)).game,f.after);
      const dir=path.join(out,'frames-'+(options.A+options.B===49?'sin-vacias':options.A===options.B?'empate':options.A>options.B?'victoriaA':'victoriaB'));await fs.mkdir(dir,{recursive:true});
      await p.screenshot({path:path.join(dir,'00-resultado.png')});await p.locator('#explore').click();await p.screenshot({path:path.join(dir,'01-consulta.png')});
      const m=finalRegions(f.after);await p.locator(`[data-explore-cell="${m.regions[0].cells[0]}"]`).dispatchEvent('click');await p.screenshot({path:path.join(dir,'02-propagacion.png')});await p.waitForTimeout(350);await p.screenshot({path:path.join(dir,'03-region.png')});
      await p.locator(`[data-explore-cell="${m.regions[1].cells[0]}"]`).dispatchEvent('click');await p.screenshot({path:path.join(dir,'04-otra-region.png')});await p.locator('#explore').click();await p.screenshot({path:path.join(dir,'05-regreso.png')});await context.close();
    }
    report.checks.push('Acceso tras última construcción y animaciones para victoria A, B y empate; ningún cambio en resultado, puntuación, guardado, vibración o conquistas');
    const context=await browser.newContext({viewport:{width:360,height:740},reducedMotion:'reduce'}),p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
    await p.goto(pathToFileURL(path.join(root,'Cerconexo_Premium_Listo_Para_Jugar.html')).href);await load(p,fixture.after);await p.locator('#explore').click();await p.locator('[data-explore-cell="8"]').dispatchEvent('click');
    assert.equal(await p.locator('.region-outline').evaluateAll(ns=>ns.flatMap(n=>n.getAnimations()).length),0);assert.ok(await p.locator('[data-region-title]').innerText());await context.close();
    report.checks.push('HTML autónomo file:// y movimiento reducido: información inmediata sin propagación');assert.deepEqual(errors,[]);report.errors=errors;
    await fs.writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  }finally{await browser.close();await site.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
