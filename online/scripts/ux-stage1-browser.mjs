import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { startUX } from './ux-local.mjs';
const site=await startUX(),browser=await chromium.launch({channel:'msedge',headless:true}),report={ok:false,checks:[],errors:[],external:[]};
await mkdir(new URL('../evidence/',import.meta.url),{recursive:true});
try{
  for(const [width,height]of[[390,844],[1440,1000]]){
    const context=await browser.newContext({viewport:{width,height},hasTouch:width<600,isMobile:width<600,reducedMotion:'reduce'});
    await context.route('**/*',route=>{if(new URL(route.request().url()).hostname==='127.0.0.1')return route.continue();report.external.push(route.request().url());return route.abort();});
    const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
    await page.goto(site.base+'/clasico/?new=1');await page.locator('#newDialog[open]').waitFor();await page.locator('[data-online-control]').click();
    assert.equal(await page.locator('#newDialog .selector-columns').isVisible(),false);assert.equal(await page.locator('[name=onlinePlayers]').count(),0);
    await page.locator('#startLocal').click();await page.locator('[data-entry=create]').waitFor();assert.equal(await page.locator('#createForm').isVisible(),false);
    await page.locator('[data-entry=create]').click();assert.equal(await page.locator('#policyField').isVisible(),false);
    await page.locator('#createForm [name=players]').selectOption('2');assert.equal(await page.locator('#policyField').isVisible(),true);assert.equal(await page.locator('[name=policy]').inputValue(),'piece');
    await page.locator('#createForm [name=policy]').selectOption('team');await page.locator('#createForm [name=players]').selectOption('4');assert.equal(await page.locator('[name=policy]').inputValue(),'piece');
    await page.locator('#createForm [name=name]').fill('Anfitrión');await page.locator('#createForm button[type=submit]').click();await page.locator('#connection[data-phase=connected]').waitFor();
    assert.equal(await page.locator('#clocks').count(),0);assert.equal(await page.locator('.top nav').count(),0);assert.equal(await page.locator('#copyInvite').isVisible(),true);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    if(width===390)assert.ok(await page.locator('#startButton').evaluate(n=>n.getBoundingClientRect().bottom)<=height,'Acciones principales fuera de la pantalla móvil');
    await page.screenshot({path:new URL(`../evidence/ux-stage1-lobby-${width}.png`,import.meta.url).pathname.replace(/^\/(\w:)/,'$1'),fullPage:true});
    const code=await page.locator('#roomCode').textContent();const join=await context.newPage();await join.goto(site.entry+'?room='+code+'&profile=2');
    await join.locator('#joinForm').waitFor();assert.equal(await join.locator('#joinCodeField').isVisible(),false);assert.equal(await join.locator('#createForm').isVisible(),false);
    await join.locator('#joinForm [name=name]').fill('Invitada');await join.locator('#joinForm button[type=submit]').click();await join.locator('#connection[data-phase=connected]').waitFor();
    assert.match(await join.locator('#lobbyHint').textContent(),/aprobación/);assert.equal(await join.locator('[name=players]:visible').count(),0);
    report.checks.push({width,configurationOnce:true,joinWithoutConfiguration:true,lobbyCompact:true});await context.close();
  }
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.external,[]);report.ok=true;
}catch(e){report.error=e.stack??e.message;process.exitCode=1;}
finally{await browser.close();await site.stop();await writeFile(new URL('../evidence/ux-stage1-browser.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
