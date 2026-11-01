import { digest, Fault, requireThat } from './protocol.mjs';
export const STAGING_ADMISSION_HEADER = 'x-cerconexo-test-admission';
export async function authorizeCreation(request, env) {
  if (env.SERVICE_MODE === 'beta-public') {
    requireThat(env.PUBLIC_CREATION === 'true', 'BETA_NOT_OPEN', 'La beta aún no admite creación pública de salas.', 409);
    return;
  }
  if (env.SERVICE_MODE !== 'beta-staging') return;
  // Explicitly closed: this candidate never opens public room creation.
  requireThat(env.PUBLIC_CREATION === 'false', 'CONFIG', 'La creación pública necesita una candidata y autorización independientes.', 503);
  const value = request.headers.get(STAGING_ADMISSION_HEADER);
  if (!/^[A-Za-z0-9_-]{43}$/.test(value ?? '') || !/^[a-f0-9]{64}$/.test(env.TEST_ADMISSION_HASH ?? ''))
    throw new Fault('BETA_NOT_OPEN', 'La beta aún no está publicada. La creación de salas está reservada a las pruebas autorizadas.', 409);
  requireThat(await digest(value) === env.TEST_ADMISSION_HASH, 'BETA_NOT_OPEN', 'La beta aún no admite creación pública de salas.', 403);
}
