import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { prepareStatic } from './prepare-static.mjs';

export const root = fileURLToPath(new URL('../', import.meta.url));
export async function eventually(predicate, message, timeout = 15000) {
  const start = Date.now(); let last;
  while (Date.now() - start < timeout) { try { const value = await predicate(); if (value) return value; } catch (error) { if (error.fatal) throw error; last = error; } await delay(30); }
  throw new Error(`${message}${last ? ': ' + last.message : ''}`);
}
export async function startRuntime({ port = 8788, stateDir = path.join(root, '.state', `integration-${crypto.randomUUID()}`) } = {}) {
  await prepareStatic();
  await mkdir(stateDir, { recursive: true });
  // Separate build directories prevent concurrent local Wrangler processes from
  // deleting one another's middleware bundles. Persistent paths survive restart.
  const config = JSON.parse(await readFile(path.join(root, 'wrangler.jsonc'), 'utf8'));
  delete config.$schema;
  config.main = path.join(root, 'src/worker.mjs'); config.assets.directory = path.join(root, 'public');
  const configPath = path.join(stateDir, 'wrangler.jsonc');
  await writeFile(configPath, JSON.stringify(config, null, 2));
  const env = { ...process.env, WRANGLER_SEND_METRICS: 'false', NODE_USE_SYSTEM_CA: '1', XDG_CONFIG_HOME: path.join(root, '.state/config'), WRANGLER_LOG_PATH: path.join(stateDir, 'logs') };
  for (const name of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_API_KEY', 'CLOUDFLARE_EMAIL', 'CLOUDFLARE_ACCOUNT_ID']) delete env[name];
  const child = spawn(process.execPath, [path.join(root, 'node_modules/wrangler/bin/wrangler.js'), 'dev', '--config', configPath, '--local', '--ip', '127.0.0.1', '--port', String(port), '--persist-to', stateDir],
    { cwd: stateDir, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  let log = ''; child.stdout.on('data', chunk => { log += chunk; }); child.stderr.on('data', chunk => { log += chunk; });
  const base = `http://127.0.0.1:${port}`;
  const stop = async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    if (process.platform === 'win32') {
      await new Promise(resolve => { const killer = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true }); killer.on('exit', resolve); killer.on('error', resolve); });
    } else { child.kill('SIGTERM'); }
    await eventually(() => child.exitCode !== null || child.signalCode !== null, 'El runtime de prueba no cerró', 10000);
  };
  try {
    // Cold workerd startup on this Windows host was measured above 100 s.
    // Wait for the CLI's readiness signal before issuing health requests.
    await eventually(() => {
      if (child.exitCode !== null || child.signalCode !== null) { const error = new Error(log.slice(-2500)); error.fatal = true; throw error; }
      return log.includes(`Ready on ${base}`);
    }, 'Wrangler no terminó su arranque local', 180000);
    await eventually(async () => {
      if (child.exitCode !== null || child.signalCode !== null) { const error = new Error(log.slice(-2500)); error.fatal = true; throw error; }
      return (await fetch(base + '/api/health', { signal: AbortSignal.timeout(5000) })).ok;
    }, 'El runtime local no respondió', 15000);
  } catch (error) { await stop(); throw new Error(`${error.message}\n${log.slice(-3000)}`); }
  return { base, stateDir, child, stop, logs: () => log };
}
