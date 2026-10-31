import { readFile, mkdir, writeFile, readdir, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OFFICIAL_FILES } from './prepare-static.mjs';

export const onlineRoot = fileURLToPath(new URL('../', import.meta.url));
export const experimentalAssets = path.join(onlineRoot, '.experimental/public');
const repo = path.dirname(onlineRoot);
const ONLINE_FILES = ['index.html', 'app.mjs', 'config.mjs', 'session.mjs', 'classic.mjs', 'classic.css', 'styles.css'];

function insertOnline(html) {
  // All three official portals carry the same Classic card. Only the generated
  // package gets this link; the canonical HTML, rules and local JS stay intact.
  const marker = '<nav class="card-actions" aria-label="Cerconexo Clásico">';
  if (!html.includes(marker)) throw new Error('No se encontró la tarjeta oficial de Clásico.');
  return html.replace(marker, marker + '\n          <a class="continue-mode" data-online href="/online/">Online · 4 personas</a>');
}

export async function experimentalPayload({ origin = 'http://127.0.0.1:8800' } = {}) {
  const site = new URL(origin);
  if (site.origin !== origin || !['http:', 'https:'].includes(site.protocol) || site.username || site.password) throw new Error('Origen experimental inválido.');
  const files = JSON.parse(await readFile(path.join(repo, 'scripts/pages-files.json'), 'utf8'));
  const result = new Map();
  for (const name of files) {
    if (path.isAbsolute(name) || name.split('/').includes('..')) throw new Error('Ruta fuera del manifiesto público.');
    const source = path.join(repo, name);
    if ((await lstat(source)).isSymbolicLink()) throw new Error('No se permiten enlaces en el paquete.');
    result.set(name, await readFile(source));
  }
  for (const name of ['index.html', 'clasico/index.html', 'arena/index.html']) {
    let html = insertOnline(result.get(name).toString());
    html = html.replace('</head>', '<link rel="stylesheet" href="/experimental.css"></head>');
    html = html.replace('</body>', '<p class="experimental-note">Versión experimental · Clásico online disponible</p></body>');
    if (name === 'clasico/index.html') html = html.replace('<p id="localDescription"', '<a class="continue-mode experimental-online-choice" href="/online/">Online · Cuatro personas en dispositivos distintos →</a><p id="localDescription"');
    result.set(name, Buffer.from(html));
  }
  result.set('experimental.css', Buffer.from('.experimental-note{margin:8px auto 18px;text-align:center;color:#B4C4D5;font:11px/1.5 system-ui}.experimental-online-choice{display:flex;margin:10px 0;color:#FFD166;border-color:#D4A64A;text-decoration:none}\n'));
  for (const name of ONLINE_FILES) result.set('online/' + name, await readFile(path.join(onlineRoot, 'public', name)));
  let lobby = result.get('online/index.html').toString();
  lobby = lobby.replace('href="/styles.css"', 'href="/online/styles.css"').replace('src="/app.mjs"', 'src="/online/app.mjs"');
  lobby = lobby.replace('<body>', '<body class="integrated-online">');
  lobby = lobby.replace(/<header class="top">[\s\S]*?<\/header>/, '<header class="top"><a href="/" class="online-brand"><img src="/assets/Cerconexo_wordmark_transparente.png" alt="CERCONEXO"></a><nav aria-label="Navegación"><a href="/">Inicio</a><a href="/clasico/">Clásico</a><a href="/arena/">Arena</a></nav></header>');
  lobby = lobby.replace('<h1>CERCONEXO Clásico online.</h1>', '<h1>Clásico online</h1>');
  lobby = lobby.replace('Iniciar prueba</button>', 'Comenzar partida</button>');
  lobby = lobby.replace('<footer>', '<footer><a href="/">← Volver al inicio de Cerconexo</a>');
  lobby = lobby.replace('<link rel="stylesheet" href="/online/styles.css">', '<link rel="stylesheet" href="/online/styles.css"><link rel="stylesheet" href="/online/integrated.css">');
  result.set('online/index.html', Buffer.from(lobby));
  result.set('online/config.mjs', Buffer.from('export const API_BASE = location.origin;\n'));
  result.set('online/integrated.css', await readFile(path.join(onlineRoot, 'public/integrated.css')));
  result.set('pilot-login.mjs', await readFile(path.join(onlineRoot, 'public/pilot-login.mjs')));
  for (const name of OFFICIAL_FILES) result.set('official/' + name, await readFile(path.join(repo, name)));
  const hashes = new Set();
  for (const [name, bytes] of result) if (name.endsWith('.html')) {
    for (const match of bytes.toString().matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) hashes.add(`'sha256-${createHash('sha256').update(match[1]).digest('base64')}'`);
  }
  const ws = (site.protocol === 'https:' ? 'wss://' : 'ws://') + site.host;
  const csp = `default-src 'self'; script-src 'self' ${[...hashes].join(' ')}; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ${ws}; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`;
  result.set('_headers', Buffer.from(`/*\n  Cache-Control: no-store\n  Referrer-Policy: no-referrer\n  X-Content-Type-Options: nosniff\n  X-Robots-Tag: noindex, nofollow\n  Content-Security-Policy: ${csp}\n`));
  result.set('robots.txt', Buffer.from('User-agent: *\nDisallow: /\n'));
  return result;
}

export async function buildExperimental(options = {}) {
  const expected = await experimentalPayload(options);
  // Refuse unexpected files instead of recursively removing a computed path.
  async function inventory(dir, prefix = '') {
    const entries = await readdir(dir, { withFileTypes: true }).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
    const names = [];
    for (const entry of entries) {
      if (entry.isSymbolicLink()) throw new Error('Enlace no permitido en el destino experimental.');
      const name = prefix + entry.name;
      if (entry.isDirectory()) names.push(...await inventory(path.join(dir, entry.name), name + '/'));
      else names.push(name);
    }
    return names;
  }
  const actual = await inventory(experimentalAssets);
  if (actual.some(name => !expected.has(name))) throw new Error('Hay archivos ajenos en el paquete experimental; revisar el destino.');
  for (const [name, bytes] of expected) {
    const target = path.join(experimentalAssets, name);
    if (options.check) {
      if (!(await readFile(target).catch(() => null))?.equals(bytes)) throw new Error(`Paquete experimental desactualizado: ${name}`);
    } else { await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, bytes); }
  }
  return { ok: true, files: expected.size, destination: experimentalAssets, canonicalSourcesUnchanged: true };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const index = process.argv.indexOf('--origin');
  console.log(JSON.stringify(await buildExperimental({ check: process.argv.includes('--check'), ...(index < 0 ? {} : { origin: process.argv[index + 1] }) }), null, 2));
}
