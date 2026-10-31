import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import WebSocket from 'ws';
import { chromium } from 'playwright';
import { testTarget } from './test-target.mjs';
import { loadOperator } from './pilot-access.mjs';
import { root } from './runtime.mjs';
const target = testTarget(); if (!target?.publicServer) throw new Error('Se necesita --base con el sitio HTTPS del piloto.');
const report = { stage: 'M6.3', checkedAt: new Date().toISOString(), target: target.base, checks: [], pageErrors: [] };
let browser;
try {
  const { credential } = await loadOperator();
  for (const route of ['/', '/online/', '/src/engine.mjs', '/arena/src/engine.mjs']) {
    const response = await fetch(target.base + route, { redirect: 'manual', signal: AbortSignal.timeout(20000) });
    assert.equal(response.status, 303); assert.ok(response.headers.get('location').startsWith(target.base + '/pilot/'));
  }
  assert.equal((await fetch(target.base + '/api/health')).status, 401);
  const socketStatus = await new Promise((resolve, reject) => {
    const socket = new WebSocket(target.base.replace('https:', 'wss:') + '/api/rooms/ABCDEFGH23/socket', { origin: target.base, handshakeTimeout: 20000 });
    socket.on('error', () => {});
    socket.once('open', () => { socket.terminate(); reject(new Error('WebSocket anónimo admitido')); });
    socket.once('unexpected-response', (_request, response) => { response.resume(); socket.terminate(); resolve(response.statusCode); });
    setTimeout(() => { socket.terminate(); reject(new Error('Sin respuesta al rechazo WSS')); }, 21000).unref();
  });
  assert.equal(socketStatus, 401);
  report.checks.push('Sin cookie: portada, recursos de motores y pantallas redirigen al acceso privado; API y WSS rechazan con 401.');
  const denied = await fetch(target.base + '/pilot/session', { method: 'POST', headers: { origin: target.base, 'content-type': 'application/json' }, body: JSON.stringify({ credential: 'Z'.repeat(43) }) });
  assert.equal(denied.status, 401); assert.equal(denied.headers.get('set-cookie'), null);
  const foreign = await fetch(target.base + '/pilot/session', { method: 'POST', headers: { origin: 'https://externo.invalid', 'content-type': 'application/json' }, body: JSON.stringify({ credential }) });
  assert.equal(foreign.status, 403);
  report.checks.push('Credencial incorrecta no emite cookie; origen externo rechazado incluso con la credencial correcta.');
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage(); page.on('pageerror', error => report.pageErrors.push(error.message));
  await page.goto(target.base + '/online/'); await page.locator('#pilotLogin').waitFor();
  await page.locator('[name=credential]').fill(credential); await page.locator('#pilotLogin button').click();
  await page.locator('#createForm').waitFor(); assert.equal(new URL(page.url()).pathname, '/online/');
  const cookie = (await context.cookies()).find(c => c.name === '__Host-cerconexo_m6_pilot');
  assert.ok(cookie?.httpOnly && cookie?.secure && cookie?.sameSite === 'Strict');
  assert.equal(await page.evaluate(() => document.cookie.includes('__Host-cerconexo_m6_pilot')), false);
  assert.ok(!page.url().includes(credential)); assert.ok(!(await page.content()).includes(credential));
  await page.reload(); await page.locator('#createForm').waitFor();
  assert.deepEqual(report.pageErrors, []);
  report.checks.push('Formulario real en móvil emulado: acceso a /online/, cookie HttpOnly/Secure/SameSite Strict, credencial fuera de URL/DOM y recarga autenticada.');
  report.ok = true;
} catch (error) { report.ok = false; report.error = error.message; process.exitCode = 1; }
finally {
  await browser?.close().catch(() => {});
  await mkdir(path.join(root, 'evidence'), { recursive: true });
  await writeFile(path.join(root, 'evidence/pilot-public.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
