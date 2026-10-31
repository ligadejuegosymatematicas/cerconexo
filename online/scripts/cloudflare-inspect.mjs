import { readFile } from 'node:fs/promises';
import path from 'node:path';
const account = process.argv[process.argv.indexOf('--account') + 1];
if (!process.argv.includes('--account') || !/^[a-f0-9]{32}$/.test(account ?? '')) throw new Error('Indica la cuenta que se acaba de verificar con Wrangler.');
// Read the official CLI session only in memory. Never print or copy credentials.
const config = await readFile(path.join(process.env.APPDATA, 'xdg.config/.wrangler/config/default.toml'), 'utf8');
const token = /^oauth_token\s*=\s*"([^"\r\n]+)"/m.exec(config)?.[1];
if (!token) throw new Error('No hay una sesión OAuth normal de Wrangler; ejecuta el flujo oficial.');
const result = { account, checkedAt: new Date().toISOString(), checks: {} };
for (const [name, route] of [['subdomain', 'workers/subdomain'], ['workerSettings', 'workers/account-settings'], ['subscriptions', 'subscriptions']]) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/${route}`, {
    headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000)
  });
  const data = await response.json();
  result.checks[name] = { status: response.status, success: data.success };
  if (data.success) {
    if (name === 'subdomain') result.checks[name].subdomain = data.result.subdomain;
    if (name === 'workerSettings') result.checks[name].defaultUsageModel = data.result.default_usage_model;
    if (name === 'subscriptions') result.checks[name].plans = data.result.map(plan => ({ name: plan.rate_plan?.public_name ?? plan.rate_plan?.name, id: plan.rate_plan?.id, state: plan.state }));
  } else result.checks[name].errorCodes = data.errors?.map(error => error.code);
}
console.log(JSON.stringify(result, null, 2));
