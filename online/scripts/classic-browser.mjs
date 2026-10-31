import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { root, startRuntime, eventually } from './runtime.mjs';
import { initialState, applyTurn, availableMoves, wallOptions, territory, activeIds } from '../../src/engine.mjs';
import { beginDraft, advanceDraft } from '../../src/turnDraft.mjs';
import { testTarget, authorizeTarget } from './test-target.mjs';
const target = testTarget();

const report = { stage: 'M6.2', checkedAt: new Date().toISOString(), scenarios: [], screenshots: [], viewports: [], pageErrors: [], latenciesMs: [], socketCloses: [] };
const contexts = [], pages = [], credentials = new Set(), commands = [], urls = [], publicFrames = [], apiResponses = [], responseJobs = [];
const names = ['Ana', 'Beto', 'Carla', 'Diego'], seats = ['A1', 'B1', 'A2', 'B2'];
const viewports = [{ width: 390, height: 844 }, { width: 360, height: 800 }, { width: 740, height: 360 }, { width: 1440, height: 1000 }];
let runtime, browser, oracle = initialState(), draft = beginDraft(oracle), seed = 0x6c2;

function redact(value) {
  let text = String(value);
  for (const credential of credentials) text = text.split(credential).join('[redacted]');
  return text;
}
function assertPrivate(value, label) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  for (const credential of credentials) assert.ok(!text.includes(credential), label);
}
const publicState = page => page.locator('#publicState').textContent().then(JSON.parse);
const allStates = () => Promise.all(pages.map(publicState));
const actionCount = () => new Set(commands.filter(command => command.type.startsWith('classic.')).map(command => command.actionId)).size;
async function waitAll(predicate, message) {
  return eventually(async () => { const states = await allStates(); return states.length === pages.length && states.every(predicate) && states; }, message, 25000);
}
async function screenshot(page, name) {
  const output = target ? name.replace('.png', `-${target.suffix}.png`) : name;
  await page.screenshot({ path: path.join(root, 'evidence', output), fullPage: true }); report.screenshots.push(output);
}
async function rememberNodes(page) {
  await page.evaluate(() => {
    const board = document.querySelector('[data-classic-board]');
    globalThis.__classicNodes = { board, cells: [...board.querySelectorAll('[data-cell]')], tokens: [...board.querySelectorAll('[data-piece]')] };
  });
}
async function assertNodes(page) {
  assert.equal(await page.evaluate(() => {
    const saved = globalThis.__classicNodes, board = document.querySelector('[data-classic-board]');
    return saved?.board === board && saved.cells.length === 49 && saved.tokens.length === 4
      && saved.cells.every(cell => board.querySelector(`[data-cell="${cell.dataset.cell}"]`) === cell)
      && saved.tokens.every(token => board.querySelector(`[data-piece="${token.dataset.piece}"]`) === token);
  }), true, 'Una actualización recreó el tablero, las casillas o las fichas');
}
async function assertBoard() {
  const expectedTerritory = territory(oracle), expectedActive = [...activeIds(oracle)].sort(), states = await allStates();
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i], state = states[i];
    assert.equal(state.stage, 'M6.2'); assert.equal(state.config.ruleset, 'classic-online-v1');
    assert.deepEqual(state.classic.game, oracle); assert.deepEqual(state.classic.draft, draft);
    assert.deepEqual(state.classic.territory, expectedTerritory); assert.deepEqual([...state.classic.activeIds].sort(), expectedActive);
    assert.equal(state.self.seat, seats[i]);
    if (!oracle.over) {
      assert.equal(state.status, 'active'); assert.equal(state.decision.kind, 'classic');
      assert.equal(state.decision.actor, oracle.currentActor); assert.equal(state.decision.team, oracle.turnTeam);
      assert.equal(state.clock.owner, oracle.turnTeam); assert.equal(state.canDecide, seats[i] === oracle.currentActor);
      assert.deepEqual(state.decision.eligible, [states[seats.indexOf(oracle.currentActor)].self.id]);
    }
    for (const team of ['A', 'B']) assert.equal(await page.locator(`[data-classic-score="${team}"]`).textContent(), String(expectedTerritory.score[team]));
    const connected = await page.locator('[data-classic-connection]').getAttribute('data-phase') === 'connected';
    const targets = await page.locator('[data-classic-board] [role="button"]').count();
    if (oracle.over || seats[i] !== oracle.currentActor || !connected) assert.equal(targets, 0, `La ficha ${seats[i]} recibió acciones de otra persona`);
    else assert.ok(targets > 0, 'La ficha propia que decide no tiene objetivos');
    assert.equal(await page.locator(`[data-piece="${seats[i]}"].classic-token-self`).count(), 1);
    await assertNodes(page);
  }
}
async function waitBoard() {
  const expectedGame = JSON.stringify(oracle), expectedDraft = JSON.stringify(draft);
  await waitAll(state => JSON.stringify(state.classic?.game) === expectedGame && JSON.stringify(state.classic?.draft) === expectedDraft,
    'Las cuatro vistas no alcanzaron el tablero y el camino del oráculo');
  await Promise.all(pages.map(page => page.locator('[data-classic-board][aria-busy="false"]').waitFor()));
  await assertBoard();
}
function plannedTurn() {
  const first = [{ path: [8], to: 1 }, { path: [12, 11], to: 4 }, { path: [40, 41, 34], to: 27 }];
  if (first[oracle.moves]) return { actor: oracle.currentActor, ...first[oracle.moves] };
  const start = oracle.pieces.find(piece => piece.id === oracle.currentActor).pos;
  let paths = [[start]];
  for (let n = 0; n < oracle.moves % 3; n++) paths = paths.flatMap(route => availableMoves(oracle, oracle.currentActor, route.at(-1)).map(to => [...route, to]));
  let options = paths.flatMap(route => wallOptions(oracle, route.at(-1)).map(to => ({ actor: oracle.currentActor, path: route, to })));
  if (!options.length) options = wallOptions(oracle, start).map(to => ({ actor: oracle.currentActor, path: [start], to }));
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; assert.ok(options.length);
  return options[seed % options.length];
}
async function choose(index, kind, to, keyboard = false) {
  const page = pages[index], before = actionCount(), began = performance.now();
  const target = page.locator(`[data-classic-board] [${kind === 'step' ? 'data-to' : 'data-wall'}="${to}"]`);
  const beforeState = await publicState(page);
  assert.equal(beforeState.canDecide, true); assert.equal(beforeState.decision.actor, beforeState.self.seat);
  await target.waitFor();
  if (keyboard) { await target.focus(); await target.press(kind === 'step' ? 'Enter' : 'Space'); }
  else await target.locator(kind === 'step' ? '.move-hit' : '.wall-hit').click();
  await waitBoard();
  assert.equal(actionCount(), before + 1, 'Una elección del tablero emitió cero o varias intenciones distintas');
  const sent = commands.filter(command => command.type === `classic.${kind}`).at(-1);
  assert.deepEqual(sent.params, { to }); assert.deepEqual(Object.keys(sent.params), ['to']);
  report.latenciesMs.push(Math.round(performance.now() - began));
}
async function recoverStep(index) {
  const page = pages[index], before = await publicState(page), count = actionCount();
  await page.reload(); await page.locator('[data-classic-connection][data-phase="connected"]').waitFor();
  await rememberNodes(page); await waitBoard();
  let recovered = await publicState(page);
  assert.equal(recovered.self.id, before.self.id); assert.equal(recovered.self.seat, 'A2');
  assert.deepEqual(recovered.classic, before.classic); assert.equal(actionCount(), count);
  for (const team of ['A', 'B']) assert.ok(recovered.clock.remainingMs[team] <= before.clock.remainingMs[team], 'La recarga devolvió tiempo');
  report.scenarios.push('Recarga tras el primer paso irreversible de A2: identidad, camino confirmado, muros y relojes recuperados sin reenviar un paso nuevo');

  const beforeDisconnect = recovered;
  await page.locator('[data-classic-disconnect]').click();
  await page.locator('[data-classic-connection][data-phase="disconnected"]').waitFor();
  assert.equal(await page.locator('[data-classic-board] [role="button"]').count(), 0);
  await eventually(async () => (await Promise.all(pages.filter((_, i) => i !== index).map(publicState))).every(state =>
    state.clock.graceUntil && !state.participants.find(player => player.id === before.self.id).online), 'La desconexión del actor no abrió la gracia');
  await pages[(index + 1) % 4].locator('[data-classic-grace]:visible').waitFor();
  await page.locator('[data-classic-reconnect]').click();
  await page.locator('[data-classic-connection][data-phase="connected"]').waitFor();
  await waitAll(state => state.clock.graceUntil === null && state.participants.every(player => player.online), 'La reconexión no cerró la gracia');
  recovered = await publicState(page);
  assert.deepEqual(recovered.classic, beforeDisconnect.classic); assert.equal(recovered.self.id, before.self.id); assert.equal(actionCount(), count);
  for (const team of ['A', 'B']) assert.ok(recovered.clock.remainingMs[team] <= beforeDisconnect.clock.remainingMs[team], 'La reconexión devolvió tiempo');
  await waitBoard();
  report.scenarios.push('Desconectar/reconectar desde la interfaz tras un paso confirmado: gracia compartida, ficha propia intacta y ningún paso futuro automático');
}

try {
  await authorizeTarget(target);
  await mkdir(path.join(root, 'evidence'), { recursive: true });
  runtime = target ?? await startRuntime({ port: 8789 });
  console.log('Clásico browser: runtime listo en 8789');
  const health = await (await fetch(runtime.base + '/api/health', { headers: target?.headers, signal: AbortSignal.timeout(15000) })).json(); assert.equal(health.stage, target ? 'M6.3' : 'M6.2');
  if (target) { report.stage = 'M6.3'; report.target = target.base; report.https = target.publicServer; report.runtimeLogsInspected = false; }
  browser = await chromium.launch({ channel: process.env.CERCONEXO_BROWSER_CHANNEL ?? 'msedge', headless: true });
  for (let i = 0; i < 4; i++) {
    const viewport = viewports[i], context = await browser.newContext({ viewport, isMobile: viewport.width < 650, hasTouch: viewport.width < 650, reducedMotion: 'reduce' });
    contexts.push(context); const page = await context.newPage(); pages.push(page); page.setDefaultTimeout(20000);
    if (target?.cookies) await context.addCookies(target.cookies);
    page.on('pageerror', error => report.pageErrors.push(error.message));
    page.on('request', request => urls.push(request.url()));
    page.on('response', response => {
      if (new URL(response.url()).pathname.startsWith('/api/')) responseJobs.push(response.text().then(body => apiResponses.push(body)).catch(() => {}));
    });
    page.on('websocket', socket => {
      urls.push(socket.url()); assert.equal(new URL(socket.url()).search, '');
      socket.on('framesent', ({ payload }) => {
        try {
          const message = JSON.parse(String(payload));
          if (message.type === 'authenticate') credentials.add(message.credential);
          else if (message.actionId) commands.push({ ...message, browser: i });
        } catch {}
      });
      socket.on('framereceived', ({ payload }) => publicFrames.push(String(payload)));
      socket.on('close', () => report.socketCloses.push({ browser: i, at: new Date().toISOString() }));
    });
  }
  const entryResponse = await pages[0].goto(target?.entry ?? runtime.base);
  assert.ok(entryResponse.headers()['content-security-policy'].includes("script-src 'self'"));
  await screenshot(pages[0], 'classic-entry-mobile.png');
  await pages[0].locator('#createForm [name=name]').fill(names[0]);
  await pages[0].locator('#createForm button[type=submit]').click();
  await pages[0].locator('#connection[data-phase="connected"]').waitFor();
  const code = (await publicState(pages[0])).code; assert.match(code, /^[A-HJ-NP-Z2-9]{10}$/);
  for (let i = 1; i < 4; i++) {
    const page = pages[i]; await page.goto(`${target?.entry ?? runtime.base + '/'}?room=${code}`);
    await page.locator('#joinForm [name=name]').fill(names[i]); await page.locator('#joinForm button[type=submit]').click();
    await page.locator('#connection[data-phase="connected"]').waitFor();
    const request = pages[0].locator('#requests .request').filter({ hasText: `${names[i]} solicita entrar` });
    await request.locator('select').selectOption(seats[i]); await request.getByRole('button', { name: 'Admitir', exact: true }).click();
    await eventually(async () => (await publicState(page)).self.seat === seats[i], 'No se admitió la posición asignada');
  }
  await waitAll(state => state.participants.length === 4 && state.participants.every(player => player.online), 'No se reunieron las cuatro personas');
  for (let i = 0; i < 4; i++) {
    await pages[i].locator('#readyButton').click();
    await waitAll(state => state.participants.find(player => player.seat === seats[i]).ready, 'La preparación no llegó a las cuatro vistas');
  }
  const began = performance.now(); await pages[0].locator('#startButton:enabled').click();
  await waitAll(state => state.status === 'active', 'La partida no comenzó después de la cuenta atrás');
  assert.ok(performance.now() - began >= 2800, 'La cuenta atrás terminó antes de tres segundos');
  await Promise.all(pages.map(page => page.locator('[data-classic-connection][data-phase="connected"]').waitFor()));
  await Promise.all(pages.map(rememberNodes)); await waitBoard();
  console.log('Clásico browser: cuatro jugadores y partida activa');
  report.scenarios.push('Cuatro contextos Edge crean, solicitan admisión, ocupan A1/B1/A2/B2, confirman preparación e inician Clásico desde los formularios');
  await screenshot(pages[0], 'classic-game-mobile.png');

  // A presence-only update must not rebuild the actor's live keyboard targets.
  await pages[0].locator('[data-classic-board] [data-to]').first().focus();
  await pages[0].evaluate(() => { globalThis.__classicTarget = document.activeElement; });
  const idB2 = (await publicState(pages[3])).self.id;
  await pages[3].locator('[data-classic-disconnect]').click();
  await pages[3].locator('[data-classic-connection][data-phase="disconnected"]').waitFor();
  await eventually(async () => !(await publicState(pages[0])).participants.find(player => player.id === idB2).online, 'La desconexión no se reflejó en el roster');
  assert.equal(await pages[0].evaluate(() => globalThis.__classicTarget === document.activeElement && globalThis.__classicTarget.isConnected), true);
  await pages[3].locator('[data-classic-reconnect]').click();
  await waitAll(state => state.participants.every(player => player.online), 'El roster no recuperó la conexión');
  assert.equal(await pages[0].evaluate(() => globalThis.__classicTarget === document.activeElement && globalThis.__classicTarget.isConnected), true);
  await waitBoard(); report.scenarios.push('La presencia del compañero conserva los mismos objetivos del tablero y el foco de teclado del actor');

  await contexts[0].grantPermissions(['clipboard-read', 'clipboard-write'], { origin: runtime.base });
  await pages[0].locator('[data-classic-invite]').click();
  const invite = await pages[0].evaluate(() => navigator.clipboard.readText());
  assert.equal(new URL(invite).searchParams.get('room'), code); assert.deepEqual([...new URL(invite).searchParams.keys()], ['room']);
  assertPrivate(invite, 'La invitación incluyó una credencial');

  const routeCounts = [0, 0, 0];
  while (!oracle.over) {
    const turn = plannedTurn(), index = seats.indexOf(turn.actor);
    for (let n = 1; n < turn.path.length; n++) {
      draft = advanceDraft(oracle, draft, turn.path[n]);
      await choose(index, 'step', turn.path[n], n % 2 === 1);
      if (oracle.moves === 2 && n === 1) await recoverStep(index);
      if (n === 2) assert.equal(await pages[index].locator('[data-classic-board] [data-to]').count(), 0, 'El tablero ofrece un tercer paso');
    }
    oracle = applyTurn(oracle, turn); draft = beginDraft(oracle);
    await choose(index, 'wall', turn.to, oracle.moves % 2 === 0); routeCounts[turn.path.length - 1]++;
    if (oracle.moves % 4 === 0) console.log(`Clásico browser: ${oracle.moves} turnos confirmados`);
    if (oracle.moves === 3) await screenshot(pages[3], 'classic-game-desktop.png');
  }
  const score = territory(oracle).score;
  assert.equal(oracle.moves, 16); assert.deepEqual(score, { A: 46, B: 3, empty: 0, mixed: 0 }); assert.ok(routeCounts.every(count => count > 0));
  const finalStates = await allStates();
  for (let i = 0; i < 4; i++) {
    const state = finalStates[i];
    assert.equal(state.status, 'finished'); assert.equal(state.canDecide, false); assert.equal(state.decision, null); assert.equal(state.clock.owner, null);
    assert.equal(state.outcome.reason, 'territory'); assert.deepEqual(state.outcome.winners, ['A']); assert.deepEqual(state.outcome.score, score);
    assert.equal(await pages[i].locator('[data-classic-result-title]').textContent(), 'Gana el equipo A');
    assert.equal(await pages[i].locator('[data-classic-result]').isVisible(), true);
    assert.equal(await pages[i].locator('[data-classic-board] [role="button"]').count(), 0);
    assert.equal(await pages[i].locator('[data-piece].token-isolated').count(), 4);
  }
  await screenshot(pages[3], 'classic-result.png');
  report.game = { turns: oracle.moves, routesBySteps: routeCounts, walls: oracle.walls.length, score, winners: ['A'], commands: actionCount() };
  report.scenarios.push('Partida completa de 16 turnos exclusivamente por clic/Enter/Espacio: juego, draft, territorio, fichas activas, decisión y reloj comparados con el motor oficial tras cada comando');
  report.scenarios.push('Caminos de cero, uno y dos pasos; sin tercer paso, sin objetivos para fichas ajenas y nodos persistentes durante toda la partida');
  report.scenarios.push('Final territorial exacto 46–3, resultado visible en los cuatro navegadores y relojes/acciones detenidos');

  for (const width of [360, 390, 740, 1440]) {
    await pages[3].setViewportSize({ width, height: width === 740 ? 360 : 900 });
    assert.equal(await pages[3].evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `Desbordamiento horizontal a ${width}px`);
    report.viewports.push({ width, height: width === 740 ? 360 : 900, horizontalOverflow: false });
  }
  await Promise.all(responseJobs);
  for (const page of pages) { assertPrivate(page.url(), 'Una URL contiene una credencial'); assertPrivate(await page.content(), 'El DOM contiene una credencial'); }
  for (const value of [...urls, ...publicFrames, ...apiResponses]) assertPrivate(value, 'Una URL o respuesta pública contiene una credencial');
  assertPrivate(runtime.logs(), 'El registro del runtime contiene una credencial');
  for (const file of await readdir(path.join(runtime.stateDir, 'logs')).catch(() => [])) assertPrivate(await readFile(path.join(runtime.stateDir, 'logs', file), 'utf8'), 'Un registro local contiene una credencial');
  assert.equal(credentials.size, 4); assert.deepEqual(report.pageErrors, []);
  report.scenarios.push(target ? 'Invitación solo con código público; URLs, HTTP, WebSocket y DOM sin credenciales; CSP activa y cero errores de JavaScript; no se inspeccionan logs del proveedor' : 'Invitación solo con código público; URLs, HTTP, WebSocket, DOM y registros sin credenciales; CSP activa y cero errores de JavaScript');
  report.scenarios.push('Sin desbordamiento horizontal en 360, 390, 740 y 1440 px, incluido paisaje de 740 × 360');
  report.ok = true;
} catch (error) {
  report.ok = false; report.error = redact(error.stack ?? error.message); process.exitCode = 1;
  report.failurePages = await Promise.all(pages.map(async (page, index) => {
    try {
      const state = await publicState(page);
      return { browser: index, phase: await page.locator('[data-classic-connection]').getAttribute('data-phase'), self: state.self.seat,
        revision: state.revision, presenceRevision: state.presenceRevision, status: state.status,
        participants: state.participants.map(player => ({ seat: player.seat, online: player.online })),
        graceUntil: state.clock.graceUntil, decision: state.decision, draft: state.classic?.draft };
    } catch { return { browser: index, unavailable: true }; }
  }));
} finally {
  for (const context of contexts) await context.close().catch(() => {});
  await browser?.close().catch(() => {});
  if (runtime) { report.runtimeLogErrors = target ? null : (runtime.logs().match(/\[ERROR\]/g) ?? []).length; await runtime.stop(); }
  await mkdir(path.join(root, 'evidence'), { recursive: true });
  await writeFile(path.join(root, `evidence/classic-browser${target ? '-' + target.suffix : ''}.json`), redact(JSON.stringify(report, null, 2)));
  console.log(redact(JSON.stringify(report, null, 2)));
}
