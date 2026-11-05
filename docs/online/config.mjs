// Public backend; the established daily room admission limit remains in force.
export const API_BASE = 'https://cerconexo-m6-beta-staging.cerconexo-piloto-h89.workers.dev';
// Merge the Pages release only once the public backend advertises duo-online.
export const ARENA_DUO_ENABLED = true;
// Enable only with a backend that accepts Arena rooms with two players.
export const ARENA_1V1_ENABLED = true;
// Enable only with the authoritative four-team backend deployed and verified.
export const ARENA_FFA_ENABLED = true;
// Enabled after verifying the authoritative four-team backend and recovery.
export const CLASSIC_FFA_ENABLED = true;
