import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const account = process.argv[process.argv.indexOf('--account-id') + 1];
if (!/^[a-f0-9]{32}$/.test(account ?? '')) throw new Error('Cuenta inválida.');
const config = await readFile(path.join(process.env.APPDATA, 'xdg.config/.wrangler/config/default.toml'), 'utf8');
const token = /^oauth_token\s*=\s*"([^"\r\n]+)"/m.exec(config)?.[1]; if (!token) throw new Error('Se necesita OAuth oficial de Wrangler.');
const since = new Date(Date.now() - 86400000).toISOString(), worker = 'cerconexo-m6-beta-staging';
const review = JSON.parse(await readFile(new URL('../evidence/beta-staging-review.json', import.meta.url), 'utf8'));
const namespaces = review.bindings.filter(b => b.type === 'durable_object_namespace').map(b => b.namespaceId);
if (review.worker !== worker || namespaces.length !== 2 || namespaces.some(id => !/^[a-f0-9]{32}$/.test(id))) throw new Error('Revisa los namespaces independientes antes de medir.');
const filter = `{datetime_geq: "${since}", namespaceId_in: ${JSON.stringify(namespaces)}}`;
let query = `query { viewer { accounts(filter: {accountTag: "${account}"}) {
  workersInvocationsAdaptive(filter: {datetime_geq: "${since}", scriptName: "${worker}"}, limit: 1) { sum { requests errors subrequests } }
  durableObjectsInvocationsAdaptiveGroups(filter: ${filter}, limit: 1) { sum { requests responseBodySize } }
  durableObjectsPeriodicGroups(filter: ${filter}, limit: 1) { sum { rowsRead rowsWritten cpuTime duration exceededCpuErrors exceededMemoryErrors fatalInternalErrors } }
} } }`;
if (process.argv.includes('--durable-schema')) query = `query {
  sums: __type(name: "AccountDurableObjectsSqlStorageGroupsSum") { fields { name } }
  filters: __type(name: "AccountDurableObjectsSqlStorageGroupsFilter_InputObject") { inputFields { name } }
  periodic: __type(name: "AccountDurableObjectsPeriodicGroupsSum") { fields { name } }
}`;
const response = await fetch('https://api.cloudflare.com/client/v4/graphql', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ query }), signal: AbortSignal.timeout(30000) });
const payload = await response.json(), result = { checkedAt: new Date().toISOString(), worker, since, status: response.status,
  available: !payload.errors, data: payload.data, errors: payload.errors?.map(e => ({ message: e.message, code: e.extensions?.code })),
  note: 'Consulta de solo lectura para el Worker y sus dos namespaces independientes. Métricas posiblemente retrasadas o muestreadas; no son una factura. No amplía permisos.' };
await mkdir(new URL('../evidence/', import.meta.url), { recursive: true });
await writeFile(new URL(process.argv.includes('--durable-schema') ? '../evidence/beta-metrics-schema.json' : '../evidence/beta-cloudflare-metrics.json', import.meta.url), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result, null, 2));
