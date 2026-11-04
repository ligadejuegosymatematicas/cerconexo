import worker from './worker.mjs';

export { AdmissionGate, Room } from './worker.mjs';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.workers.dev') ||
        (env.ARENA_PREVIEW_ORIGIN && url.origin !== env.ARENA_PREVIEW_ORIGIN)) {
      return new Response('Origen de pruebas no admitido.', { status: 403 });
    }

    const response = await worker.fetch(request, {
      ...env,
      PUBLIC_DEMO: 'true',
      PUBLIC_ORIGIN: url.origin,
      INTEGRATED_SITE: 'true',
      ARENA_DUO_ENABLED: 'true',
      STATIC_CSP: [
        "default-src 'self'",
        `script-src 'self' ${env.PREVIEW_SCRIPT_HASHES ?? ''}`,
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        `connect-src 'self' wss://${url.host}`,
        "object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
      ].join('; '),
    });
    if (response.status === 101) return response;
    const headers = new Headers(response.headers);
    headers.set('X-Robots-Tag', 'noindex, nofollow');
    headers.set('X-Cerconexo-Preview', 'arena-duo');
    return new Response(response.body, { status: response.status, headers });
  },
};
