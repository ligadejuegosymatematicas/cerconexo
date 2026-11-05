import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {chromium,devices} from 'playwright';
import {startUX} from './ux-local.mjs';
import {eventually} from './runtime.mjs';
import {SocketClient} from './socket-client.mjs';
import {availableMoves,wallOptions,adjacent,wallKey} from '../../src/engine.mjs';
import {initialClassicFfa,ffaDraft,ffaTerritory,stepClassicFfa,wallClassicFfa,eliminateClassicFfa} from '../classic-ffa.mjs';
import {API_BASE} from '../config.mjs';

const seedIndex=process.argv.indexOf('--seed'), seed=seedIndex<0?0:Number(process.argv[seedIndex+1]);
assert.ok(Number.isInteger(seed)&&seed>=0&&seed<12,'Semilla fuera del conjunto validado.');
const candidateHttps=process.argv.includes('--candidate-https'),publicPages=process.argv.includes('--public-pages');
assert.ok(!candidateHttps||!publicPages,'Elige una sola procedencia de la interfaz.');
const remote=candidateHttps||publicPages,webOrigin='https://ligadejuegosymatematicas.github.io';
const evidence=new URL(`../evidence/classic-ffa/${remote?(candidateHttps?'https-candidate/':'public-pages/'):''}${seed?`seed-${seed}/`:''}`,import.meta.url);
await mkdir(evidence,{recursive:true});
const options={port:8850,apiPort:8851,classicFfa:true,arena1v1:true,arenaFfa:true,
  stateDir:fileURLToPath(new URL(`../.state/classic-ffa-browser${seed?'-'+seed:''}/`,import.meta.url))};
let site,browser,deadline,ghost;
const contexts=[],pages=[],credentials=[],sent=[],errors=[],secrets=new Set();
const report={ok:false,seed,transport:remote?'HTTPS/WSS Cloudflare público':'HTTP/WS local; sin Cloudflare',frontendIntercepted:candidateHttps,physicalDevices:false,games:[],checks:[],screenshots:[]};
const redact=value=>{let text=String(value);for(const secret of secrets)text=text.split(secret).join('[redacted]');return text;};
const read=p=>p.locator('#publicState').textContent().then(JSON.parse);
const shot=async(page,name)=>{await page.screenshot({path:fileURLToPath(new URL(name,evidence)),fullPage:true});report.screenshots.push(name);};
const all=predicate=>eventually(async()=>{
  const ready=pages.filter(p=>p.url()!=='about:blank');
  return (await Promise.all(ready.map(read))).every(predicate);
},'Las cuatro vistas no convergen',20000);
function independentScore(game){
  const seen=new Set(),walls=new Set(game.walls),score={A:0,B:0,C:0,D:0,mixed:0,empty:0};
  for(let first=0;first<49;first++)if(!seen.has(first)){
    const cells=[first];seen.add(first);
    for(let i=0;i<cells.length;i++)for(const next of adjacent(cells[i]))if(!walls.has(wallKey(cells[i],next))&&!seen.has(next)){seen.add(next);cells.push(next);}
    const teams=new Set(game.pieces.filter(p=>cells.includes(p.pos)).map(p=>p.team));
    score[teams.size===0?'empty':teams.size===1?[...teams][0]:'mixed']+=cells.length;
  }
  return score;
}
function turnFor(game,seed){
  const actor=game.currentActor;let paths=[[game.pieces.find(p=>p.id===actor).pos]];
  for(let n=0;n<game.moves%3;n++){
    const next=paths.flatMap(path=>availableMoves(game,actor,path.at(-1)).map(to=>[...path,to]));if(next.length)paths=next;
  }
  const turns=paths.flatMap(path=>wallOptions(game,path.at(-1)).map(to=>({path,to})));
  return turns[(game.moves*17+seed*13+3)%turns.length];
}
async function boards(game,draft){
  await all(s=>JSON.stringify(s.classic.game)===JSON.stringify(game)&&JSON.stringify(s.classic.draft)===JSON.stringify(draft));
  const oracle=independentScore(game);
  for(const page of pages){
    const s=await read(page);assert.deepEqual(s.classic.territory.score,oracle);
    assert.equal(await page.locator('[data-piece]').count(),game.pieces.length);
    assert.equal(await page.locator('[data-classic-clock]').count(),4);
    for(const team of ['A','B','C','D'])assert.equal(await page.locator(`[data-classic-score=${team}]`).textContent(),String(oracle[team]));
    for(const p of game.pieces){
      const token=page.locator(`[data-piece=${p.id}]`),at=p.id===draft.actor?draft.path.at(-1):p.pos;
      assert.equal(await token.getAttribute('transform'),`translate(${100+at%7*80} ${100+Math.floor(at/7)*80})`);
      assert.notEqual(await token.locator('.token-body').getAttribute('fill'),'undefined');
    }
    for(const region of s.classic.territory.components)assert.equal(await page.locator(`[data-cell="${region.cells[0]}"]`).getAttribute('data-territory'),region.type);
    assert.equal(await page.locator('.wall-built[data-edge]').count(),game.walls.length);
    if(!s.canDecide||game.over)assert.equal(await page.locator('#interactionLayer [role=button]').count(),0);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Desbordamiento horizontal');
  }
}
async function reconnect(page){
  await page.locator('[data-classic-connection][data-phase=replaced]').waitFor();
  await page.locator('[data-classic-actions-menu] > summary').click();
  await page.locator('[data-classic-reconnect]').click();
  await all(s=>s.participants.every(p=>p.online));
}
try{
  deadline=setTimeout(()=>{console.error('Límite de ejecución: cierre controlado.');void browser?.close();},process.argv.includes('--timeout')?720000:240000);
  site=remote?{origin:webOrigin,api:API_BASE,base:webOrigin+'/cerconexo',entry:webOrigin+'/cerconexo/online/',stop:async()=>{}}:await startUX(options);
  browser=await chromium.launch({channel:'msedge',headless:true});
  const files=new Set(candidateHttps?JSON.parse(await readFile(new URL('../../scripts/pages-files.json',import.meta.url),'utf8')):[]);
  for(let i=0;i<4;i++){
    const c=await browser.newContext(i===0?{...devices['Pixel 7']}:{viewport:i===1?{width:360,height:740}:{width:1440,height:1000},reducedMotion:i===3?'reduce':'no-preference'});
    if(candidateHttps)await c.route(webOrigin+'/cerconexo/**',async route=>{
      let name=new URL(route.request().url()).pathname.slice('/cerconexo/'.length);if(!name||name.endsWith('/'))name+='index.html';
      assert.ok(files.has(name),'Recurso fuera del inventario público: '+name);
      const types={html:'text/html',mjs:'text/javascript',css:'text/css',png:'image/png',webp:'image/webp'};
      await route.fulfill({status:200,contentType:types[name.split('.').at(-1)]??'application/octet-stream',body:await readFile(new URL('../../docs/'+name,import.meta.url))});
    });
    contexts.push(c);const page=await c.newPage();page.setDefaultTimeout(15000);pages.push(page);
    page.on('pageerror',e=>errors.push(e.message));
    page.on('response',r=>{if(r.status()>=400)errors.push(`HTTP ${r.status()} ${new URL(r.url()).pathname}`);});
    page.on('websocket',ws=>{assert.equal(new URL(ws.url()).protocol,remote?'wss:':'ws:');ws.on('framesent',({payload})=>{try{
      const m=JSON.parse(String(payload));if(m.type==='authenticate'){credentials[i]=m.credential;secrets.add(m.credential);}else if(m.actionId)sent.push({index:i,...m});
    }catch{}});});
  }
  await pages[0].goto(site.base+'/clasico/?new=1');
  await pages[0].locator('#newDialog[open]').waitFor();await pages[0].locator('[data-online-control]').click();await pages[0].locator('#startLocal').click();
  await pages[0].locator('[data-entry=create]').click();
  await pages[0].locator('#createForm [name=players]').selectOption('ffa');
  assert.equal(await pages[0].locator('#policyField').isVisible(),false);
  await shot(pages[0],'01-create-mobile.png');
  await pages[0].locator('#createForm [name=name]').fill('Ana');await pages[0].locator('#createForm button[type=submit]').click();
  await pages[0].locator('#connection[data-phase=connected]').waitFor();
  const code=(await read(pages[0])).code;
  for(let i=1;i<4;i++){
    await pages[i].goto(site.entry+'?room='+code);await pages[i].locator('#joinForm [name=name]').fill('Persona '+i);await pages[i].locator('#joinForm button[type=submit]').click();
    await pages[i].locator('#connection[data-phase=connected]').waitFor();
    const row=pages[0].locator('#requests .request').filter({hasText:'Persona '+i+' solicita entrar'});
    await row.locator('select').selectOption(['A','B','C','D'][i]);await row.getByRole('button',{name:'Admitir',exact:true}).click();
    await all(s=>s.participants.length===i+1);
  }
  await shot(pages[0],'02-lobby-mobile.png');
  for(let i=0;i<4;i++){await pages[i].locator('#readyButton').click();await all(s=>s.participants[i].ready);}
  await pages[0].locator('#startButton:enabled').click();await all(s=>s.status==='active');
  let game=initialClassicFfa(),draft=ffaDraft(game),recovered=false,restarted=false;const lengths=new Set();
  const identities=(await read(pages[0])).participants.map(p=>[p.id,p.seat]);
  await boards(game,draft);await shot(pages[0],'03-game-mobile.png');await shot(pages[3],'04-game-desktop.png');
  while(!game.over){
    const index=['A','B','C','D'].indexOf(game.currentActor),page=pages[index],actor=game.currentActor;
    const turn=turnFor(game,seed);lengths.add(turn.path.length-1);
    for(const to of turn.path.slice(1)){
      draft=stepClassicFfa(game,draft,to);await page.locator(`[data-to="${to}"] .move-hit`).click();await boards(game,draft);
      if(!recovered){
        const before=await read(page),last=sent.filter(c=>c.index===index&&c.type==='classic.step').at(-1);
        await page.reload();await page.locator('[data-classic-connection][data-phase=connected]').waitFor();await boards(game,draft);
        assert.equal((await read(page)).self.id,before.self.id);
        ghost=await new SocketClient(site.api,code,credentials[index],{},['rematch-v1','classic-ffa-v1'],site.origin).connect();
        const {index:ignored,...envelope}=last;
        const duplicate=await ghost.request(envelope);assert.equal(duplicate.duplicate,true);assert.deepEqual(duplicate.state.classic,before.classic);
        await ghost.sync();const illegal=await ghost.request(ghost.envelope('classic.step',{to:48,matchId:ghost.state.matchId}));
        assert.equal(illegal.type,'error');assert.deepEqual(illegal.state.classic,before.classic);
        if(remote)await ghost.abort();else await ghost.close();ghost=null;await reconnect(page);await boards(game,draft);
        for(const team of ['A','B','C','D'])assert.ok((await read(page)).clock.remainingMs[team]<=before.clock.remainingMs[team]);
        recovered=true;report.checks.push('Recarga parcial, duplicado idempotente, jugada ilegal y exclusión de sesión concurrente');
      }
      if(!remote&&!restarted&&game.moves>=2){
        const before=await read(page);await site.stop();site=await startUX(options);
        await Promise.all(pages.map(p=>p.reload()));
        await all(s=>s.participants.every(p=>p.online));await boards(game,draft);
        assert.deepEqual((await read(page)).participants.map(p=>[p.id,p.seat]),identities);
        for(const team of ['A','B','C','D'])assert.ok((await read(page)).clock.remainingMs[team]<=before.clock.remainingMs[team]);
        restarted=true;report.checks.push('Reinicio real de workerd/SQLite recupera recorrido parcial, identidad y relojes');
      }
    }
    const secured=structuredClone(game.secured);
    game=wallClassicFfa(game,draft,turn.to);draft=ffaDraft(game);
    await page.locator(`[data-wall="${turn.to}"] .wall-hit`).click();await boards(game,draft);
    for(const [team,record] of Object.entries(secured))assert.deepEqual(game.secured[team],record);
  }
  assert.equal(lengths.size,3);const final=await read(pages[0]);assert.equal(final.outcome.reason,'territory');
  const region=final.classic.territory.components.find(c=>c.type==='C'||c.type==='D')??final.classic.territory.components[0];
  const sentBefore=sent.length;await pages[0].locator(`[data-inspect="${region.cells[0]}"]`).click();
  assert.equal(await pages[0].locator('[data-inspected-cell]').count(),region.cells.length);assert.equal(sent.length,sentBefore);
  assert.ok((await pages[0].locator('[data-classic-inspection-info]').textContent()).includes(region.type));
  assert.equal(await pages[0].locator('[data-classic-result]').isVisible(),true);
  await shot(pages[0],'05-result-inspection-mobile.png');await shot(pages[3],'06-result-desktop.png');
  await pages[0].locator('[data-classic-propose-rematch]').click();await all(s=>s.rematch?.status==='pending');await shot(pages[0],'07-rematch-mobile.png');
  for(let i=1;i<4;i++){await pages[i].locator('[data-rematch-accept]').click();await all(s=>Object.keys(s.rematch.votes).length===i+1);}
  await all(s=>s.matchNumber===2&&s.status==='active');
  for(const p of pages){const s=await read(p);assert.deepEqual(s.previousResults[0].outcome,final.outcome);assert.deepEqual(s.classic.game,initialClassicFfa());assert.equal(s.clock.remainingMs.B,300000);}
  report.games.push({reason:final.outcome.reason,turns:game.moves,score:final.outcome.score,winners:final.outcome.winners,ranking:final.outcome.ranking,steps:[...lengths],fourBrowserContexts:true,partialReload:recovered,sqliteRestart:restarted,rematch:true});
  if(process.argv.includes('--timeout')){
    // Replay legal actions only: A secures 31 cells, B secures 3; C/D share 12.
    // C expires mid-move. D becomes exclusive but must lose to secured A.
    let timed=initialClassicFfa(),partial=ffaDraft(timed);
    while(timed.moves<=28){
      const page=pages[['A','B','C','D'].indexOf(timed.currentActor)],turn=turnFor(timed,43);
      for(const to of turn.path.slice(1)){partial=stepClassicFfa(timed,partial,to);await page.locator(`[data-to="${to}"] .move-hit`).click();await boards(timed,partial);}
      if(timed.moves===28)break;
      timed=wallClassicFfa(timed,partial,turn.to);partial=ffaDraft(timed);
      await page.locator(`[data-wall="${turn.to}"] .wall-hit`).click();await boards(timed,partial);
    }
    assert.equal(timed.currentActor,'C');assert.equal(timed.secured.A.score,31);assert.equal(timed.secured.B.score,3);
    assert.deepEqual(partial.path,[43,44]);
    const beforeWait=await read(pages[0]),started=Date.now();
    console.log('Traza legal de 28 muros: A asegurado con 31 puntos. Esperando vencimiento real de C durante su paso parcial.');
    await eventually(async()=>{const s=await read(pages[0]);return s.classic.game.eliminations.length===1;},'No se produjo eliminación por reloj real',315000);
    const s=await read(pages[0]);assert.equal(s.classic.game.eliminations[0].team,'C');assert.equal(s.classic.game.pieces.length,3);
    const expected=eliminateClassicFfa(timed,partial,'C',s.classic.game.eliminations[0].at);
    await boards(expected,ffaDraft(expected));await all(s=>s.status==='finished'&&s.clock.owner===null);
    assert.equal(s.clock.remainingMs.C,0);
    for(const team of ['A','B','D'])assert.equal(s.clock.remainingMs[team],beforeWait.clock.remainingMs[team]);
    assert.deepEqual(s.classic.game.walls,timed.walls);assert.deepEqual(s.outcome.winners,['A']);
    assert.equal(s.outcome.score.D,12);assert.deepEqual(s.classic.game.secured.A,timed.secured.A);
    assert.deepEqual(s.outcome.ranking.map(r=>[r.team,r.rank,r.eliminated]),[['A',1,false],['D',2,false],['B',3,false],['C',4,true]]);
    assert.equal(await pages[0].locator('[data-piece=C]').count(),0);
    report.games.push({reason:s.outcome.reason,timeElimination:'C',walls:timed.walls.length,score:s.outcome.score,winners:s.outcome.winners,ranking:s.outcome.ranking,securedBeatsLastActive:true});
    report.checks.push({realTimeout:true,waitedMs:Date.now()-started,partialRemoved:true,wallsPreserved:28,securedBeatsLastActive:true,clock:s.clock.remainingMs});
    await shot(pages[0],'08-timeout-mobile.png');
  }
  for(const page of pages)for(const secret of secrets)assert.ok(!(await page.content()).includes(secret));
  assert.deepEqual(errors,[]);report.ok=true;report.checks.push('Inspección C/D de solo lectura, colores, cuatro relojes, tablero idéntico y sin errores JS/HTTP');
}catch(error){report.error=redact(error.stack);process.exitCode=1;
  report.diagnostics=await Promise.all(pages.map(p=>p.evaluate(()=>({url:location.pathname,problem:document.querySelector('#problem')?.textContent,phase:document.querySelector('[data-classic-connection]')?.dataset.phase})).catch(()=>null)));
}finally{
  clearTimeout(deadline);await ghost?.close().catch(()=>{});await browser?.close().catch(()=>{});await site?.stop();
  await writeFile(new URL('report.json',evidence),redact(JSON.stringify({...report,errors},null,2)));
  console.log(redact(JSON.stringify({...report,errors},null,2)));
}
