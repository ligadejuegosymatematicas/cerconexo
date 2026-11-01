import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {startUX} from './ux-local.mjs';
const site=await startUX(),browser=await chromium.launch({channel:'msedge',headless:true}),contexts=[],report={ok:false,checks:[],external:[],errors:[]};
const state=page=>page.locator('#publicState').textContent().then(JSON.parse);
await mkdir(new URL('../evidence/',import.meta.url),{recursive:true});
try{
  const pages=[];for(let i=0;i<2;i++){const c=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});contexts.push(c);await c.route('**/*',r=>{if(new URL(r.request().url()).hostname==='127.0.0.1')return r.continue();report.external.push(r.request().url());return r.abort();});const p=await c.newPage();pages.push(p);p.on('pageerror',e=>report.errors.push(e.message));}
  const [a,b]=pages;await a.goto(site.entry+'?action=create');await a.locator('#createForm [name=players]').selectOption('2');await a.locator('#createForm [name=name]').fill('Ana');await a.locator('#createForm button[type=submit]').click();await a.locator('#connection[data-phase=connected]').waitFor();
  const code=(await state(a)).code;await b.goto(site.entry+'?room='+code);await b.locator('#joinForm [name=name]').fill('Beto');await b.locator('#joinForm button[type=submit]').click();await b.locator('#connection[data-phase=connected]').waitFor();
  const request=a.locator('#requests .request');await request.locator('select').selectOption('B');await request.getByRole('button',{name:'Admitir',exact:true}).click();await b.locator('#readyButton:visible').waitFor();
  await a.locator('#readyButton').click();await b.locator('#readyButton').click();await a.locator('#startButton:enabled').click();await a.locator('[data-classic-connection][data-phase=connected]').waitFor();
  await a.locator('[data-to="9"] .move-hit').click();await a.waitForFunction(()=>JSON.parse(document.querySelector('#publicState').textContent).classic.draft.path.join(',')==='8,9');const before=await state(a);
  await a.screenshot({path:new URL('../evidence/ux-active-mobile.png',import.meta.url).pathname.replace(/^\/(\w:)/,'$1'),fullPage:true});
  await a.setViewportSize({width:1440,height:1000});await a.screenshot({path:new URL('../evidence/ux-active-desktop.png',import.meta.url).pathname.replace(/^\/(\w:)/,'$1'),fullPage:true});await a.setViewportSize({width:390,height:844});
  await a.locator('[data-classic-actions-menu]>summary').click();await a.locator('.classic-session-actions>a').click();await a.locator('[data-online-continue]').waitFor();
  await a.screenshot({path:new URL('../evidence/ux-continue-home-mobile.png',import.meta.url).pathname.replace(/^\/(\w:)/,'$1'),fullPage:true});
  // A read-only resume cannot steal the other browser's connection.
  const inspect=()=>b.evaluate(async({api,code})=>{const saved=JSON.parse(localStorage.getItem('cerconexo-m6-session-v1:1:'+code));return(await(await fetch(api+'/api/rooms/'+code+'/resume',{method:'POST',headers:{authorization:'Bearer '+saved.credential,'content-type':'application/json'},body:'{}'})).json()).state;},{api:site.api,code});
  await new Promise(r=>setTimeout(r,1300));const away=await inspect();assert.equal(away.clock.graceUntil,null);assert.ok(away.clock.remainingMs.A<before.clock.remainingMs.A-1000);assert.deepEqual(away.classic,before.classic);report.checks.push('Inicio mantiene el reloj y conserva el paso parcial');
  await a.locator('[data-online-continue]').click();await a.locator('[data-classic-connection][data-phase=connected]').waitFor();const restored=await state(a);assert.equal(restored.self.id,before.self.id);assert.deepEqual(restored.classic,before.classic);assert.ok(restored.clock.remainingMs.A<=away.clock.remainingMs.A);report.checks.push('Continuar recupera identidad y partida sin credencial manual');
  await a.locator('[data-classic-actions-menu]>summary').click();await a.locator('.classic-access>summary').click();await a.locator('[data-classic-disconnect]').click();await a.locator('[data-classic-connection][data-phase=disconnected]').waitFor();
  const offline=await inspect();assert.ok(offline.clock.graceUntil>offline.serverNow);await a.locator('[data-classic-reconnect]').click();await a.locator('[data-classic-connection][data-phase=connected]').waitFor();assert.deepEqual((await state(a)).classic,before.classic);report.checks.push('Desconectar conserva la gracia normal; reconectar no duplica el movimiento');
  assert.equal(await a.locator('[data-classic-invite]:visible').count(),0);assert.deepEqual(report.external,[]);assert.deepEqual(report.errors,[]);report.ok=true;
}catch(e){report.error=e.stack??e.message;process.exitCode=1;}
finally{for(const c of contexts)await c.close();await browser.close();await site.stop();await writeFile(new URL('../evidence/ux-continuity-browser.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
