// Env config with documented local-dev fallbacks. web-bff is a PUBLIC/SPA
// client: it runs the OAuth code+PKCE flow with NO client secret.
function env(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.length > 0 ? value : fallback;
}

// Documented local-dev fallbacks — fine for dev, fatal in production.
const DEV_SESSION_SECRET = 'dev-only-insecure-session-secret-change-me-please';
const DEV_MACHINE_CLIENT_SECRET = 'local-machine-secret-key';

export const config = {
  avHost: env('AV_HOST', 'https://auth.lvh.me'),
  clientId: env('AV_CLIENT_ID', 'web-bff-client-id'),
  redirectUri: env('AV_REDIRECT_URI', 'https://bff.lvh.me/api/auth/callback'),
  // AES-256-GCM key for the session cookie — must be >= 32 chars.
  sessionSecret: env('SESSION_SECRET', DEV_SESSION_SECRET),
  // M2M (client_credentials) client — the ONLY place a client secret lives.
  machineClientId: env('AV_MACHINE_CLIENT_ID', 'local-machine-client-id'),
  machineClientSecret: env('AV_MACHINE_CLIENT_SECRET', DEV_MACHINE_CLIENT_SECRET),
  port: Number(process.env.PORT ?? 3000),
  // Served over HTTPS via Traefik, so Secure cookies are correct.
  isProduction: true,
};

// Refuse to boot in production with the well-known dev fallback secrets —
// shipping these would mean anyone reading this repo can forge sessions.
if (process.env.NODE_ENV === 'production') {
  if (config.sessionSecret === DEV_SESSION_SECRET) {
    throw new Error(
      'FATAL: SESSION_SECRET is the documented dev fallback. Set a strong, unique SESSION_SECRET in production.',
    );
  }
  if (config.machineClientSecret === DEV_MACHINE_CLIENT_SECRET) {
    throw new Error(
      'FATAL: AV_MACHINE_CLIENT_SECRET is the documented dev fallback. Set the real machine client secret in production.',
    );
  }
}

export const jwksUri = `${config.avHost}/.well-known/jwks.json`;
