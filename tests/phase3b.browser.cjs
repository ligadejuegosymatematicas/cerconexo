const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.CERCONEXO_PLAYWRIGHT_PATH||'playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'validation/phase3b');
const idle=p=>p.waitForFunction(()=>document.getElementById('board').getAttribute('aria-busy')==='false');
const saved=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('wallgo-league-v2'))?.game);
async function load(page,state){
  await page.evaluate(game=>{localStorage.clear();if(game)localStorage.setItem('wallgo-league-v2',JSON.stringify({game}));},state);
  await page.reload();await idle(page);await page.evaluate(()=>Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{}))));
}
async function choose(page,to,{keyboard=false,wait=true}={}){
  const el=page.locator(`[data-wall="${to}"]`);
  if(keyboard){await el.focus();await page.keyboard.press('Enter');}
  else{const b=await el.boundingBox();assert.ok(b);await page.touchscreen.tap(b.x+b.width/2,b.y+b.height/2);}
  if(wait)await idle(page);
}
async function roster(page){return page.evaluate(()=>[...document.querySelectorAll('.piece-token')].map(node=>({id:node.dataset.piece,transform:node.getAttribute('transform'),secured:node.classList.contains('token-isolated'),badge:getComputedStyle(node.querySelector('.marker-check')).display!=='none',body:getComputedStyle(node.querySelector('.token-body')).fill,label:node.querySelector('.token-label').textContent,active:node.querySelector('.token-body').classList.contains('token-active')})));}
async function metric(page){return page.evaluate(()=>{
  const box=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
  const notice=document.getElementById('recentEvent'),n=box(notice),b=box(document.getElementById('board'));
  return {page:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],viewport:[innerWidth,innerHeight],board:b,
    noticeHidden:notice.hidden,notice:n,clipped:[...document.querySelectorAll('.team-roster,.player,.prompt')].filter(el=>el.scrollWidth>el.clientWidth+1||el.scrollHeight>el.clientHeight+1).map(el=>el.className),
    noticeClipped:notice.hidden?false:notice.scrollHeight>notice.clientHeight+1||notice.scrollWidth>notice.clientWidth+1||[...notice.querySelectorAll('span,strong')].some(el=>{const r=box(el);return r.right>n.right+1||r.bottom>n.bottom+1;}),
    overlap:!notice.hidden&&Math.min(n.right,b.right)>Math.max(n.x,b.x)&&Math.min(n.bottom,b.bottom)>Math.max(n.y,b.y)};
});}
(async()=>{
  await fs.mkdir(out,{recursive:true});
  const fixtures=await import('./participation-fixtures.mjs'),territorial=await import('./territory-fixtures.mjs');
  const engine=await import(pathToFileURL(path.join(root,'src/engine.mjs')));
  const {startPagesServer}=await import('./pages-server.mjs');
  const site=await startPagesServer(),browser=await chromium.launch({headless:true,channel:'msedge'});
  const report={checks:[],screens:[],events:[]},errors=[];
  async function create(width=390,height=844,motion='no-preference'){
    const context=await browser.newContext({viewport:{width,height},isMobile:width<761,hasTouch:true,reducedMotion:motion});
    await context.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{
      window.confirmations=[];window.participationNotices=[];
      const seen=new Set([...document.querySelectorAll('.token-isolated')].map(n=>n.dataset.piece));
      new MutationObserver(()=>{
        for(const node of document.querySelectorAll('.token-isolated')){
          if(seen.has(node.dataset.piece))continue;seen.add(node.dataset.piece);
          window.confirmations.push({id:node.dataset.piece,at:performance.now(),busy:document.getElementById('board').getAttribute('aria-busy'),heading:document.querySelector('#turnBanner h2').textContent,durations:node.querySelector('.secured-aura').getAnimations().map(a=>a.effect.getTiming().duration)});
          const before=localStorage.getItem('wallgo-league-v2');
          document.querySelector('[data-wall]')?.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
          window.confirmations.at(-1).duplicateBlocked=before===localStorage.getItem('wallgo-league-v2');
        }
      }).observe(document.getElementById('piecesLayer'),{attributes:true,subtree:true});
      const notice=document.getElementById('recentEvent');let active=false;
      new MutationObserver(()=>{
        if(!notice.hidden){
          if(active)return;active=true;
          const entry={text:document.getElementById('matchupLabel').textContent+' '+document.getElementById('matchupPlayers').textContent+' '+notice.textContent,announcement:document.getElementById('participationAnnouncement').textContent,start:performance.now(),busy:document.getElementById('board').getAttribute('aria-busy'),duel:[...document.querySelectorAll('.duel-aura')].filter(n=>n.getAnimations().length).map(n=>n.parentNode.dataset.piece)};
          window.participationNotices.push(entry);
          const timer=setInterval(()=>{if(notice.hidden){entry.end=performance.now();clearInterval(timer);active=false;}},10);
        }else active=false;
      }).observe(notice,{attributes:true,childList:true,subtree:true});
    }));
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>errors.push(r.url()));
    await page.goto(site.url);await idle(page);return {page,context};
  }
  try{
    for(const [width,height] of [[1440,900],[1366,768],[390,844],[360,740]]){
      const {page,context}=await create(width,height);
      const initial=await roster(page);assert.equal(initial.length,4);assert.ok(initial.every(p=>!p.badge&&!p.secured));
      const baseline=await metric(page);assert.deepEqual(baseline.page,[width,height]);assert.deepEqual(baseline.clipped,[]);
      if(width<761)assert.equal(baseline.board.width,width-24);
      await page.screenshot({path:path.join(out,`inicial-${width}x${height}.png`)});
      const fixture=fixtures.participationFixture();await load(page,fixture.before);
      const previous=await roster(page);await choose(page,fixture.to);
      const state=await roster(page);assert.equal(state.length,4);assert.equal(state.filter(p=>p.badge).length,1);
      const a1=state.find(p=>p.id==='A1');assert.ok(a1.secured&&!a1.active);assert.equal(a1.transform,previous.find(p=>p.id==='A1').transform);assert.equal(a1.body,'rgb(245, 158, 11)');assert.equal(a1.label,'A1');
      assert.equal(await page.locator('#player-A1 .state-full').innerText(),'Asegurado');assert.equal(await page.locator('#player-A2 .state-full').innerText(),'En juego');
      assert.equal(await page.locator('#turnDisc').innerText(),fixture.after.currentActor);assert.deepEqual(await saved(page),fixture.after);
      let probes=await page.evaluate(()=>({confirmations:window.confirmations,notices:window.participationNotices}));
      assert.deepEqual(probes.confirmations.map(p=>p.id),['A1']);assert.deepEqual(probes.confirmations[0].durations,[350]);
      assert.equal(probes.confirmations[0].duplicateBlocked,true);
      assert.equal(probes.confirmations[0].heading,'RESOLVIENDO');
      assert.equal(probes.notices.length,1);assert.equal(probes.notices[0].busy,'false');assert.match(probes.notices[0].text,/1 vs\. 2.*A2 vs\. B1 y B2/);
      assert.match(probes.notices[0].announcement,/A2 jugará todos los turnos del equipo A/);
      const measured=await metric(page);assert.deepEqual(measured.page,[width,height]);assert.deepEqual(measured.clipped,[]);assert.equal(measured.noticeClipped,false);assert.equal(measured.overlap,false);assert.equal(measured.board.width,baseline.board.width);
      await page.screenshot({path:path.join(out,`uno-vs-dos-${width}x${height}.png`)});
      // El siguiente turno puede construir mientras el aviso sigue visible.
      const nextActor=fixture.after.currentActor,pos=engine.pieceById(fixture.after,nextActor).pos,to=engine.wallOptions(fixture.after,pos)[0];
      await choose(page,to);assert.equal((await saved(page)).currentActor,'A2');
      assert.equal(await page.evaluate(()=>window.participationNotices.length),1);
      // Última disputa: ambos halos pertenecen solo a las fichas que continúan.
      const last=fixtures.participationFixture({team:'B',alreadyA:true});await load(page,last.before);await choose(page,last.to);
      probes=await page.evaluate(()=>({confirmations:window.confirmations,notices:window.participationNotices}));
      assert.deepEqual(probes.confirmations.map(p=>p.id),['B1']);assert.equal(probes.notices.length,1);
      assert.match(probes.notices[0].text,/1 vs\. 1 · Última disputa.*A2 vs\. B2/);assert.deepEqual(probes.notices[0].duel.sort(),['A2','B2']);
      assert.equal((await roster(page)).filter(p=>p.badge).length,2);
      await page.screenshot({path:path.join(out,`ultima-disputa-${width}x${height}.png`)});
      await page.waitForTimeout(1600);
      const finished=await page.evaluate(()=>window.participationNotices[0]);assert.equal(finished.end,undefined);assert.ok(await page.locator('#recentEvent').isVisible());
      await page.screenshot({path:path.join(out,`uno-vs-uno-${width}x${height}.png`)});
      report.screens.push({viewport:[width,height],boardWidth:baseline.board.width,notice:'persistente'});report.events.push(probes);
      await context.close();
    }
    report.checks.push('Cuatro resoluciones: fichas persistentes con color e ID, distintivo circular, estados legibles, tablero sin reducción ni scroll; avisos persistentes sin bloqueo y halos solo de fichas activas');
    const landscape=await create(740,360),duel=fixtures.participationFixture({team:'B',alreadyA:true});
    await load(landscape.page,duel.before);await choose(landscape.page,duel.to);
    const rotated=await metric(landscape.page);assert.deepEqual(rotated.page,[740,360]);assert.deepEqual(rotated.clipped,[]);assert.equal(rotated.noticeClipped,false);assert.equal(rotated.overlap,false);
    await landscape.page.screenshot({path:path.join(out,'ultima-disputa-740x360.png')});await landscape.context.close();
    report.checks.push('Rotación 740×360: distintivos, participantes y aviso dentro de la pantalla, sin cubrir el tablero');
    const {page,context}=await create();
    // Simetría B y acceso por teclado.
    const b=fixtures.participationFixture({team:'B'});await load(page,b.before);await choose(page,b.to,{keyboard:true});
    assert.match(await page.locator('#matchupPlayers').innerText(),/A1 y A2 vs\. B2/);assert.equal((await roster(page)).filter(p=>p.badge).length,1);
    // Dos confirmaciones simultáneas, sin una secuencia por ficha.
    const direct=fixtures.directDuelFixture();await load(page,direct.before);await choose(page,direct.to);
    let probes=await page.evaluate(()=>({confirmations:window.confirmations,notices:window.participationNotices}));
    assert.deepEqual(probes.confirmations.map(p=>p.id).sort(),['A1','B1']);assert.ok(Math.abs(probes.confirmations[0].at-probes.confirmations[1].at)<30);assert.equal(probes.notices.length,1);
    // La prioridad del resultado suprime avisos de enfrentamiento en la separación final.
    const end=territorial.conquestFixture({both:true});await load(page,end.before);await choose(page,end.to);
    assert.ok(await page.locator('#endScreen').isVisible());assert.equal(await page.evaluate(()=>window.participationNotices.length),0);
    assert.equal((await roster(page)).filter(p=>p.badge).length,4);assert.deepEqual(await saved(page),end.after);
    assert.equal(await page.locator('#scoreA').innerText(),'12');assert.equal(await page.locator('#scoreB').innerText(),'37');
    // Muro ordinario: ni confirmación ni mensaje nuevos.
    await load(page,engine.initialState());await choose(page,9);assert.equal(await page.evaluate(()=>window.confirmations.length+window.participationNotices.length),0);
    // Recarga a mitad de la confirmación, luego otra recarga de la partida asegurada.
    const a=fixtures.participationFixture();await load(page,a.before);await choose(page,a.to,{wait:false});
    await page.waitForFunction(()=>document.querySelector('.secured-aura').getAnimations().length>0);
    await page.reload();await idle(page);assert.deepEqual(await saved(page),a.after);
    assert.equal((await roster(page)).filter(p=>p.badge).length,1);assert.equal(await page.evaluate(()=>window.confirmations.length+window.participationNotices.length),0);
    await page.reload();await idle(page);assert.equal((await roster(page)).filter(p=>p.badge).length,1);
    // Reiniciar cancela los efectos y los avisos de la partida previa.
    await load(page,a.before);await choose(page,a.to,{wait:false});await page.waitForFunction(()=>document.querySelector('.secured-aura').getAnimations().length>0);
    page.once('dialog',d=>d.accept());await page.locator('#new').click();await page.locator('#startLocal').click();await idle(page);await page.waitForTimeout(1600);
    assert.equal((await saved(page)).moves,0);assert.ok((await roster(page)).every(p=>!p.badge));assert.ok(await page.locator('#recentEvent').isHidden());
    // Preferencia dinámica y preferencia al iniciar: confirmación directa sin perder mensajes.
    await load(page,a.before);await choose(page,a.to,{wait:false});await page.waitForFunction(()=>document.querySelector('.secured-aura').getAnimations().length>0);
    await page.emulateMedia({reducedMotion:'reduce'});await idle(page);assert.equal(await page.evaluate(()=>document.getAnimations().length),0);
    await load(page,a.before);await choose(page,a.to);
    assert.ok((await roster(page)).find(p=>p.id==='A1').badge);assert.equal(await page.evaluate(()=>document.getAnimations().length),0);
    assert.equal(await page.evaluate(()=>window.participationNotices.length),1);assert.match(await page.locator('#participationAnnouncement').innerText(),/A1 aseguró su territorio/);
    await context.close();
    report.checks.push('Simetría, teclado, transición directa a 1 vs. 1, confirmaciones simultáneas, fin de partida prioritario, sin conquista, recarga durante/después, reinicio y movimiento reducido');
    // El HTML autónomo restaura los mismos distintivos y no repite avisos.
    const offline=await browser.newContext({viewport:{width:360,height:740},hasTouch:true,reducedMotion:'reduce'}),single=await offline.newPage();
    single.on('pageerror',e=>errors.push(e.message));await single.goto(pathToFileURL(path.join(root,'Cerconexo_Premium_Listo_Para_Jugar.html')).href);await idle(single);
    await load(single,a.before);await choose(single,a.to);await single.reload();await idle(single);
    assert.deepEqual(await saved(single),a.after);assert.equal((await roster(single)).filter(p=>p.badge).length,1);assert.ok(await single.locator('#recentEvent').isHidden());await offline.close();
    report.checks.push('HTML autónomo file://: confirmación, turnos, guardado, distintivo persistente y recarga sin celebraciones');
    assert.deepEqual(errors,[]);report.errors=errors;await fs.writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  }finally{await browser.close();await site.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
