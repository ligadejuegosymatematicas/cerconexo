import assert from 'node:assert/strict';import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {API_BASE} from '../config.mjs';
import {chromium,devices} from 'playwright';import {startUX} from './ux-local.mjs';import {eventually} from './runtime.mjs';import {reviewTraces} from './arena-trace.mjs';
const ffa = process.argv.includes('--ffa');
const policy = process.argv.includes('--1v1-team') ? 'team' : 'piece';
const two = policy === 'team' || process.argv.includes('--1v1-piece');
const seats = ffa ? ['A','B','C','D'] : two ? ['A','B'] : ['A1','B1','A2','B2'];
const clockMs = ffa ? 300000 : 600000;
const clockText = ffa ? '05:00' : '10:00';
assert.ok(!ffa || !two);
const count = seats.length;
const candidatePages = process.argv.includes('--candidate-https');
const publicPages = process.argv.includes('--public-pages');
const pagesMode = candidatePages || publicPages;
assert.ok(!candidatePages || !publicPages);
const pagesOrigin = 'https://ligadejuegosymatematicas.github.io';
const remote = pagesMode ? API_BASE : process.env.ARENA_TEST_ORIGIN;
assert.ok(!two || !remote || pagesMode, 'Origen Arena 1 vs. 1 no autorizado.');
assert.ok(!ffa || !remote || pagesMode && remote === API_BASE, 'Cuatro equipos remotos requieren el backend público autorizado y Pages.');
const origin = remote && new URL(remote);
if (origin && (origin.protocol !== 'https:' || !origin.hostname.endsWith('.workers.dev') || origin.origin !== remote)) {
  throw new Error('Origen HTTPS de pruebas inválido.');
}
const credential = remote && !pagesMode && (await readFile(process.env.ARENA_TEST_ACCESS_FILE, 'utf8')).trim();
const site = pagesMode ? {base: pagesOrigin+'/cerconexo', entry: pagesOrigin+'/cerconexo/online/', stop: async () => {}}
  : remote ? { base: remote, entry: remote + '/online/', stop: async () => {} }
  : await startUX({
    port: ffa ? 8844 : two ? policy === 'piece' ? 8832 : 8834 : 8830,
    apiPort: ffa ? 8845 : two ? policy === 'piece' ? 8833 : 8835 : 8831,
    ...(ffa ? {arena1v1:true,arenaFfa:true,stateDir:fileURLToPath(new URL('../.state/arena-ffa-browser/',import.meta.url))} : {}),
    ...(two ? {arena1v1: true, stateDir: fileURLToPath(new URL(`../.state/arena-1v1-${policy}/`, import.meta.url))} : {}),
  });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const report = { ok: false, count, policy, ffa, origin: site.base, wss: Boolean(remote), frontendIntercepted: candidatePages, games: [], checks: [], errors: [], external: [] };
const contexts = [];
const evidence = new URL(pagesMode ? `../evidence/${candidatePages ? 'https-candidate' : 'public'}-${ffa ? 'ffa' : count}-${policy}/` : remote ? '../evidence/https/' : ffa ? '../evidence/arena-ffa/' : two ? `../evidence/arena-1v1-${policy}/` : '../evidence/', import.meta.url);
await mkdir(evidence, { recursive: true });
const publicFiles = new Set(candidatePages ? JSON.parse(await readFile(new URL('../../scripts/pages-files.json',import.meta.url),'utf8')) : []);
const capture = (page, name) => page.screenshot({ path: fileURLToPath(new URL(name, evidence)), fullPage: true });
async function checkMedals(page, selector) {
  const medals = await page.locator(selector).evaluateAll(async nodes => {
    return Promise.all(nodes.map(async node => {
      const url = node.getAttribute('href');
      const image = new Image();
      image.src = url;
      await image.decode();
      return { url, width: image.naturalWidth };
    }));
  });
  assert.ok(medals.length > 0, selector);
  assert.ok(medals.every(({url,width}) => /\.webp$/.test(url) && width === 112));
  return new Set(medals.map(({url}) => url)).size;
}
const read=p=>p.locator('#publicState').textContent().then(JSON.parse);await mkdir(new URL('../evidence/',import.meta.url),{recursive:true});let diagnostic;
try{
  const pages=[];
  const sockets = Array.from({ length: count }, () => []);
  for (let i = 0; i < count; i++) {
    const c = await browser.newContext({ ...(i === 0 ? devices['Pixel 7'] : { viewport: { width: 1440, height: 1000 } }),
      reducedMotion: i === 3 ? 'reduce' : 'no-preference' });
    c.setDefaultTimeout(20000);
    contexts.push(c);
    await c.route('**/*', async r => {
      const url = new URL(r.request().url());
      if (candidatePages && url.origin === pagesOrigin) {
        assert.ok(url.pathname.startsWith('/cerconexo/'));
        let name = url.pathname.slice('/cerconexo/'.length);
        if (!name || name.endsWith('/')) name += 'index.html';
        assert.ok(publicFiles.has(name), name);
        const types = {html:'text/html',mjs:'text/javascript',css:'text/css',png:'image/png',webp:'image/webp'};
        return r.fulfill({status:200,contentType:types[name.split('.').at(-1)],
          body:await readFile(new URL('../../docs/'+name,import.meta.url))});
      }
      if (pagesMode ? [pagesOrigin,remote].includes(url.origin) : remote ? url.origin === remote : url.hostname === '127.0.0.1') return r.continue();
      report.external.push(url.origin);
      return r.abort();
    });
    if (remote && !pagesMode) {
      const landing = await c.request.get(remote + '/arena/', { maxRedirects: 0 });
      assert.equal(landing.headers()['x-cerconexo-preview'], 'arena-duo');
      assert.equal(landing.status(), 303);
      const login = await c.request.post(remote + '/pilot/session', { headers: { Origin: remote }, data: { credential } });
      assert.equal(login.status(), 200);
      if (i === 0) {
        const healthResponse = await c.request.get(remote + '/api/health');
        assert.equal(healthResponse.status(), 200);
        const health = await healthResponse.json();
        assert.equal(health.capabilities.arena, 'duo-online');
        assert.equal(health.publicCreation, false);
        if (process.env.ARENA_TEST_SHA) assert.equal(health.candidateSha, process.env.ARENA_TEST_SHA);
        report.workerCommit = health.candidateSha;
      }
    }
    if (pagesMode && i === 0) {
      const response = await c.request.get(remote+'/api/health',{headers:{Origin:pagesOrigin,'Cache-Control':'no-cache'}});
      assert.equal(response.status(),200);
      assert.equal(response.headers()['access-control-allow-origin'],pagesOrigin);
      const health = await response.json();
      assert.equal(health.capabilities.arena,'duo-online');
      assert.equal(health.capabilities.classic,'online');
      if (ffa) assert.equal(health.capabilities.arenaFfa,'online');
      assert.equal(health.publicCreation,true);
      if(process.env.ARENA_TEST_SHA)assert.equal(health.candidateSha,process.env.ARENA_TEST_SHA);
      report.workerCommit=health.candidateSha;
    }
    await c.addInitScript(() => {
      window.arenaWire = { replies: new Map() };
      const Socket = window.WebSocket;
      window.WebSocket = class extends Socket {
        constructor(...args) {
          super(...args);
          window.arenaWire.socket = this;
          this.addEventListener('message', ({ data }) => {
            if (typeof data !== 'string' || !data.startsWith('{')) return;
            const reply = JSON.parse(data);
            if (reply.actionId) window.arenaWire.replies.set(reply.actionId, {
              type: reply.type, duplicate: reply.duplicate, code: reply.error?.code,
            });
          });
        }
        send(data) {
          if (typeof data === 'string' && data.startsWith('{')) {
            const message = JSON.parse(data);
            if (message.type === 'arena.action') window.arenaWire.last = message;
          }
          return super.send(data);
        }
      };
    });
    const p = await c.newPage();
    p.on('websocket', socket => sockets[i].push(socket.url()));
    p.on('pageerror', e => report.errors.push(e.message));
    pages.push(p);
  }
  async function probe(page, envelope) {
    return page.evaluate(async command => {
      const { socket, replies } = window.arenaWire;
      replies.delete(command.actionId);
      socket.send(JSON.stringify(command));
      for (let i = 0; i < 150; i++) {
        if (replies.has(command.actionId)) return replies.get(command.actionId);
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      throw new Error('Sin recibo de la prueba WebSocket.');
    }, envelope);
  }
  const host=pages[0];diagnostic=host;
  await host.goto(site.base+'/arena/?new=1');await host.locator('[name=opponent][value=online]:enabled').check();assert.equal(await host.locator('[name=mode]:visible').count(),0);
  await host.locator('[name=opponent][value=cpu]').check();assert.equal(await host.locator('#humanTeamField').isVisible(),true);assert.equal(await host.locator('#experimentDetails').isVisible(),false);
  await host.locator('[name=opponent][value=local]').check();assert.equal(await host.locator('#humanTeamField').isVisible(),false);assert.equal(await host.locator('[name=mode]:visible').count(),2);
  await host.locator('[name=opponent][value=online]').check();await host.locator('#startArena').click();await host.locator('[data-entry=create]').click();assert.equal(await host.locator('[name=players]:visible').count(),pagesMode || two || ffa ? 1 : 0);assert.equal(await host.locator('[name=policy]:visible').count(),0);
  if (ffa) await host.locator('[name=players]').selectOption('ffa');
  if (two) {
    await host.locator('[name=players]').selectOption('2');
    assert.equal(await host.locator('[name=policy]:visible').inputValue(),'piece');
    await host.locator('[name=policy]').selectOption(policy);
  }
  await host.locator('#createForm [name=name]').fill('Ana');await host.locator('#createForm button[type=submit]').click();await host.locator('#connection[data-phase=connected]').waitFor();const code=(await read(host)).code;
  await capture(host, 'arena-lobby-mobile.png');
  for(let i=1;i<count;i++){const p=pages[i];await p.goto(site.entry+'?mode='+(ffa?'arena-ffa':'arena-duo')+'&room='+code);await p.locator('#joinForm [name=name]').fill('Persona '+seats[i]);await p.locator('#joinForm button[type=submit]').click();await p.locator('#connection[data-phase=connected]').waitFor();const request=host.locator('#requests .request');await request.locator('select').selectOption(seats[i]);await request.getByRole('button',{name:'Admitir',exact:true}).click();await p.locator('#readyButton:visible').waitFor();}
  for(let i=0;i<count;i++){await pages[i].locator('#readyButton:enabled').click();await eventually(async()=>(await Promise.all(pages.map(read))).every(s=>s.participants.find(p=>p.seat===seats[i]).ready),'Listo no confirmado');}await host.locator('#startButton:enabled').click();for(const p of pages)await p.locator('[data-arena-connection][data-phase=connected]').waitFor();
  assert.equal((await read(host)).config.clockMs,clockMs);assert.equal(await host.locator('[data-arena-time=B]').textContent(),clockText);assert.equal(await host.locator('[data-cell-bg]').count(),81);assert.equal(await host.locator('[data-arena-board]').evaluate(n=>n.getBoundingClientRect().width>300),true);
  assert.equal(await pages[1].locator('[data-arena-home]').isVisible(),true);assert.equal(await pages[1].locator('[data-arena-roster]').isVisible(),true);
  if (two) {
    for (const [i,page] of pages.entries()) {
      assert.deepEqual((await read(page)).self.controlledPieces, [seats[i]+'1',seats[i]+'2']);
      assert.equal(await page.locator('[data-piece][data-self=true]').count(),2);
    }
    assert.equal(await host.locator('[data-arena-summary-presence]').textContent(),'2/2 conectados');
  }
  if(ffa){
    assert.equal((await read(host)).config.mode,'arena-ffa');
    assert.equal(await host.locator('[data-arena-clock]').count(),4);
    const colors=await host.locator('[data-piece]').evaluateAll(nodes=>nodes.map(n=>n.style.getPropertyValue('--team')));
    assert.equal(new Set(colors).size,4);
    report.checks.push('Cuatro equipos, cuatro colores y cinco minutos individuales');
  }
  const traces=reviewTraces(policy,ffa?'ffa':'duo').slice(0,two && !pagesMode ? 1 : undefined);
  const pictured = new Set();
  for(let round=0;round<traces.length;round++){
    const trace=traces[round];let reloaded=false,discardReloaded=false;
    for(let n=0;n<trace.commands.length;n++){
      const snapshots=await Promise.all(pages.map(read)),s=snapshots[0],actor=two?s.decision.team:s.decision.actor,index=seats.indexOf(actor),p=pages[index],action=trace.commands[n];diagnostic=p;
      if (round === 0 && n === 0) {
        const peer = pages[(index + 1) % count];
        const envelope = { type: 'arena.action', protocolVersion: 1, roomId: code,
          actionId: crypto.randomUUID(), expectedRevision: s.revision, params: { matchId: s.matchId, action } };
        assert.equal((await probe(peer, envelope)).code, 'DECISION');
        assert.equal((await probe(p, { ...envelope, actionId: crypto.randomUUID(),
          params: { matchId: s.matchId, action: { type: 'move', to: 80 } } })).code, 'ILLEGAL_ACTION');
      }
      if (action.type === 'select') {
        const target = p.getByRole('button',{name:`Seleccionar ${action.actor}`,exact:true});
        if (n === 0) { await target.focus(); await p.keyboard.press('Enter'); }
        else await target.locator('.hit').click();
      } else if(action.type==='discard')await p.locator(`[data-arena-discard="${action.power}"]:enabled`).click();
      else{if(action.power)await p.locator(`[data-arena-power="${action.power}"]:enabled`).click();const target=p.locator(`[data-kind="${action.type}"][data-to="${action.to}"]`);if(round===0&&n===0){await target.focus();await p.keyboard.press('Enter');}else await target.locator('.hit').click();}
      const expected=trace.states[n];await eventually(async()=>(await Promise.all(pages.map(read))).every(v=>JSON.stringify(v.arena.game)===JSON.stringify(expected)),'El estado Arena no converge',20000);
      for (const page of pages) {
        if (action.type !== 'select') assert.equal(await page.locator('[data-arena-feedback]').getAttribute('data-action-revision'), String(expected.revision));
        else assert.equal((await read(page)).decisionId, s.decisionId);
      }
      if (round === 0 && n === 0) {
        const envelope = await p.evaluate(() => window.arenaWire.last);
        assert.equal((await probe(p, envelope)).duplicate, true);
        assert.equal((await probe(p, { ...envelope, params: {
          ...envelope.params, action: { type: 'move', to: 80 },
        } })).code, 'ACTION_CONFLICT');
        assert.deepEqual((await read(p)).arena.game, expected);
        report.checks.push('WebSocket rechaza ficha ajena y jugada ilegal. El duplicado es idempotente.');
      }
      const effect = expected.lastEvents.find(event => ['reactivated', 'secured'].includes(event.type))?.type ?? action.type;
      if (['extraWall', 'demolition', 'jump', 'reactivated', 'secured'].includes(effect) && !pictured.has(effect)) {
        await capture(host, `arena-${effect}-mobile.png`);
        pictured.add(effect);
      }
      if(!reloaded&&action.type==='move'&&!expected.over&&!expected.pending){
        const before=await read(p);await p.reload();await p.locator('[data-arena-connection][data-phase=connected]').waitFor();const after=await read(p);assert.deepEqual(after.arena,before.arena);assert.equal(after.self.id,before.self.id);assert.ok(after.clock.remainingMs[before.clock.owner]<=before.clock.remainingMs[before.clock.owner]);reloaded=true;
        assert.equal(await p.locator('[data-arena-feedback]').isVisible(), false);
        if(round===0){await p.locator('[data-arena-menu]>summary').click();await p.locator('[data-arena-home]').click();await p.locator('[data-online-continue]').click();await p.locator('[data-arena-connection][data-phase=connected]').waitFor();assert.match(await p.title(),/Arena Online/);const continued=await read(p);assert.equal(continued.self.id,before.self.id);assert.deepEqual(continued.arena,before.arena);assert.ok(continued.clock.remainingMs[before.clock.owner]<=after.clock.remainingMs[before.clock.owner]);report.checks.push('Inicio → Continuar recupera Arena y movimiento parcial sin credencial manual ni devolver tiempo');}
      }
      if(!discardReloaded&&expected.pending){
        const owner=pages[seats.indexOf(two ? expected.pending.team : expected.pending.owner)],before=await read(owner);await owner.reload();await owner.locator('[data-arena-connection][data-phase=connected]').waitFor();assert.deepEqual((await read(owner)).arena,before.arena);assert.equal(await owner.locator('section[data-arena-discard]').isVisible(),true);discardReloaded=true;
        assert.equal(await owner.locator('[data-arena-feedback]').isVisible(), false);
        await checkMedals(owner, 'section[data-arena-discard] button svg.power-icon image');
        for (const peer of pages.filter(page => page !== owner)) {
          assert.equal(await peer.locator('section[data-arena-discard] button:enabled').count(),0);
        }
        await capture(owner, 'arena-discard.png');
        if(owner===host)await capture(owner, 'arena-discard-mobile.png');
      }
      if (round === 0 && n === 1) {
        assert.equal(await checkMedals(host, '.drop-token svg.power-icon image'), ffa ? 1 : 3);
        await capture(host, 'arena-active-mobile.png');
        await capture(pages[1], 'arena-active-desktop.png');
      }
    }
    const final=await read(host);assert.equal(final.status,'finished');assert.equal(final.outcome.reason,'territory');for(const p of pages){assert.equal(await p.locator('[data-arena-notice]').isVisible(),false);const title=await p.locator('[data-arena-result-title]').boundingBox(),prompt=await p.locator('[data-arena-prompt]').boundingBox();assert.ok(title.y>=prompt.y+prompt.height);await p.locator('[data-inspect]').first().click();assert.match(await p.locator('[data-arena-inspection]').textContent(),/Región/);}
    await capture(host, 'arena-final-mobile.png');
    report.games.push({seed:trace.seed,actions:trace.commands.length,turns:final.arena.game.completedTurns,score:final.outcome.score,types:trace.types,events:trace.events,reloaded,discardReloaded});
    const match=final.matchId;await host.locator('[data-arena-propose-rematch]').click();for(let i=1;i<count;i++){await pages[i].locator('[data-rematch-accept]').click();await eventually(async()=>(await Promise.all(pages.map(read))).every(s=>s.rematch.votes[s.participants.find(p=>p.seat===seats[i]).id]),'Aceptación no confirmada');}
    await eventually(async()=>(await Promise.all(pages.map(read))).every(s=>s.status==='active'&&s.matchId!==match),'Revancha no iniciada',15000);assert.equal((await read(host)).arena.game.completedTurns,0);assert.equal((await read(host)).clock.remainingMs.B,clockMs);
  }
  if (!two && !ffa) { const idleBefore=await read(host);await host.waitForTimeout(61000);assert.equal(await host.locator('[data-arena-idle]').isVisible(),true);for(const p of pages.slice(1))assert.equal(await p.locator('[data-arena-idle]').isVisible(),false);assert.match(await host.locator('[data-arena-time=A]').textContent(),/^08:|^09:/);assert.equal(await host.locator('[data-arena-time=B]').textContent(),clockText);assert.deepEqual((await read(host)).arena,idleBefore.arena);report.checks.push('Un minuto real de espera mantiene tablero y reloj rival; aviso de inactividad solo para quien decide'); }
  if (ffa) {
    // Real server clocks: no shortened room settings, injected timestamps or
    // client clock controls. This third game observes three five-minute turns.
    const start = await read(host);
    await host.locator('[data-kind=move][data-to="11"] .hit').click();
    await eventually(async()=>(await read(host)).arena.game.turn.steps===1,'No aceptó primer paso');
    await host.locator('[data-kind=move][data-to="20"] .hit').click();
    await eventually(async()=>(await read(host)).arena.game.turn.steps===2,'No aceptó segundo paso');
    const power=(await read(host)).arena.game.inventories.A[0];
    assert.equal(power.type,'extraWall');
    await host.locator(`[data-arena-power="${power.id}"]:enabled`).click();
    await host.locator('[data-kind=extraWall][data-to="21"] .hit').click();
    await eventually(async()=>(await read(host)).arena.game.walls.length===1,'No persistió el muro adicional');
    const accepted=(await read(host)).arena.game;
    await capture(host,'arena-before-timeout-mobile.png');
    const began=Date.now(),timeouts=[];
    for (const [index,team] of ['A','B','C'].entries()) {
      const waitBegan=Date.now();let minute=-1;
      while ((await read(host)).arena.eliminations.length <= index) {
        assert.ok(Date.now()-waitBegan<335000,'No venció el reloj de '+team);
        const state=await read(host);
        const left=Number((await host.locator(`[data-arena-time=${team}]`).textContent()).split(':')[0]);
        if(left!==minute){console.log('Reloj local de '+team+': '+left+' minutos restantes');minute=left;}
        await host.waitForTimeout(1000);
      }
      await eventually(async()=>(await Promise.all(pages.map(read))).every(s=>s.arena.eliminations.length===index+1),'Eliminación no compartida');
      const states=await Promise.all(pages.map(read)),official=states[0];
      assert.deepEqual(official.arena.game.walls,accepted.walls);
      assert.equal(official.arena.game.completedTurns,accepted.completedTurns);
      assert.deepEqual(official.arena.game.waveLog,accepted.waveLog);
      assert.equal(official.arena.game.pending,null);
      assert.equal(official.arena.game.resolution,null);
      assert.equal(official.clock.remainingMs[team],0);
      assert.ok(!official.arena.game.pieces.some(p=>p.team===team));
      for(const page of pages)assert.equal(await page.locator(`[data-piece="${team}"]`).count(),0);
      timeouts.push({team,order:index+1,remaining:official.clock.remainingMs});
      if(index===0){
        const id=official.self.id;
        await host.reload();await host.locator('[data-arena-connection][data-phase=connected]').waitFor();
        const recovered=await read(host);
        assert.equal(recovered.self.id,id);
        assert.equal(recovered.self.eliminated,true);
        assert.equal(recovered.canDecide,false);
        assert.deepEqual(recovered.arena,official.arena);
        await capture(host,'arena-eliminated-mobile.png');
      }
    }
    const final=await read(host);
    assert.equal(final.status,'finished');
    assert.equal(final.outcome.reason,'last-survivor');
    assert.deepEqual(final.outcome.winners,['D']);
    assert.deepEqual(final.outcome.ranking.map(r=>[r.team,r.rank]),[['D',1],['C',2],['B',3],['A',4]]);
    for(const page of pages){
      assert.equal(await page.locator('[data-arena-ranking] li').count(),4);
      assert.equal(await page.locator('[data-arena-result]').getAttribute('data-final-winner'),'D');
    }
    await capture(host,'arena-timeout-final-mobile.png');
    await capture(pages[3],'arena-timeout-winner-desktop.png');
    await host.locator('[data-arena-propose-rematch]').click();
    for(let i=1;i<4;i++){
      await pages[i].locator('[data-rematch-accept]').click();
      await eventually(async()=>(await Promise.all(pages.map(read))).every(s=>s.rematch.votes[s.participants.find(p=>p.seat===seats[i]).id]),'Falta voto de revancha');
    }
    await eventually(async()=>(await Promise.all(pages.map(read))).every(s=>s.status==='active'&&s.matchId!==final.matchId),'No empezó la revancha FFA',15000);
    const restored=await read(host);
    assert.equal(restored.arena.game.pieces.length,4);
    assert.deepEqual(restored.arena.eliminations,[]);
    assert.equal(restored.self.eliminated,false);
    assert.deepEqual(restored.previousResults.at(-1).outcome,final.outcome);
    report.timeoutGame={realClocks:true,clockMs,elapsedMs:Date.now()-began,timeouts,ranking:final.outcome.ranking,wallsPreserved:true,turnsUnchanged:true,recoveredEliminated:true,rematchRestored:true,match:start.matchNumber};
  }
  report.connections = sockets.map(urls => urls.length);
  assert.ok(sockets.every(urls => urls.length && urls.every(url => remote
    ? url.startsWith('wss://' + origin.host + '/api/rooms/')
    : url.startsWith('ws://127.0.0.1:'))));
  report.checks.push(`${traces.length} partida(s) entre ${count} navegadores, con poderes, recarga e inspección`,ffa?'Revancha unánime y cinco minutos por equipo':'Revancha unánime y diez minutos por equipo');assert.deepEqual(report.errors,[]);assert.deepEqual(report.external,[]);report.ok=true;
}catch(e){report.error=e.stack??e.message;if(diagnostic&&!diagnostic.isClosed()){report.diagnostic=await diagnostic.locator('body').innerText();await capture(diagnostic, 'arena-failure.png');}process.exitCode=1;}
finally{for(const c of contexts)await c.close();await browser.close();await site.stop();await writeFile(new URL('arena-browser.json',evidence),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
