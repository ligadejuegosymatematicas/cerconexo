export const PROTOCOL_VERSION = 1;
export const SCHEMA_VERSION = 1;
export const BASE_SHA = '0ce64e92c744e75cdcd9383b7ddb00270cd64df8';
export const HEARTBEAT_MS = 5_000;
export const LEASE_MS = 15_000;
export const AUTH_MS = 5_000;
export const RETENTION_MS = 86_400_000;
export const GRACE_INCIDENT_MS = 30_000;
export const GRACE_TOTAL_MS = 60_000;
export const COUNTDOWN_MS = 3_000;
export const MAX_MESSAGE_BYTES = 8_192;
export const CODE_PATTERN = /^[A-HJ-NP-Z2-9]{10}$/;
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const MODES = Object.freeze({
  classic: { label: 'Clásico · 2 vs. 2', teams: ['A', 'B'], seats: ['A1', 'B1', 'A2', 'B2'], clockMs: 480_000, policies: ['piece'] },
  'arena-duo': { label: 'Arena · 2 vs. 2', teams: ['A', 'B'], seats: ['A1', 'B1', 'A2', 'B2'], clockMs: 600_000, policies: ['piece', 'team'] },
  'arena-ffa': { label: 'Arena · cuatro equipos', teams: ['A', 'B', 'C', 'D'], seats: ['A', 'B', 'C', 'D'], clockMs: 300_000, policies: ['piece'] }
});

export class Fault extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}
export function requireThat(ok, code, message, status = 400) { if (!ok) throw new Fault(code, message, status); }
export function configuration(mode = 'classic', policy = 'piece') {
  const preset = MODES[mode];
  requireThat(preset && preset.policies.includes(policy), 'CONFIG', 'Modalidad o política no admitida.');
  return { mode, policy, ruleset: mode === 'classic' ? 'classic-online-v1' : 'm6.1-connection-probe-v1', teams: [...preset.teams], seats: [...preset.seats], clockMs: preset.clockMs,
    graceIncidentMs: GRACE_INCIDENT_MS, graceTotalMs: GRACE_TOTAL_MS, countdownMs: COUNTDOWN_MS };
}
export function nameOf(value) {
  requireThat(typeof value === 'string', 'NAME', 'Indica tu nombre.');
  const name = value.trim().normalize('NFC');
  requireThat(name.length >= 1 && name.length <= 32 && !/[\p{C}<>]/u.test(name), 'NAME', 'Usa entre 1 y 32 caracteres visibles, sin etiquetas.');
  return name;
}
export function roomCode(value) {
  const code = typeof value === 'string' ? value.toUpperCase() : '';
  requireThat(CODE_PATTERN.test(code), 'CODE', 'Código de sala inválido.');
  return code;
}
export function credential(value) {
  requireThat(typeof value === 'string' && TOKEN_PATTERN.test(value), 'AUTH', 'Credencial no válida.', 401);
  return value;
}
export function commandEnvelope(value, code) {
  requireThat(value && typeof value === 'object' && !Array.isArray(value), 'MESSAGE', 'Mensaje inválido.');
  requireThat(value.protocolVersion === PROTOCOL_VERSION, 'VERSION', 'Actualiza el cliente para usar este protocolo.', 409);
  requireThat(value.roomId === code, 'ROOM', 'El mensaje corresponde a otra sala.');
  requireThat(typeof value.actionId === 'string' && /^[A-Za-z0-9_-]{16,80}$/.test(value.actionId), 'ACTION_ID', 'Identificador de acción inválido.');
  requireThat(Number.isSafeInteger(value.expectedRevision) && value.expectedRevision >= 0, 'REVISION', 'Revisión inválida.');
  requireThat(typeof value.type === 'string' && value.type.length <= 48, 'TYPE', 'Tipo de comando inválido.');
  requireThat(value.params === undefined || value.params && typeof value.params === 'object' && !Array.isArray(value.params), 'PARAMS', 'Parámetros inválidos.');
  return { actionId: value.actionId, expectedRevision: value.expectedRevision, type: value.type, params: value.params ?? {} };
}
export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
export async function digest(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
}
export function randomId() { return crypto.randomUUID(); }
export function makeCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return [...crypto.getRandomValues(new Uint8Array(10))].map(n => alphabet[n & 31]).join('');
}
export function errorMessage(error) {
  return error instanceof Fault ? { code: error.code, message: error.message } : { code: 'UNAVAILABLE', message: 'El servicio no pudo confirmar la operación. Conserva tu sesión y reintenta.' };
}
