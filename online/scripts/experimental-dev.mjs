import { spawn } from 'node:child_process';
import path from 'node:path';
import { buildExperimental, onlineRoot } from './build-experimental.mjs';
await buildExperimental();
const env = { ...process.env, WRANGLER_SEND_METRICS: 'false', NODE_USE_SYSTEM_CA: '1', XDG_CONFIG_HOME: path.join(onlineRoot, '.state/config'), WRANGLER_LOG_PATH: path.join(onlineRoot, '.state/experimental-logs') };
for (const name of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_API_KEY', 'CLOUDFLARE_EMAIL', 'CLOUDFLARE_ACCOUNT_ID']) delete env[name];
const child = spawn(process.execPath, [path.join(onlineRoot, 'node_modules/wrangler/bin/wrangler.js'), 'dev', '--config', 'wrangler.experimental.jsonc', '--local', '--ip', '127.0.0.1', '--port', '8800', '--persist-to', '.state/experimental'], { cwd: onlineRoot, env, stdio: 'inherit', windowsHide: true });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', code => { process.exitCode = code ?? 0; });
