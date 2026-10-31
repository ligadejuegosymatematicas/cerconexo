// Local laboratory only. No token, account identifier or production endpoint.
export const API_BASE = location.port === '8790' ? 'http://127.0.0.1:8787' : location.origin;
