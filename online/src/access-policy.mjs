import { requireThat, Fault, MAX_MESSAGE_BYTES } from './protocol.mjs';

const loopback = hostname => ['localhost', '127.0.0.1', '[::1]'].includes(hostname);
export function apiAccess(url, env, origin) {
  const publicSite = env.PUBLIC_DEMO === 'true';
  let allowed;
  if (publicSite) {
    let configured;
    try { configured = new URL(env.PUBLIC_ORIGIN); } catch { throw new Fault('CONFIG', 'El sitio experimental no está configurado.', 503); }
    requireThat(configured.protocol === 'https:' && configured.origin === env.PUBLIC_ORIGIN && !loopback(configured.hostname)
      && !configured.username && !configured.password, 'CONFIG', 'El sitio experimental necesita un origen HTTPS exacto.', 503);
    requireThat(url.origin === configured.origin, 'HOST', 'Dirección no admitida.', 403);
    allowed = [configured.origin];
  } else {
    requireThat(env.LOCAL_DEMO === 'true' && loopback(url.hostname), 'LOCAL_ONLY', 'Este backend solo está habilitado para pruebas locales.', 403);
    allowed = (env.ALLOWED_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean);
  }
  requireThat(!url.search, 'QUERY', 'La API no admite credenciales ni parámetros en la URL.');
  requireThat(!origin || allowed.includes(origin), 'ORIGIN', 'Origen no admitido.', 403);
  return { publicSite, allowed, cors: origin ? { 'access-control-allow-origin': origin, vary: 'Origin' } : {} };
}

export async function boundedJson(request) {
  const declared = request.headers.get('content-length');
  requireThat(!declared || /^\d+$/.test(declared) && Number(declared) <= MAX_MESSAGE_BYTES, 'SIZE', 'Mensaje demasiado grande.', 413);
  const reader = request.body?.getReader();
  const chunks = []; let size = 0;
  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.byteLength;
        requireThat(size <= MAX_MESSAGE_BYTES, 'SIZE', 'Mensaje demasiado grande.', 413);
        chunks.push(value);
      }
    } catch (error) { await reader.cancel().catch(() => {}); throw error; }
    finally { reader.releaseLock(); }
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new Fault('JSON', 'JSON inválido.'); }
}
