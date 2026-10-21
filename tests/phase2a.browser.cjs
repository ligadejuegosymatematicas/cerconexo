// Pruebas del DOM real y Web Animations. Sin dependencias nuevas para el juego.
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CERCONEXO_PLAYWRIGHT_PATH||'playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,process.env.CERCONEXO_VALIDATION_DIR||'validation/phase2a');
const report={checks:[],screens:[]};
const idle=page=>page.waitForFunction(()=>document.getElementById('board').getAttribute('aria-busy')==='false');
const settle=page=>page.evaluate(()=>Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{}))));
const saved=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('wallgo-league-v2'))?.game);
async function activate(page,selector,{touch=false,wait=true}={}){
  const box=await page.locator(selector).first().boundingBox();
  assert.ok(box,selector);
  if(touch)await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);
  else await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
  if(wait)await idle(page);
}
async function reset(page,state){
  await page.evaluate(state=>{localStorage.clear();if(state)localStorage.setItem('wallgo-league-v2',JSON.stringify({game:state}));},state);
  await page.reload();await idle(page);await settle(page);
}
async function layout(page){
  return page.evaluate(()=>{
    const box=el=>{const {x,y,width,height,bottom,right}=el.getBoundingClientRect();return {x,y,width,height,bottom,right};};
    const visible=el=>!!el.getClientRects().length;
    const targets=[...document.querySelectorAll('[data-to],[data-wall]')].map(el=>{
      const hit=el.querySelector('.move-hit,.wall-hit'),r=hit.getBoundingClientRect();
      return {width:r.width,height:r.height,correct:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('[data-to],[data-wall]')===el};
    });
    return {viewport:[innerWidth,innerHeight],page:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],board:box(document.getElementById('board')),turn:box(document.getElementById('turnBanner')),score:box(document.querySelector('.score-panel')),targets,
      clipped:[...document.querySelectorAll('.turn-card,.prompt,.team-heading,.team-roster,.header-actions')].filter(el=>visible(el)&&(el.scrollWidth>el.clientWidth+1||el.scrollHeight>el.clientHeight+1)).map(el=>el.className),
      fonts:[...document.querySelectorAll('.player-id,.player-state,#turnName,.prompt,.team-heading h3,.minor-stats')].filter(visible).map(el=>parseFloat(getComputedStyle(el).fontSize))};
  });
}
(async()=>{
  await fs.mkdir(out,{recursive:true});
  const engine=await import(pathToFileURL(path.join(root,'src/engine.mjs')));
  const {startPagesServer}=await import('./pages-server.mjs');
  const site=await startPagesServer();
  const browser=await chromium.launch({headless:true,channel:process.env.CERCONEXO_BROWSER_CHANNEL||'msedge'});
  const errors=[];
  const create=async(width,height,motion='no-preference')=>{
    const context=await browser.newContext({viewport:{width,height},isMobile:width<761,hasTouch:width<761,reducedMotion:motion});
    await context.addInitScript(()=>{
      // Medir dentro del clic real evita perder efectos de 180 ms por latencia del protocolo.
      document.addEventListener('click',event=>{
        const action=event.target.closest?.('[data-to],[data-wall]'),board=document.getElementById('board');
        if(!action||board?.getAttribute('aria-busy')!=='true')return;
        const before=localStorage.getItem('wallgo-league-v2');
        const token=board.querySelector('[data-piece="A1"]');
        const sample={frames:token.getAnimations().map(a=>({duration:a.effect.getTiming().duration,frames:a.effect.getKeyframes().map(f=>f.transform)})),flash:board.querySelectorAll('.wall-confirmation').length};
        board.querySelector('[data-wall]')?.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
        sample.blocked=before===localStorage.getItem('wallgo-league-v2');window.latestMotionProbe=sample;
      });
    });
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    page.on('requestfailed',r=>errors.push(r.url()));
    await page.goto(site.url);await idle(page);await settle(page);return {context,page};
  };
  try{
    for(const [width,height] of [[1440,900],[1366,768],[390,844],[360,740]]){
      const {page,context}=await create(width,height);
      const metrics=await layout(page);
      assert.ok(metrics.page[0]<=width&&metrics.page[1]<=height,JSON.stringify(metrics));
      assert.deepEqual(metrics.clipped,[]);assert.ok(metrics.fonts.every(size=>size>=12));
      assert.ok(metrics.board.bottom<=height&&metrics.turn.bottom<=height&&metrics.score.bottom<=height);
      assert.ok(Math.abs(metrics.board.width-metrics.board.height)<1);
      assert.ok(metrics.targets.every(t=>t.correct));
      if(width<761)assert.ok(metrics.board.width>=width-30,'Preservar tamaño de tablero en orientación vertical');
      await page.screenshot({path:path.join(out,`${width}x${height}.png`)});
      report.screens.push(metrics);
      await page.locator('#help').click();assert.ok(await page.locator('#helpDialog').evaluate(el=>el.open));
      await page.locator('#helpDialog .dialog-close').click();
      // Nodos persistentes: dos pasos, incluso giro y regreso, se animan por separado.
      for(const route of [[],[9],[15,16],[9,8]]){
        await reset(page);
        await page.evaluate(()=>{window.originalToken=document.querySelector('[data-piece="A1"]');});
        for(const to of route){
          await activate(page,`[data-to="${to}"]`,{touch:width<761,wait:false});
          const frames=await page.evaluate(()=>window.latestMotionProbe.frames);
          assert.equal(frames.length,1);assert.equal(frames[0].duration,180);
          const [a,b]=frames[0].frames.map(text=>text.match(/-?\d+(?:\.\d+)?/g).map(Number));
          assert.ok((a[0]===b[0])!==(a[1]===b[1]),'Cada desplazamiento es ortogonal');
          // Un intento incompatible durante la transición no cambia el borrador ni construye.
          assert.ok(await page.evaluate(()=>window.latestMotionProbe.blocked));
          assert.equal((await saved(page))?.moves??0,0);
          await idle(page);
          assert.ok(await page.evaluate(()=>window.originalToken===document.querySelector('[data-piece="A1"]')));
        }
        await activate(page,'[data-wall]',{touch:width<761,wait:false});
        const committed=await saved(page);
        assert.equal(committed.moves,1);assert.equal(committed.pieces[0].pos,route.at(-1)??8);
        assert.equal(committed.currentActor,'B1');
        // Segundo intento de commit no duplica muros ni adelanta otro turno.
        assert.ok(await page.evaluate(()=>window.latestMotionProbe.blocked));
        assert.deepEqual(await saved(page),committed);
        assert.equal(await page.evaluate(()=>window.latestMotionProbe.flash),1);
        await idle(page);await settle(page);
        assert.equal(await page.locator('#turnDisc').innerText(),'B1');
        await page.reload();await idle(page);assert.deepEqual(await saved(page),committed);
      }
      report.checks.push(`${width}×${height}: sin scroll, recursos, targets, 0/1/2 pasos, giro, retorno, bloqueo, muro y guardado`);
      if(width===360){
        for(const [w,h] of [[360,640],[740,360],[360,740]]){
          await page.setViewportSize({width:w,height:h});
          await page.waitForFunction(h=>Math.abs(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--viewport-height'))-h)<1,h);
          const resized=await layout(page);assert.ok(resized.page[0]<=w&&resized.page[1]<=h,JSON.stringify(resized));
          assert.deepEqual(resized.clipped,[]);assert.ok(resized.targets.every(t=>t.correct));
          await page.screenshot({path:path.join(out,`viewport-${w}x${h}.png`)});
        }
        report.checks.push('Altura disponible 640px y rotación 740×360: tablero, turno y marcador visibles sin scroll');
      }
      await context.close();
    }
    const {page,context}=await create(390,844);
    // Recarga durante un paso: solo el borrador desaparece; el motor no avanzó.
    await activate(page,'[data-to="9"]',{wait:false});await page.reload();await idle(page);
    assert.equal(await page.locator('[data-piece="A1"]').getAttribute('transform'),'translate(180 180)');
    // Recarga durante muro: el turno ya se guardó exactamente una vez.
    await activate(page,'[data-wall]',{wait:false});const committed=await saved(page);
    await page.reload();await idle(page);assert.deepEqual(await saved(page),committed);
    // Nueva partida durante el efecto cancela toda continuación pendiente.
    await reset(page);await activate(page,'[data-to="9"]',{wait:false});await page.locator('#new').click();await settle(page);await idle(page);
    assert.equal((await saved(page)).moves,0);assert.equal(await page.locator('#turnDisc').innerText(),'A1');
    await activate(page,'[data-wall]',{wait:false});page.once('dialog',d=>d.accept());await page.locator('#new').click();await settle(page);await idle(page);
    assert.equal((await saved(page)).moves,0);assert.equal(await page.locator('.wall-confirmation').count(),0);
    // Confirmación rechazada conserva la partida.
    await activate(page,'[data-wall]');const current=await saved(page);
    page.once('dialog',d=>d.dismiss());await page.locator('#new').click();assert.deepEqual(await saved(page),current);
    // Regresar por el recorrido provisional no cambia la partida confirmada.
    await reset(page);await activate(page,'[data-to="15"]');await activate(page,'[data-to="16"]');
    await page.locator('#cancel').click();await idle(page);
    assert.equal(await page.locator('[data-piece="A1"]').getAttribute('transform'),'translate(180 180)');
    assert.equal((await saved(page))?.moves??0,0);
    report.checks.push('Recarga durante paso/muro, reinicio durante ambas transiciones, confirmación y cancelación del recorrido');
    // Aislamiento real provocado por un muro y paso al compañero en los turnos de A.
    let isolated=engine.initialState();isolated.walls=[1,7,9].map(to=>engine.wallKey(8,to));isolated.moves=3;
    assert.ok(engine.verifyState(isolated));await reset(page,isolated);
    await activate(page,'[data-wall="15"]');
    assert.equal(await page.locator('[data-piece="A1"].token-isolated').count(),1);
    assert.equal(await page.locator('#scoreA').innerText(),'1');
    assert.match(await page.locator('[data-piece="A1"]').getAttribute('aria-label'),/territorio asegurado/);
    await activate(page,'[data-wall]');assert.equal(await page.locator('#turnDisc').innerText(),'A2');
    // Partida determinista completa con reducción de movimiento; comprobar todos los estados contra motor.
    await page.emulateMedia({reducedMotion:'reduce'});let game=engine.initialState();await reset(page,game);
    let seed=1541,transitions=0;
    const rnd=n=>{seed=(1664525*seed+1013904223)>>>0;return seed%n;};
    while(!game.over){
      const actor=game.currentActor,path=[engine.pieceById(game,actor).pos];
      for(let steps=rnd(3);steps>0;steps--){const options=engine.availableMoves(game,actor,path.at(-1));if(!options.length)break;const to=options[rnd(options.length)];path.push(to);await activate(page,`[data-to="${to}"]`);}
      const walls=engine.wallOptions(game,path.at(-1)),to=walls[rnd(walls.length)];
      game=engine.applyTurn(game,{actor,path,to});await activate(page,`[data-wall="${to}"]`);
      assert.deepEqual(await saved(page),game);assert.equal(await page.locator('.piece-token').count(),4);
      assert.equal(await page.locator('.token-isolated').count(),4-engine.activeIds(game).size);
      assert.equal(await page.locator('.wall-built').count(),game.moves);
      transitions++;
    }
    assert.ok(await page.locator('#endScreen').isVisible());
    assert.equal(await page.evaluate(()=>document.getAnimations().length),0);
    assert.equal(await page.locator('[data-wall],[data-to]').count(),0);
    await page.screenshot({path:path.join(out,'partida-finalizada.png')});
    await page.reload();await idle(page);assert.deepEqual(await saved(page),game);assert.ok(await page.locator('#endScreen').isVisible());
    await page.locator('#new').click();await idle(page);assert.equal((await saved(page)).moves,0);
    // Preferencia modificada en plena animación: termina, no queda bloqueada.
    await page.emulateMedia({reducedMotion:'no-preference'});await activate(page,'[data-to="9"]',{wait:false});
    await page.emulateMedia({reducedMotion:'reduce'});await idle(page);assert.equal(await page.evaluate(()=>document.getAnimations().length),0);
    // Teclado y autorepetición: una única acción.
    await reset(page);await page.locator('[data-to="9"]').focus();await page.keyboard.press('Enter');await idle(page);
    const prompt=await page.locator('#prompt').innerText();
    await page.evaluate(()=>document.querySelector('[data-wall]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',repeat:true,bubbles:true})));
    assert.equal(await page.locator('#prompt').innerText(),prompt);assert.equal((await saved(page))?.moves??0,0);
    report.checks.push(`Aislamiento, alternancia, ${transitions} turnos de partida completa, finalización, 4 fichas visibles, movimiento reducido y teclado`);
    await context.close();
    // El HTML autónomo funciona por file://, sin servidor ni recursos externos.
    const offline=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'}),single=await offline.newPage();
    single.on('pageerror',e=>errors.push(e.message));
    await single.goto(pathToFileURL(path.join(root,'Cerconexo_Premium_Listo_Para_Jugar.html')).href);await idle(single);
    await activate(single,'[data-to="9"]');await activate(single,'[data-wall]');const singleSave=await saved(single);
    assert.equal(singleSave.moves,1);await single.reload();await idle(single);assert.deepEqual(await saved(single),singleSave);await offline.close();
    report.checks.push('HTML autónomo file://: movimiento, muro, guardado y recarga');
    assert.deepEqual(errors,[]);
    await fs.writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify(report,null,2));
  }finally{await browser.close();await site.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
