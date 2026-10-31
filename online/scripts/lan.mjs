import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { isIP } from 'node:net';
import { fileURLToPath } from 'node:url';
import WebSocket, { WebSocketServer } from 'ws';

// This optional adapter never changes Wrangler's loopback binding or the
// Worker's origin/authentication rules. Its only upstream is this literal IP.
const BACKEND = 'http://127.0.0.1:8787';
const BACKEND_WS = 'ws://127.0.0.1:8787';
export const DEFAULT_PORT = 8791;
export const MAX_CLIENT_PAYLOAD = 8192;
const MAX_BUFFERED_BYTES = 1024 * 1024;

function ipv4Number(value) {
  if (typeof value !== 'string' || isIP(value) !== 4) return null;
  return value.split('.').reduce((sum, octet) => ((sum << 8) | Number(octet)) >>> 0, 0);
}

export function isPrivateIPv4(value) {
  const ip = ipv4Number(value);
  return ip !== null && ((ip >>> 24) === 10 || (ip >>> 20) === 0xac1 || (ip >>> 16) === 0xc0a8);
}

function prefixOf(netmask) {
  const mask = ipv4Number(netmask);
  if (mask === null || mask === 0) return null;
  const inverse = (~mask) >>> 0;
  if ((inverse & (inverse + 1)) !== 0) return null;
  return 32 - Math.log2(inverse + 1);
}

export function lanCandidates(interfaces = os.networkInterfaces()) {
  const candidates = [];
  for (const [name, addresses] of Object.entries(interfaces)) {
    for (const entry of addresses ?? []) {
      if (entry.internal || !['IPv4', 4].includes(entry.family) || !isPrivateIPv4(entry.address)) continue;
      const prefix = prefixOf(entry.netmask);
      if (prefix === null) continue;
      if (!candidates.some(c => c.address === entry.address && c.netmask === entry.netmask)) {
        candidates.push({ name, address: entry.address, netmask: entry.netmask, prefix });
      }
    }
  }
  return candidates;
}

export function chooseInterface(host, interfaces = os.networkInterfaces()) {
  const candidates = lanCandidates(interfaces);
  if (host !== undefined && !isPrivateIPv4(host)) throw new Error('--host debe ser una IPv4 privada RFC1918 del PC; no se admite 0.0.0.0, loopback ni WAN.');
  const matches = host === undefined ? candidates : candidates.filter(entry => entry.address === host);
  if (matches.length !== 1) {
    const available = candidates.map(c => `${c.address}/${c.prefix} (${c.name})`).join(', ') || 'ninguna';
    throw new Error(`Selecciona una única interfaz LAN con --host. Candidatas: ${available}.`);
  }
  return matches[0];
}

export function sameSubnet(remoteAddress, selected) {
  // Node may report an IPv4 peer through its IPv4-mapped IPv6 representation.
  const address = typeof remoteAddress === 'string' ? remoteAddress.replace(/^::ffff:/i, '') : '';
  if (!isPrivateIPv4(address) || !isPrivateIPv4(selected?.address) || prefixOf(selected.netmask) === null) return false;
  const mask = ipv4Number(selected.netmask);
  return ((ipv4Number(address) & mask) >>> 0) === ((ipv4Number(selected.address) & mask) >>> 0);
}

export function gatewayConfig({ host, port = DEFAULT_PORT, interfaces = os.networkInterfaces() } = {}) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Puerto LAN inválido.');
  const selected = chooseInterface(host, interfaces);
  const authority = `${selected.address}${port === 80 ? '' : `:${port}`}`;
  return Object.freeze({ ...selected, port, authority, origin: `http://${authority}` });
}

function reject(message = 'Solicitud LAN rechazada.', status = 403) {
  const error = new Error(message); error.status = status; throw error;
}

function headerCount(request, name) {
  if (!request.rawHeaders) return request.headers[name] === undefined ? 0 : 1;
  let count = 0;
  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    if (request.rawHeaders[index].toLowerCase() === name) count++;
  }
  return count;
}

export function validateRequest(request, config, { websocket = false } = {}) {
  if (!sameSubnet(request.socket?.remoteAddress, config)) reject();
  if (headerCount(request, 'host') !== 1 || request.headers.host !== config.authority) reject();
  if (headerCount(request, 'origin') > 1) reject();
  const origin = request.headers.origin;
  if (origin !== undefined ? origin !== config.origin : websocket || request.method !== 'GET') reject();
  // Accept origin-form paths only, never absolute proxy targets or CONNECT.
  if (typeof request.url !== 'string' || !request.url.startsWith('/') || request.url.startsWith('//') || /[\\\x00-\x20\x7f#]/.test(request.url)) reject('Ruta inválida.', 400);
  const url = new URL(request.url, BACKEND);
  if (url.origin !== BACKEND || url.username || url.password) reject('Ruta inválida.', 400);
  if (url.pathname.startsWith('/api/') && url.search) reject('La API no admite parámetros en la URL.', 400);
  if (websocket && (request.method !== 'GET' || !/^\/api\/rooms\/[A-HJ-NP-Z2-9]{10}\/socket$/i.test(url.pathname))) reject('Ruta WebSocket inválida.', 400);
  return { path: request.url, origin };
}

const HOP_HEADERS = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade']);

function cleanHeaders(headers) {
  const removed = new Set([...HOP_HEADERS, ...String(headers.connection ?? '').toLowerCase().split(',').map(value => value.trim())]);
  return Object.fromEntries(Object.entries(headers).filter(([key]) => !removed.has(key.toLowerCase())));
}

export function upstreamHeaders(request, validated) {
  const headers = cleanHeaders(request.headers);
  // Peers cannot impersonate a trusted reverse proxy or choose the upstream.
  for (const key of Object.keys(headers)) {
    if (key === 'forwarded' || key.startsWith('x-forwarded-') || ['x-real-ip', 'cf-connecting-ip', 'true-client-ip', 'x-m6-route'].includes(key)) delete headers[key];
  }
  headers.host = '127.0.0.1:8787';
  if (validated.origin !== undefined) headers.origin = BACKEND;
  else delete headers.origin;
  return headers;
}

export function contentSecurityPolicy(config) {
  // SVG boardView uses style attributes. Scripts remain same-origin only.
  return `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ${config.origin} ws://${config.authority}; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`;
}

function responseHeaders(headers, validated, config) {
  const result = cleanHeaders(headers);
  result['content-security-policy'] = contentSecurityPolicy(config);
  result['cache-control'] = 'no-store';
  result['referrer-policy'] = 'no-referrer';
  result['x-content-type-options'] = 'nosniff';
  delete result['access-control-allow-origin'];
  if (validated.origin !== undefined) result['access-control-allow-origin'] = config.origin;
  if (result.location) {
    const location = new URL(result.location, BACKEND);
    if (location.origin !== BACKEND) reject('Redirección no admitida.', 502);
    result.location = config.origin + location.pathname + location.search + location.hash;
  }
  return result;
}

function failHttp(response, status = 403) {
  if (response.headersSent) { response.destroy(); return; }
  response.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'connection': 'close', 'x-content-type-options': 'nosniff' });
  response.end(status === 502 ? 'Backend local no disponible.\n' : 'Solicitud LAN rechazada.\n');
}

function failUpgrade(socket, status = 403) {
  if (socket.destroyed || socket.writableEnded) return;
  const reason = status === 502 ? 'Bad Gateway' : status === 400 ? 'Bad Request' : 'Forbidden';
  socket.end(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  const timer = setTimeout(() => socket.destroy(), 1000); timer.unref();
  socket.once('close', () => clearTimeout(timer));
}

function safeClose(ws, code = 1011, reason = 'Connection closed') {
  if (ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) return;
  if (ws.readyState === WebSocket.CONNECTING) { ws.terminate(); return; }
  const valid = code === 1000 || (code >= 1001 && code <= 1014 && ![1004, 1005, 1006].includes(code)) || (code >= 3000 && code <= 4999);
  try { ws.close(valid ? code : 1011, valid && Buffer.byteLength(reason) <= 123 ? reason : 'Connection closed'); }
  catch { ws.terminate(); }
}

function bridge(client, backend) {
  const closeBoth = () => { safeClose(client); safeClose(backend); };
  for (const [source, destination] of [[client, backend], [backend, client]]) {
    source.on('message', (data, isBinary) => {
      if (destination.readyState !== WebSocket.OPEN) { closeBoth(); return; }
      if (destination.bufferedAmount + data.length > MAX_BUFFERED_BYTES) { closeBoth(); return; }
      // No parsing, logging or rewriting: the Worker's first-frame credential
      // handshake and all application authentication remain authoritative.
      source.pause();
      destination.send(data, { binary: isBinary }, error => {
        if (error) closeBoth();
        else if (source.readyState === WebSocket.OPEN) source.resume();
      });
    });
    source.on('close', (code, reason) => safeClose(destination, code, reason.toString()));
    source.on('error', closeBoth);
  }
}

export function createGateway(options = {}) {
  const config = gatewayConfig(options);
  const agent = new http.Agent({ keepAlive: true, maxSockets: 32, maxFreeSockets: 8 });
  const pending = new Set(), peers = new Set(), sockets = new Set();
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_CLIENT_PAYLOAD, perMessageDeflate: false, closeTimeout: 1500 });
  const server = http.createServer({ maxHeaderSize: 16384, headersTimeout: 10000, requestTimeout: 30000, keepAliveTimeout: 5000 }, (request, response) => {
    let validated;
    try { validated = validateRequest(request, config); }
    catch (error) { failHttp(response, error.status ?? 403); request.resume(); return; }
    const upstream = http.request({ hostname: '127.0.0.1', port: 8787, path: validated.path, method: request.method,
      headers: upstreamHeaders(request, validated), agent }, incoming => {
      try { response.writeHead(incoming.statusCode ?? 502, responseHeaders(incoming.headers, validated, config)); }
      catch { incoming.destroy(); failHttp(response, 502); return; }
      incoming.on('error', () => response.destroy());
      incoming.pipe(response);
    });
    pending.add(upstream);
    upstream.once('close', () => pending.delete(upstream));
    upstream.on('error', () => failHttp(response, 502));
    upstream.setTimeout(15000, () => upstream.destroy());
    request.on('aborted', () => upstream.destroy());
    request.on('error', () => upstream.destroy());
    response.on('close', () => { if (!response.writableFinished) upstream.destroy(); });
    request.pipe(upstream);
  });
  server.maxHeadersCount = 100;
  server.on('connection', socket => { sockets.add(socket); socket.on('error', () => {}); socket.once('close', () => sockets.delete(socket)); });
  server.on('clientError', (_error, socket) => failUpgrade(socket, 400));
  server.on('connect', (_request, socket) => failUpgrade(socket, 403));
  server.on('upgrade', (request, socket, head) => {
    let validated;
    try { validated = validateRequest(request, config, { websocket: true }); }
    catch (error) { failUpgrade(socket, error.status ?? 403); return; }
    const backend = new WebSocket(BACKEND_WS + validated.path, {
      origin: BACKEND, followRedirects: false, perMessageDeflate: false,
      maxPayload: MAX_BUFFERED_BYTES, handshakeTimeout: 5000, closeTimeout: 1500
    });
    peers.add(backend); backend.once('close', () => peers.delete(backend));
    let upgraded = false;
    const abandoned = () => { if (!upgraded) safeClose(backend); };
    socket.once('close', abandoned);
    backend.on('error', () => { if (!upgraded) failUpgrade(socket, 502); });
    backend.on('unexpected-response', (_request, response) => { response.destroy(); backend.terminate(); failUpgrade(socket, 502); });
    backend.once('open', () => {
      if (socket.destroyed) { safeClose(backend); return; }
      try {
        // Connect upstream before accepting the browser: its first auth frame
        // cannot be lost while the local upstream handshake is still pending.
        wss.handleUpgrade(request, socket, head, client => {
          upgraded = true; socket.removeListener('close', abandoned);
          peers.add(client); client.once('close', () => peers.delete(client));
          bridge(client, backend);
        });
      } catch { safeClose(backend); failUpgrade(socket, 400); }
    });
    backend.once('close', () => { if (!upgraded) failUpgrade(socket, 502); });
  });
  return {
    config,
    start() {
      return new Promise((resolve, rejectStart) => {
        server.once('error', rejectStart);
        server.listen({ host: config.address, port: config.port }, () => {
          server.removeListener('error', rejectStart); resolve(config.origin);
        });
      });
    },
    async stop() {
      for (const peer of peers) safeClose(peer, 1001, 'Gateway stopping');
      for (const request of pending) request.destroy();
      agent.destroy();
      if (!server.listening) { for (const socket of sockets) socket.destroy(); wss.close(); return; }
      const closed = new Promise(resolve => server.close(resolve));
      const timer = setTimeout(() => { for (const peer of peers) peer.terminate(); for (const socket of sockets) socket.destroy(); }, 1800);
      timer.unref();
      await closed; clearTimeout(timer); wss.close();
    }
  };
}

function parseArguments(args) {
  const options = {}; let check = false;
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === '--check') check = true;
    else if (argument === '--host' || argument === '--port') {
      const value = args[++index];
      if (!value || value.startsWith('--')) throw new Error(`Falta el valor de ${argument}.`);
      if (argument === '--host') options.host = value;
      else {
        if (!/^[1-9]\d{0,4}$/.test(value)) throw new Error('Puerto LAN inválido.');
        options.port = Number(value);
      }
    } else throw new Error(`Argumento no admitido: ${argument}.`);
  }
  return { options, check };
}

async function main() {
  if (process.argv.includes('--help')) {
    console.log('Uso: node scripts/lan.mjs [--host IPv4_PRIVADA_DEL_PC] [--port 8791] [--check]\nPrimero: node scripts/dev.mjs (Wrangler solo 127.0.0.1:8787).\n--check valida la selección sin abrir puertos. --host es obligatorio si hay varias candidatas.');
    return;
  }
  const { options, check } = parseArguments(process.argv.slice(2));
  const gateway = createGateway(options);
  console.log(`LAN: ${gateway.config.origin} (${gateway.config.name}, /${gateway.config.prefix}).`);
  console.log('HTTP sin TLS: usa solo una LAN privada de confianza. Los datos de sesión viajan sin cifrar.');
  console.log('No se crean túneles ni reglas de firewall. Si Windows bloquea, permite manualmente Node/puerto LAN solo en red privada y subred local.');
  if (check) { console.log('Configuración válida; no se abrió ningún puerto.'); await gateway.stop(); return; }
  await gateway.start();
  console.log('Gateway activo; backend fijo en 127.0.0.1:8787. Ctrl+C para cerrar.');
  let stopping = false;
  const stop = async () => { if (stopping) return; stopping = true; await gateway.stop(); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
