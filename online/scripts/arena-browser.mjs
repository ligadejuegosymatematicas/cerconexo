import assert from 'node:assert/strict';import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {chromium,devices} from 'playwright';import {startUX} from './ux-local.mjs';import {eventually} from './runtime.mjs';import {reviewTraces} from './arena-trace.mjs';
const remote = process.env.ARENA_TEST_ORIGIN;
const origin = remote && new URL(remote);
if (origin && (origin.protocol !== 'https:' || !origin.hostname.endsWith('.workers.dev') || origin.origin !== remote)) {
  throw new Error('Origen HTTPS de pruebas inválido.');
}
const credential = remote && (await readFile(process.env.ARENA_TEST_ACCESS_FILE, 'utf8')).trim();
const site = remote ? { base: remote, entry: remote + '/online/', stop: async () => {} }
  : await startUX({ port: 8830, apiPort: 8831 });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const report = { ok: false, origin: site.base, wss: Boolean(remote), games: [], checks: [], errors: [], external: [] };
const contexts = [];
const evidence = new URL(remote ? '../evidence/https/' : '../evidence/', import.meta.url);
await mkdir(evidence, { recursive: true });
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
const read=p=>p.locator('#publicState').textContent().then(JSON.parse),seats=['A1','B1','A2','B2'];await mkdir(new URL('../evidence/',import.meta.url),{recursive:true});let diagnostic;
try{
  const pages=[];
  const sockets = Array.from({ length: 4 }, () => []);
  for (let i = 0; i < 4; i++) {
    const c = await browser.newContext({ ...(i === 0 ? devices['Pixel 7'] : { viewport: { width: 1440, height: 1000 } }),
      reducedMotion: i === 3 ? 'reduce' : 'no-preference' });
    contexts.push(c);
    await c.route('**/*', r => {
      const url = new URL(r.request().url());
      if (remote ? url.origin === remote : url.hostname === '127.0.0.1') return r.continue();
      report.external.push(url.origin);
      return r.abort();
    });
    if (remote) {
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
  await host.locator('[name=opponent][value=online]').check();await host.locator('#startArena').click();await host.locator('[data-entry=create]').click();assert.equal(await host.locator('[name=players]:visible').count(),0);assert.equal(await host.locator('[name=policy]:visible').count(),0);
  await host.locator('#createForm [name=name]').fill('Ana');await host.locator('#createForm button[type=submit]').click();await host.locator('#connection[data-phase=connected]').waitFor();const code=(await read(host)).code;
  await capture(host, 'arena-lobby-mobile.png');
  for(let i=1;i<4;i++){const p=pages[i];await p.goto(site.entry+'?mode=arena-duo&room='+code);await p.locator('#joinForm [name=name]').fill('Persona '+seats[i]);await p.locator('#joinForm button[type=submit]').click();await p.locator('#connection[data-phase=connected]').waitFor();const request=host.locator('#requests .request');await request.locator('select').selectOption(seats[i]);await request.getByRole('button',{name:'Admitir',exact:true}).click();await p.locator('#readyButton:visible').waitFor();}
  for(let i=0;i<4;i++){await pages[i].locator('#readyButton:enabled').click();await eventually(async()=>(await Promise.all(pages.map(read))).every(s=>s.participants.find(p=>p.seat===seats[i]).ready),'Listo no confirmado');}await host.locator('#startButton:enabled').click();for(const p of pages)await p.locator('[data-arena-connection][data-phase=connected]').waitFor();
  assert.equal((await read(host)).config.clockMs,600000);assert.equal(await host.locator('[data-arena-time=B]').textContent(),'10:00');assert.equal(await host.locator('[data-cell-bg]').count(),81);assert.equal(await host.locator('[data-arena-board]').evaluate(n=>n.getBoundingClientRect().width>300),true);
  assert.equal(await pages[1].locator('[data-arena-home]').isVisible(),true);assert.equal(await pages[1].locator('[data-arena-roster]').isVisible(),true);
  const traces=reviewTraces();
  const pictured = new Set();
  for(let round=0;round<traces.length;round++){
    const trace=traces[round];let reloaded=false,discardReloaded=false;
    for(let n=0;n<trace.commands.length;n++){
      const snapshots=await Promise.all(pages.map(read)),s=snapshots[0],actor=s.decision.actor,index=seats.indexOf(actor),p=pages[index],action=trace.commands[n];diagnostic=p;
      if (round === 0 && n === 0) {
        const peer = pages[(index + 1) % 4];
        const envelope = { type: 'arena.action', protocolVersion: 1, roomId: code,
          actionId: crypto.randomUUID(), expectedRevision: s.revision, params: { matchId: s.matchId, action } };
        assert.equal((await probe(peer, envelope)).code, 'DECISION');
        assert.equal((await probe(p, { ...envelope, actionId: crypto.randomUUID(),
          params: { matchId: s.matchId, action: { type: 'move', to: 80 } } })).code, 'ILLEGAL_ACTION');
      }
      if(action.type==='discard')await p.locator(`[data-arena-discard="${action.power}"]:enabled`).click();
      else{if(action.power)await p.locator(`[data-arena-power="${action.power}"]:enabled`).click();const target=p.locator(`[data-kind="${action.type}"][data-to="${action.to}"]`);if(round===0&&n===0){await target.focus();await p.keyboard.press('Enter');}else await target.locator('.hit').click();}
      const expected=trace.states[n];await eventually(async()=>(await Promise.all(pages.map(read))).every(v=>JSON.stringify(v.arena.game)===JSON.stringify(expected)),'El estado Arena no converge',20000);
      for (const page of pages) {
        assert.equal(await page.locator('[data-arena-feedback]').getAttribute('data-action-revision'), String(expected.revision));
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
        const owner=pages[seats.indexOf(expected.pending.owner)],before=await read(owner);await owner.reload();await owner.locator('[data-arena-connection][data-phase=connected]').waitFor();assert.deepEqual((await read(owner)).arena,before.arena);assert.equal(await owner.locator('section[data-arena-discard]').isVisible(),true);discardReloaded=true;
        assert.equal(await owner.locator('[data-arena-feedback]').isVisible(), false);
        await checkMedals(owner, 'section[data-arena-discard] button svg.power-icon image');
        await capture(owner, 'arena-discard.png');
        if(owner===host)await capture(owner, 'arena-discard-mobile.png');
      }
      if (round === 0 && n === 1) {
        assert.equal(await checkMedals(host, '.drop-token svg.power-icon image'), 3);
        await capture(host, 'arena-active-mobile.png');
        await capture(pages[1], 'arena-active-desktop.png');
      }
    }
    const final=await read(host);assert.equal(final.status,'finished');assert.equal(final.outcome.reason,'territory');for(const p of pages){assert.equal(await p.locator('[data-arena-notice]').isVisible(),false);const title=await p.locator('[data-arena-result-title]').boundingBox(),prompt=await p.locator('[data-arena-prompt]').boundingBox();assert.ok(title.y>=prompt.y+prompt.height);await p.locator('[data-inspect]').first().click();assert.match(await p.locator('[data-arena-inspection]').textContent(),/Región/);}
    await capture(host, 'arena-final-mobile.png');
    report.games.push({seed:trace.seed,actions:trace.commands.length,turns:final.arena.game.completedTurns,score:final.outcome.score,types:trace.types,events:trace.events,reloaded,discardReloaded});
    const match=final.matchId;await host.locator('[data-arena-propose-rematch]').click();for(let i=1;i<4;i++){await pages[i].locator('[data-rematch-accept]').click();await eventually(async()=>(await Promise.all(pages.map(read))).every(s=>s.rematch.votes[s.participants.find(p=>p.seat===seats[i]).id]),'Aceptación no confirmada');}
    await eventually(async()=>(await Promise.all(pages.map(read))).every(s=>s.status==='active'&&s.matchId!==match),'Revancha no iniciada',15000);assert.equal((await read(host)).arena.game.completedTurns,0);assert.equal((await read(host)).clock.remainingMs.B,600000);
  }
  const idleBefore=await read(host);await host.waitForTimeout(61000);assert.equal(await host.locator('[data-arena-idle]').isVisible(),true);for(const p of pages.slice(1))assert.equal(await p.locator('[data-arena-idle]').isVisible(),false);assert.match(await host.locator('[data-arena-time=A]').textContent(),/^08:|^09:/);assert.equal(await host.locator('[data-arena-time=B]').textContent(),'10:00');assert.deepEqual((await read(host)).arena,idleBefore.arena);report.checks.push('Un minuto real de espera mantiene tablero y reloj rival; aviso de inactividad solo para quien decide');
  report.connections = sockets.map(urls => urls.length);
  assert.ok(sockets.every(urls => urls.length && urls.every(url => remote
    ? url.startsWith('wss://' + origin.host + '/api/rooms/')
    : url.startsWith('ws://127.0.0.1:'))));
  report.checks.push('Dos partidas oficiales entre cuatro navegadores con poderes, descarte, reactivación, recarga e inspección','Revancha unánime y diez minutos por equipo');assert.deepEqual(report.errors,[]);assert.deepEqual(report.external,[]);report.ok=true;
}catch(e){report.error=e.stack??e.message;if(diagnostic&&!diagnostic.isClosed()){report.diagnostic=await diagnostic.locator('body').innerText();await capture(diagnostic, 'arena-failure.png');}process.exitCode=1;}
finally{for(const c of contexts)await c.close();await browser.close();await site.stop();await writeFile(new URL('arena-browser.json',evidence),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
