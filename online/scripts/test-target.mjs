import path from 'node:path';
import { root } from './runtime.mjs';
import { loadOperator } from './pilot-access.mjs';

// An explicit target never starts or stops another server. HTTPS is mandatory
// except for the integrated loopback fixture; stable Pages is never a target.
export function testTarget(args = process.argv.slice(2)) {
  const index = args.indexOf('--base'); if (index < 0) return null;
  const url = new URL(args[index + 1]);
  if (url.origin !== args[index + 1] || url.username || url.password ||
    !(url.protocol === 'https:' && url.hostname.endsWith('.workers.dev') || url.origin === 'http://127.0.0.1:8800'))
    throw new Error('Usa el origen HTTPS workers.dev de la prueba o http://127.0.0.1:8800.');
  const publicServer = url.protocol === 'https:';
  return { base: url.origin, publicServer, suffix: publicServer ? 'public' : 'integrated', entry: url.origin + '/online/',
    stateDir: path.join(root, '.state/no-external-runtime-logs'), logs: () => '', stop: async () => {} };
}
export async function authorizeTarget(target) {
  if (!target?.publicServer) return;
  const { credential } = await loadOperator();
  const response = await fetch(target.base + '/pilot/session', { method: 'POST', headers: { origin: target.base, 'content-type': 'application/json' }, body: JSON.stringify({ credential }), signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Acceso al piloto no autorizado: HTTP ${response.status}`);
  const cookie = response.headers.get('set-cookie')?.split(';')[0], prefix = '__Host-cerconexo_m6_pilot=';
  if (!cookie?.startsWith(prefix)) throw new Error('El acceso al piloto no emitió una cookie válida.');
  target.headers = { cookie };
  target.cookies = [{ name: prefix.slice(0, -1), value: cookie.slice(prefix.length), url: target.base, httpOnly: true, secure: true, sameSite: 'Strict' }];
}
