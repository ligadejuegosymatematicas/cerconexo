import { cloudflareAPI } from './cloudflare-api.mjs';
const args = process.argv.slice(2), value = flag => args[args.indexOf(flag) + 1];
const account = value('--account'), candidate = value('--create');
let current;
try { current = await cloudflareAPI(account, 'workers/subdomain'); }
catch (error) { if (!error.message.includes('HTTP 404') || !error.message.includes('10007')) throw error; }
if (!current && candidate) {
  if (!/^[a-z0-9][a-z0-9-]{2,60}[a-z0-9]$/.test(candidate)) throw new Error('Subdominio inválido.');
  current = await cloudflareAPI(account, 'workers/subdomain', { method: 'PUT', body: { subdomain: candidate } });
}
if (!current) throw new Error('La cuenta todavía no tiene subdominio de Workers.');
console.log(JSON.stringify({ account, subdomain: current.subdomain, experimentalOrigin: `https://cerconexo-m6-experimental.${current.subdomain}.workers.dev`, otherDomainsChanged: false }, null, 2));
