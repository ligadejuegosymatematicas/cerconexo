import WebSocket from 'ws';
import { once } from 'node:events';
import { eventually } from './runtime.mjs';

export class SocketClient {
  constructor(base, code, credential, headers = {}) { this.base = base; this.code = code; this.credential = credential; this.headers = headers; this.state = null; this.messages = []; this.waiters = new Map(); }
  async connect() {
    const endpoint = new URL(`/api/rooms/${this.code}/socket`, this.base);
    endpoint.protocol = endpoint.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(endpoint, { origin: this.base, headers: this.headers }); this.ws = ws;
    ws.on('message', data => {
      const text = data.toString(); if (text === 'm6:pong') return;
      let message; try { message = JSON.parse(text); } catch { return; }
      this.messages.push(message); if (message.state) this.state = message.state;
      if (message.actionId && this.waiters.has(message.actionId)) {
        const resolve = this.waiters.get(message.actionId); this.waiters.delete(message.actionId); resolve(message);
      }
    });
    await once(ws, 'open');
    ws.send(JSON.stringify({ type: 'authenticate', roomId: this.code, protocolVersion: 1, credential: this.credential }));
    await eventually(() => this.state || this.messages.find(m => m.type === 'error'), 'La sesión WebSocket no se autenticó');
    if (!this.state) throw new Error(this.messages.at(-1)?.error?.code ?? 'AUTH');
    this.ping = setInterval(() => { if (ws.readyState === WebSocket.OPEN) ws.send('m6:ping'); }, 5000); return this;
  }
  envelope(type, params = {}, revision = this.state.revision) { return { type, params, roomId: this.code, protocolVersion: 1, actionId: crypto.randomUUID(), expectedRevision: revision }; }
  request(envelope) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.waiters.delete(envelope.actionId); reject(new Error('Sin confirmación del comando')); }, 15000);
      this.waiters.set(envelope.actionId, message => { clearTimeout(timer); resolve(message); });
      this.ws.send(JSON.stringify(envelope));
    });
  }
  async command(type, params = {}) { const message = await this.request(this.envelope(type, params)); if (message.type !== 'ack') throw new Error(message.error.code); return message; }
  async sync() {
    const prior = this.messages.length; this.ws.send(JSON.stringify({ type: 'sync', roomId: this.code, protocolVersion: 1 }));
    await eventually(() => this.messages.length > prior, 'Sin instantánea de recuperación'); return this.state;
  }
  async close() { clearInterval(this.ping); if (!this.ws || this.ws.readyState === WebSocket.CLOSED) return; const closed = once(this.ws, 'close'); this.ws.close(); await closed; }
  async abort() { clearInterval(this.ping); if (this.ws) { const closed = once(this.ws, 'close'); this.ws.terminate(); await closed; } }
}
