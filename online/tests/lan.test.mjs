import test from 'node:test';
import assert from 'node:assert/strict';
import { isPrivateIPv4, lanCandidates, chooseInterface, sameSubnet, gatewayConfig,
  validateRequest, upstreamHeaders, contentSecurityPolicy, MAX_CLIENT_PAYLOAD } from '../scripts/lan.mjs';

const entry = (address, netmask = '255.255.255.0', internal = false) => ({ address, netmask, family: 'IPv4', internal });
const interfaces = { WiFi: [entry('192.168.20.8')], Loopback: [entry('127.0.0.1', '255.0.0.0', true)] };
const config = gatewayConfig({ interfaces });
const request = (overrides = {}) => ({ method: 'GET', url: '/', socket: { remoteAddress: '192.168.20.11' },
  headers: { host: config.authority }, ...overrides });

test('only canonical RFC1918 IPv4 addresses are LAN candidates', () => {
  for (const address of ['10.0.0.1', '172.16.0.1', '172.31.255.254', '192.168.0.1']) assert.equal(isPrivateIPv4(address), true, address);
  for (const address of ['0.0.0.0', '127.0.0.1', '8.8.8.8', '172.15.0.1', '172.32.0.1', '169.254.1.2', '100.64.1.2', '224.0.0.1', '::1', '::ffff:192.168.1.2', '192.168.001.1', '3232235777']) assert.equal(isPrivateIPv4(address), false, address);
  const available = lanCandidates({ ...interfaces, WAN: [entry('8.8.8.8')], InvalidMask: [entry('10.0.0.2', '255.0.255.0')], NoMask: [entry('10.0.0.3', '0.0.0.0')] });
  assert.deepEqual(available, [{ name: 'WiFi', address: '192.168.20.8', netmask: '255.255.255.0', prefix: 24 }]);
});

test('bind selection requires an actual local private interface and resolves ambiguity explicitly', () => {
  assert.equal(chooseInterface(undefined, interfaces).address, '192.168.20.8');
  const multiple = { ...interfaces, Hotspot: [entry('192.168.137.1')] };
  assert.throws(() => chooseInterface(undefined, multiple), /--host/);
  assert.equal(chooseInterface('192.168.137.1', multiple).name, 'Hotspot');
  for (const host of ['0.0.0.0', '127.0.0.1', '8.8.8.8', '192.168.20.200']) assert.throws(() => chooseInterface(host, interfaces));
  assert.throws(() => chooseInterface(undefined, {}));
  assert.throws(() => chooseInterface('192.168.20.8', { ...interfaces, Other: [entry('192.168.20.8', '255.255.0.0')] }));
  for (const port of [0, -1, 65536, 1.5, '8791']) assert.throws(() => gatewayConfig({ interfaces, port }));
});

test('peer checks use the selected netmask, accept mapped IPv4, and reject other/private/public subnets', () => {
  assert.equal(sameSubnet('192.168.20.11', config), true);
  assert.equal(sameSubnet('::ffff:192.168.20.11', config), true);
  for (const address of ['192.168.21.11', '10.0.0.1', '127.0.0.1', '8.8.8.8', '::1', '::ffff:8.8.8.8', undefined]) assert.equal(sameSubnet(address, config), false);
  const wifi = { address: '172.17.56.19', netmask: '255.255.224.0' };
  assert.equal(sameSubnet('172.17.32.1', wifi), true);
  assert.equal(sameSubnet('172.17.63.254', wifi), true);
  assert.equal(sameSubnet('172.17.64.1', wifi), false);
});

test('exact numeric Host and same-origin Origin block DNS rebinding and external browser requests', () => {
  assert.equal(validateRequest(request(), config).path, '/');
  assert.equal(validateRequest(request({ headers: { host: config.authority, origin: config.origin } }), config).origin, config.origin);
  for (const host of ['localhost:8791', '127.0.0.1:8791', 'attacker.test:8791', '192.168.20.8', `${config.authority}.attacker.test`, `${config.authority}, attacker.test`]) {
    assert.throws(() => validateRequest(request({ headers: { host } }), config), /rechazada/);
  }
  for (const origin of ['null', 'https://192.168.20.8:8791', 'http://192.168.20.8:8792', 'http://attacker.test', config.origin + '/', config.origin + '.attacker.test']) {
    assert.throws(() => validateRequest(request({ headers: { host: config.authority, origin } }), config), /rechazada/);
  }
  assert.throws(() => validateRequest(request({ socket: { remoteAddress: '192.168.21.1' } }), config));
  assert.throws(() => validateRequest(request({ rawHeaders: ['Host', config.authority, 'hOsT', config.authority] }), config));
  assert.throws(() => validateRequest(request({ headers: { host: config.authority, origin: config.origin }, rawHeaders: ['Host', config.authority, 'Origin', config.origin, 'Origin', config.origin] }), config));
});

test('missing Origin is allowed for native GET only; websocket always requires it', () => {
  validateRequest(request(), config);
  for (const method of ['POST', 'OPTIONS', 'HEAD', 'CONNECT']) assert.throws(() => validateRequest(request({ method }), config));
  validateRequest(request({ method: 'POST', url: '/api/rooms', headers: { host: config.authority, origin: config.origin } }), config);
  const socketRequest = request({ url: '/api/rooms/ABCDEFGH23/socket', headers: { host: config.authority, origin: config.origin } });
  validateRequest(socketRequest, config, { websocket: true });
  assert.throws(() => validateRequest({ ...socketRequest, headers: { host: config.authority } }, config, { websocket: true }));
  assert.throws(() => validateRequest(request({ headers: socketRequest.headers }), config, { websocket: true }));
  assert.equal(MAX_CLIENT_PAYLOAD, 8192);
});

test('paths cannot choose another destination or put API parameters/credentials in a URL', () => {
  for (const url of ['http://attacker.test/', '//attacker.test/', '/\\attacker.test/', '/\r\nHost: attacker.test', '/#fragment', '/api/rooms/ABCDEFGH23/socket?token=secret', '/api/health?x=1']) {
    assert.throws(() => validateRequest(request({ url }), config));
  }
  validateRequest(request({ url: '/client.mjs?v=1' }), config);
});

test('forwarded HTTP headers retain Authorization and content type, replace trusted origin/host, and strip spoofing/hop headers', () => {
  const input = request({ method: 'POST', headers: { host: config.authority, origin: config.origin,
    authorization: 'Bearer opaque-session', 'content-type': 'application/json', 'content-length': '32',
    connection: 'keep-alive, x-hop', 'x-hop': 'remove', 'x-forwarded-for': '8.8.8.8', 'x-forwarded-host': 'attacker.test',
    forwarded: 'for=8.8.8.8', 'cf-connecting-ip': '8.8.8.8', 'x-m6-route': 'create' } });
  const headers = upstreamHeaders(input, validateRequest(input, config));
  assert.deepEqual(headers, { host: '127.0.0.1:8787', origin: 'http://127.0.0.1:8787', authorization: 'Bearer opaque-session',
    'content-type': 'application/json', 'content-length': '32' });
  const native = request();
  assert.equal(upstreamHeaders(native, validateRequest(native, config)).origin, undefined);
});

test('LAN CSP permits its own HTTP/WS, SVG styles and same-origin scripts', () => {
  const csp = contentSecurityPolicy(config);
  assert.match(csp, /script-src 'self';/);
  assert.match(csp, /style-src 'self' 'unsafe-inline';/);
  assert.ok(csp.includes(`connect-src 'self' ${config.origin} ws://${config.authority};`));
  assert.equal(csp.includes('127.0.0.1'), false);
  assert.equal(csp.includes('localhost'), false);
  assert.equal(csp.includes('https://'), false);
});
