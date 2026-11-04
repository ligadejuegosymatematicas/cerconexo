import { randomBytes, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { root } from './runtime.mjs';

const service = 'cerconexo-m6-arena-revision';
const origin = process.argv[2];
const account = process.argv[3];
if (origin && !new RegExp(`^https://${service}\\.[a-z0-9-]+\\.workers\\.dev$`).test(origin)) {
  throw new Error('El origen debe corresponder al Worker exclusivo de Arena.');
}
if (account && (!origin || !/^[a-f0-9]{32}$/.test(account))) throw new Error('Cuenta de pruebas inválida.');
const repo = path.dirname(root);
const state = path.join(root, '.state');
await mkdir(state, { recursive: true });
const directory = await mkdtemp(path.join(state, 'arena-preview-'));
const assets = path.join(directory, 'assets');
const manifest = JSON.parse(await readFile(path.join(repo, 'scripts/pages-files.json'), 'utf8'));
const hashes = new Set();

for (const name of manifest) {
  if (!/^[a-z0-9._/-]+$/i.test(name) || name.split('/').includes('..') || name.startsWith('/')) {
    throw new Error('Ruta de Pages inválida.');
  }
  let bytes = await readFile(path.join(repo, 'docs', name));
  if (name === 'online/config.mjs') {
    bytes = Buffer.from('export const API_BASE = location.origin;\nexport const ARENA_DUO_ENABLED = true;\nexport const ARENA_1V1_ENABLED = false;\n');
  }
  if (name.endsWith('.html')) {
    for (const match of bytes.toString().matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
      hashes.add(`'sha256-${createHash('sha256').update(match[1]).digest('base64')}'`);
    }
  }
  const target = path.join(assets, name);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes);
}
await writeFile(path.join(assets, 'pilot-login.mjs'), await readFile(path.join(root, 'src/preview-login.mjs')));

const credential = randomBytes(32).toString('base64url');
await writeFile(path.join(directory, 'access.txt'), credential, { mode: 0o600 });
await writeFile(path.join(directory, 'secrets.json'), JSON.stringify({
  PILOT_CREDENTIAL_HASH: createHash('sha256').update(credential).digest('hex'),
  PILOT_SESSION_KEY: randomBytes(32).toString('base64url'),
}), { mode: 0o600 });

const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
await writeFile(path.join(directory, 'wrangler.jsonc'), JSON.stringify({
  name: service,
  ...(account ? { account_id: account } : {}),
  main: path.join(root, 'src/arena-preview-worker.mjs'),
  compatibility_date: '2026-10-23',
  workers_dev: true,
  preview_urls: false,
  send_metrics: false,
  assets: { directory: assets, binding: 'ASSETS', run_worker_first: true },
  durable_objects: { bindings: [{ name: 'ROOMS', class_name: 'Room' }, { name: 'ADMISSION', class_name: 'AdmissionGate' }] },
  migrations: [{ tag: 'arena-preview-1', new_sqlite_classes: ['Room', 'AdmissionGate'] }],
  vars: {
    ARENA_PREVIEW_ORIGIN: origin ?? '',
    ARENA_DUO_ENABLED: 'true',
    PUBLIC_DEMO: 'true',
    CANDIDATE_SHA: sha,
    PREVIEW_SCRIPT_HASHES: [...hashes].join(' '),
  },
  observability: { enabled: false },
}, null, 2));
console.log(directory);
