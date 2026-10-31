import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { onlineRoot } from './build-experimental.mjs';
const account = process.argv[process.argv.indexOf('--account') + 1];
if (!process.argv.includes('--account') || !/^[a-f0-9]{32}$/.test(account ?? '')) throw new Error('Cuenta inválida.');
const config = await readFile(path.join(process.env.APPDATA, 'xdg.config/.wrangler/config/default.toml'), 'utf8');
const token = /^oauth_token\s*=\s*"([^"\r\n]+)"/m.exec(config)?.[1];
if (!token) throw new Error('Se necesita la sesión oficial de Wrangler.');
const since = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const query = `query { viewer { accounts(filter: {accountTag: "${account}"}) {
  durableObjectsInvocationsAdaptiveGroups(filter: {date_gt: "${since}"}, limit: 1000) { sum { requests responseBodySize } }
  durableObjectsPeriodicGroups(filter: {date_gt: "${since}"}, limit: 1000) { sum { cpuTime } }
  durableObjectsStorageGroups(filter: {date_gt: "${since}"}, limit: 1000) { max { storedBytes } }
} } }`;
const response = await fetch('https://api.cloudflare.com/client/v4/graphql', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ query }), signal: AbortSignal.timeout(30000) });
const payload = await response.json();
const report = { checkedAt: new Date().toISOString(), sinceExclusive: since, status: response.status, available: !payload.errors,
  data: payload.data, errors: payload.errors?.map(error => ({ message: error.message, code: error.extensions?.code })),
  note: 'Métricas de la cuenta nueva dedicada al piloto; pueden tener retraso o muestreo. No equivalen a una factura.' };
await mkdir(path.join(onlineRoot, 'evidence'), { recursive: true });
await writeFile(path.join(onlineRoot, 'evidence/cloudflare-metrics.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
