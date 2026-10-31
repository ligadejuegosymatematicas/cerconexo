import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomBytes, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { onlineRoot } from './build-experimental.mjs';
import { cloudflareAPI } from './cloudflare-api.mjs';
export const operatorPath = path.join(onlineRoot, '.state/pilot/operator.json');
export async function loadOperator() { return JSON.parse(await readFile(operatorPath, 'utf8')); }
const command = process.argv[2];
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (command === 'init') {
    await mkdir(path.dirname(operatorPath), { recursive: true });
    let operator;
    try { operator = await loadOperator(); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const credential = randomBytes(32).toString('base64url');
      operator = { credential, credentialHash: createHash('sha256').update(credential).digest('hex'), sessionKey: randomBytes(32).toString('base64url'), createdAt: new Date().toISOString() };
      await writeFile(operatorPath, JSON.stringify(operator, null, 2), { flag: 'wx', mode: 0o600 });
    }
    const privateFile = path.join(path.dirname(operatorPath), 'ACCESO-PRIVADO.txt');
    await writeFile(privateFile, 'CERCONEXO M6 · Credencial privada del piloto\n\n' + operator.credential + '\n\nSolo para el responsable autorizado. No es una clave de Cloudflare.\nEscríbela en el formulario del piloto; no la incluyas en enlaces ni Git.\n', { mode: 0o600 });
    console.log(JSON.stringify({ ok: true, privateFile, secretsPrinted: false }));
  } else if (command === 'install') {
    const operator = await loadOperator(), config = path.join(onlineRoot, '.experimental/deploy/wrangler.jsonc');
    const settings = JSON.parse(await readFile(config, 'utf8'));
    if (settings.name !== 'cerconexo-m6-experimental' || settings.workers_dev || settings.preview_urls) throw new Error('Instala los secretos después de la primera subida privada y antes de habilitar HTTPS.');
    for (const [name, secret] of [['PILOT_CREDENTIAL_HASH', operator.credentialHash], ['PILOT_SESSION_KEY', operator.sessionKey]]) {
      await cloudflareAPI(settings.account_id, 'workers/scripts/cerconexo-m6-experimental/secrets', { method: 'PUT', body: { name, type: 'secret_text', text: secret } });
      console.log(`${name}: instalado; valor no mostrado.`);
    }
  } else throw new Error('Uso: node scripts/pilot-access.mjs init | install');
}
