import { execFileSync } from 'node:child_process';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { betaOperator } from './beta-operator.mjs';
const repo = new URL('../../', import.meta.url), operator = await betaOperator();
const secrets = [operator.credential, operator.hash];
try { secrets.push(...JSON.parse(await readFile(new URL('../.state/beta-persistence/session.json', import.meta.url), 'utf8')).credentials); } catch (e) { if (e.code !== 'ENOENT') throw e; }
const tracked = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: repo, windowsHide: true }).toString().split('\0').filter(Boolean);
const targets = new Set(tracked);
for (const name of await readdir(new URL('../evidence/', import.meta.url)).catch(() => [])) targets.add('online/evidence/' + name);
async function logs(directory, prefix) {
  for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
    if (entry.isDirectory()) await logs(new URL(entry.name + '/', directory), prefix + entry.name + '/');
    else if (entry.isFile()) targets.add(prefix + entry.name);
  }
}
await logs(new URL('../.state/beta-deploy/logs/', import.meta.url), 'online/.state/beta-deploy/logs/');
const findings = [];
for (const file of targets) {
  const bytes = await readFile(new URL(file, repo));
  if (secrets.some(secret => bytes.includes(Buffer.from(secret)))) findings.push(file);
}
const manifest = JSON.parse(await readFile(new URL('scripts/pages-files.json', repo), 'utf8'));
if (manifest.some(file => /(?:\.state|node_modules|wrangler|online\/(src|scripts|tests|public)\/)/.test(file))) findings.push('manifiesto público');
const report = { ok: findings.length === 0, filesChecked: targets.size, publicResources: manifest.length + 1, findings,
  privatePilotCredentialsRead: false, secretValuesPrinted: false };
await mkdir(new URL('../evidence/', import.meta.url), { recursive: true });
await writeFile(new URL('../evidence/beta-secrets.json', import.meta.url), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2)); if (!report.ok) process.exitCode = 1;
