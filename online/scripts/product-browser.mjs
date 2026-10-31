import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { root } from './runtime.mjs';
import { testTarget, authorizeTarget } from './test-target.mjs';
const target = testTarget() ?? testTarget(['--base', 'http://127.0.0.1:8800']);
const report = { stage: 'M6.3', checkedAt: new Date().toISOString(), target: target.base, https: target.publicServer, scenarios: [], pageErrors: [], failedResources: [] };
let browser, currentPage;
try {
  await authorizeTarget(target);
  await mkdir(path.join(root, 'evidence'), { recursive: true });
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 600, hasTouch: width < 600, reducedMotion: 'reduce' });
    if (target.cookies) await context.addCookies(target.cookies);
    const page = await context.newPage(); currentPage = page; page.setDefaultTimeout(25000);
    page.on('pageerror', error => report.pageErrors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) report.failedResources.push({ path: new URL(response.url()).pathname, status: response.status() }); });
    report.step = `${width}: portada`; await page.goto(target.base);
    assert.equal(await page.locator('.mode-card').count(), 2);
    assert.equal(await page.locator('[data-mode=classic] [data-online]').count(), 1);
    assert.equal(await page.locator('[data-mode=arena] [data-online]').count(), 0);
    assert.equal(await page.locator('.portal-brand img').evaluate(img => img.complete && img.naturalWidth > 0), true);
    await page.waitForLoadState('networkidle');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    await page.screenshot({ path: path.join(root, `evidence/product-portal-${width}-${target.suffix}.png`), fullPage: true });
    await page.locator('[data-online]').click(); await page.locator('#createForm').waitFor();
    assert.equal(new URL(page.url()).pathname, '/online/');
    assert.equal(await page.locator('.probe').isVisible(), false);
    report.step = `${width}: Clásico local`;
    await page.getByRole('link', { name: 'Clásico', exact: true }).click();
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => document.querySelector('#board')?.hasAttribute('aria-busy'));
    await page.locator('#play').click(); await page.locator('#newDialog[open]').waitFor();
    await page.locator('#newDialog [data-control=local]').click(); await page.locator('#startLocal').click();
    await page.locator('.app:visible #board[aria-busy=false]').waitFor();
    await page.locator('#board [data-wall]').first().locator('.wall-hit').click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('wallgo-league-v2'))?.game?.moves === 1);
    const localSave = await page.evaluate(() => localStorage.getItem('wallgo-league-v2'));
    await page.goto(target.entry); await page.locator('#createForm').waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem('wallgo-league-v2')), localSave);
    await page.locator('#createForm [name=name]').fill('Revisión producto');
    await page.locator('#createForm button[type=submit]').click();
    await page.locator('#connection[data-phase=connected]').waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem('wallgo-league-v2')), localSave);
    report.step = `${width}: Clásico CPU`;
    await page.getByRole('link', { name: 'Clásico', exact: true }).click();
    await page.waitForLoadState('networkidle');
    await page.locator('#play').click(); await page.locator('#newDialog [data-control=cpu]').click();
    await page.locator('#newDialog [name=humanTeam][value=B]').check(); await page.locator('#startLocal').click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('wallgo-league-v2'))?.game?.moves >= 1, { timeout: 30000 });
    await page.locator('.app:visible #board[aria-busy=false]').waitFor();
    report.scenarios.push(`${width}px: portada común, enlace Online exclusivo de Clásico, partida local con muro, guardado intacto al crear sala y primer turno real de CPU`);
    for (const opponent of ['local', 'cpu']) {
      report.step = `${width}: Arena ${opponent}`;
      await page.goto(target.base + '/arena/?new=1'); await page.waitForLoadState('networkidle');
      await page.locator('#newDialog[open]').waitFor();
      await page.locator(`#newForm [name=opponent][value=${opponent}]`).check();
      await page.locator('#newForm').evaluate(form => form.requestSubmit());
      await page.locator('#arenaBoard:visible').waitFor();
      assert.equal(await page.locator('#arenaBoard [data-piece]').count(), 4);
      await page.waitForLoadState('networkidle');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      if (opponent === 'local') await page.screenshot({ path: path.join(root, `evidence/product-arena-${width}-${target.suffix}.png`), fullPage: true });
    }
    report.scenarios.push(`${width}px: Arena conserva sus formularios Local y Contra CPU, carga sus cuatro fichas y no anuncia Arena online`);
    await context.close();
  }
  assert.deepEqual(report.pageErrors, []); assert.deepEqual(report.failedResources, []); report.ok = true;
} catch (error) {
  report.ok = false; report.error = error.message; process.exitCode = 1;
  report.failure = await currentPage?.evaluate(() => ({ path: location.pathname, entry: document.documentElement.dataset.entry,
    homeHidden: document.querySelector('#homeScreen')?.hidden, dialogOpen: document.querySelector('#newDialog')?.open,
    boardBusy: document.querySelector('#board')?.getAttribute('aria-busy'), scripts: [...document.scripts].map(s => s.src),
    resources: performance.getEntriesByType('resource').map(r => new URL(r.name).pathname) })).catch(() => null);
  await currentPage?.screenshot({ path: path.join(root, `evidence/product-failure-${target.suffix}.png`), fullPage: true }).catch(() => {});
}
finally {
  await browser?.close().catch(() => {});
  await writeFile(path.join(root, `evidence/product-browser-${target.suffix}.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
