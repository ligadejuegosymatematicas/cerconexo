const VERSION = 1;
export function newCredential() {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
export function newCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return [...crypto.getRandomValues(new Uint8Array(10))].map(n => alphabet[n & 31]).join('');
}
export function newActionId() {
  // getRandomValues also works on an HTTP LAN origin, unlike randomUUID.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = bytes[6] & 15 | 64; bytes[8] = bytes[8] & 63 | 128;
  const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export function storageKey(code, profile = '1') { return `cerconexo-m6-session-v1:${profile}:${code}`; }
export function loadSession(storage, code, profile = '1') {
  try { const data = JSON.parse(storage.getItem(storageKey(code, profile))); return /^[A-Za-z0-9_-]{43}$/.test(data?.credential) ? data : null; } catch { return null; }
}
export async function apiRequest(base, path, body, credential) {
  // Initial registration and resume are idempotent for this exact credential.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(new URL(path, base), { method: 'POST', headers: { 'content-type': 'application/json', ...(credential ? { authorization: `Bearer ${credential}` } : {}) }, body: JSON.stringify(body ?? {}), cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) { const error = new Error(data.error?.message ?? 'No se pudo completar la solicitud.'); error.code = data.error?.code; error.status = response.status; error.transient = response.status >= 500; throw error; }
      return data;
    } catch (error) {
      if (attempt || !(error instanceof TypeError || error.transient)) throw error;
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }
}
export class OnlineSession extends EventTarget {
  constructor({ base, code, credential, profile = '1', storage = localStorage }) {
    super(); this.base = base; this.code = code; this.credential = credential; this.profile = profile; this.storage = storage;
    this.state = null; this.socket = null; this.phase = 'idle'; this.stopped = true; this.retry = 0; this.pending = loadSession(storage, code, profile)?.pending ?? null;
    this.persist();
  }
  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
  persist() { this.storage.setItem(storageKey(this.code, this.profile), JSON.stringify({ code: this.code, credential: this.credential, pending: this.pending })); }
  setPhase(value) { this.phase = value; this.emit('phase', value); }
  receiveState(state) { this.state = state; this.receivedAt = performance.now(); this.emit('state', state); }
  connect() {
    this.stopped = false; clearTimeout(this.retryTimer); clearTimeout(this.ackTimer); clearInterval(this.pingTimer);
    const prior = this.socket; this.socket = null; prior?.close();
    this.setPhase('connecting');
    const url = new URL(`/api/rooms/${this.code}/socket`, this.base); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(url); this.socket = ws; let authenticated = false;
    ws.addEventListener('open', () => { if (this.socket === ws) ws.send(JSON.stringify({ type: 'authenticate', protocolVersion: VERSION, roomId: this.code, credential: this.credential })); });
    ws.addEventListener('message', event => {
      if (this.socket !== ws) return;
      if (event.data === 'm6:pong') { this.lastPong = performance.now(); return; }
      let message; try { message = JSON.parse(event.data); } catch { return; }
      if (message.type === 'session-replaced' || message.type === 'expired') {
        this.stopped = true; this.setPhase(message.type === 'expired' ? 'expired' : 'replaced'); ws.close(); return;
      }
      if (message.state) {
        authenticated = true;
        const first = this.phase !== 'connected'; this.receiveState(message.state);
        if (first) {
          this.setPhase('connected'); this.retry = 0; this.lastPong = performance.now();
          this.pingTimer = setInterval(() => {
            if (this.socket !== ws || ws.readyState !== WebSocket.OPEN) return;
            if (performance.now() - this.lastPong > 15000) { this.connect(); return; }
            ws.send('m6:ping');
          }, 5000);
          if (this.pending) this.sendPending();
        }
      }
      // A storage/scheduling failure may follow a committed command. Resolve its
      // receipt on a new socket before discarding the durable local intention.
      if (message.type === 'error' && message.error.code === 'UNAVAILABLE') {
        this.emit('problem', message.error); ws.close(1011, 'Resolve pending receipt'); return;
      }
      if ((message.type === 'ack' || message.type === 'error') && message.actionId && this.pending?.actionId === message.actionId) {
        this.pending = null; clearTimeout(this.ackTimer); this.persist(); this.emit('pending', false);
      }
      if (message.type === 'error') {
        this.emit('problem', message.error);
        if (!this.state || ['AUTH', 'AUTH_TIMEOUT', 'REJECTED', 'REPLACED'].includes(message.error.code)) {
          this.stopped = true; this.setPhase('rejected'); ws.close();
        }
      }
    });
    ws.addEventListener('close', async () => {
      if (this.socket !== ws) return;
      clearInterval(this.pingTimer); clearTimeout(this.ackTimer);
      if (this.stopped) return;
      this.setPhase('reconnecting');
      // Browsers hide an unsuccessful upgrade's HTTP body. Classify terminal
      // room/session failures over HTTP instead of retrying a 404 forever.
      if (!authenticated) {
        try { await apiRequest(this.base, `/api/rooms/${this.code}/resume`, {}, this.credential); }
        catch (error) {
          if (this.socket !== ws || this.stopped) return;
          if ([401, 403, 404, 410].includes(error.status)) {
            this.stopped = true; this.setPhase([404, 410].includes(error.status) ? 'expired' : 'rejected'); this.emit('problem', { code: error.code, message: error.message }); return;
          }
        }
      }
      if (this.socket !== ws || this.stopped) return;
      this.retryTimer = setTimeout(() => this.connect(), Math.min(5000, 500 * 2 ** this.retry++) + Math.floor(Math.random() * 150));
    });
    ws.addEventListener('error', () => { if (this.socket === ws) this.emit('problem', { code: 'NETWORK', message: 'Conexión interrumpida. Se conserva tu sesión.' }); });
  }
  sendPending() {
    if (!this.pending || this.phase !== 'connected' || this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify(this.pending)); clearTimeout(this.ackTimer);
    this.ackTimer = setTimeout(() => { if (this.pending && !this.stopped) this.connect(); }, 10000);
  }
  command(type, params = {}) {
    if (this.phase !== 'connected' || !this.state || this.pending) throw new Error('Espera la conexión y la confirmación anterior.');
    this.pending = { protocolVersion: VERSION, roomId: this.code, actionId: newActionId(), expectedRevision: this.state.revision, type, params };
    try { this.persist(); } catch { this.pending = null; throw new Error('No se pudo guardar la intención. Revisa el almacenamiento del navegador.'); }
    this.emit('pending', true); this.sendPending();
  }
  sync() {
    if (this.phase === 'connected' && this.socket?.readyState === WebSocket.OPEN && performance.now() - this.lastPong < 15000)
      this.socket.send(JSON.stringify({ type: 'sync', protocolVersion: VERSION, roomId: this.code }));
    else if (!this.stopped) this.connect();
  }
  disconnect() {
    this.stopped = true; clearTimeout(this.retryTimer); clearTimeout(this.ackTimer); clearInterval(this.pingTimer);
    const ws = this.socket; this.socket = null; ws?.close(1000, 'Manual disconnect'); this.setPhase('disconnected');
  }
}
