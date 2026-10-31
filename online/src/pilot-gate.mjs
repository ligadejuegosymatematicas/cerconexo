import { boundedJson } from './access-policy.mjs';

export const PILOT_COOKIE = '__Host-cerconexo_m6_pilot';
export const PILOT_SESSION_MS = 7 * 86400000;
const encoder = new TextEncoder();
const encode = bytes => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
function decode(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('encoding');
  return Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));
}
const response = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), { status, headers: {
  'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff', ...extra
} });
async function signingKey(secret) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
export async function createPilotSession(env, origin, now) {
  const payload = encode(encoder.encode(JSON.stringify({ v: 1, aud: origin, issuedAt: now, exp: now + PILOT_SESSION_MS })));
  const signature = await crypto.subtle.sign('HMAC', await signingKey(env.PILOT_SESSION_KEY), encoder.encode(payload));
  return payload + '.' + encode(new Uint8Array(signature));
}
export async function validPilotSession(value, env, origin, now) {
  try {
    if (!value || value.length > 1024) return false;
    const parts = value.split('.'); if (parts.length !== 2) return false;
    if (!await crypto.subtle.verify('HMAC', await signingKey(env.PILOT_SESSION_KEY), decode(parts[1]), encoder.encode(parts[0]))) return false;
    const data = JSON.parse(new TextDecoder().decode(decode(parts[0])));
    return data.v === 1 && data.aud === origin && Number.isSafeInteger(data.issuedAt) && Number.isSafeInteger(data.exp)
      && data.issuedAt <= now && data.exp > now && data.exp - data.issuedAt === PILOT_SESSION_MS;
  } catch { return false; }
}
function returnPath(value) {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\x00-\x20\x7f]/.test(value)) return '/';
  const url = new URL(value, 'https://pilot.invalid');
  return url.origin === 'https://pilot.invalid' && !url.pathname.startsWith('/pilot/') && !url.pathname.startsWith('/api/') ? url.pathname + url.search : '/';
}
function loginPage(next) {
  // The return path is JSON encoded into a data attribute through a fixed
  // URLSearchParams round trip in the client; no untrusted HTML is interpolated.
  return `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Cerconexo · Acceso al piloto</title><style>body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#071a2f;color:#fbf7ef;font:16px/1.5 system-ui}main{margin:20px;padding:26px;max-width:400px;background:#0d223a;border:1px solid #42607a;border-radius:16px}h1{font-size:24px;color:#ffd166}label{display:block}input,button{box-sizing:border-box;width:100%;font:inherit;border-radius:8px;padding:12px;margin-top:10px}input{background:#071a2f;color:#fbf7ef;border:1px solid #42607a}button{background:#ffd166;color:#071a2f;border:0;font-weight:700;min-height:46px}p{color:#b4c4d5;font-size:14px}[role=status]{color:#ffd166}</style><main><h1>Cerconexo · Piloto privado</h1><p>Versión experimental. Introduce la credencial del piloto facilitada por su responsable.</p><form id="pilotLogin"><label>Credencial privada<input name="credential" type="password" required minlength="43" maxlength="43" autocomplete="current-password" autocapitalize="off" spellcheck="false"></label><button>Entrar al piloto</button><p id="pilotProblem" role="status" aria-live="polite"></p></form><p>No es tu contraseña de Cloudflare ni un código de sala. La sesión de acceso dura siete días en este navegador.</p></main><script type="module" src="/pilot-login.mjs"></script></html>`;
}
export async function pilotGate(request, env, now = Date.now()) {
  const url = new URL(request.url);
  if (env.PUBLIC_DEMO !== 'true' && env.PILOT_REQUIRED !== 'true') return null;
  if (!/^[a-f0-9]{64}$/.test(env.PILOT_CREDENTIAL_HASH ?? '') || (env.PILOT_SESSION_KEY?.length ?? 0) < 43)
    return response({ error: { code: 'PILOT_CONFIG', message: 'El acceso privado al piloto aún no está configurado.' } }, 503);
  const origin = env.PUBLIC_DEMO === 'true' ? env.PUBLIC_ORIGIN : url.origin;
  if (url.origin !== origin) return response({ error: { code: 'HOST', message: 'Dirección no admitida.' } }, 403);
  if (url.pathname === '/pilot/session' && request.method === 'POST') {
    if (request.headers.get('origin') !== origin || url.search) return response({ error: { code: 'ORIGIN', message: 'Origen no admitido.' } }, 403);
    const ip = request.headers.get('cf-connecting-ip') ?? 'local';
    const ipHash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(ip)))].map(b => b.toString(16).padStart(2, '0')).join('');
    const gate = await env.ADMISSION.get(env.ADMISSION.idFromName('m6.1-admission')).fetch('https://internal/consume', { method: 'POST', body: JSON.stringify({ kind: 'pilot-login', ipHash }) });
    if (!gate.ok) return response({ error: { code: 'RATE_LIMIT', message: 'Demasiados intentos. Espera un minuto.' } }, 429, { 'retry-after': '60' });
    let input;
    try { input = await boundedJson(request); } catch { return response({ error: { code: 'INPUT', message: 'Credencial inválida.' } }, 400); }
    if (!input || typeof input !== 'object' || Object.keys(input).join(',') !== 'credential' || !/^[A-Za-z0-9_-]{43}$/.test(input.credential ?? ''))
      return response({ error: { code: 'INPUT', message: 'Credencial inválida.' } }, 400);
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(input.credential)));
    const expected = Uint8Array.from(env.PILOT_CREDENTIAL_HASH.match(/../g), value => parseInt(value, 16));
    let difference = 0; for (let i = 0; i < 32; i++) difference |= hash[i] ^ expected[i];
    if (difference) return response({ error: { code: 'PILOT_AUTH', message: 'Credencial inválida.' } }, 401);
    const session = await createPilotSession(env, origin, now);
    return response({ ok: true }, 200, { 'set-cookie': `${PILOT_COOKIE}=${session}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${PILOT_SESSION_MS / 1000}` });
  }
  const cookie = request.headers.get('cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith(PILOT_COOKIE + '='))?.slice(PILOT_COOKIE.length + 1);
  const valid = await validPilotSession(cookie, env, origin, now);
  if (url.pathname === '/pilot/' && request.method === 'GET') {
    if (valid) return Response.redirect(origin + returnPath(url.searchParams.get('return')), 303);
    return new Response(loginPage(), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff',
      'x-robots-tag': 'noindex, nofollow', 'content-security-policy': "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'" } });
  }
  if (url.pathname === '/pilot-login.mjs' && request.method === 'GET' && !url.search) return null;
  if (valid) return null;
  if (url.pathname.startsWith('/api/') || request.headers.get('upgrade')?.toLowerCase() === 'websocket' || request.method !== 'GET')
    return response({ error: { code: 'PILOT_AUTH', message: 'Vuelve a entrar al piloto privado para continuar.' } }, 401);
  return Response.redirect(origin + '/pilot/?return=' + encodeURIComponent(returnPath(url.pathname + url.search)), 303);
}
