# Examples — Local UAT Stack

> A one-command, subdomain-based, HTTPS-everywhere playground for exercising
> AuthVital end to end: a React SPA, a per-seat licensing SPA, and an Express
> BFF, all fronted by Traefik behind `*.lvh.me`.

The [`examples/`](https://github.com/fed-stew/authvital/tree/main/examples)
directory in the repo contains a complete, self-contained UAT environment. Every
example app builds against the **local workspace SDKs** (`@authvital/browser`,
`@authvital/server`), so it doubles as a live integration reference.

!!! info "Source of truth"
    This page mirrors the repo runbook. For the full detail (and the
    persona-by-persona acceptance matrix) see
    [`examples/README.md`](https://github.com/fed-stew/authvital/blob/main/examples/README.md)
    and
    [`examples/UAT-CHECKLIST.md`](https://github.com/fed-stew/authvital/blob/main/examples/UAT-CHECKLIST.md).

## What's in the box

Three example apps, plus Traefik + mkcert for locally-trusted HTTPS:

| App | Package used | Demonstrates |
| --- | --- | --- |
| **spa-react** — "My Local App" | `@authvital/browser/react` | Login/signup/logout, decoded-claims panel (`app_roles` / `app_permissions` / `tenant_roles` / `license`), tenant switcher (re-login with `tenant_hint` + subdomain jump), role-gated admin card, invitation accept at `/invite?token=...` |
| **spa-seat** — "Seat App" | `@authvital/browser/react` | `PER_SEAT` licensing portal — seat/license status (basic-seat vs pro-seat from the JWT `license` claim) and controls tiered by tenant role |
| **bff-express** — Express BFF | `@authvital/server` | Server-side PKCE (no client secret in the browser), encrypted httpOnly session cookie, JWKS token validation, claim-based permission checks, M2M (client credentials), and JWKS-verified identity-sync webhooks |

## Prerequisites

- **Docker** with Compose v2 (`docker compose`, not `docker-compose`). That's the
  only hard requirement — TLS certs and the DB volume self-configure on `make up`.
- **`lvh.me` resolves to `127.0.0.1`** — no `/etc/hosts` edits needed; `lvh.me`
  and every `*.lvh.me` subdomain publicly resolve to loopback. Your network just
  has to be able to resolve it (a captive portal / VPN / DNS blocker can break it).
- **Free host ports** `80`, `443`, `8080`, `8081`, `5433`.
- **mkcert** *(optional)* for a locally-**trusted** cert (no browser warning):
  ```bash
  brew install mkcert nss   # nss lets Firefox trust the local CA too
  make certs
  ```
  Skip it and the stack still boots HTTPS on a self-signed cert (dev-only) — the
  browser just warns it's untrusted.

## Start it — one command, zero pre-steps

From the **repo root**:

```bash
make up
```

That's the whole cold start. It builds everything, auto-generates a TLS cert
(`examples-certs` runs once and exits), boots Postgres into the named volume
`authvital-pgdata`, and seeds the DB. No cert pre-step, no `POSTGRES_PORT`
fiddling, no one-time reset.

| Command | Effect | Data |
| --- | --- | --- |
| `make up` | Start the full stack (detached) | Kept / created |
| `make down` | Stop the stack | **Kept** |
| `make fresh` | Wipe the DB volume (`down -v`) + reseed | **Wiped → reseeded** |

`make` targets wrap
`docker compose -f docker-compose.yml -f docker-compose.examples.yml …` and set
`POSTGRES_PORT=5433` for you. `npm run dev:examples` / `npm run fresh:examples`
are equivalents. `http://localhost:8080` (base stack) keeps working unchanged.

!!! info "Full lifecycle guide"
    For break/make/reset semantics, seed reconciliation, and troubleshooting,
    see **[Local UAT — Lifecycle](local-uat.md)**.

## The BFF webhook — seeded, no `/admin` step

Identity-sync webhooks are delivered **per-application** to
`application.webhookUrl`, and this is now **fully seeded** — there is **no manual
`/admin` step**. `seed.config.yaml` sets the Web BFF app's webhook config and the
seeder writes it on every boot (idempotent upsert):

```yaml
# seed.config.yaml — Web BFF application
webhook_url: http://bff-express:3000/webhooks   # INTERNAL Docker service URL
webhook_enabled: true
webhook_events: [subject.*, member.*, app_access.*, license.*, invite.*]
```

The internal `http://bff-express:3000/webhooks` URL is used (not
`https://bff.lvh.me/webhooks`) because `lvh.me` resolves to `127.0.0.1`
*everywhere* — inside the `api` container that's the container itself, so it
could never POST to `bff.lvh.me`. `bff-express:3000` is the container-to-container
address on the `authvital` network. Authenticity is **JWKS-signature based**, so
plain HTTP over the trusted internal network is safe.

The BFF verifies every delivery via **JWKS** (no shared secret) and shows the
captured events at **https://bff.lvh.me/events**. `/events` starts empty and
fills as identity-sync events fire (e.g. sign up a user scoped to the Web BFF app).

## Hostnames

| Host | Serves | Demonstrates |
| --- | --- | --- |
| `https://auth.lvh.me` | AuthVital IdP (`api`) | Issuer / OAuth + `/admin` Super Admin dashboard |
| `https://app.lvh.me` | "My Local App" React SPA | Login/signup/logout, decoded claims, tenant switch, role-gated UI |
| `https://{tenant}.app.lvh.me` | Same SPA, per-tenant subdomain | Tenant subdomain context (e.g. `acme.app.lvh.me`) |
| `https://seat.lvh.me` | "Seat App" SPA (`PER_SEAT`) | Seat/license status + role-tiered seat controls |
| `https://{tenant}.seat.lvh.me` | Same Seat App, per-tenant subdomain | Per-tenant licensing + cross-tenant block (e.g. `licenseco.seat…`) |
| `https://bff.lvh.me` | Express BFF (PKCE, httpOnly sessions) | Server-side PKCE, JWKS validation, M2M, webhooks / `/events` |
| `https://traefik.lvh.me` | Traefik dashboard | Routing/TLS introspection (also `http://localhost:8081`) |

## Seeded credentials

All values below are **local-dev only** (defined in `seed.config.yaml`). Never
reuse them anywhere real.

| Persona | Password | Tenant / role | Used for |
| --- | --- | --- | --- |
| `alice@acme.com` | `password123` | acme (owner), globex (member) | multi-tenant + admin app-role |
| `bob@acme.com` | `password123` | acme (admin), app role `editor` | NO admin card |
| `charlie@globex.com` | `password123` | globex (owner), app `admin+editor` | globex admin |
| `owner@licenseco.test` | `test1234` | licenseco (owner) | view + manage + provision |
| `billing@licenseco.test` | `test1234` | licenseco (billing-admin) | view + manage + provision |
| `admin@licenseco.test` | `test1234` | licenseco (admin) | view + manage, NO provision |
| `member@licenseco.test` | `test1234` | licenseco (member) | view only |
| `owner@otherco.test` | `test1234` | otherco (owner) | cross-tenant block (empty seats) |
| **Super Admin** `admin@localhost.com` | `admin123` | system-level (`/admin`) | dashboard (webhooks are seeded) |

## Known behaviors (not bugs)

These are expected by design — don't file them as UAT failures:

- **Tenant switch = full re-login redirect.** Switching tenants in the React SPA
  isn't a silent token swap; it kicks off a fresh OAuth login with a `tenant_hint`
  (and jumps to the tenant subdomain). A round-trip to `auth.lvh.me` is normal.
- **`/api/m2m` returns a token preview only.** By design the BFF never returns raw
  tokens to the browser. You get metadata (`token_preview`, scopes, subject, exp),
  not the JWT itself.
- **Cross-tenant access shows empty seats, not an error.** Logging in as
  `owner@otherco.test` on `licenseco.seat.lvh.me` yields empty roles/seats (an
  IDOR-style block that fails closed), not a 500 or a scary error page.
- **`/events` starts empty, then fills as events fire.** The webhook is
  **seeded** (see above) — no `/admin` step. It shows "No webhooks captured yet"
  only until the first identity-sync event for the Web BFF app is delivered.
- **The React SPA ships as one largeish Vite chunk.** A single big JS bundle is
  expected for these demo apps — no code-splitting tuning was done because it's a
  UAT playground, not a production bundle-size exercise.

## Handy commands

```bash
make up                  # cold start (auto certs + named volume + seed)
make down                # stop, KEEP data
make fresh               # DESTRUCTIVE: wipe DB volume (down -v) + reseed
make certs               # optional: mint a locally-TRUSTED mkcert cert

# npm equivalents:
npm run dev:examples     # == docker compose ... up --build (POSTGRES_PORT=5433)
npm run fresh:examples   # DESTRUCTIVE reset (down -v), with confirm prompt
```

## Notes / gotchas

- **`allowed_web_origins` has no wildcards.** Every tenant subdomain that calls
  the IdP must be enumerated in `seed.config.yaml` (and mirrored in the api
  `CORS_ORIGINS` env in the overlay). Add new tenants to both.
- **Webhooks are seeded — no `/admin` step.** The Web BFF app's `webhook_url` /
  `webhook_enabled` / `webhook_events` live in `seed.config.yaml` and are applied
  on every boot. The seeded URL is the INTERNAL `http://bff-express:3000/webhooks`
  (`https://bff.lvh.me` is unreachable from the `api` container — `lvh.me` →
  127.0.0.1 = the container itself). Signature auth is JWKS-based.
- **Seed reconciliation.** The bootstrap seed re-applies `seed.config.yaml` on
  every boot: edits to *seeded* entities in `/admin` get reconciled back, so make
  lasting changes in the seed file. Runtime data you create fresh persists across
  `make down`/`make up` and is only wiped by `make fresh`.

---

*Full runbook + persona matrix live in the repo:
[`examples/README.md`](https://github.com/fed-stew/authvital/blob/main/examples/README.md)
·
[`examples/UAT-CHECKLIST.md`](https://github.com/fed-stew/authvital/blob/main/examples/UAT-CHECKLIST.md).*
