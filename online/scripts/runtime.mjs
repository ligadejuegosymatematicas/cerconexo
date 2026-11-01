import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
export const root = fileURLToPath(new URL('../', import.meta.url));
export async function eventually(predicate, message, timeout = 15000) {
  const start = Date.now(); let last;
  while (Date.now() - start < timeout) {
    try { const value = await predicate(); if (value) return value; } catch (error) { if (error.fatal) throw error; last = error; }
    await delay(30);
  }
  throw new Error(`${message}${last ? ': ' + last.message : ''}`);
}
