import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { buildExperimental, onlineRoot, experimentalAssets } from './build-experimental.mjs';
import { deploymentPolicy } from './deployment-policy.mjs';

const args = process.argv.slice(2), value = name => args[args.indexOf(name) + 1];
if (args.includes('--help')) {
  console.log('Preparar (sin publicar): node scripts/deploy-experimental.mjs --account-id ID --origin https://cerconexo-m6-experimental.SUBDOMINIO.workers.dev\nSubida privada sin URL pública: añadir --publish --free-plan-confirmed.\nHabilitar HTTPS: añadir también --enable-https --pilot-access-reviewed, solo después de instalar y revisar los secretos del acceso privado.');
} else {
  const account = value('--account-id'), origin = value('--origin'), publish = args.includes('--publish');
  const template = JSON.parse(await readFile(path.join(onlineRoot, 'wrangler.experimental.jsonc'), 'utf8'));
  const config = deploymentPolicy(template, { account: args.includes('--account-id') ? account : null, origin, publish,
    enableHttps: args.includes('--enable-https'), pilotAccessReviewed: args.includes('--pilot-access-reviewed'), freePlanConfirmed: args.includes('--free-plan-confirmed') });
  await buildExperimental({ origin });
  config.vars.STATIC_CSP = /^  Content-Security-Policy: (.+)$/m.exec(await readFile(path.join(experimentalAssets, '_headers'), 'utf8'))[1];
  config.main = path.join(onlineRoot, 'src/worker.mjs'); config.assets.directory = experimentalAssets;
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
