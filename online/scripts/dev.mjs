import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { prepareStatic } from './prepare-static.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
await prepareStatic();
const env = { ...process.env, WRANGLER_SEND_METRICS: 'false', NODE_USE_SYSTEM_CA: '1',
  XDG_CONFIG_HOME: path.join(root, '.state/config'), WRANGLER_LOG_PATH: path.join(root, '.state/logs') };
for (const name of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_API_KEY', 'CLOUDFLARE_EMAIL', 'CLOUDFLARE_ACCOUNT_ID']) delete env[name];
const port = process.argv.includes('--port') ? process.argv[process.argv.indexOf('--port') + 1] : '8787';
if (!/^\d{4,5}$/.test(port) || +port > 65535) throw new Error('Puerto local inválido.');
const child = spawn(process.execPath, [path.join(root, 'node_modules/wrangler/bin/wrangler.js'), 'dev', '--local', '--ip', '127.0.0.1', '--port', port,
  '--persist-to', path.join(root, '.state')], { cwd: root, env, stdio: 'inherit', windowsHide: true });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', code => { process.exitCode = code ?? 0; });
