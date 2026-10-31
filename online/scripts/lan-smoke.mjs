import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { gatewayConfig } from './lan.mjs';
import { root, eventually } from './runtime.mjs';
import { SocketClient } from './socket-client.mjs';
import { initialState, applyTurn, territory, activeIds } from '../../src/engine.mjs';
import { beginDraft, advanceDraft } from '../../src/turnDraft.mjs';

// Run against an already-running loopback Worker and private-IP gateway.
// This script owns only its browser and clients; it never starts/stops servers.
const report = { stage: 'M6.2', checkedAt: new Date().toISOString(), ok: false,
  testDevice: 'Emulación móvil de Chromium/Edge en PC sobre origen LAN; Android físico no probado.',
  physicalAndroidTested: false, scenarios: [], screenshots: [], pageErrors: [] };
const credentials = new Set(), clients = [], urls = [], publicFrames = [], apiResponses = [], responseJobs = [], commands = [];
let config, browser, context, page, code;

function argumentsOf(args) {
  const options = {};
  for (let index = 0; index < args.length; index++) {
    const option = args[index], value = args[++index];
    if (!['--host', '--port'].includes(option) || !value) throw new Error('Uso: node scripts/lan-smoke.mjs --host IPv4_PRIVADA_DEL_PC [--port 8791]');
    if (option === '--host') options.host = value;
    else {
      if (!/^[1-9]\d{0,4}$/.test(value)) throw new Error('Puerto LAN inválido.');
      options.port = Number(value);
    }
  }
  return gatewayConfig(options);
}

function redact(value) {
  let text = String(value);
  for (const credential of credentials) text = text.split(credential).join('[redacted]');
  return text;
}
function assertPrivate(value, message = 'Una URL o un estado público expuso una credencial.') {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  for (const credential of credentials) assert.ok(!text.includes(credential), message);
}
function token() {
  const credential = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
  credentials.add(credential); return credential;
}
const publicState = () => page.locator('#publicState').textContent().then(JSON.parse);
const allStates = async () => [await publicState(), ...clients.map(client => client.state)];
async function waitAll(predicate, message) {
  return eventually(async () => { const states = await allStates(); return states.every(state => state && predicate(state)) && states; }, message, 30000);
}
async function shared(revision) {
  return waitAll(state => state.revision >= revision, 'Las cuatro vistas no alcanzaron la revisión compartida.');
}
async function api(route, body) {
  const response = await fetch(config.origin + route, { method: 'POST', redirect: 'error',
    headers: { 'content-type': 'application/json', origin: config.origin }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  const data = await response.json(); apiResponses.push(JSON.stringify(data));
  assertPrivate(data); assert.equal(response.status, 200, 'La solicitud LAN no se confirmó.');
  return data;
}
async function rawStatus(headers) {
  return new Promise((resolve, reject) => {
    const request = http.get({ hostname: config.address, port: config.port, path: '/api/health', headers }, response => {
      response.resume(); response.once('end', () => resolve(response.statusCode));
    });
    request.setTimeout(10000, () => request.destroy(new Error('La comprobación LAN agotó su plazo.')));
    request.once('error', reject);
  });
}
async function assertBoard(game, draft) {
  const states = await allStates(), expectedTerritory = territory(game), expectedActive = [...activeIds(game)].sort();
  assert.equal(states.length, 4);
  assert.deepEqual(states.map(state => state.self.seat), ['A1', 'B1', 'A2', 'B2']);
  for (const state of states) {
    assert.equal(state.stage, 'M6.2'); assert.equal(state.status, 'active');
    assert.deepEqual(state.classic.game, game); assert.deepEqual(state.classic.draft, draft);
    assert.deepEqual(state.classic.territory, expectedTerritory); assert.deepEqual([...state.classic.activeIds].sort(), expectedActive);
    assert.equal(state.decision.actor, game.currentActor); assert.equal(state.clock.owner, game.turnTeam);
    assert.equal(state.canDecide, state.self.seat === game.currentActor); assertPrivate(state);
  }
}
async function waitBoard(game, draft) {
  const expectedGame = JSON.stringify(game), expectedDraft = JSON.stringify(draft);
  await waitAll(state => JSON.stringify(state.classic?.game) === expectedGame && JSON.stringify(state.classic?.draft) === expectedDraft,
    'El tablero o el paso no llegaron a las cuatro vistas LAN.');
  await page.locator('[data-classic-board][aria-busy="false"]').waitFor();
  await assertBoard(game, draft);
}
function classicActionCount() { return new Set(commands.filter(command => command.type.startsWith('classic.')).map(command => command.actionId)).size; }

try {
  config = argumentsOf(process.argv.slice(2)); report.origin = config.origin;
  report.interface = { name: config.name, address: config.address, prefix: config.prefix };
  const healthResponse = await fetch(config.origin + '/api/health', { redirect: 'error', signal: AbortSignal.timeout(10000) });
  assert.equal(healthResponse.status, 200); const health = await healthResponse.json(); assert.equal(health.stage, 'M6.2');
  report.security = {
    externalOriginStatus: await rawStatus({ host: config.authority, origin: 'http://external.invalid' }),
    forgedHostStatus: await rawStatus({ host: 'rebind.invalid:8791', origin: config.origin })
  };
  assert.equal(report.security.externalOriginStatus, 403); assert.equal(report.security.forgedHostStatus, 403);
  report.scenarios.push('Origin externo y Host forjado rechazados con 403, solicitando únicamente la IP privada seleccionada.');

  browser = await chromium.launch({ channel: process.env.CERCONEXO_BROWSER_CHANNEL ?? 'msedge', headless: true });
  report.browser = { engine: 'Chromium', channel: process.env.CERCONEXO_BROWSER_CHANNEL ?? 'msedge', version: browser.version(), headless: true };
  context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  page = await context.newPage(); page.setDefaultTimeout(30000);
  page.on('pageerror', error => report.pageErrors.push(redact(error.message)));
  page.on('request', request => urls.push(request.url()));
  page.on('response', response => {
    if (new URL(response.url()).pathname.startsWith('/api/')) responseJobs.push(response.text().then(body => apiResponses.push(body)).catch(() => {}));
  });
  page.on('websocket', websocket => {
    urls.push(websocket.url());
    websocket.on('framesent', ({ payload }) => {
      try {
        const message = JSON.parse(String(payload));
        if (message.type === 'authenticate') credentials.add(message.credential);
        else if (message.actionId) commands.push(message);
      } catch { /* Application heartbeat has no JSON payload. */ }
    });
    websocket.on('framereceived', ({ payload }) => publicFrames.push(String(payload)));
  });
  const entryResponse = await page.goto(config.origin + '/?profile=1');
  assert.equal(entryResponse.status(), 200);
  const csp = entryResponse.headers()['content-security-policy'];
  assert.ok(csp?.includes("script-src 'self'")); assert.ok(csp.includes(`ws://${config.authority}`));
  report.environment = await page.evaluate(() => ({ origin: location.origin, isSecureContext,
    randomUUIDAvailable: typeof crypto?.randomUUID === 'function', getRandomValuesAvailable: typeof crypto?.getRandomValues === 'function',
    clipboardAvailable: typeof navigator.clipboard?.writeText === 'function', viewport: { width: innerWidth, height: innerHeight } }));
  assert.equal(report.environment.origin, config.origin); assert.equal(report.environment.isSecureContext, false);
  assert.equal(report.environment.getRandomValuesAvailable, true);

  await page.locator('#createForm [name=name]').fill('Ana');
  await page.locator('#createForm button[type=submit]').click();
  await page.locator('#connection[data-phase="connected"]').waitFor();
  code = await page.locator('#roomCode').innerText(); assert.match(code, /^[A-HJ-NP-Z2-9]{10}$/);
  const initialCredential = await page.evaluate(code => JSON.parse(localStorage.getItem(`cerconexo-m6-session-v1:1:${code}`)).credential, code);
  credentials.add(initialCredential);
  const names = ['Beto', 'Carla', 'Diego'], seats = ['B1', 'A2', 'B2'];
  for (let index = 0; index < 3; index++) {
    const credential = token();
    const joined = await api(`/api/rooms/${code}/join`, { name: names[index], credential });
    const client = new SocketClient(config.origin, code, credential); clients.push(client);
    urls.push(config.origin.replace('http:', 'ws:') + `/api/rooms/${code}/socket`);
    await client.connect();
    const row = page.locator('#requests .request').filter({ hasText: names[index] });
    await row.locator('select').selectOption(seats[index]);
    await row.getByRole('button', { name: 'Admitir', exact: true }).click();
    await eventually(() => client.state?.self.seat === seats[index], 'No se confirmó la posición del cliente LAN.');
    await waitAll(state => state.participants.some(player => player.id === joined.state.self.id && player.seat === seats[index]), 'La admisión no llegó a todas las vistas LAN.');
  }
  await waitAll(state => state.participants.length === 4 && state.participants.every(player => player.online), 'La sala LAN no tiene cuatro personas conectadas.');
  await page.locator('#readyButton').click();
  await waitAll(state => state.participants.find(player => player.seat === 'A1')?.ready, 'El anfitrión no confirmó su preparación.');
  for (const client of clients) { const ack = await client.command('ready', { ready: true }); await shared(ack.receipt.revision); }
  const startAt = Date.now(); await page.locator('#startButton:enabled').click();
  await waitAll(state => state.status === 'active', 'No comenzó la partida Clásico sobre LAN.');
  assert.ok(Date.now() - startAt >= 2900, 'La cuenta atrás terminó antes de tres segundos.');
  await page.locator('[data-classic-connection][data-phase="connected"]').waitFor();
  const game = initialState(), committedDraft = advanceDraft(game, beginDraft(game), 9);
  await waitBoard(game, beginDraft(game));
  report.scenarios.push('Ana crea por UI; tres SocketClients sobre LAN solicitan entrada; el anfitrión admite B1/A2/B2 por DOM, los cuatro se preparan e inician.');

  await page.locator('[data-classic-board] [data-to="9"] .move-hit').click();
  await waitBoard(game, committedDraft); assert.equal(classicActionCount(), 1);
  const step = commands.find(command => command.type === 'classic.step');
  assert.match(step.actionId, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  assert.deepEqual(step.params, { to: 9 });
  const beforeReload = await publicState();
  await page.reload(); await page.locator('[data-classic-connection][data-phase="connected"]').waitFor();
  await waitAll(state => state.participants.every(player => player.online) && state.clock.graceUntil === null, 'La recarga no recuperó la conexión LAN.');
  await waitBoard(game, committedDraft);
  const recovered = await publicState();
  assert.equal(recovered.self.id, beforeReload.self.id); assert.equal(recovered.self.seat, 'A1');
  const recoveredCredential = await page.evaluate(code => JSON.parse(localStorage.getItem(`cerconexo-m6-session-v1:1:${code}`)).credential, code);
  credentials.add(recoveredCredential); assert.equal(recoveredCredential, initialCredential);
  for (const team of ['A', 'B']) assert.ok(recovered.clock.remainingMs[team] <= beforeReload.clock.remainingMs[team], 'La recarga devolvió tiempo al equipo.');
  assert.equal(classicActionCount(), 1, 'La recarga volvió a emitir un paso distinto.');
  report.scenarios.push('En HTTP LAN inseguro se confirma A1→9; [8,9] persiste en las cuatro vistas y tras recargar se conservan credencial, identidad, posición y reloj.');
  report.environment.actionIdConfirmed = true;
  report.environment.getRandomValuesFallbackExercised = !report.environment.randomUUIDAvailable;

  const expected = applyTurn(game, { actor: 'A1', path: [8, 9], to: 10 });
  await page.locator('[data-classic-board] [data-wall="10"] .wall-hit').click();
  await waitBoard(expected, beginDraft(expected)); assert.equal(classicActionCount(), 2);
  assert.equal(expected.walls.length, 1); assert.equal(expected.currentActor, 'B1');
  assert.equal(await page.locator('[data-classic-board] [role="button"]').count(), 0);
  report.scenarios.push('Muro 9–10 confirmado desde UI: cuatro vistas coinciden con applyTurn oficial, un muro y turno B1.');
  report.game = { walls: expected.walls.length, moves: expected.moves, currentActor: expected.currentActor,
    committedPathBeforeWall: [8, 9], confirmedActionCount: classicActionCount(), clockAfterReload: recovered.clock.remainingMs };
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  await mkdir(path.join(root, 'evidence'), { recursive: true });
  await page.screenshot({ path: path.join(root, 'evidence/classic-lan-mobile.png'), fullPage: true });
  report.screenshots.push('classic-lan-mobile.png');

  await Promise.all(responseJobs);
  for (const value of [...urls, ...publicFrames, ...apiResponses, ...clients.flatMap(client => client.messages)]) assertPrivate(value);
  for (const url of urls) {
    const parsed = new URL(url); assert.equal(parsed.hostname, config.address); assert.equal(parsed.port || '80', String(config.port));
    if (parsed.pathname.startsWith('/api/')) assert.equal(parsed.search, '');
  }
  assertPrivate(page.url()); assertPrivate(await page.content());
  assert.equal(credentials.size, 4); assert.deepEqual(report.pageErrors, []);
  report.scenarios.push('URLs HTTP/WS sin secretos ni parámetros API; respuestas, instantáneas y DOM públicos sin credenciales; cero errores JavaScript y sin desbordamiento móvil.');
  report.ok = true;
} catch (error) {
  report.error = redact(error.stack ?? error.message); process.exitCode = 1;
} finally {
  for (const client of clients) { clearInterval(client.ping); try { client.ws?.terminate(); } catch { /* Own test clients only. */ } }
  await context?.close().catch(() => {}); await browser?.close().catch(() => {});
  await mkdir(path.join(root, 'evidence'), { recursive: true });
  const output = redact(JSON.stringify(report, null, 2));
  await writeFile(path.join(root, 'evidence/classic-lan.json'), output);
  console.log(output);
}
