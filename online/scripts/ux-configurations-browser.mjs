import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {startUX} from './ux-local.mjs';
import {eventually} from './runtime.mjs';
import {applyTurn,legalActors,wallOptions,availableMoves,territory} from '../../src/engine.mjs';
import {API_BASE} from '../config.mjs';
const publicPages=process.argv.includes('--public-pages');
const pagesOrigin='https://ligadejuegosymatematicas.github.io';
const site=publicPages?{entry:pagesOrigin+'/cerconexo/online/',stop:async()=>{}}:await startUX({port:8818,apiPort:8823}),browser=await chromium.launch({channel:'msedge',headless:true});
const report={ok:false,publicPages,frontendIntercepted:false,configurations:[],errors:[],external:[]},contexts=[];
const read=p=>p.locator('#publicState').textContent().then(JSON.parse);
await mkdir(new URL('../evidence/',import.meta.url),{recursive:true});
try{
  for(const[count,policy]of[[2,'piece'],[2,'team'],[4,'piece']]){
    const pages=[],seats=count===2?['A','B']:['A1','B1','A2','B2'];
    for(let i=0;i<count;i++){
      const context=await browser.newContext({viewport:{width:i===0?390:1440,height:i===0?844:1000},hasTouch:i===0,isMobile:i===0,reducedMotion:'no-preference'});contexts.push(context);
      await context.route('**/*',r=>{const url=new URL(r.request().url());if(publicPages?[pagesOrigin,API_BASE].includes(url.origin):url.hostname==='127.0.0.1')return r.continue();report.external.push(url.origin);return r.abort();});
      await context.addInitScript(()=>{
        const Original=WebSocket;window.__uxMessages=[];
        window.WebSocket=class extends Original{constructor(...args){super(...args);window.__uxSocket=this;this.addEventListener('message',event=>{try{const m=JSON.parse(event.data);if(m.type==='ack'||m.type==='error')window.__uxMessages.push(m);}catch{}});}send(data){try{const m=JSON.parse(data);if(m.actionId)window.__uxLast=m;}catch{}return super.send(data);}};
        const animate=Element.prototype.animate;window.__uxCelebrations=0;Element.prototype.animate=function(...args){if(this.hasAttribute('data-final-title'))window.__uxCelebrations++;return animate.apply(this,args);};
      });
      const p=await context.newPage();p.on('pageerror',e=>report.errors.push(e.message));pages.push(p);
    }
    const host=pages[0];await host.goto(site.entry+'?action=create');await host.locator('#createForm [name=players]').selectOption(String(count));if(count===2)await host.locator('#createForm [name=policy]').selectOption(policy);
    await host.locator('#createForm [name=name]').fill('Ana');await host.locator('#createForm button[type=submit]').click();await host.locator('#connection[data-phase=connected]').waitFor();const code=(await read(host)).code;
    for(let i=1;i<count;i++){
      const p=pages[i];await p.goto(site.entry+'?room='+code);await p.locator('#joinForm [name=name]').fill('Persona '+(i+1));await p.locator('#joinForm button[type=submit]').click();await p.locator('#connection[data-phase=connected]').waitFor();
      const request=host.locator('#requests .request');await request.locator('select').selectOption(seats[i]);await request.getByRole('button',{name:'Admitir',exact:true}).click();await p.locator('#readyButton:visible').waitFor();
    }
    for(const p of pages)await p.locator('#readyButton').click();await host.locator('#startButton:enabled').click();for(const p of pages)await p.locator('[data-classic-connection][data-phase=connected]').waitFor();
    let official=(await read(host)).classic.game,turns=0,duplicate=false,reloaded=false;
    while(!official.over){
      assert.ok(turns++<100);const all=await Promise.all(pages.map(read)),s=all[0],actor=s.classic.draft.actor??legalActors(official)[0],index=all.findIndex(v=>v.self.controlledPieces.includes(actor)),p=pages[index];
      if(!s.classic.draft.actor){await p.locator(`[data-actor=${actor}] .actor-hit`).click();await eventually(async()=>(await read(p)).classic.draft.actor===actor,'No seleccionó ficha');}
      if(turns===1){
        const first=availableMoves(official,actor,s.classic.draft.path.at(-1))[0];await p.locator(`[data-to="${first}"] .move-hit`).click();await eventually(async()=>(await read(p)).classic.draft.path.length===2,'No guardó el paso');const before=await read(p);
        // Raw replay uses exactly the original action id, never a second intention.
        await p.evaluate(()=>window.__uxSocket.send(JSON.stringify(window.__uxLast)));await eventually(()=>p.evaluate(()=>window.__uxMessages.some(m=>m.duplicate)),'No confirmó duplicado');duplicate=true;
        const opponent=pages[all.findIndex(v=>!v.self.controlledPieces.includes(actor))];await opponent.evaluate(({code,revision,matchId,to})=>window.__uxSocket.send(JSON.stringify({type:'classic.step',roomId:code,protocolVersion:1,actionId:crypto.randomUUID(),expectedRevision:revision,params:{to,matchId}})),{code,revision:before.revision,matchId:before.matchId,to:first});
        await eventually(()=>opponent.evaluate(()=>window.__uxMessages.some(m=>m.type==='error')),'No rechazó ficha ajena');
        await p.reload();await p.locator('[data-classic-connection][data-phase=connected]').waitFor();const restored=await read(p);assert.deepEqual(restored.classic,before.classic);assert.ok(restored.clock.remainingMs.A<=before.clock.remainingMs.A);reloaded=true;
      }
      const snapshot=await read(p),path=snapshot.classic.draft.path,options=wallOptions(official,path.at(-1)),to=options[turns%options.length];official=applyTurn(official,{actor,path,to});await p.locator(`[data-wall="${to}"] .wall-hit`).click();
      await eventually(async()=>(await Promise.all(pages.map(read))).every(v=>JSON.stringify(v.classic.game)===JSON.stringify(official)),'Divergencia entre navegadores');
    }
    for(const p of pages){
      const s=await read(p);assert.equal(s.outcome.reason,'territory');assert.deepEqual(s.outcome.score,territory(official).score);
      const winner=s.outcome.winners.length===1?s.outcome.winners[0]:'draw',role=winner==='draw'?'draw':s.self.seat[0]===winner?'winner':'loser';assert.equal(await p.locator('[data-classic-result]').getAttribute('data-final-role'),role);assert.equal(await p.locator('[data-classic-result]').getAttribute('data-final-winner'),winner);
      // The surface remains fully interactive while a winner's brief glow runs.
      assert.equal(await p.evaluate(()=>window.__uxCelebrations),role==='winner'?1:0);
      await p.locator('[data-final-inspection] [data-inspect]').first().click();assert.equal(await p.locator('[data-classic-inspection-info]').isVisible(),true);
    }
    await host.screenshot({path:new URL(`../evidence/ux-final-${count}-${policy}-mobile.png`,import.meta.url).pathname.replace(/^\/(\w:)/,'$1'),fullPage:true});
    if(count===4)await pages[1].screenshot({path:new URL('../evidence/ux-final-desktop.png',import.meta.url).pathname.replace(/^\/(\w:)/,'$1'),fullPage:true});
    const old=(await read(host)).matchId;await host.locator('[data-classic-propose-rematch]').click();for(const p of pages.slice(1)){
      await p.locator('[data-rematch-accept]').click();
      const id=(await read(p)).self.id;
      await eventually(async()=>(await Promise.all(pages.map(read))).every(s=>s.rematch.votes[id]===true),'Aceptación no compartida');
    }
    await eventually(async()=>(await Promise.all(pages.map(read))).every(s=>s.status==='active'&&s.matchId!==old),'Revancha sin unanimidad o no inició',15000);
    for(const p of pages){const s=await read(p);assert.equal(s.classic.game.moves,0);assert.ok(s.clock.remainingMs.A>470000);assert.equal(s.clock.remainingMs.B,480000);assert.equal(s.previousResults.length,1);assert.deepEqual(s.outcome,null);assert.equal(s.self.seat,seats[pages.indexOf(p)]);}
    await host.reload();await host.locator('[data-classic-connection][data-phase=connected]').waitFor();assert.equal(await host.evaluate(()=>window.__uxCelebrations),0);
    report.configurations.push({players:count,policy,turns,score:territory(official).score,duplicate,reloaded,inspection:true,unanimousRematch:true,finalRoles:true});
    for(const p of pages)await p.context().close();
  }
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.external,[]);report.ok=true;
}catch(e){report.error=e.stack??e.message;process.exitCode=1;}
finally{for(const c of contexts)await c.close();await browser.close();await site.stop();await writeFile(new URL(`../evidence/ux-configurations-browser${publicPages?'-public':''}.json`,import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
