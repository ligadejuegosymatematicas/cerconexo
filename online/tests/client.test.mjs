import test from 'node:test';
import assert from 'node:assert/strict';
import { OnlineSession, apiRequest, newCredential, storageKey } from '../session.mjs';

class Socket extends EventTarget {
  static OPEN = 1;
  static instances = [];
  constructor(url) { super(); this.url = String(url); this.readyState = 0; this.sent = []; Socket.instances.push(this); }
  open() { this.readyState = 1; this.dispatchEvent(new Event('open')); }
  message(value) { this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(value) })); }
  send(value) { this.sent.push(value); }
  close() { this.readyState = 3; this.dispatchEvent(new Event('close')); }
}
function fixture(t) {
  const original = globalThis.WebSocket; globalThis.WebSocket = Socket;
  t.after(() => { globalThis.WebSocket = original; });
  const records = new Map(), storage = { getItem: key => records.get(key) ?? null, setItem: (key, value) => records.set(key, value) };
  const session = new OnlineSession({ base: 'http://127.0.0.1:8787', code: 'ABCDEFGH23', credential: newCredential(), storage });
  t.after(() => session.disconnect()); session.connect(); const ws = Socket.instances.at(-1); ws.open();
  ws.message({ type: 'snapshot', state: { revision: 7, serverNow: 3000 } });
  return { session, ws, storage };
}
test('La credencial viaja en el primer mensaje autenticado, nunca en la URL', t => {
  const { session, ws } = fixture(t);
  assert.equal(new URL(ws.url).search, ''); assert.ok(!ws.url.includes(session.credential));
  assert.equal(JSON.parse(ws.sent[0]).credential, session.credential);
});
test('Un fallo transitorio posterior al commit conserva la intención y consulta el mismo recibo', t => {
  const { session, ws, storage } = fixture(t); session.command('probe.complete');
  session.addEventListener('problem', event => { if (event.detail.code === 'UNAVAILABLE') assert.equal(session.phase, 'reconnecting'); });
  const pending = JSON.parse(ws.sent.at(-1));
  ws.message({ type: 'error', actionId: pending.actionId, error: { code: 'UNAVAILABLE', message: 'Temporal' }, state: { revision: 8, serverNow: 4000 } });
  assert.equal(session.pending.actionId, pending.actionId);
  assert.equal(JSON.parse(storage.getItem(storageKey(session.code))).pending.actionId, pending.actionId);
  session.connect(); const recovered = Socket.instances.at(-1); recovered.open();
  recovered.message({ type: 'snapshot', state: { revision: 8, serverNow: 4500 } });
  assert.equal(JSON.parse(recovered.sent.at(-1)).actionId, pending.actionId);
  recovered.message({ type: 'ack', actionId: pending.actionId, duplicate: true, state: { revision: 8, serverNow: 4600 } });
  assert.equal(session.pending, null); assert.equal(JSON.parse(storage.getItem(storageKey(session.code))).pending, null);
});
test('Una revisión obsoleta requiere una nueva intención explícita y muestra el estado actual', t => {
  const { session, ws } = fixture(t); session.command('probe.complete'); const id = session.pending.actionId;
  ws.message({ type: 'error', actionId: id, error: { code: 'STALE', message: 'Cambió' }, state: { revision: 9, serverNow: 4500 } });
  assert.equal(session.pending, null); assert.equal(session.state.revision, 9); assert.equal(ws.sent.length, 2);
});
test('Sin persistencia local no se envía una intención que no pueda recuperarse', t => {
  const { session, ws, storage } = fixture(t); storage.setItem = () => { throw new Error('Quota'); };
  assert.throws(() => session.command('probe.complete')); assert.equal(session.pending, null); assert.equal(ws.sent.length, 1);
});
test('Reintentar un registro tras perder respuesta conserva cuerpo y credencial', async t => {
  const original = globalThis.fetch, requests = []; globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), body: init.body });
    if (requests.length === 1) throw new TypeError('Network');
    return new Response(JSON.stringify({ state: { revision: 1 } }), { status: 201 });
  };
  t.after(() => { globalThis.fetch = original; });
  await apiRequest('http://127.0.0.1:8787', '/api/rooms', { code: 'ABCDEFGH23', credential: newCredential() });
  assert.equal(requests.length, 2); assert.equal(requests[0].body, requests[1].body); assert.equal(new URL(requests[0].url).search, '');
});
test('Una denegación definitiva de HTTP no se reintenta automáticamente', async t => {
  const original = globalThis.fetch; let requests = 0;
  globalThis.fetch = async () => { requests++; return new Response(JSON.stringify({ error: { code: 'ORIGIN', message: 'No admitido' } }), { status: 403 }); };
  t.after(() => { globalThis.fetch = original; });
  await assert.rejects(() => apiRequest('http://127.0.0.1:8787', '/api/rooms', {}), error => error.code === 'ORIGIN'); assert.equal(requests, 1);
});

test('Beta: límite del proveedor sin JSON ofrece un mensaje legible y no repite la solicitud', async t => {
  const original = globalThis.fetch; let requests = 0;
  globalThis.fetch = async () => { requests++; return new Response('<h1>Capacity</h1>', { status: 429 }); };
  t.after(() => { globalThis.fetch = original; });
  await assert.rejects(() => apiRequest('https://example.org', '/api/rooms', {}), e => e.code === 'CAPACITY' && /sesión se conserva/.test(e.message));
  assert.equal(requests, 1);
});

test('Beta: indisponibilidad del proveedor conserva el reintento con el mismo cuerpo', async t => {
  const original = globalThis.fetch, bodies = [];
  globalThis.fetch = async (_url, init) => { bodies.push(init.body); return new Response('<h1>Unavailable</h1>', { status: 503 }); };
  t.after(() => { globalThis.fetch = original; });
  await assert.rejects(() => apiRequest('https://example.org', '/api/rooms', { code: 'ABCDEFGH23' }), e => e.code === 'UNAVAILABLE' && e.status === 503);
  assert.equal(bodies.length, 2); assert.equal(bodies[0], bodies[1]);
});
test('Un handshake de sala expirada se clasifica por HTTP y deja de reconectar', async t => {
  const { session } = fixture(t), original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Sala expirada' } }), { status: 404 });
  t.after(() => { globalThis.fetch = original; });
  session.connect(); const failed = Socket.instances.at(-1);
  const terminal = new Promise(resolve => session.addEventListener('phase', e => { if (e.detail === 'expired') resolve(); }));
  failed.close(); await terminal; assert.equal(session.stopped, true); assert.equal(session.phase, 'expired');
});
test('M6.2.1: error de red cambia de fase y la instantánea válida anuncia recuperación', t => {
  const { session, ws } = fixture(t), recovered = [];
  session.addEventListener('recovered', e => recovered.push(e.detail));
  ws.dispatchEvent(new Event('error')); assert.equal(session.phase, 'reconnecting');
  ws.message({ type: 'snapshot', state: { revision: 8, serverNow: 4000 } });
  assert.equal(session.phase, 'connected'); assert.equal(recovered.length, 1); assert.equal(recovered[0].resumed, true);
  ws.message({ type: 'snapshot', state: { revision: 8, serverNow: 4001 } }); assert.equal(recovered.length, 1);
});

test('Inicio espera su aviso autenticado y conserva una jugada pendiente', async t => {
  const {session,ws,storage}=fixture(t);session.state.features={viewAway:true};session.command('classic.step',{to:9});
  const pending=structuredClone(session.pending),leaving=session.leaveView(),message=JSON.parse(ws.sent.at(-1));
  assert.equal(message.type,'view-away');assert.equal(message.roomId,session.code);assert.ok(!('credential' in message));
  let done=false;leaving.then(()=>{done=true;});ws.message({type:'view-left',requestId:'wrong'});await Promise.resolve();assert.equal(done,false);
  ws.message({type:'view-left',requestId:message.requestId});await leaving;
  assert.deepEqual(session.pending,pending);assert.deepEqual(JSON.parse(storage.getItem(storageKey(session.code))).pending,pending);
});
