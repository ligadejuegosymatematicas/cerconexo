import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { root, eventually } from './runtime.mjs';
import { betaPagesTarget } from './beta-pages-target.mjs';
import { SocketClient } from './socket-client.mjs';
import { initialState, legalActors, applyTurn, availableMoves, wallOptions, territory } from '../../src/engine.mjs';
import { beginDraft, selectDraft, advanceDraft } from '../../src/turnDraft.mjs';

const target = await betaPagesTarget();
const countArg = process.argv.indexOf('--players'), counts = countArg < 0 ? [2, 4] : [Number(process.argv[countArg + 1])];
const report = { release: 'M6.2.2', target: target.base, checkedAt: new Date().toISOString(), https: target.publicServer, games: [], screenshots: [], pageErrors: [] };
const secrets = new Set(), connections = []; let browser, contexts = [];
const state = page => page.locator('#publicState').textContent().then(JSON.parse);
const redact = text => { for (const secret of secrets) text = text.split(secret).join('[redacted]'); return text; };
async function shot(page, name) { const file = `m622-${name}-${target.suffix}.png`; await page.screenshot({ path: path.join(root, 'evidence', file), fullPage: true }); report.screenshots.push(file); }

async function game(players, policy) {
  contexts = []; const pages = [], credentials = [], commands = []; let oracle = initialState({ turnMode: policy }), draft = beginDraft(oracle), recovered = false;
  const label = `${players}-${policy}`, seats = players === 2 ? ['A', 'B'] : ['A1', 'B1', 'A2', 'B2'];
  for (let i = 0; i < players; i++) {
    const context = await browser.newContext({ viewport: i === 0 ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, isMobile: i === 0, hasTouch: i === 0, reducedMotion: 'reduce' });
    contexts.push(context); await target.install(context);
    const page = await context.newPage(); pages.push(page); page.setDefaultTimeout(20000);
    page.on('pageerror', e => report.pageErrors.push(e.message));
    page.on('websocket', ws => { assert.equal(new URL(ws.url()).protocol, target.publicServer ? 'wss:' : 'ws:'); ws.on('framesent', ({ payload }) => {
      try { const m = JSON.parse(String(payload)); if (m.type === 'authenticate') { credentials[i] = m.credential; secrets.add(m.credential); } else if (m.actionId) commands.push({ index: i, ...m }); } catch {}
    }); });
  }
  const all = predicate => eventually(async () => (await Promise.all(pages.filter(p => p.url() !== 'about:blank').map(state))).every(predicate), `${label}: las vistas no convergen`, 25000);
  async function boards() {
    await all(s => JSON.stringify(s.classic.game) === JSON.stringify(oracle) && JSON.stringify(s.classic.draft) === JSON.stringify(draft));
    for (const page of pages) {
      const s = await state(page); assert.deepEqual(s.classic.territory, territory(oracle));
      assert.equal(await page.locator('.classic-token-self').count(), players === 2 ? 2 : 1);
      for (const team of ['A', 'B']) assert.equal(await page.locator(`[data-classic-score=${team}]`).textContent(), String(territory(oracle).score[team]));
      for (const actor of await page.locator('[data-classic-board] [data-actor]').evaluateAll(nodes => nodes.map(n => n.dataset.actor))) assert.ok(s.self.controlledPieces.includes(actor));
      if (!s.canDecide || oracle.over) assert.equal(await page.locator('#interactionLayer [role=button]').count(), 0);
    }
  }
  const actorPage = async actor => { const snapshots = await Promise.all(pages.map(state)); return snapshots.findIndex(s => s.self.controlledPieces.includes(actor)); };
  await pages[0].goto(target.base + '/clasico/?new=1'); await pages[0].locator('#newDialog[open]').waitFor();
  await pages[0].locator('[data-online-control]').click();
  await pages[0].locator(`[name=onlinePlayers][value="${players}"]`).check(); await pages[0].locator(`[name=turnMode][value=${policy}]`).check();
  if (players === 2 && policy === 'team') await shot(pages[0], 'selector-mobile');
  await pages[0].locator('#startLocal').click(); await pages[0].locator('#createForm').waitFor(); await pages[0].waitForLoadState('networkidle');
  assert.equal(await pages[0].locator('#createForm [name=players]').inputValue(), String(players)); assert.equal(await pages[0].locator('#createForm [name=policy]').inputValue(), policy);
  await pages[0].locator('#createForm [name=name]').fill('Ana'); await pages[0].locator('#createForm button[type=submit]').click(); await pages[0].locator('#connection[data-phase=connected]').waitFor();
  const code = (await state(pages[0])).code;
  for (let i = 1; i < players; i++) {
    await pages[i].goto(`${target.entry}?room=${code}`); await pages[i].locator('#joinForm [name=name]').fill(`Persona ${i + 1}`); await pages[i].locator('#joinForm button[type=submit]').click(); await pages[i].locator('#connection[data-phase=connected]').waitFor();
    const request = pages[0].locator('#requests .request').filter({ hasText: `Persona ${i + 1} solicita entrar` }); await request.locator('select').selectOption(seats[i]); await request.getByRole('button', { name: 'Admitir', exact: true }).click();
    await all(s => s.participants.length === i + 1);
  }
  for (let i = 0; i < players; i++) { await pages[i].locator('#readyButton').click(); await all(s => s.participants.find(p => p.seat === seats[i]).ready); }
  const identities = (await state(pages[0])).participants.map(p => [p.id, p.seat]);
  await pages[0].locator('#startButton:enabled').click(); await all(s => s.status === 'active'); await boards();
  let raced = false;
  if (players === 4 && policy === 'team') {
    const a = await new SocketClient(target.backend, code, credentials[0], target.headers, undefined, target.origin).connect(), b = await new SocketClient(target.backend, code, credentials[2], target.headers, undefined, target.origin).connect(); connections.push(a, b);
    await a.sync(); await b.sync(); const rev = a.state.revision;
    const replies = await Promise.all([a.request(a.envelope('classic.select', { actor: 'A1', matchId: a.state.matchId }, rev)), b.request(b.envelope('classic.select', { actor: 'A2', matchId: b.state.matchId }, rev))]);
    assert.equal(replies.filter(r => r.type === 'ack').length, 1); assert.equal(replies.find(r => r.type === 'error').error.code, 'STALE');
    const chosen = replies.find(r => r.type === 'ack').state.classic.draft.actor; draft = selectDraft(oracle, draft, chosen); raced = true;
    await a.close(); await b.close();
    for (const i of [0, 2]) { if (i === 0) await pages[i].locator('[data-classic-actions-menu] summary').click(); await pages[i].locator('[data-classic-reconnect]:visible').waitFor(); await pages[i].locator('[data-classic-reconnect]').click(); }
    await all(s => s.participants.every(p => p.online)); await boards();
  }
  const routes = new Set();
  while (!oracle.over) {
    assert.ok(oracle.moves < 90); const actors = legalActors(oracle), actor = draft.actor ?? actors[oracle.moves % actors.length], index = await actorPage(actor), page = pages[index];
    if (draft.actor !== actor) { draft = selectDraft(oracle, draft, actor); await page.locator(`[data-actor=${actor}] .actor-hit`).click(); await boards(); }
    if (oracle.moves === 0) { await shot(pages[0], `game-${label}-mobile`); await shot(pages.at(-1), `game-${label}-desktop`); }
    let paths = [[oracle.pieces.find(p => p.id === actor).pos]];
    for (let n = 0; n < oracle.moves % 3; n++) { const next = paths.flatMap(p => availableMoves(oracle, actor, p.at(-1)).map(to => [...p, to])); if (next.length) paths = next; }
    const turns = paths.flatMap(path => wallOptions(oracle, path.at(-1)).map(to => ({ actor, path, to }))), turn = turns[(oracle.moves * 17 + 3) % turns.length]; assert.ok(turn); routes.add(turn.path.length - 1);
    for (const to of turn.path.slice(1)) {
      draft = advanceDraft(oracle, draft, to); await page.locator(`[data-to="${to}"] .move-hit`).click(); await boards();
      if (!recovered) {
        const before = await state(page), last = commands.filter(c => c.index === index && c.type === 'classic.step').at(-1);
        await page.reload(); await page.locator('[data-classic-connection][data-phase=connected]').waitFor(); await boards();
        assert.equal((await state(page)).self.id, before.self.id);
        const ghost = await new SocketClient(target.backend, code, credentials[index], target.headers, undefined, target.origin).connect(); connections.push(ghost);
        const { index: ignored, ...envelope } = last; const duplicate = await ghost.request(envelope); assert.equal(duplicate.duplicate, true); assert.deepEqual(duplicate.state.classic, before.classic);
        await ghost.sync();
        const denied = await ghost.request(ghost.envelope('classic.step', { to: 48, matchId: ghost.state.matchId })); assert.equal(denied.type, 'error'); assert.deepEqual(denied.state.classic, before.classic);
        await ghost.close();
        await page.locator('[data-classic-connection][data-phase=replaced]').waitFor();
        if (index === 0) await page.locator('[data-classic-actions-menu] summary').click();
        await page.locator('[data-classic-reconnect]').click(); await all(s => s.participants.every(p => p.online)); await boards();
        for (const team of ['A', 'B']) assert.ok((await state(page)).clock.remainingMs[team] <= before.clock.remainingMs[team]); recovered = true;
      }
    }
    oracle = applyTurn(oracle, turn); draft = beginDraft(oracle); await page.locator(`[data-wall="${turn.to}"] .wall-hit`).click(); await boards();
  }
  assert.equal(routes.size, 3); const final = await state(pages[0]); assert.equal(final.outcome.reason, 'territory');
  const component = final.classic.territory.components.find(c => ['A', 'B'].includes(c.type));
  const countBefore = commands.length; await pages[0].locator(`[data-inspect="${component.cells[0]}"]`).click();
  assert.equal(await pages[0].locator('[data-inspected-cell]').count(), component.cells.length); assert.equal(commands.length, countBefore); assert.equal(await pages[0].locator('[data-classic-result]').isVisible(), true);
  await shot(pages[0], `inspection-${label}`);
  await pages[0].locator('[data-classic-propose-rematch]').click(); await all(s => s.rematch?.status === 'pending'); await shot(pages[0], `rematch-${label}`);
  for (let i = 1; i < players; i++) { assert.equal((await state(pages[0])).matchNumber, 1); await pages[i].locator('[data-rematch-accept]').click(); await all(s => Object.keys(s.rematch.votes).length === i + 1); }
  await all(s => s.matchNumber === 2 && s.status === 'active');
  for (const page of pages) { const s = await state(page); assert.deepEqual(s.classic.game, initialState({ turnMode: policy })); assert.deepEqual(s.participants.map(p => [p.id, p.seat]), identities); assert.deepEqual(s.previousResults[0].outcome, final.outcome); assert.equal(s.clock.remainingMs.B, 480000); assert.ok(s.clock.remainingMs.A > 470000); }
  report.games.push({ players, policy, turns: oracle.moves, score: territory(oracle).score, synchronized: true, partialReload: recovered, duplicateRejected: true, illegalRejected: true, rematch: true, simultaneousClaims: raced });
  console.log(`Clásico ${label}: partida de ${oracle.moves} turnos, recuperación y revancha verificadas.`);
  for (const page of pages) for (const secret of secrets) assert.ok(!(await page.content()).includes(secret));
  for (const context of contexts) await context.close(); contexts = [];
}
try {
  await mkdir(path.join(root, 'evidence'), { recursive: true }); browser = await chromium.launch({ channel: 'msedge', headless: true });
  for (const players of counts) for (const policy of ['piece', 'team']) await game(players, policy);
  assert.deepEqual(report.pageErrors, []); report.ok = true;
} catch (error) { report.ok = false; report.error = redact(error.stack ?? error.message); report.failurePages = await Promise.all(contexts.map(async c => c.pages()[0]?.evaluate(() => ({ url: location.href, players: document.querySelector('#createForm [name=players]')?.value, policy: document.querySelector('#createForm [name=policy]')?.value, problem: document.querySelector('#problem')?.textContent })).catch(() => null))); process.exitCode = 1; }
finally {
  for (const c of connections) { clearInterval(c.ping); c.ws?.terminate(); }
  for (const context of contexts) await context.close().catch(() => {}); await browser?.close();
  await writeFile(path.join(root, `evidence/m622-configurations${countArg < 0 ? '' : '-' + counts[0]}-${target.suffix}.json`), redact(JSON.stringify(report, null, 2))); console.log(redact(JSON.stringify(report, null, 2)));
}
