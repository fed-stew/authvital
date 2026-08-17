# Authorization Model & SDK Surface (hosted-first)

> **Status:** Reference / design spec. Every row below was verified against
> source (`integration.ts`, `server-client.ts`, the browser React SDK,
> `@authvital/core` URL helpers, backend controllers + their guards, and
> `packages/shared/src/constants/permissions.ts`). AuthVital is **hosted-first**:
> tenant administration lives in the AuthVital-hosted console, and the SDK's job
> is narrower than in earlier drafts. Where a capability is not reachable cleanly
> today it is listed in the gap appendix (§6).

## 1. Purpose & audience — three surfaces, one boundary

This document answers one question for every capability:

> **"Which surface owns this — the hosted console, the customer SDK, or the
> Super-Admin platform?"**

AuthVital, like Atlassian's admin experience, is **hosted-first**. There are
**three** surfaces, and keeping them straight is the whole point of this page:

1. **The hosted console (`/tenant/:tenantId/*`).** The canonical, AuthVital-built
   UI where your B2B customers manage **users, app/product access, SSO, domains,
   licenses, billing, and audit — across all their apps** — plus an in-console
   app/org switcher and a per-user `/account/settings` page. Your customers get
   this **out of the box**; you do not build or ship it.
2. **The customer SDK (`@authvital/browser`, `@authvital/server`,
   `@authvital/core`).** What app code legitimately does: **auth + JWT claims**,
   **permission/feature GATING** (browser + server), **entitlement reads**
   (user-token), **M2M automation** (server-to-server writes), and **deep-links
   into the hosted console**. The SDK deliberately does **not** re-implement the
   tenant-admin UI.
3. **The Super-Admin platform (`/admin`, `SuperAdminGuard`).** What **you**, the
   SaaS owner operating AuthVital, configure: Applications (OAuth clients),
   license **types**/plans/prices, instance settings & branding, system
   webhooks, pub/sub, signing keys, super-admin accounts. **Never** in the
   customer SDK — different trust boundary.

**Who reads what:**

- **You (SaaS owner):** §"Super-Admin platform" tells you what only *you*
  configure. The hosted console gives your customers self-service on top.
- **Integrators (app devs):** the SDK surface (§5 "SDK" column) is auth + gating
  + entitlement reads + M2M automation + deep-links — and nothing more.

The golden rule still holds: **an SDK method is only a convenience wrapper around
a backend guard.** No tenant-scoped guard ⇒ no SDK method. For tenant-admin
*UI*, the paved path is a **deep-link into the hosted console**, not an SDK CRUD
call.

## 2. The four authority tiers

| Tier | Who | Where it lives | In the customer SDK? |
|------|-----|----------------|----------------------|
| **T1 — Platform / Service Provider** | You, operating AuthVital | Super-Admin `/admin` (`SuperAdminGuard`, `super_admin` token) | **Never.** Different trust boundary. |
| **T2 — Tenant Admin** | Your customer's owner / admin / billing-admin | **Hosted console `/tenant/:tenantId/*`** over `/api/tenants/:tenantId/*` (`JwtAuthGuard + TenantIdentifierGuard + TenantAccessGuard + PermissionGuard`) | **UI = hosted console.** SDK role = **deep-link into it** + **gating** + **M2M automation**. |
| **T3 — End User (self)** | Any authenticated human, as themselves | `/api/oauth/*` (`OAuthTokenGuard`), `/api/auth/*` (`JwtAuthGuard`), `/account/settings` | **Yes** (the browser SDK is essentially the T3 surface). |
| **T4 — Machine / M2M** | Your product's backend acting *as itself* | `/api/integration/*` (`M2MAuthGuard`, `client_credentials`) | **Yes**, server-only (`IntegrationClient`). |

### T2 — Tenant Admin (hosted-first)
Self-service *within the caller's own tenant*: members & invitations, app/product
access, SSO config, domains, buying/assigning seats, billing, and audit. The
**canonical surface is the hosted console** — every page listed in §5 is a real
route under `/tenant/:tenantId/*`. **Verified enforcement:** `TenantAccessGuard`
derives `tenantId` **from the URL**, confirms an `ACTIVE`/`INVITED` membership,
attaches fresh DB-derived `tenantPermissions`; `PermissionGuard` enforces the
per-route `@RequirePermission(...)`. The server never trusts a client-supplied
`tenantId` here.

**What the SDK does for T2:** it does **not** re-implement these screens. It
(a) **deep-links** into them with `@authvital/core` (`getManagementUrls`,
pickers, `getAccountSettingsUrl`), (b) **gates** app UI/routes on claims &
`hasPermission`, and (c) drives **M2M automation** of the same operations from
your backend when you need to (e.g. programmatic invites, license grants).

### T1 · T3 · T4
- **T1** — Applications, license *types*, instance settings/branding, webhooks,
  pub/sub, keys, super-admin accounts. `SuperAdminGuard`, `super_admin` token.
  Separate trust boundary — **must not** appear in the customer SDK.
- **T3** — Own profile, own sessions, "which tenants am I in", accepting
  invitations, and the hosted `/account/settings` page.
- **T4** — Your backend as itself via `client_credentials`. `M2MAuthGuard`
  requires `token_type === 'm2m'` + `client_id`; integration controllers also
  `validateTenantAccess()` (app must hold an active subscription for the target
  tenant). M2M **trusts the `tenantId` in the body/query** and gates on
  *subscription ownership*, not a user permission — powerful, deliberately
  server-only.

## 3. The permission model (verified)

Source of truth: `packages/shared/src/constants/permissions.ts`
(`TENANT_PERMISSIONS` + the per-role arrays). Owner holds `tenant:*` (all).

| Permission | Owner | Admin | Billing Admin | Member |
|------------|:---:|:---:|:---:|:---:|
| `tenant:view` | Yes | Yes | Yes | Yes |
| `tenant:manage` | Yes | Yes | — | — |
| `tenant:delete` | Yes | — | — | — |
| `members:view` | Yes | Yes | Yes | Yes |
| `members:invite` | Yes | Yes | — | — |
| `members:remove` | Yes | Yes | — | — |
| `members:manage-roles` | Yes | Yes | — | — |
| `licenses:view` | Yes | Yes | Yes | Yes |
| `licenses:manage` | Yes | Yes | Yes | — |
| `licenses:provision` | Yes | — | Yes | — |
| `service-accounts:view` | Yes | Yes | — | — |
| `service-accounts:manage` | Yes | Yes | — | — |
| `domains:view` | Yes | Yes | — | — |
| `domains:manage` | Yes | Yes | — | — |
| `billing:view` | Yes | Yes | Yes | — |
| `billing:manage` | Yes | — | Yes | — |
| `app-access:view` | Yes | Yes | Yes | Yes |
| `app-access:manage` | Yes | Yes | Yes | — |
| `tenant:sso:manage` | Yes | Yes | — | — |
| **`audit:view`** | Yes | Yes | — | — |
| **`audit:export`** | Yes | — | — | — |

> **Deliberate tiering.** Only **Billing Admin** (and Owner) holds
> `licenses:provision` + `billing:manage`. **Admin** has `billing:view` but not
> `billing:manage` — Admin can *see* the money, not *move* it. **`audit:view`**
> is granted to **Owner + Admin** (compliance/security flavour). **`audit:export`**
> (CSV) is a heavier, exfil-adjacent capability granted to **Owner only** —
> assign it explicitly to anyone else.

## 4. Design principles

1. **The backend controller guard is the real gate.** An SDK method is only a
   wrapper. `ServerClient.hasPermission()` is fail-closed and **delegates** to
   `POST /api/integration/check-permission` (identity read from the access
   token), returning `false` on any error. The browser `usePermissions()` hook
   reads `tenant_permissions` **claims** for UI gating only — never enforcement.
2. **Tenant-scoping is mandatory for T2.** `TenantAccessGuard` derives `tenantId`
   from the URL and verifies membership; `PermissionGuard.checkTenantIdMatch()`
   rejects any body/query/param `tenantId` that differs from the JWT. This is the
   block that stops the `owner@otherco` IDOR.
3. **T1 operations never appear in the customer SDK** — different token type,
   different trust boundary.
4. **Tenant-admin UI = hosted console, not SDK CRUD.** For humans, the paved path
   is a deep-link into `/tenant/:tenantId/*`. Use the SDK's M2M `IntegrationClient`
   only for *programmatic automation* from your own backend.
5. **License TYPE definition (T1) ≠ subscription purchase + seat assignment
   (T2).** Defining what a "Pro seat" is and what it costs is a platform act
   (`SuperAdminGuard`); buying seats and assigning them is a tenant act
   (`licenses:provision` / `licenses:manage`), done in the console.

## 5. Master surface matrix

**Column legend**
- **Console page / route:** the hosted-console UI (T2), with its route and
  gating permission.
- **Backend:** the guarded REST endpoint(s) behind it.
- **SDK:** how the SDK relates — `gating`, `entitlement read (ServerClient)`,
  `M2M (IntegrationClient)`, `deep-link (@authvital/core)`, or `—` (none).

### Members & invitations

| Capability | Console page · route · perm | Backend | SDK | Status |
|---|---|---|---|---|
| List / view members | **Members** · `/tenant/:id/members` · `members:view` | `GET /api/tenants/:id/members` | M2M `listTenantMembers`; deep-link `getMembersUrl` | Implemented |
| Invite member | **Members** · `members:invite` | `POST /api/tenants/:id/members/invite`; M2M `POST /api/integration/invite` | M2M `sendInvitation({tenantId,email,roleId,clientId?,expiresInDays?,…})`; deep-link | Implemented |
| Resend / revoke invite | **Members** · `members:invite` | `/api/integration/invitation/:id/resend`, `DELETE .../invitation/:id` | M2M `resendInvitation`→`{expiresAt}`, `revokeInvitation`→`{success,message}` | Implemented |
| Remove member | **Members** · `members:remove` | `DELETE /api/tenants/:id/members/:membershipId` | deep-link | Implemented |
| Set member's **app** role | **Members** / **App users** · `members:manage-roles` | `POST /api/integration/set-member-role` | M2M `setMemberRole({membershipId,roleId,applicationId})` (`roleId` = an **app Role** id) | Implemented |
| App-access grant/manage | **Applications** / **Access matrix** · `/tenant/:id/applications`, `/access-matrix` · `app-access:view`/`:manage` | `/api/tenants/:id/members/apps/*`; `GET /api/tenants/:id/app-access-matrix` | deep-link `getApplicationsUrl`/`getAccessMatrixUrl` | Implemented |

### Licenses & billing

| Capability | Console page · route · perm | Backend | SDK | Status |
|---|---|---|---|---|
| License overview / seats | **Licenses** · `/tenant/:id/licenses` · `licenses:view` | `GET /api/tenants/:id/licenses/overview`; M2M `usage-overview` | M2M `getUsageOverview`; deep-link `getLicensesUrl` | Implemented |
| Grant / revoke / change seat | **Licenses** · `licenses:manage` | `POST /api/tenants/:id/licenses/{grant,revoke,change}`; M2M grant/revoke/change | M2M `grantLicense`/`revokeLicense`/`changeLicenseType`; deep-link | Implemented |
| Provision / resize / cancel subscription | **Billing** · `/tenant/:id/billing` · `licenses:provision` | `POST /api/tenants/:id/licenses/subscriptions`, `PATCH .../:subId/quantity`, `POST .../:subId/cancel` (`assertSubscriptionInTenant`) | deep-link `getBillingUrl` | Implemented (console) |
| Billing overview | **Billing** · `billing:view` | subscriptions + usage reads | deep-link `getBillingUrl` | Implemented (console) |
| **Usage trends** (time series) | **Billing / Usage** · `billing:view` | `GET /api/tenants/:id/licenses/usage-trends?days=` | deep-link; or `client.get(...)` | Implemented |
| Per-user entitlement read | (used by app code) · `licenses:view` (JWT) | `GET /api/integration/licenses/*` (JwtAuthGuard) | **entitlement read (ServerClient, user token, no `tenantId`)**: `checkLicense`, `checkLicenseFeature`, `getAppLicensedUsers`, `countLicensedUsers` | Implemented |
| Tenant feature / seat / subscription check | (automation) | `GET /api/integration/{check-feature,check-seats,subscription-status}` | M2M `checkFeature({tenantId,feature})`, `checkSeats`, `getSubscriptionStatus` | Implemented |
| Define license **TYPE** / price | **Super-Admin** (T1) | `LicenseAdminController` | **never in SDK** | Implemented (T1) |

### SSO · Domains

| Capability | Console page · route · perm | Backend | SDK | Status |
|---|---|---|---|---|
| Configure tenant SSO | **SSO** · `/tenant/:id/sso` · `tenant:sso:manage` | `GET/PUT/DELETE /api/tenants/:id/sso/config[/:provider]` | deep-link `getSsoUrl` | Implemented |
| Manage domains | **Domains** · `/tenant/:id/domains` · `domains:view`/`:manage` | `/api/tenants/:id/domains*` (register/verify/delete) | deep-link `getDomainsUrl` | Implemented |
| Instance SSO providers | **Super-Admin** (T1) | `SuperAdminSsoController` | never in SDK | Implemented (T1) |

### Audit

| Capability | Console page · route · perm | Backend | SDK | Status |
|---|---|---|---|---|
| Read tenant audit log | **Audit** · `/tenant/:id/audit` · `audit:view` | `GET /api/tenants/:id/audit` (paginated/filterable) | deep-link `getAuditUrl` | Implemented |
| Export audit log (CSV) | **Audit** · `audit:export` | `GET /api/tenants/:id/audit/export` | deep-link | Implemented |

### Tenant settings · Account · Switchers

| Capability | Console page · route · perm | SDK | Status |
|---|---|---|---|
| Tenant settings | **General** · `/tenant/:id/general` · `tenant:view`/`:manage` | deep-link `getSettingsUrl` | Implemented |
| Per-user account (profile/security/orgs/sessions) | **Account** · `/account/settings` (T3) | deep-link `getAccountSettingsUrl` | Implemented |
| Switch app / switch org | `/auth/app-picker`, `/auth/org-picker` | deep-link `getAppPickerUrl`/`getOrgPickerUrl` | Implemented |

### End-user (self) & permissions — SDK surface

| Capability | Surface | SDK | Status |
|---|---|---|---|
| Login/signup/logout/callback/refresh/silent-auth | browser | core browser SDK | Implemented |
| Profile / which tenants am I in | `GET /api/oauth/{userinfo,tenants}`, `GET /api/users/me` | `getCurrentUser()`; browser `getUser()` | Implemented |
| Sessions list / revoke | `GET/POST /api/oauth/sessions*` (`OAuthTokenGuard`) | browser session monitoring; REST | Implemented |
| Client-side gating | claims | browser `usePermissions()` (**UI only**) | Implemented |
| Server-side gating | `POST /api/integration/check-permission` | `ServerClient.hasPermission()` (fail-closed) | Implemented |
| Check one/many/all permissions | M2M | `checkPermission`/`checkPermissions`/`getUserPermissions` | Implemented |

### Platform (T1) — never in the customer SDK

Application (OAuth client) CRUD, application-role CRUD, license-type/price
definition, instance settings/meta/branding, instance API keys, system webhooks,
pub/sub, signing keys, super-admin accounts, cross-tenant super-admin tenant
management. All `SuperAdminGuard`, `super_admin` token. **Must not** ship in the
customer SDK.

## 6. Gap remediation appendix (what's actually still open)

The tenant-admin surfaces above are now **implemented in the hosted console**.
What remains open are the Phase 4a/4b follow-ups:

| # | Gap | Detail (verified) | Where |
|---|-----|--------------------|-------|
| 1 | **Deferred audit instrumentation** | The audit read/export exist, but only `member.*`, `invite.*`, `app_access.*`, `license.*` actions are emitted (`audit-actions.ts`). **Subscription, SSO, domain and tenant-settings mutations do not yet write audit rows**, so they won't appear in the log/export. | backend services (emit points) |
| 2 | **Usage-trends backfill + scheduling** | `GET .../licenses/usage-trends` reads **daily seat snapshots**; there is no historical **backfill** and the per-environment **snapshot job scheduling** isn't wired, so trends are sparse/empty until snapshots accrue. | `license-usage.service` + lifecycle job |
| 3 | **`LicenseType.displayPrice` not surfaced** | The field exists on the `LicenseType` model (`display_price`) but is **not read anywhere in `src`** — the subscription/billing mapping never returns it, so the Billing page can't show a price. | subscription mapping |
| 4 | **Account page: sessions + profile** | `/account/settings` lists active sessions via `/api/oauth/sessions` (guarded by `OAuthTokenGuard`), which may **reject the console's `JwtAuthGuard` token** — the page degrades to a friendly note. There is also **no profile-update endpoint**, so profile is read-only. | `AccountSettingsPage` + auth guards |
| 5 | **Invoices / payments unmodeled** | The Billing page surfaces subscriptions + usage, but **invoices and payment methods are not modeled** — there is no invoice/payment data source yet. | billing domain |

> **Pre-existing (non-Phase) gap:** tenant-scoped **branding** (read/update per
> tenant) still has no model/endpoint — instance/app branding remains T1 only.

## 7. What could NOT be exhaustively verified

- **`resolveEffectiveTenantPermissions` owner "god-mode" expansion** — read call
  sites/comments, not the util body line-by-line.
- **Exact request/response schemas for the T1 ts-rest contracts** (applications,
  license-types, instance, webhooks, pubsub) beyond paths + `SuperAdminGuard`.
- **Runtime confirmation** that every console page's data loads end-to-end under
  its stated guard — routes/guards/permissions were verified statically from the
  controllers and `App.tsx`.
