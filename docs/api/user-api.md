# User API Reference

> REST endpoints for the **current authenticated user**.

!!! danger "The old `/api/users/me/*` surface does not exist"
    Earlier drafts documented a full `/api/users/me` CRUD API (profile GET/PATCH,
    password change, session list/revoke, SSO link/unlink, email change, account
    deletion). **There is no `users` controller in the backend** — none of those
    routes exist. This page now lists the endpoints that are actually served
    (verified against `packages/backend/src`).

    Note: the SDK's `ServerClient.getCurrentUser()` now correctly calls
    `GET /api/auth/me` (the `{ authenticated, user }` envelope) and returns the
    corrected `User` shape from `@authvital/shared` — named OIDC-claim fields
    (`id`, `email` (nullable), `displayName`, `givenName`, `familyName`,
    `pictureUrl`, …), **not** the old fictional `profile` blob. You can still
    read the claims directly from the access token if you prefer.

## Endpoints Overview

| Endpoint | Method | Description | Controller |
|----------|--------|-------------|-----------|
| `/api/auth/me` | GET | Current user (with memberships) | `auth.controller` |
| `/api/auth/profile` | GET | Current user's profile | `auth.controller` |
| `/oauth/userinfo` | GET | OIDC UserInfo (Bearer token) | `oauth-session.controller` |
| `/oauth/tenants` | GET | Tenants the user belongs to | `oauth-session.controller` |
| `/oauth/sessions` | GET | List active sessions | `oauth-session.controller` |
| `/oauth/sessions/:sessionId/revoke` | POST | Revoke a specific session | `oauth-session.controller` |
| `/oauth/logout` | POST | End the current session | `oauth-session.controller` |
| `/oauth/logout-all` | POST | End all of the user's sessions | `oauth-session.controller` |

MFA management for the current user lives under `/api/auth/mfa/*` — see the
[Authentication API](./authentication.md). Password changes are done via the
**reset** flow (`/api/auth/forgot-password` → `/api/auth/reset-password`); there
is no self-service "change password while logged in" REST endpoint.

!!! note "`/oauth/*` is not under `/api`"
    OAuth/session endpoints are excluded from the global `/api` prefix — call them
    at `${AV_HOST}/oauth/...`.

---

## Get Current User

### GET /api/auth/me

**Headers:** `Authorization: Bearer <access_token>` (or the session cookie).

Returns the authenticated user together with their tenant memberships. (Exact
field set is defined by `AuthService.getMe`/`getProfile`.)

### GET /api/auth/profile

Returns the current user's profile (`AuthService.getProfile`).

### GET /oauth/userinfo

Standard OIDC UserInfo endpoint. Claims returned depend on the granted scopes
(`profile`, `email`). See [JWT Claims](../reference/jwt-claims.md).

---

## Tenants

### GET /oauth/tenants

Returns the tenants the authenticated user is a member of.

---

## Sessions

### GET /oauth/sessions

List the user's active sessions.

### POST /oauth/sessions/:sessionId/revoke

Revoke a single session (log out that device).

### POST /oauth/logout

End the current session (clears session cookies / revokes the current refresh
token).

### POST /oauth/logout-all

End all of the user's sessions.

---

## Not provided as REST endpoints

The following were documented before but are **not** implemented in the backend.
Don't build against them:

- Profile update (`PATCH /api/users/me`)
- Self-service password change (`POST /api/users/me/password`)
- SSO account linking/unlinking (`/api/users/me/sso*`) — the `auth/sso`
  controller only handles **login** (`GET /api/auth/sso/providers`,
  `GET /api/auth/sso/:provider/authorize`, `GET /api/auth/sso/:provider/callback`),
  not account linking.
- Email change (`POST /api/users/me/email`)
- Account deletion (`DELETE /api/users/me`)

If your app needs these, they must be handled through the AuthVital admin
console / super-admin APIs, not a self-service user REST API.

---

## Using the SDK

There is no `authvital.users.*` / `authvital.sso.*` fluent namespace. For the
current user, validate the access token and read its claims:

```typescript
import { verifyToken } from '@authvital/server';

const claims = await verifyToken(accessToken, { authVitalHost: process.env.AV_HOST! });
console.log(claims.sub, claims.email, claims.tenant_roles);
```

Or call `GET /api/auth/me` / `GET /oauth/userinfo` directly with the user's
token. For server-to-server user/membership data, use the M2M
`createServerClient(...).integration.*` methods
([overview](../sdk/server-sdk/namespaces/overview.md)).

---

## Related Documentation

- [Authentication API](./authentication.md)
- [OAuth Endpoints](./oauth-endpoints.md)
- [Server SDK](../sdk/server-sdk/index.md)
