import path from 'node:path';
import { root } from './runtime.mjs';

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
