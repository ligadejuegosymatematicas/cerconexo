import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { buildExperimental, onlineRoot, experimentalAssets } from './build-experimental.mjs';

const args = process.argv.slice(2), value = name => args[args.indexOf(name) + 1];
if (args.includes('--help')) {
  console.log('Preparar (sin publicar): node scripts/deploy-experimental.mjs --account-id ID --origin https://cerconexo-m6-experimental.SUBDOMINIO.workers.dev\nPublicar: añadir --publish --free-plan-confirmed, únicamente tras comprobar Workers Free en la cuenta.');
} else {
  const account = value('--account-id'), origin = value('--origin'), publish = args.includes('--publish');
  assert.ok(args.includes('--account-id') && /^[a-f0-9]{32}$/.test(account ?? ''), 'Se necesita el identificador de cuenta, nunca un token.');
  const url = new URL(origin);
  assert.ok(url.origin === origin && url.protocol === 'https:' && /^cerconexo-m6-experimental\.[a-z0-9-]+\.workers\.dev$/.test(url.hostname), 'Solo se permite el Worker experimental independiente.');
  if (publish) assert.ok(args.includes('--free-plan-confirmed'), 'Comprueba Workers Free en el panel; este script no cambia el plan.');
  await buildExperimental({ origin });
  const config = JSON.parse(await readFile(path.join(onlineRoot, 'wrangler.experimental.jsonc'), 'utf8'));
  assert.equal(config.name, 'cerconexo-m6-experimental'); assert.ok(!config.routes && !config.route);
  config.account_id = account; config.workers_dev = true;
  config.main = path.join(onlineRoot, 'src/worker.mjs'); config.assets.directory = experimentalAssets;
  config.vars = { INTEGRATED_SITE: 'true', LOCAL_DEMO: 'false', PUBLIC_DEMO: 'true', PUBLIC_ORIGIN: origin };
  delete config.$schema;
  const directory = path.join(onlineRoot, '.experimental/deploy'); await mkdir(directory, { recursive: true });
  const configPath = path.join(directory, 'wrangler.jsonc'); await writeFile(configPath, JSON.stringify(config, null, 2));
  const env = { ...process.env, WRANGLER_SEND_METRICS: 'false', NODE_USE_SYSTEM_CA: '1', WRANGLER_LOG_PATH: path.join(onlineRoot, '.state/deploy-logs') };
  // OAuth/keyring or an operator-managed environment; credentials are never read
  // into the project or copied into config, assets, evidence or command arguments.
  const cli = [path.join(onlineRoot, 'node_modules/wrangler/bin/wrangler.js'), 'deploy', '--config', configPath];
  if (!publish) cli.push('--dry-run', '--outdir', path.join(directory, 'dry-run'));
  const child = spawn(process.execPath, cli, { cwd: onlineRoot, env, stdio: 'inherit', windowsHide: true });
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
  process.exitCode = code ?? 1;
}
