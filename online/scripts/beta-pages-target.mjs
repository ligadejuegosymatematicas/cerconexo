import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { API_BASE } from '../config.mjs';
import { betaOperator } from './beta-operator.mjs';
export async function betaPagesTarget() {
  const operator = await betaOperator(); assert.equal(operator.origin, API_BASE);
  const origin = 'https://ligadejuegosymatematicas.github.io', prefix = '/cerconexo/';
  const allowed = new Set(JSON.parse(await readFile(new URL('../../scripts/pages-files.json', import.meta.url), 'utf8')));
  const types = { html: 'text/html', mjs: 'text/javascript', css: 'text/css', png: 'image/png' };
  return { base: origin + '/cerconexo', entry: origin + prefix + 'online/', backend: API_BASE, origin, headers: {}, suffix: 'staging-pages', publicServer: true,
    async install(context) {
      // Only this isolated browser sees the candidate; GitHub Pages is unchanged.
      await context.route(origin + prefix + '**', async route => {
        const pathname = new URL(route.request().url()).pathname;
        let name = pathname.slice(prefix.length); if (!name || name.endsWith('/')) name += 'index.html';
        if (!allowed.has(name)) { await route.fulfill({ status: 404, body: 'Recurso fuera del paquete público' }); return; }
        await route.fulfill({ status: 200, contentType: types[name.split('.').at(-1)] ?? 'application/octet-stream', body: await readFile(new URL('../../docs/' + name, import.meta.url)) });
      });
      await context.route(API_BASE + '/api/rooms', async route => {
        if (route.request().method() === 'POST') await route.continue({ headers: { ...route.request().headers(), 'x-cerconexo-test-admission': operator.credential } });
        else await route.continue();
      });
    } };
}
