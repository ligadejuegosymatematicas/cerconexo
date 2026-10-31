import { DurableObject } from 'cloudflare:workers';
import { initialState } from '../../src/engine.mjs';
import { createArena } from '../../arena/src/engine.mjs';
import { analyzeArena } from '../../arena/src/geometry.mjs';
import { PROTOCOL_VERSION, SCHEMA_VERSION, BASE_SHA, AUTH_MS, LEASE_MS, HEARTBEAT_MS, MAX_MESSAGE_BYTES,
  Fault, requireThat, roomCode, credential, nameOf, configuration, commandEnvelope, canonical, digest, errorMessage } from './protocol.mjs';
import { createRoom, joinRoom, findPlayer, publicRoom, reconcileRoom, presence, applyCommand, nextWake } from './room-model.mjs';
import { apiAccess, boundedJson as bodyOf } from './access-policy.mjs';

const utf8 = new TextEncoder();
const PARAMS = { admit: ['playerId', 'seat'], reject: ['playerId'], ready: ['ready'], start: [],
  'probe.complete': [], 'probe.discard': [], 'probe.resolve': [], 'classic.step': ['to'], 'classic.wall': ['to'] };
const json = (value, status = 200, extra = {}) => new Response(JSON.stringify(value), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
    'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', ...extra }
});
function send(ws, message) { try { if (ws.readyState === 1) ws.send(JSON.stringify(message)); } catch { /* close event reconciles presence */ } }
function close(ws, code, reason) { try { ws.close(code, reason); } catch { /* already closed */ } }
function attachment(ws) { try { return ws.deserializeAttachment(); } catch { return null; } }
function authenticateHeader(request) {
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.get('authorization') ?? '');
  requireThat(match, 'AUTH', 'Se necesita una credencial de sesión.', 401); return match[1];
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url), origin = request.headers.get('origin');
    let cors = {};
    try {
      if (url.pathname.startsWith('/api/')) {
        const access = apiAccess(url, env, origin), { allowed, publicSite } = access; cors = access.cors;
        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors,
          'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'Authorization, Content-Type', 'access-control-max-age': '600' } });
        if (url.pathname === '/api/health' && request.method === 'GET') {
          // Real imports execute in workerd; this is a compatibility check, not online gameplay.
          const classic = initialState(), duo = createArena({ mode: 'duo' }), ffa = createArena({ mode: 'ffa' });
          return json({ ok: true, stage: env.INTEGRATED_SITE === 'true' ? 'M6.3' : 'M6.2', protocolVersion: PROTOCOL_VERSION, schemaVersion: SCHEMA_VERSION, baseSha: BASE_SHA,
            localOnly: !publicSite, heartbeatMs: HEARTBEAT_MS, leaseMs: LEASE_MS,
            capabilities: { classic: 'online', arena: publicSite ? 'local-and-cpu-only' : 'connection-probe-only' },
            engines: { classic: { pieces: classic.pieces.length }, arenaDuo: { pieces: duo.pieces.length, cells: analyzeArena(duo).score.shared },
              arenaFfa: { pieces: ffa.pieces.length, cells: analyzeArena(ffa).score.shared } } }, 200, cors);
        }
        let code, route, payload;
        if (url.pathname === '/api/rooms' && request.method === 'POST') {
          payload = await bodyOf(request); code = roomCode(payload.code); route = 'create';
          nameOf(payload.name); credential(payload.credential); configuration(payload.mode, payload.policy);
          if (publicSite) requireThat(payload.mode === 'classic' && payload.policy === 'piece', 'MODE', 'En esta prueba solo está disponible Clásico online por ficha.');
        } else {
          const match = /^\/api\/rooms\/([^/]+)\/(join|resume|socket)$/.exec(url.pathname);
          requireThat(match, 'ROUTE', 'Ruta no disponible.', 404); code = roomCode(match[1]); route = match[2];
          requireThat(route === 'socket' ? request.method === 'GET' : request.method === 'POST', 'METHOD', 'Método no admitido.', 405);
          if (route === 'socket') {
            requireThat(origin && allowed.includes(origin), 'ORIGIN', 'WebSocket necesita un origen admitido.', 403);
            requireThat(request.headers.get('upgrade')?.toLowerCase() === 'websocket', 'UPGRADE', 'Se necesita WebSocket.', 426);
          }
        }
        const ipHash = await digest(request.headers.get('cf-connecting-ip') ?? 'local');
        const gate = await env.ADMISSION.get(env.ADMISSION.idFromName('m6.1-admission')).fetch('https://internal/consume', {
          method: 'POST', body: JSON.stringify({ kind: route, ipHash }) });
        if (!gate.ok) return json({ error: { code: 'RATE_LIMIT', message: 'Demasiados intentos. Espera antes de volver a conectar.' } }, 429, { ...cors, 'retry-after': '60' });
        const headers = new Headers(request.headers); headers.set('x-m6-route', route);
        const forwarded = new Request(`https://internal/rooms/${code}`, { method: request.method, headers,
          body: route === 'create' ? JSON.stringify(payload) : request.method === 'POST' ? request.body : undefined,
          ...(request.method === 'POST' ? { duplex: 'half' } : {}) });
        const response = await env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(forwarded);
        if (response.status === 101) return response;
        const wrapped = new Response(response.body, response); for (const [key, value] of Object.entries(cors)) wrapped.headers.set(key, value); return wrapped;
      }
      const asset = await env.ASSETS.fetch(request);
      const response = new Response(asset.body, asset);
      response.headers.set('cache-control', 'no-store'); response.headers.set('referrer-policy', 'no-referrer');
      response.headers.set('x-content-type-options', 'nosniff');
      response.headers.set('content-security-policy', `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' http://127.0.0.1:8787 http://localhost:8787 ws://127.0.0.1:8787 ws://localhost:8787 ws://${url.host}; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`);
      return response;
    } catch (error) { return json({ error: errorMessage(error) }, error instanceof Fault ? error.status : 503, cors); }
  }
};

// One local pilot gate: no raw IP, names, credentials or request bodies are logged.
export class AdmissionGate extends DurableObject {
  constructor(ctx, env) { super(ctx, env); this.dailyRooms = env.PUBLIC_DEMO === 'true' ? 20 : 100; this.ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL)'); }
  async fetch(request) {
    const { kind, ipHash } = await request.json(), now = Date.now();
    const minute = Math.floor(now / 60_000), hour = Math.floor(now / 3_600_000), day = Math.floor(now / 86_400_000);
    const buckets = kind === 'create' ? [[`create:${ipHash}:${hour}`, 20, (hour + 1) * 3_600_000], [`rooms:${day}`, this.dailyRooms, (day + 1) * 86_400_000]]
      : [[`${kind}:${ipHash}:${minute}`, kind === 'socket' ? 80 : 40, (minute + 1) * 60_000]];
    const accepted = this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec('DELETE FROM limits WHERE expires <= ?', now);
      for (const [key, limit] of buckets) if ((this.ctx.storage.sql.exec('SELECT count FROM limits WHERE key = ?', key).toArray()[0]?.count ?? 0) >= limit) return false;
      for (const [key, , expires] of buckets) this.ctx.storage.sql.exec('INSERT INTO limits (key, count, expires) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = count + 1', key, expires);
      return true;
    });
    return json({ accepted }, accepted ? 200 : 429);
  }
}

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env); this.queue = Promise.resolve();
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS room (id INTEGER PRIMARY KEY CHECK (id = 1), snapshot TEXT NOT NULL)');
      ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, revision INTEGER NOT NULL, at INTEGER NOT NULL, type TEXT NOT NULL, actor TEXT, payload TEXT NOT NULL)');
      ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS receipts (player TEXT NOT NULL, action TEXT NOT NULL, hash TEXT NOT NULL, receipt TEXT NOT NULL, PRIMARY KEY (player, action))');
      ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('m6:ping', 'm6:pong'));
      const room = this.read(); if (room) await this.schedule(room, Date.now());
    });
  }
  async serial(fn) {
    const previous = this.queue; let release; this.queue = new Promise(resolve => { release = resolve; });
    await previous; try { return await fn(); } finally { release(); }
  }
  read() { const row = this.ctx.storage.sql.exec('SELECT snapshot FROM room WHERE id = 1').toArray()[0]; return row ? JSON.parse(row.snapshot) : null; }
  write(room, events = [], accepted = null) {
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec('INSERT INTO room (id, snapshot) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET snapshot = excluded.snapshot', JSON.stringify(room));
      for (const event of events) this.ctx.storage.sql.exec('INSERT INTO events (revision, at, type, actor, payload) VALUES (?, ?, ?, ?, ?)',
        room.revision, event.at ?? Date.now(), event.type, event.playerId ?? null, JSON.stringify(event));
      if (accepted) this.ctx.storage.sql.exec('INSERT INTO receipts (player, action, hash, receipt) VALUES (?, ?, ?, ?)', accepted.player, accepted.action, accepted.hash, JSON.stringify(accepted.receipt));
    });
  }
  liveSocket(player) {
    return this.ctx.getWebSockets().find(ws => { const a = attachment(ws); return ws.readyState === 1 && a?.playerId === player.id && a.generation === player.generation; });
  }
  seenAt(ws) {
    const a = attachment(ws), automatic = this.ctx.getWebSocketAutoResponseTimestamp(ws);
    return Math.max(a?.seenAt ?? 0, automatic ? +automatic : 0);
  }
  refresh(room, now) {
    const offlineIds = [];
    for (const player of Object.values(room.participants)) {
      if (!player.online) continue;
      const ws = this.liveSocket(player), seen = ws ? this.seenAt(ws) : 0;
      if (!ws || seen + LEASE_MS <= now) {
        offlineIds.push(player.id);
        if (ws) close(ws, 4000, 'Presence lease expired');
      } else player.lastSeenAt = seen;
    }
    return reconcileRoom(room, offlineIds, now);
  }
  async schedule(room, now) {
    const candidates = [nextWake(room, now)];
    for (const ws of this.ctx.getWebSockets()) {
      if (ws.readyState !== 1) continue;
      const a = attachment(ws);
      if (!a?.playerId) candidates.push(a?.authUntil ?? now + AUTH_MS);
      // Finished games need retention and auth deadlines, but no periodic
      // presence writes. Hibernating result screens must not exhaust Free SQL.
      else if (room.status !== 'finished' && room.participants[a.playerId]?.online && a.generation === room.participants[a.playerId].generation) candidates.push(this.seenAt(ws) + LEASE_MS);
    }
    const next = candidates.filter(t => typeof t === 'number');
    if (next.length) await this.ctx.storage.setAlarm(Math.max(now + 1, Math.min(...next)));
    else await this.ctx.storage.deleteAlarm();
  }
  broadcast(room, now) {
    for (const ws of this.ctx.getWebSockets()) {
      const a = attachment(ws); if (!a?.playerId || ws.readyState !== 1) continue;
      const p = room.participants[a.playerId];
      if (!p || p.rejected) { close(ws, 4003, 'Admission rejected'); continue; }
      if (p.generation !== a.generation) { send(ws, { type: 'session-replaced' }); close(ws, 4001, 'Session replaced'); continue; }
      send(ws, { type: 'snapshot', state: publicRoom(room, p.id, now) });
    }
  }
  async purge(room) {
    for (const ws of this.ctx.getWebSockets()) { send(ws, { type: 'expired' }); close(ws, 4004, 'Room expired'); }
    await this.ctx.storage.deleteAll();
  }
  async fetch(request) {
    return this.serial(async () => {
      try {
        const now = Date.now(), code = new URL(request.url).pathname.split('/').at(-1), route = request.headers.get('x-m6-route');
        let room = this.read();
        if (route === 'create') {
          const input = await bodyOf(request), tokenHash = await digest(credential(input.credential));
          const requested = configuration(input.mode, input.policy);
          // A retry belongs to the immutable parameters with which this room
          // was created, including rooms surviving a local version update.
          const persisted = room && room.config.mode === requested.mode && room.config.policy === requested.policy ? room.config : requested;
          const normalized = { name: nameOf(input.name), ...persisted };
          const fingerprint = await digest(canonical(normalized));
          if (room) {
            requireThat(room.participants[room.hostId].tokenHash === tokenHash && room.creationFingerprint === fingerprint, 'EXISTS', 'Ese código ya está ocupado.', 409);
          } else {
            room = createRoom({ code, name: input.name, mode: input.mode, policy: input.policy, tokenHash }, now); room.creationFingerprint = fingerprint;
            this.write(room, [{ type: 'created', at: now }]);
          }
          await this.schedule(room, now); return json({ state: publicRoom(room, room.hostId, now) }, 201);
        }
        requireThat(room, 'NOT_FOUND', 'Sala no encontrada o expirada.', 404);
        const events = this.refresh(room, now);
        if (room.status === 'expired') { await this.purge(room); throw new Fault('EXPIRED', 'La sala expiró.', 410); }
        this.write(room, events); await this.schedule(room, now);
        if (events.length) this.broadcast(room, now);
        if (route === 'join') {
          const input = await bodyOf(request), tokenHash = await digest(credential(input.credential));
          const already = Object.values(room.participants).some(p => p.tokenHash === tokenHash);
          requireThat(already || Object.keys(room.participants).length < 32, 'CAPACITY', 'El lobby alcanzó su límite de solicitudes.', 409);
          const id = joinRoom(room, { name: input.name, tokenHash }, now);
          this.write(room, already ? [] : [{ type: 'join-requested', playerId: id, at: now }]);
          await this.schedule(room, now); this.broadcast(room, now); return json({ state: publicRoom(room, id, now) });
        }
        if (route === 'resume') {
          const player = findPlayer(room, await digest(authenticateHeader(request)));
          return json({ state: publicRoom(room, player.id, now) });
        }
        if (route === 'socket') {
          requireThat(this.ctx.getWebSockets().filter(ws => ws.readyState === 1).length < 24, 'CONNECTION_LIMIT', 'La sala alcanzó el límite temporal de conexiones.', 429);
          const pair = new WebSocketPair(), [client, server] = Object.values(pair);
          this.ctx.acceptWebSocket(server);
          server.serializeAttachment({ authUntil: now + AUTH_MS, seenAt: now, rateStart: now, rateCount: 0 });
          await this.schedule(room, now); return new Response(null, { status: 101, webSocket: client });
        }
        throw new Fault('ROUTE', 'Ruta no disponible.', 404);
      } catch (error) { return json({ error: errorMessage(error) }, error instanceof Fault ? error.status : 503); }
    });
  }
  async webSocketMessage(ws, raw) {
    return this.serial(async () => {
      let room = null, message = null;
      try {
        const now = Date.now(), a = attachment(ws);
        requireThat(typeof raw === 'string' && utf8.encode(raw).byteLength <= MAX_MESSAGE_BYTES, 'SIZE', 'Mensaje inválido o demasiado grande.', 413);
        try { message = JSON.parse(raw); } catch { throw new Fault('JSON', 'JSON inválido.'); }
        requireThat(message && typeof message === 'object' && !Array.isArray(message), 'MESSAGE', 'Mensaje inválido.');
        requireThat(a, 'AUTH', 'Conexión no reconocida.', 401);
        if (now - a.rateStart >= 10_000) { a.rateStart = now; a.rateCount = 0; }
        requireThat(++a.rateCount <= 60, 'RATE_LIMIT', 'Demasiados comandos. Espera unos segundos.', 429);
        ws.serializeAttachment(a);
        room = this.read(); requireThat(room, 'NOT_FOUND', 'Sala no encontrada.', 404);
        const events = this.refresh(room, now);
        if (room.status === 'expired') { await this.purge(room); return; }
        // Reconcile the previous lease before accepting this pulse. A delayed
        // alarm must not let an expired application socket revive itself.
        this.write(room, events);
        if (events.length) this.broadcast(room, now);
        if (!a.playerId) {
          requireThat(now < a.authUntil, 'AUTH_TIMEOUT', 'El plazo para autenticar la conexión expiró.', 401);
          requireThat(message.type === 'authenticate' && message.protocolVersion === PROTOCOL_VERSION && message.roomId === room.code, 'AUTH', 'Autentica la sesión con el protocolo correcto.', 401);
          const p = findPlayer(room, await digest(credential(message.credential)));
          p.generation++;
          // Tags are fixed at acceptWebSocket. The authoritative identity lives in the attachment.
          ws.serializeAttachment({ playerId: p.id, generation: p.generation, seenAt: now, rateStart: now, rateCount: 0 });
          presence(room, p.id, true, now);
          this.write(room, [{ type: 'connected', playerId: p.id, at: now }]);
          await this.schedule(room, now); this.broadcast(room, now); return;
        }
        const player = room.participants[a.playerId];
        requireThat(player && !player.rejected && player.generation === a.generation, 'REPLACED', 'Otra conexión recuperó esta sesión.', 401);
        // An expired lease must be recovered by opening a fresh, authenticated socket.
        requireThat(player.online, 'RECONNECT', 'Reconecta tu sesión para continuar.', 409);
        a.seenAt = now; ws.serializeAttachment(a);
        if (message.type === 'sync') {
          requireThat(message.protocolVersion === PROTOCOL_VERSION && message.roomId === room.code, 'VERSION', 'Protocolo o sala inválidos.', 409);
          await this.schedule(room, now);
          send(ws, { type: 'snapshot', state: publicRoom(room, player.id, now) }); return;
        }
        const command = commandEnvelope(message, room.code);
        requireThat(PARAMS[command.type] && Object.keys(command.params).every(key => PARAMS[command.type].includes(key)), 'COMMAND', 'Comando o parámetros no disponibles.');
        const hash = await digest(canonical({ type: command.type, params: command.params }));
        const prior = this.ctx.storage.sql.exec('SELECT hash, receipt FROM receipts WHERE player = ? AND action = ?', player.id, command.actionId).toArray()[0];
        if (prior) {
          requireThat(prior.hash === hash, 'ACTION_CONFLICT', 'Ese identificador ya corresponde a otra acción.', 409);
          await this.schedule(room, now);
          send(ws, { type: 'ack', actionId: command.actionId, duplicate: true, receipt: JSON.parse(prior.receipt), state: publicRoom(room, player.id, now) });
          return;
        }
        // Persist time/presence even if the submitted command is later rejected.
        requireThat(command.expectedRevision === room.revision, 'STALE', 'El estado cambió. Revisa la sala antes de repetir la intención.', 409);
        const candidate = structuredClone(room), event = applyCommand(candidate, player.id, command, now);
        const receipt = { actionId: command.actionId, revision: candidate.revision, at: now };
        this.write(candidate, [{ ...event, params: command.params }], { player: player.id, action: command.actionId, hash, receipt }); room = candidate;
        await this.schedule(room, now);
        send(ws, { type: 'ack', actionId: command.actionId, duplicate: false, receipt, state: publicRoom(room, player.id, now) });
        this.broadcast(room, now);
      } catch (error) {
        const a = attachment(ws);
        if (room && room.status !== 'expired') {
          // Re-read committed data: a failed transaction must not leak a candidate state.
          const committed = this.read();
          if (committed) {
            await this.schedule(committed, Date.now());
            const self = committed.participants[a?.playerId];
            send(ws, { type: 'error', actionId: typeof message?.actionId === 'string' ? message.actionId.slice(0, 80) : null,
              error: errorMessage(error), ...(self && !self.rejected ? { state: publicRoom(committed, self.id, Date.now()) } : {}) });
          }
        } else send(ws, { type: 'error', error: errorMessage(error) });
        if (!a?.playerId || error.code === 'REPLACED' || error.code === 'SIZE') close(ws, error.code === 'SIZE' ? 4009 : 4003, 'Connection rejected');
      }
    });
  }
  async disconnected(ws) {
    return this.serial(async () => {
      const room = this.read(), a = attachment(ws); if (!room) return;
      const now = Date.now(), events = this.refresh(room, now), player = room.participants[a?.playerId];
      if (player && a.generation === player.generation && presence(room, player.id, false, now)) events.push({ type: 'disconnected', playerId: player.id, at: now });
      this.write(room, events); await this.schedule(room, now); this.broadcast(room, now);
    });
  }
  async webSocketClose(ws) { return this.disconnected(ws); }
  async webSocketError(ws) { close(ws, 1011, 'Connection error'); return this.disconnected(ws); }
  async alarm() {
    return this.serial(async () => {
      const room = this.read(); if (!room) return;
      const now = Date.now();
      for (const ws of this.ctx.getWebSockets()) { const a = attachment(ws); if (!a?.playerId && now >= (a?.authUntil ?? 0)) close(ws, 4003, 'Authentication timeout'); }
      const events = this.refresh(room, now);
      if (room.status === 'expired') { await this.purge(room); return; }
      this.write(room, events); await this.schedule(room, now);
      if (events.length) this.broadcast(room, now);
    });
  }
}
