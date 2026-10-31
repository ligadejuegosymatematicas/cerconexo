import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { loadOperator } from './pilot-access.mjs';
import { onlineRoot, experimentalAssets } from './build-experimental.mjs';
const repo = path.dirname(onlineRoot), operator = await loadOperator();
const values = Object.entries(operator).filter(([name]) => ['credential', 'credentialHash', 'sessionKey'].includes(name));
try {
  const config = await readFile(path.join(process.env.APPDATA, 'xdg.config/.wrangler/config/default.toml'), 'utf8');
  const token = /^oauth_token\s*=\s*"([^"\r\n]+)"/m.exec(config)?.[1]; if (token) values.push(['oauth', token]);
} catch { /* The pilot checks still work without a local operator OAuth session. */ }
const tracked = (await promisify(execFile)('git', ['--no-optional-locks', 'ls-files', '-z'], { cwd: repo, windowsHide: true })).stdout.split('\0').filter(Boolean).map(name => path.join(repo, name));
async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
  const result = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await files(target));
    else if (entry.isFile()) result.push(target);
  }
  return result;
}
const targets = new Set([...tracked, ...await files(experimentalAssets), ...await files(path.join(onlineRoot, 'evidence')), ...await files(path.join(onlineRoot, '.state/deploy-logs'))]);
const findings = [];
for (const file of targets) {
  const bytes = await readFile(file);
  for (const [kind, secret] of values) if (bytes.includes(Buffer.from(secret))) findings.push({ file: path.relative(repo, file), kind });
}
const report = { checkedAt: new Date().toISOString(), filesChecked: targets.size, ok: findings.length === 0, findings, secretValuesPrinted: false };
await mkdir(path.join(onlineRoot, 'evidence'), { recursive: true });
await writeFile(path.join(onlineRoot, 'evidence/pilot-secrets-check.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2)); if (!report.ok) process.exitCode = 1;
