import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { root } from './runtime.mjs';
import { digest } from '../src/protocol.mjs';
const directory = path.join(root, '.state/beta-staging'), filename = path.join(directory, 'operator.json');
export async function betaOperator({ create = false } = {}) {
  let value;
  try { value = JSON.parse(await readFile(filename, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT' || !create) throw error; }
  if (!value) {
    const credential = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
    value = { credential, hash: await digest(credential), origin: 'https://cerconexo-m6-beta-staging.cerconexo-piloto-h89.workers.dev' };
    await mkdir(directory, { recursive: true }); await writeFile(filename, JSON.stringify(value), { flag: 'wx' });
  }
  if (!/^[A-Za-z0-9_-]{43}$/.test(value.credential) || await digest(value.credential) !== value.hash) throw new Error('Operador de staging inválido.');
  return value;
}
