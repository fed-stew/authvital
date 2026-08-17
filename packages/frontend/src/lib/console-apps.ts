/**
 * Shared helpers for the in-console app/product switcher.
 *
 * AppPicker.tsx and OrgPicker.tsx historically inlined these same `fetch`
 * calls against /api/auth/apps and /api/auth/me. This module is the single
 * source of truth for that shape so the console chrome switcher and the auth
 * pickers can't drift (DRY).
 */

const API_URL = import.meta.env.VITE_API_URL || window.location.origin;

export interface ConsoleApp {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  clientId: string;
  initiateLoginUri: string | null;
  brandingLogoUrl: string | null;
  brandingIconUrl: string | null;
  brandingPrimaryColor: string | null;
}

export interface ConsoleMembership {
  id: string;
  tenant: { id: string; name: string; slug: string };
}

/**
 * Fetch the applications the signed-in user can launch. Returns `null` when the
 * caller isn't authenticated (so the UI can hide the switcher instead of
 * bouncing them to login mid-session).
 */
export async function fetchConsoleApps(): Promise<ConsoleApp[] | null> {
  const res = await fetch(`${API_URL}/api/auth/apps`, { credentials: 'include' });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.authenticated) return null;
  return (data.applications ?? []) as ConsoleApp[];
}

/**
 * Fetch the signed-in user's org memberships (for the org switcher).
 * Returns `null` when not authenticated.
 */
export async function fetchConsoleMemberships(): Promise<ConsoleMembership[] | null> {
  const res = await fetch(`${API_URL}/api/auth/me`, { credentials: 'include' });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.authenticated) return null;
  return (data.memberships ?? []) as ConsoleMembership[];
}

/**
 * Redirect the browser to an application's login entry point. When the app's
 * initiateLoginUri is tenant-templated ({tenant}) but no slug is available, we
 * can't build a valid host (it would yield "https://.bff.lvh.me"), so we send
 * the user to the org-picker to choose a tenant. Falls back to the org-picker
 * too when the app has no initiateLoginUri configured. Mirrors
 * AppPicker.handleSelectApp.
 */
export function launchApp(app: ConsoleApp, tenantSlug?: string): void {
  if (app.initiateLoginUri) {
    // Tenant-templated URI but no slug available -> we can't build a valid
    // host (would yield "https://.bff.lvh.me"). Let the user pick a tenant.
    if (app.initiateLoginUri.includes('{tenant}') && !tenantSlug) {
      window.location.href = `/auth/org-picker?client_id=${encodeURIComponent(app.clientId)}`;
      return;
    }
    window.location.href = app.initiateLoginUri.replace('{tenant}', tenantSlug ?? '');
    return;
  }
  window.location.href = `/auth/org-picker?client_id=${encodeURIComponent(app.clientId)}`;
}
