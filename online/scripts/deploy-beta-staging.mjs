import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import { root } from './runtime.mjs';
import { betaOperator } from './beta-operator.mjs';
const args = process.argv.slice(2), value = name => args[args.indexOf(name) + 1];
const account = value('--account-id'), upload = args.includes('--upload'), enable = args.includes('--enable-staging');
if (!args.includes('--account-id') || !/^[a-f0-9]{32}$/.test(account)) throw new Error('Cuenta de Cloudflare inválida.');
if (upload && !args.includes('--free-plan-confirmed')) throw new Error('Confirma Workers Free antes de subir staging.');
const template = JSON.parse(await readFile(path.join(root, 'wrangler.beta.jsonc'), 'utf8'));
if (template.name !== 'cerconexo-m6-beta-staging' || template.routes || template.route || template.vars.PUBLIC_CREATION !== 'false' || template.assets) throw new Error('Configuración fuera del staging cerrado.');
if (template.migrations.length !== 1 || JSON.stringify(template.migrations[0].new_sqlite_classes) !== '["Room","AdmissionGate"]') throw new Error('Almacenamiento no autorizado.');
const operator = await betaOperator({ create: true });
const config = { ...template, account_id: account, main: path.join(root, 'src/worker.mjs'), workers_dev: enable, preview_urls: false };
const git = args => execFileSync('git', ['--no-optional-locks', ...args], { cwd: root, windowsHide: true }).toString().trim();
if (upload) {
  if (git(['branch', '--show-current']) !== 'm6-beta-integracion' || git(['status', '--porcelain'])) throw new Error('La subida requiere la candidata M6 beta registrada y limpia.');
  if (git(['merge-base', 'HEAD', 'cd22390f9571e6b6f03a43b84922a825ec823def']) !== 'cd22390f9571e6b6f03a43b84922a825ec823def') throw new Error('La candidata no parte de M5-D.');
}
config.vars = { ...template.vars, CANDIDATE_SHA: git(['rev-parse', 'HEAD']) };
delete config.$schema;
const directory = path.join(root, '.state/beta-deploy'); await mkdir(directory, { recursive: true });
const configPath = path.join(directory, 'wrangler.jsonc'); await writeFile(configPath, JSON.stringify(config));
const env = { ...process.env, NODE_USE_SYSTEM_CA: '1', WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: path.join(directory, 'logs') };
async function cli(extra, input) {
  const child = spawn(process.execPath, [path.join(root, 'node_modules/wrangler/bin/wrangler.js'), ...extra, '--config', configPath], { cwd: root, env, windowsHide: true, stdio: ['pipe', 'inherit', 'inherit'] });
  child.stdin.end(input ?? ''); const code = await new Promise(resolve => child.on('exit', resolve)); if (code !== 0) throw new Error('Wrangler no terminó correctamente.');
}
if (!upload) await cli(['deploy', '--dry-run', '--outdir', path.join(directory, 'dry-run')]);
else {
  if (!enable) {
    await cli(['deploy']);
    await cli(['secret', 'put', 'TEST_ADMISSION_HASH'], operator.hash + '\n');
  } else {
    if (!args.includes('--secrets-reviewed')) throw new Error('Revisa el secreto independiente antes de habilitar HTTPS de staging.');
    await cli(['deploy']);
  }
}
console.log(JSON.stringify({ ok: true, service: template.name, uploaded: upload, stagingHttps: enable, publicCreation: false, secretsPrinted: false }));
