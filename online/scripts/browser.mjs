import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { root, startRuntime, eventually } from './runtime.mjs';

const report = { stage: 'M6.1', checkedAt: new Date().toISOString(), scenarios: [], screenshots: [], pageErrors: [] };
let runtime, site, browser;
const contexts = [], secrets = [], sentCommands = [];
try {
  runtime = await startRuntime({ port: 8789 });
  const allowed = new Set(['index.html', 'styles.css', 'app.mjs', 'session.mjs', 'config.mjs']);
  site = createServer(async (request, response) => {
    const name = new URL(request.url, 'http://127.0.0.1:8790').pathname.slice(1) || 'index.html';
    if (!allowed.has(name)) { response.writeHead(404); response.end(); return; }
    const body = name === 'config.mjs' ? `export const API_BASE = ${JSON.stringify(runtime.base)};` : await readFile(path.join(root, 'public', name));
    response.writeHead(200, { 'content-type': name.endsWith('.mjs') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' }); response.end(body);
  });
  await new Promise((resolve, reject) => { site.once('error', reject); site.listen(8790, '127.0.0.1', resolve); });
  browser = await chromium.launch({ channel: process.env.CERCONEXO_BROWSER_CHANNEL ?? 'msedge', headless: true });
  await mkdir(path.join(root, 'evidence'), { recursive: true });
  async function pageFor(viewport = { width: 390, height: 844 }) {
    const context = await browser.newContext({ viewport, isMobile: viewport.width < 650, hasTouch: viewport.width < 650, reducedMotion: 'reduce' }); contexts.push(context);
    const page = await context.newPage(); page.on('pageerror', error => report.pageErrors.push(error.message));
    page.on('websocket', ws => {
      assert.equal(new URL(ws.url()).search, '');
      ws.on('framesent', ({ payload }) => {
        try { const message = JSON.parse(String(payload)); if (message.type === 'authenticate') secrets.push(message.credential); else if (message.actionId) sentCommands.push(message); } catch {}
      });
    });
    return page;
  }
  const pages = [await pageFor()];
  await pages[0].goto('http://127.0.0.1:8790');
  await pages[0].screenshot({ path: path.join(root, 'evidence/entry-mobile.png'), fullPage: true }); report.screenshots.push('entry-mobile.png');
  await pages[0].locator('#createForm [name=name]').fill('Ana'); await pages[0].locator('#createForm button[type=submit]').click();
  await pages[0].locator('#connection[data-phase=connected]').waitFor();
  const code = await pages[0].locator('#roomCode').innerText(); assert.match(code, /^[A-HJ-NP-Z2-9]{10}$/);
  const names = ['Ana', 'Beto', 'Carla', 'Diego'], seats = ['A1', 'B1', 'A2', 'B2'];
  for (let i = 1; i < 4; i++) {
    const page = await pageFor(); pages.push(page); await page.goto(`http://127.0.0.1:8790/?room=${code}`);
    await page.locator('#joinForm [name=name]').fill(names[i]); await page.locator('#joinForm button[type=submit]').click();
    await page.locator('#connection[data-phase=connected]').waitFor();
    const row = pages[0].locator('#requests .request').filter({ hasText: names[i] }); await row.locator('select').selectOption(seats[i]); await row.getByRole('button', { name: 'Admitir', exact: true }).click();
    await eventually(async () => (await page.locator('#selfLabel').innerText()).includes(seats[i]), 'La posición no se difundió al móvil');
  }
  for (const page of pages) {
    await page.locator('#readyButton').click();
    await eventually(async () => (await page.locator('#readyButton').innerText()).includes('✓'), 'No se confirmó la preparación');
  }
  await pages[0].locator('#startButton:enabled').click();
  await pages[0].locator('#completeButton:enabled').waitFor();
  await pages[0].locator('#completeButton').click();
  for (const page of pages) await eventually(async () => await page.locator('#completed').innerText() === '01', 'El contador no llegó a los cuatro clientes');
  const states = await Promise.all(pages.map(p => p.locator('#publicState').textContent().then(JSON.parse)));
  assert.equal(new Set(states.map(s => s.revision)).size, 1);
  for (const state of states) assert.deepEqual(state.participants, states[0].participants);
  assert.equal(await pages[0].locator('#completeButton').isDisabled(), true); assert.equal(await pages[1].locator('#completeButton').isEnabled(), true);
  report.scenarios.push('Cuatro contextos de navegador independientes crean, solicitan, admiten, preparan y comparten la misma revisión');
  report.scenarios.push('Interfaz estática en :8790 y backend/WebSocket en :8789: CORS y autenticación sin cookies de terceros');
  await pages[1].screenshot({ path: path.join(root, 'evidence/room-mobile.png'), fullPage: true }); report.screenshots.push('room-mobile.png');
  await pages[1].reload(); await pages[1].locator('#connection[data-phase=connected]').waitFor();
  assert.ok((await pages[1].locator('#selfLabel').innerText()).includes('B1')); assert.equal(await pages[1].locator('#completed').innerText(), '01');
  await pages[1].locator('#disconnectButton').click();
  await pages[0].locator('#graceNotice:visible').waitFor();
  await pages[1].locator('#reconnectButton').click(); await pages[1].locator('#connection[data-phase=connected]').waitFor();
  await pages[0].locator('#graceNotice').waitFor({ state: 'hidden' });
  report.scenarios.push('Recarga y desconexión del móvil que decide: posición recuperada, gracia visible y reloj sin reiniciar');

  const privateSession = await pages[0].evaluate(code => JSON.parse(localStorage.getItem(`cerconexo-m6-session-v1:1:${code}`)), code);
  const desktop = await pageFor({ width: 1440, height: 1000 }); await desktop.goto(`http://127.0.0.1:8790/?room=${code}`);
  await desktop.locator('.recovery summary').click(); await desktop.locator('#recoverForm [name=credential]').fill(privateSession.credential);
  await desktop.locator('#recoverForm button[type=submit]').click(); await desktop.locator('#connection[data-phase=connected]').waitFor();
  await pages[0].locator('#connection[data-phase=replaced]').waitFor();
  assert.ok((await desktop.locator('#selfLabel').innerText()).includes('A1'));
  assert.equal(await desktop.locator('.seat').count(), 4);
  report.scenarios.push('Recuperación personal en otro contexto, mediante campo protegido; se invalida la conexión anterior');

  const confirmed = sentCommands.find(c => c.type === 'probe.complete'); assert.ok(confirmed);
  await desktop.evaluate(({ code, pending }) => {
    const key = `cerconexo-m6-session-v1:1:${code}`, saved = JSON.parse(localStorage.getItem(key)); saved.pending = pending; localStorage.setItem(key, JSON.stringify(saved));
  }, { code, pending: confirmed });
  await desktop.reload(); await desktop.locator('#connection[data-phase=connected]').waitFor();
  await eventually(() => desktop.evaluate(code => JSON.parse(localStorage.getItem(`cerconexo-m6-session-v1:1:${code}`)).pending === null, code), 'No se resolvió la confirmación pendiente');
  assert.equal(await desktop.locator('#completed').innerText(), '01');
  report.scenarios.push('Una confirmación perdida conservada en el navegador se reenvía con el mismo actionId sin duplicar la decisión');
  await desktop.screenshot({ path: path.join(root, 'evidence/room-desktop.png'), fullPage: true }); report.screenshots.push('room-desktop.png');
  await desktop.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:8790' });
  await desktop.locator('#copyInvite').click(); const invite = await desktop.evaluate(() => navigator.clipboard.readText());
  assert.equal(new URL(invite).searchParams.get('room'), code); assert.equal([...new URL(invite).searchParams.keys()].join(), 'room');
  for (const secret of secrets) assert.ok(!invite.includes(secret), 'Una invitación incluyó una credencial');
  for (const page of [...pages, desktop]) {
    const visibleState = await page.locator('#publicState').textContent();
    for (const secret of secrets) assert.ok(!visibleState.includes(secret), 'El DOM público contiene una credencial');
  }
  report.scenarios.push('Invitación copiada con código público solamente; estado visible sin credenciales');
  for (const width of [360, 390, 740, 1440]) {
    await desktop.setViewportSize({ width, height: width === 740 ? 360 : 900 });
    assert.ok(await desktop.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Desbordamiento horizontal a ${width}px`);
  }
  report.scenarios.push('Sin desbordamiento horizontal en 360, 390, 740 y 1440 px, incluido paisaje de altura reducida');
  const direct = await pageFor({ width: 1280, height: 800 });
  const directResponse = await direct.goto(runtime.base);
  assert.ok(directResponse.headers()['content-security-policy'].includes("script-src 'self'"));
  await direct.locator('#createForm [name=name]').fill('Prueba directa'); await direct.locator('#createForm button[type=submit]').click();
  await direct.locator('#connection[data-phase=connected]').waitFor();
  report.scenarios.push('La demo servida directamente por el Worker aplica CSP y autentica su WebSocket');
  assert.deepEqual(report.pageErrors, []);
  for (const secret of secrets) assert.ok(!runtime.logs().includes(secret), 'El registro del runtime contiene una credencial');
  report.ok = true;
} catch (error) { report.ok = false; report.error = error.message; process.exitCode = 1; }
finally {
  for (const context of contexts) await context.close().catch(() => {});
  await browser?.close(); if (site) await new Promise(resolve => site.close(resolve)); if (runtime) await runtime.stop();
  await mkdir(path.join(root, 'evidence'), { recursive: true }); await writeFile(path.join(root, 'evidence/browser.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
