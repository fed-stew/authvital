import express, { type Request, type Response } from 'express';
import {
  OAuthFlow,
  createServerClient,
  verifyToken,
  type SessionTokens,
} from '@authvital/server';
import type { TokenResponse } from '@authvital/shared';
import { config, jwksUri } from './config';
import { esc, jsonBlock, page } from './html';
import { decodeClaims, hasAppPermission, hasFeatureFromJwt } from './jwt';
import {
  sessionStore,
  getSessionTokens,
  serializeFlowCookie,
  readFlowCookie,
  clearFlowCookie,
  clearSessionCookie,
} from './session';
import { webhookRouter, getEvents, getIdentities } from './webhooks';

// ---------------------------------------------------------------------------
// SDK wiring
// ---------------------------------------------------------------------------

// This one BFF process uses TWO credentials that both belong to the SINGLE
// "Web BFF" app CONTAINER (slug web-bff): a public SPA credential for the
// browser login flow, and a MACHINE credential for server-to-server M2M calls.
//
// SPA credential — PKCE flow for a PUBLIC client: clientSecret is intentionally
// OMITTED. The SDK's OAuthFlow only attaches client_secret when one is
// provided, so the authorization-code + PKCE exchange works with no secret.
//
// The OAuthFlow is now built PER-REQUEST (see oauthFor below) so the redirect
// URI carries the incoming {tenant}.bff.lvh.me subdomain — that's what lets the
// IdP bind tenant_id onto the token. No module-level singleton.

// MACHINE credential of the SAME "Web BFF" app: M2M client_credentials — the
// ONLY place a secret is used (SPA credential above carries none).
//
// Surface split (matches the SDK docs / authorization-model):
//   • M2M IntegrationClient (this machineClient.integration.*) = server-side
//     AUTOMATION: writes/reads that act as the app itself (invitations,
//     licensing grants, tenant/usage reads gated on subscription ownership).
//   • Per-user ENTITLEMENT reads (checkLicense / checkLicenseFeature /
//     getAppLicensedUsers / countLicensedUsers) live on ServerClient and run on
//     the END USER's access token (tenantId derived from the JWT), NOT on M2M —
//     construct a ServerClient with the user's SessionTokens to call them.
//   • Tenant-admin UI (members/SSO/domains/billing/audit/...) is NOT an SDK
//     surface at all — it's the hosted console, reached via @authvital/core
//     deep-links (see the SPAs).
const machineClient = createServerClient({
  authVitalHost: config.avHost,
  clientId: config.machineClientId,
  clientSecret: config.machineClientSecret,
});

async function safe<T>(fn: () => Promise<T>): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Original external host (Traefik preserves Host; X-Forwarded-Host as backup). */
function getHost(req: Request): string {
  const xfh = req.headers['x-forwarded-host'];
  const host = (Array.isArray(xfh) ? xfh[0] : xfh) || req.headers.host || 'bff.lvh.me';
  return String(host);
}

/** Tenant slug from the subdomain: acme.bff.lvh.me -> 'acme'; bff.lvh.me -> null. */
function currentTenantSlug(req: Request): string | null {
  const label = getHost(req).split('.')[0];
  return label && label !== 'bff' ? label : null;
}

/**
 * Per-request PKCE flow. The redirect URI is derived from the incoming host
 * so a login on {tenant}.bff.lvh.me carries a tenant-subdomain callback,
 * which the IdP uses to bind tenant_id onto the token. On the flat host
 * (bff.lvh.me) the callback has no tenant subdomain -> org-less token.
 */
function oauthFor(req: Request): OAuthFlow {
  return new OAuthFlow({
    authVitalHost: config.avHost,
    clientId: config.clientId,
    redirectUri: `https://${getHost(req)}/api/auth/callback`,
    // offline_access is REQUIRED for the IdP to issue a refresh_token — without
    // it the token response has no refresh_token and the BFF can't silently
    // renew the session (see docs/api/oauth-endpoints.md, Scopes table).
    scope: 'openid profile email offline_access',
  });
}

/** Verify a session's access token against the IdP JWKS (validateRequest). */
async function validateRequest(tokens: SessionTokens | null) {
  if (!tokens) return { valid: false as const, reason: 'no session' };
  const result = await verifyToken(tokens.accessToken, {
    jwksUri,
    issuer: config.avHost,
    audience: config.clientId,
  });
  return result.valid
    ? { valid: true as const, claims: result.payload }
    : { valid: false as const, reason: result.error };
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

const app = express();
app.disable('x-powered-by');

// ---- OAuth: login ---------------------------------------------------------
app.get('/api/auth/login', async (req: Request, res: Response) => {
  const oauth = oauthFor(req);
  const { authorizeUrl, state, codeVerifier } = await oauth.startFlow({ appState: '/' });
  // Bind state + codeVerifier to the browser in an encrypted, httpOnly cookie.
  res.setHeader('Set-Cookie', serializeFlowCookie({ state, codeVerifier }));
  res.redirect(authorizeUrl);
});

// ---- OAuth: callback ------------------------------------------------------
app.get('/api/auth/callback', async (req: Request, res: Response) => {
  const code = String(req.query.code ?? '');
  const state = String(req.query.state ?? '');
  const flow = readFlowCookie(req.headers.cookie);

  if (!code || !flow) {
    res.status(400).send(page('Login failed', '<h1>Login failed</h1><p>Missing code or flow cookie.</p><p><a href="/">Home</a></p>'));
    return;
  }

  const oauth = oauthFor(req);
  const result = await safe(() => oauth.handleCallback(code, state, flow.state, flow.codeVerifier));
  if (!result.ok) {
    res.status(400).send(page('Login failed', `<h1>Login failed</h1><pre>${esc(result.error)}</pre><p><a href="/">Home</a></p>`));
    return;
  }

  const tokens = result.data;
  const session = sessionStore.createSession({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_in: tokens.expires_in,
    token_type: tokens.token_type ?? 'Bearer',
  } as unknown as TokenResponse);

  // Set the encrypted session cookie, and clear the transient flow cookie.
  res.setHeader('Set-Cookie', [session.setCookieHeader, clearFlowCookie()]);
  res.redirect(tokens.appState || '/');
});

// ---- OAuth: logout --------------------------------------------------------
async function handleLogout(req: Request, res: Response) {
  const tokens = getSessionTokens(req);
  if (tokens) {
    const userClient = createServerClient(
      { authVitalHost: config.avHost, clientId: config.clientId, clientSecret: '' },
      tokens,
    );
    await safe(() => userClient.revokeToken()); // best-effort revoke
  }
  res.setHeader('Set-Cookie', clearSessionCookie());
  res.redirect('/');
}
app.get('/api/auth/logout', handleLogout);
app.post('/api/auth/logout', handleLogout);

// ---- Home (server-rendered) ----------------------------------------------
app.get('/', async (req: Request, res: Response) => {
  const tokens = getSessionTokens(req);

  if (!tokens) {
    // On a TENANT subdomain, an unauthenticated visit goes straight into the
    // tenant-scoped login instead of showing a landing page. This is what makes
    // "switch org" a single click: the org-switcher links point at
    // https://<slug>.bff.lvh.me/, we bounce through /api/auth/login on that
    // subdomain (redirect URI carries the tenant subdomain -> the IdP binds
    // tenant_id), and the shared IdP session usually means no password re-entry.
    // No redirect loop: the callback returns to '/' only WITH a session (its
    // failure path renders a terminal error page, never '/').
    if (currentTenantSlug(req)) {
      res.redirect('/api/auth/login');
      return;
    }

    // Flat host (bff.lvh.me): the tenant-agnostic, org-less landing. Log in
    // here first, then pick an organization from the switcher.
    res.send(
      page('AuthVital BFF', `
      <h1>AuthVital Express BFF</h1>
      <div class="card">
        <p>You are <strong>not signed in</strong> — this is the tenant-agnostic landing host.</p>
        <a class="btn" href="/api/auth/login">Log in (PKCE)</a>
      </div>
      <p class="muted">Public client <code>${esc(config.clientId)}</code> · PKCE · no client secret. After login, pick an organization to get a tenant-scoped session.</p>`),
    );
    return;
  }

  const validation = await validateRequest(tokens);
  const claims = decodeClaims(tokens.accessToken);
  const sub = claims?.sub ?? '';
  const tenantId = claims?.tenant_id;

  const userClient = createServerClient(
    { authVitalHost: config.avHost, clientId: config.clientId, clientSecret: '' },
    tokens,
  );

  // getCurrentUser (user-scoped) + Integration API calls (M2M / machine client).
  const [me, memberships, invitations, licenses, usage] = await Promise.all([
    safe(() => userClient.getCurrentUser()),
    safe(() => machineClient.integration.listUserTenants({ userId: sub })),
    tenantId ? safe(() => machineClient.integration.listInvitations({ tenantId })) : Promise.resolve({ ok: false as const, error: 'no tenant_id on token — pick an organization above for a tenant-scoped session' }),
    tenantId ? safe(() => machineClient.integration.getUserLicenses({ userId: sub, tenantId })) : Promise.resolve({ ok: false as const, error: 'no tenant_id on token — pick an organization above for a tenant-scoped session' }),
    tenantId ? safe(() => machineClient.integration.getUsageOverview({ tenantId })) : Promise.resolve({ ok: false as const, error: 'no tenant_id on token — pick an organization above for a tenant-scoped session' }),
  ]);

  const curSlug = currentTenantSlug(req);
  const tenantList =
    memberships.ok && memberships.data && Array.isArray((memberships.data as { memberships?: unknown }).memberships)
      ? ((memberships.data as { memberships: Array<{ tenant: { slug: string; name: string } }> }).memberships)
      : [];

  const orgLinks = tenantList
    .map((m) => {
      const s = m.tenant.slug;
      const isCur = s === curSlug;
      return `<a class="btn" href="https://${esc(s)}.bff.lvh.me/"${isCur ? ' style="opacity:.5;pointer-events:none"' : ''}>${esc(m.tenant.name)} (${esc(s)})${isCur ? ' — current' : ''}</a>`;
    })
    .join(' ');

  const orgCard = `
  <div class="card">
    <h2>Organization</h2>
    ${curSlug
      ? `<p>Scoped to <strong>${esc(curSlug)}</strong>${tenantId ? '' : ' <span class="muted">(no tenant_id on token yet — log out and back in on this subdomain)</span>'}.</p>`
      : `<p class="muted">You're on the tenant-agnostic host <code>bff.lvh.me</code>, so the token is <strong>org-less</strong>. This is a B2B IdP — pick an organization to get a tenant-scoped session:</p>`}
    <p>${orgLinks || '<span class="muted">No tenants for this user.</span>'}</p>
    <p class="muted">Each org is its own subdomain. Switching orgs = switching subdomain + a fresh tenant-scoped login (independent session per org).</p>
  </div>`;

  const section = (label: string, r: { ok: true; data: unknown } | { ok: false; error: string }) =>
    r.ok ? jsonBlock(label, r.data) : `<h3>${esc(label)}</h3><p class="muted">unavailable: ${esc(r.error)}</p>`;

  res.send(
    page('AuthVital BFF', `
    <h1>AuthVital Express BFF</h1>
    <div class="card">
      <p>Signed in as <strong>${esc(claims?.email ?? sub)}</strong></p>
      <p class="muted">Token signature: ${validation.valid ? 'VALID' : 'INVALID (' + esc(('reason' in validation && validation.reason) || '') + ')'}</p>
      <a class="btn" href="/api/auth/logout">Log out</a>
    </div>

    ${orgCard}

    <div class="card">
      <h2>Validated claims</h2>
      ${jsonBlock('app_roles / app_permissions / tenant_roles / license', {
        app_roles: claims?.app_roles,
        app_permissions: claims?.app_permissions,
        tenant_roles: claims?.tenant_roles,
        tenant_id: claims?.tenant_id,
        license: claims?.license,
      })}
      ${section('getCurrentUser()', me)}
    </div>

    <div class="card">
      <h2>Integration API (M2M)</h2>
      ${section('memberships.listTenantsForUser -> listUserTenants', memberships)}
      ${section('invitations.listPending -> listInvitations', invitations)}
      ${section('licenses.listForUser -> getUserLicenses', licenses)}
      ${section('licenses usage overview -> getUsageOverview', usage)}
    </div>

    <div class="card">
      <h2>Try it</h2>
      <a class="btn" href="/api/protected">/api/protected</a>
      <a class="btn" href="/api/permission?permission=content:edit">/api/permission?permission=content:edit</a>
      <a class="btn" href="/api/m2m">/api/m2m</a>
      <a class="btn" href="/events">/events (webhooks)</a>
    </div>`),
  );
});

// ---- Protected JSON (validateRequest demo) --------------------------------
app.get('/api/protected', async (req: Request, res: Response) => {
  const validation = await validateRequest(getSessionTokens(req));
  if (!validation.valid) {
    res.status(401).json({ error: 'Unauthorized', reason: validation.reason });
    return;
  }
  res.json({ ok: true, sub: validation.claims.sub, claims: validation.claims });
});

// ---- Permission / feature demo -------------------------------------------
app.get('/api/permission', (req: Request, res: Response) => {
  const tokens = getSessionTokens(req);
  if (!tokens) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const claims = decodeClaims(tokens.accessToken);
  const permission = req.query.permission ? String(req.query.permission) : undefined;
  const feature = req.query.feature ? String(req.query.feature) : undefined;

  const checks: Record<string, unknown> = {};
  if (permission) checks.permission = { permission, allowed: hasAppPermission(claims, permission) };
  if (feature) checks.feature = { feature, allowed: hasFeatureFromJwt(claims, feature) };
  if (!permission && !feature) {
    res.status(400).json({ error: 'Provide ?permission=... and/or ?feature=...' });
    return;
  }
  res.json(checks);
});

// ---- M2M demo (client_credentials) ---------------------------------------
app.get('/api/m2m', async (_req: Request, res: Response) => {
  const token = await machineClient.getClientCredentialsToken();
  if (!token) {
    res.status(502).json({ error: 'Failed to obtain M2M token' });
    return;
  }
  // Sanitized: NEVER return the raw token. Decode only to surface metadata.
  const claims = decodeClaims(token);
  res.json({
    via: 'SDK client_credentials (machineClient.getClientCredentialsToken)',
    token_type: 'Bearer',
    token_preview: `${token.slice(0, 8)}...`,
    scopes: claims?.scope ?? null,
    subject: claims?.sub ?? null,
    expires_at: typeof claims?.exp === 'number' ? new Date(claims.exp * 1000).toISOString() : null,
  });
});

// ---- Webhooks (raw body for signature verification) -----------------------
app.post('/webhooks', express.raw({ type: '*/*' }), async (req: Request, res: Response) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body ?? '');
  const result = await webhookRouter.receive(req.headers, rawBody);
  // 200 for authentic events; 400 for unverified (so a tester sees the check work).
  res.status(result.verified ? 200 : 400).json({ received: true, ...result });
});

// ---- Events viewer --------------------------------------------------------
// ⚠️ SECURITY: this page renders captured webhook payloads and identity PII
// (emails, memberships, licenses). It MUST stay behind a valid session — and
// even authenticated, it's a demo-only viewer. Never expose anything like
// this in production.
app.get('/events', async (req: Request, res: Response) => {
  const validation = await validateRequest(getSessionTokens(req));
  if (!validation.valid) {
    res.status(401).send(
      page('Sign in first', `
      <h1>Sign in first</h1>
      <div class="card">
        <p>The <code>/events</code> viewer shows captured webhook payloads and
        identity PII, so it requires a signed-in session
        (<span class="muted">${esc(validation.reason)}</span>).</p>
        <a class="btn" href="/api/auth/login">Log in (PKCE)</a>
      </div>`),
    );
    return;
  }

  const events = getEvents();
  const identities = getIdentities();

  const eventRows = events.length
    ? events.map((e) => `<tr>
        <td>${esc(e.receivedAt)}</td>
        <td><code>${esc(e.type)}</code></td>
        <td>${e.verified ? 'yes' : 'NO'}</td>
        <td>${esc(e.summary)}</td>
      </tr>`).join('')
    : '<tr><td colspan="4" class="muted">No webhooks captured yet. The Web BFF webhook is seeded (http://bff-express:3000/webhooks) — trigger an event for the Web BFF app (e.g. sign a user up scoped to it, or change an acme member Alice has access to) and it will appear here, verified via JWKS.</td></tr>';

  const identityRows = identities.length
    ? identities.map((i) => `<tr>
        <td><code>${esc(i.sub)}</code></td>
        <td>${esc(i.email ?? '')}</td>
        <td>${esc(i.status)}</td>
        <td>${esc(JSON.stringify(i.memberships))}</td>
        <td>${esc(i.licenses.map((l) => l.name).join(', '))}</td>
      </tr>`).join('')
    : '<tr><td colspan="5" class="muted">No identities synced yet.</td></tr>';

  res.send(
    page('Webhook events', `
    <div class="card" style="border-color:#b45309;background:#3b2410">
      <strong>⚠️ Demo viewer — exposes webhook PII; never expose in production.</strong>
    </div>
    <h1>Captured webhook events</h1>
    <p class="muted">Verified via JWKS (${esc(jwksUri)}). Newest first. In-memory only.</p>
    <table>
      <thead><tr><th>Received</th><th>Type</th><th>Verified</th><th>Summary</th></tr></thead>
      <tbody>${eventRows}</tbody>
    </table>

    <h2>In-memory identities</h2>
    <table>
      <thead><tr><th>sub</th><th>email</th><th>status</th><th>memberships</th><th>licenses</th></tr></thead>
      <tbody>${identityRows}</tbody>
    </table>`),
  );
});

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[bff-express] listening on :${config.port} (IdP ${config.avHost})`);
});
