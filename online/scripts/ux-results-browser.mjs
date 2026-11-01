import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {startPagesServer} from '../../tests/pages-server.mjs';
import {resultFixture} from '../../tests/result-fixtures.mjs';
import {ArenaSession,ARENA_SAVE_KEY} from '../../arena/src/session.mjs';
import {arenaDecisionTeam,arenaCpuActions} from '../../arena/src/cpuStrategy.mjs';
import {saveArenaControl,ARENA_CPU_KEY} from '../../arena/src/cpuConfig.mjs';
const site=await startPagesServer(),browser=await chromium.launch({channel:'msedge',headless:true}),report={ok:false,checks:[],errors:[],external:[]};let diagnosticPage;
await mkdir(new URL('../evidence/',import.meta.url),{recursive:true});
function arenaFixture(mode){
  const storage={setItem(){}},session=new ArenaSession(storage,{mode,policy:'piece'});let seed=91;
  for(let n=0;n<600;n++){
    const choices=arenaCpuActions(session.game),walls=choices.filter(a=>a.type==='wall'),pool=walls.length?walls:choices.filter(a=>a.type==='select'||a.type==='discard');assert.ok(pool.length);
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;const action=pool[seed%pool.length],before=session.encode(),team=arenaDecisionTeam(session.game);session.dispatch(action);
    if(session.game.over)return{before,after:session.encode(),action,winners:session.game.winners,team};
  }throw Error('Fixture Arena no terminó');
}
async function context(reducedMotion='no-preference',width=390){
  const c=await browser.newContext({viewport:{width,height:width<600?844:1000},hasTouch:width<600,isMobile:width<600,reducedMotion});
  await c.route('**/*',r=>{if(new URL(r.request().url()).hostname==='127.0.0.1')return r.continue();report.external.push(r.request().url());return r.abort();});
  await c.addInitScript(()=>{window.__celebrations=0;const animate=Element.prototype.animate;Element.prototype.animate=function(...args){if(this.hasAttribute('data-final-title'))window.__celebrations++;return animate.apply(this,args);};});
  const p=await c.newPage();diagnosticPage=p;p.on('pageerror',e=>report.errors.push(e.message));return{c,p};
}
try{
  for(const kind of (process.argv.includes('--arena')?[]:['winner','loser','shared','draw','reduced'])){
    const {c,p}=await context(kind==='reduced'?'reduce':'no-preference'),fixture=resultFixture(kind==='loser'||kind==='shared'?{A:16,B:28}:kind==='draw'?{A:23,B:23}:{}),control=kind==='shared'?null:{version:1,type:'cpu',humanTeam:'A',difficulty:'beginner',seed:1};
    await p.goto(site.url);await p.evaluate(({game,control})=>localStorage.setItem('wallgo-league-v2',JSON.stringify({game,...(control?{control}:{})})),{game:fixture.before,control});await p.goto(site.url+'?continue=1');
    await p.locator(`[data-wall="${fixture.to}"]`).focus();await p.keyboard.press('Enter');await p.waitForFunction(()=>document.getElementById('endScreen').hidden===false&&document.getElementById('board').getAttribute('aria-busy')==='false');
    assert.equal(await p.locator('#endScreen').getAttribute('data-final-role'),kind==='reduced'?'winner':kind);assert.equal(await p.evaluate(()=>window.__celebrations),['winner','shared'].includes(kind)?1:0);
    const expected=fixture.after.winner==='Empate'?'draw':fixture.after.winner;assert.equal(await p.locator('#endScreen').getAttribute('data-final-winner'),expected);
    assert.deepEqual(await p.evaluate(()=>JSON.parse(localStorage.getItem('wallgo-league-v2')).game),fixture.after);
    await p.reload();await p.locator('#endScreen:not([hidden])').waitFor();assert.equal(await p.evaluate(()=>window.__celebrations),0);assert.equal(await p.evaluate(()=>document.getAnimations().length),0);
    if(kind==='shared')await p.screenshot({path:new URL('../evidence/ux-classic-local-result-mobile.png',import.meta.url).pathname.replace(/^\/(\w:)/,'$1'),fullPage:true});report.checks.push('Clásico '+kind+': resultado oficial y recarga sin efectos');await c.close();
  }
  for(const[mode,cpu]of[['duo',false],['duo',true],['duo','winner'],['ffa',false]]){
    const f=arenaFixture(mode),human=cpu==='winner'?f.winners[0]:f.team;
    const {c,p}=await context('no-preference',mode==='ffa'?1440:390),store=new Map(),storage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)};
    if(cpu)saveArenaControl(storage,ARENA_SAVE_KEY,f.before,{opponent:'cpu',humanTeam:human});else storage.setItem(ARENA_SAVE_KEY,f.before);
    // This case isolates the final animation from CPU strategy: its Worker reply
    // selects a known legal final wall. The unchanged controller and engine still
    // validate and apply it. Real CPU behavior is covered by the historical suite.
    if(cpu==='winner')await c.route('**/arena/src/cpuWorker.mjs',r=>r.fulfill({contentType:'text/javascript',body:`self.onmessage=({data})=>self.postMessage({id:data.id,revision:data.game.revision,action:${JSON.stringify(f.action)},nodes:0});`}));
    await p.goto(site.origin+'/cerconexo/arena/');await p.evaluate(entries=>{localStorage.clear();for(const[k,v]of entries)localStorage.setItem(k,v);},[...store]);await p.goto(site.origin+'/cerconexo/arena/?continue=1');
    assert.equal(f.action.type,'wall');if(cpu!=='winner')await p.locator(`[data-kind=wall][data-to="${f.action.to}"]`).click();await p.waitForFunction(()=>document.getElementById('turnBanner').hasAttribute('data-final-role'));
    const role=f.winners.length!==1?'draw':!cpu?'shared':f.winners[0]===human?'winner':'loser';assert.equal(await p.locator('#turnBanner').getAttribute('data-final-role'),role);assert.equal(await p.locator('#turnBanner').getAttribute('data-final-winner'),f.winners.length===1?f.winners[0]:'draw');assert.equal(await p.evaluate(()=>window.__celebrations),['shared','winner'].includes(role)?1:0);
    assert.deepEqual(JSON.parse(await p.evaluate(k=>localStorage.getItem(k),ARENA_SAVE_KEY)),JSON.parse(f.after));await p.reload();await p.locator('#turnBanner[data-final-role]').waitFor();assert.equal(await p.evaluate(()=>window.__celebrations),0);
    await p.screenshot({path:new URL(`../evidence/ux-arena-${mode}-${cpu?'cpu-'+role:'local'}-result.png`,import.meta.url).pathname.replace(/^\/(\w:)/,'$1'),fullPage:true});report.checks.push(`Arena ${mode}/${cpu?'CPU':'Local'}: ${role}, ganador ${f.winners.join('/')}, diario intacto`);await c.close();
  }
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.external,[]);report.ok=true;
}catch(e){report.error=e.stack??e.message;if(diagnosticPage&&!diagnosticPage.isClosed())report.diagnostic=await diagnosticPage.evaluate(()=>({title:document.getElementById('turnTitle')?.textContent,problem:document.getElementById('problem')?.textContent,dialog:document.querySelector('dialog[open]')?.id,actions:[...document.querySelectorAll('[data-action]')].map(n=>({kind:n.dataset.kind,cell:n.dataset.cell})),save:JSON.parse(localStorage.getItem('cerconexo-arena-m3a-v1')??'null')}));process.exitCode=1;}
finally{await browser.close();await site.close();await writeFile(new URL('../evidence/ux-results'+(process.argv.includes('--arena')?'-arena':'')+'-browser.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
