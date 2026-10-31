import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { root, eventually } from './runtime.mjs';
import { testTarget, authorizeTarget } from './test-target.mjs';

// An isolated room on the running local demo: no clock overrides or test hooks.
const target = testTarget(), base = target?.base ?? 'http://127.0.0.1:8787';
const report = { stage: 'M6.2', checkedAt: new Date().toISOString(), realClock: true, pageErrors: [] };
const pages = [], contexts = [], seats = ['A1', 'B1', 'A2', 'B2'];
const state = page => page.locator('#publicState').textContent().then(JSON.parse);
const states = () => Promise.all(pages.map(state));
const all = (predicate, message) => eventually(async () => (await states()).every(predicate), message, 25000);
let browser;
try {
  await authorizeTarget(target);
  await mkdir(path.join(root, 'evidence'), { recursive: true });
  const health = await (await fetch(base + '/api/health', { headers: target?.headers, signal: AbortSignal.timeout(15000) })).json(); assert.equal(health.stage, target ? 'M6.3' : 'M6.2');
  if (target) { report.stage = 'M6.3'; report.target = target.base; report.https = target.publicServer; }
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  for (let i = 0; i < 4; i++) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    contexts.push(context); const page = await context.newPage(); pages.push(page);
    if (target?.cookies) await context.addCookies(target.cookies);
    page.setDefaultTimeout(20000); page.on('pageerror', error => report.pageErrors.push(error.message));
  }
  await pages[0].goto(target?.entry ?? base);
  await pages[0].locator('#createForm [name=name]').fill('Reloj A1');
  await pages[0].locator('#createForm button[type=submit]').click();
  await pages[0].locator('#connection[data-phase="connected"]').waitFor();
  const code = (await state(pages[0])).code;
  for (let i = 1; i < 4; i++) {
    await pages[i].goto(`${target?.entry ?? base + '/'}?room=${code}`);
    await pages[i].locator('#joinForm [name=name]').fill(`Reloj ${seats[i]}`);
    await pages[i].locator('#joinForm button[type=submit]').click();
    await pages[i].locator('#connection[data-phase="connected"]').waitFor();
    const request = pages[0].locator('#requests .request').filter({ hasText: `Reloj ${seats[i]} solicita entrar` });
    await request.locator('select').selectOption(seats[i]);
    await request.getByRole('button', { name: 'Admitir', exact: true }).click();
    await eventually(async () => (await state(pages[i])).self.seat === seats[i], 'Sin asiento');
  }
  await all(s => s.participants.length === 4 && s.participants.every(p => p.online), 'Sin cuatro participantes');
  for (let i = 0; i < 4; i++) {
    await pages[i].locator('#readyButton').click();
    await all(s => s.participants.find(p => p.seat === seats[i]).ready, 'Sin preparación');
  }
  await pages[0].locator('#startButton').click();
  await all(s => s.status === 'active', 'No comenzó la partida');
  const start = await state(pages[0]);
  assert.equal(start.config.clockMs, 480000); assert.equal(start.clock.owner, 'A');
  const began = performance.now();
  await pages[0].locator('[data-classic-board] [data-to="9"] .move-hit').click();
  await all(s => s.classic.draft.path.join(',') === '8,9', 'El paso no se compartió');
  const committed = structuredClone((await state(pages[0])).classic);
  console.log('Timeout: cuatro navegadores; paso irreversible confirmado; esperando ocho minutos reales.');
  let minute = -1;
  while (true) {
    const elapsed = performance.now() - began;
    if (elapsed > 510000) throw new Error('La alarma no finalizó dentro de la tolerancia');
    const current = await states();
    if (current.every(s => s.status === 'finished')) break;
    assert.ok(current.every(s => s.participants.every(p => p.online)), 'Una desconexión alteró esta prueba de reloj real');
    if (Math.floor(elapsed / 60000) !== minute) {
      minute = Math.floor(elapsed / 60000); console.log(`Timeout: ${minute} minutos transcurridos.`);
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  report.elapsedMs = Math.round(performance.now() - began);
  assert.ok(report.elapsedMs >= 478000, 'Finalización prematura');
  const final = await states();
  for (let i = 0; i < 4; i++) {
    const s = final[i]; assert.equal(s.outcome.reason, 'timeout'); assert.deepEqual(s.outcome.winners, ['B']);
    assert.equal(s.clock.remainingMs.A, 0); assert.equal(s.clock.remainingMs.B, 480000);
    assert.equal(s.clock.owner, null); assert.equal(s.decision, null); assert.equal(s.canDecide, false);
    assert.deepEqual(s.classic, committed);
    await pages[i].locator('[data-classic-result]:visible').waitFor();
    assert.equal(await pages[i].locator('[data-classic-result-title]').textContent(), 'Gana el equipo B');
    assert.match(await pages[i].locator('[data-classic-result-detail]').textContent(), /agotó su tiempo/);
    assert.equal(await pages[i].locator('[data-classic-board] [role="button"]').count(), 0);
  }
  await pages[0].reload();
  await pages[0].locator('[data-classic-result]:visible').waitFor();
  const reloaded = await state(pages[0]);
  assert.equal(reloaded.status, 'finished'); assert.deepEqual(reloaded.outcome, final[0].outcome);
  assert.equal(reloaded.clock.remainingMs.A, 0); assert.deepEqual(reloaded.classic, committed);
  await pages[0].waitForLoadState('networkidle');
  assert.equal(await pages[0].evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  await pages[0].screenshot({ path: path.join(root, `evidence/classic-timeout${target ? '-' + target.suffix : ''}.png`), fullPage: true });
  assert.deepEqual(report.pageErrors, []);
  report.ok = true; report.browsers = 4; report.winner = 'B'; report.partialPath = [8, 9];
  report.scenarios = ['Ocho minutos reales, cuatro navegadores conectados y un paso parcial persistente', 'Alarma del servidor, victoria B y resultado visible idéntico sin acciones habilitadas', 'Recarga final sin recuperar tiempo ni perder el recorrido'];
} catch (error) { report.ok = false; report.error = error.stack ?? error.message; process.exitCode = 1; }
finally {
  for (const context of contexts) await context.close().catch(() => {});
  await browser?.close().catch(() => {});
  await writeFile(path.join(root, `evidence/classic-timeout${target ? '-' + target.suffix : ''}.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
