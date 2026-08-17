// Central place for the two env knobs this SPA needs. Falls back to the
// documented local-dev defaults so `vite dev` works even without a .env.
export const AV_HOST = import.meta.env.VITE_AV_HOST ?? 'https://auth.lvh.me';
export const AV_CLIENT_ID = import.meta.env.VITE_AV_CLIENT_ID ?? 'local-spa-client-id';

// App display name (matches the seeded application "My Local App").
export const APP_NAME = 'My Local App';

// The app role (from the JWT `app_roles` claim) that unlocks the admin card.
export const ADMIN_APP_ROLE = 'admin';
