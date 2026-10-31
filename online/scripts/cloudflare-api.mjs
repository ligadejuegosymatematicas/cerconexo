import { readFile } from 'node:fs/promises';
import path from 'node:path';
export async function cloudflareAPI(account, route, { method = 'GET', body } = {}) {
  if (!/^[a-f0-9]{32}$/.test(account) || !/^workers\/[a-z0-9/_-]+$/.test(route)) throw new Error('Destino de Workers inválido.');
  if (method !== 'GET' && !(method === 'PUT' && (route === 'workers/subdomain' || route === 'workers/scripts/cerconexo-m6-experimental/secrets')))
    throw new Error('Operación fuera del piloto.');
  const config = await readFile(path.join(process.env.APPDATA, 'xdg.config/.wrangler/config/default.toml'), 'utf8');
  const token = /^oauth_token\s*=\s*"([^"\r\n]+)"/m.exec(config)?.[1];
  if (!token) throw new Error('Se necesita una sesión oficial de Wrangler.');
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/${route}`, { method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000) });
  const data = await response.json();
  if (!data.success) throw new Error(`Cloudflare ${route}: HTTP ${response.status}; códigos ${data.errors?.map(error => error.code).join(',')}`);
  return data.result;
}
