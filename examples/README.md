# AuthVital Examples — Local UAT Runbook

A one-command, subdomain-based, HTTPS-everywhere playground for exercising
AuthVital end to end: a React SPA, a per-seat licensing SPA, and an Express BFF,
all fronted by Traefik behind `*.lvh.me`.

> Status: **Phase 3** (UAT ready). All three example apps build against the LOCAL
> workspace SDKs (`@authvital/browser`, `@authvital/server`). This document is the
> full runbook; the persona-by-persona walkthrough lives in
> [**UAT-CHECKLIST.md**](./UAT-CHECKLIST.md). The fuller hosted guide (lifecycle,
> seed reconciliation, troubleshooting) is in the docs site:
> [**Local UAT — Lifecycle**](../docs/local-uat.md).
>
> Each app's Docker image builds from the **repo root** context (so the workspace
> `packages/` are visible) with its Dockerfile referenced explicitly in
> `docker-compose.examples.yml`.

---

## 1. Prerequisites

- **Docker** (with Compose v2 — `docker compose`, not `docker-compose`). The
  Traefik service is pinned to **`traefik:v3.6`** on purpose: older Traefik
  (<= v3.5) ships a Docker client that speaks API `v1.24` without negotiation,
  and modern Docker Engines (Docker Desktop's Engine 29 = API `1.54`) raised
  their **minimum** API version to `1.40` and reject the old request with a bare
  HTTP `400`. That would kill Traefik's docker provider (no routers -> every
  host 404s). v3.6 negotiates the API version correctly. Don't downgrade it.
- **mkcert** (optional) for a locally-*trusted* HTTPS cert (no browser warning):
  ```bash
  brew install mkcert nss   # nss lets Firefox trust the local CA too
  make certs                # run this FIRST for a trusted cert
  ```
  You don't need it: on a cold `make up`, the `examples-certs` init service mints
  a **self-signed** cert automatically (dev-only; browser warns it's untrusted).
  It **never overwrites** an existing cert, so `make certs` (mkcert) is a clean
  opt-in upgrade — run it first and the init service simply skips.
- **Outbound DNS** for `lvh.me`: no `/etc/hosts` edits needed — `lvh.me` and every
  `*.lvh.me` subdomain publicly resolve to `127.0.0.1`. Your network/DNS just has
  to be able to resolve `lvh.me` (a captive portal or aggressive DNS blocker can
  break this).
- **Free host ports** `80`, `443`, `8080`, `8081`, and `5433`. The Postgres host
  publish defaults to **`5433`** (not `5432`) precisely to dodge the common
  collision with another project's DB — you never pass it manually. Apps reach
  Postgres in-network on `postgres:5432` regardless. If `5433` is also taken:
  ```bash
  make up POSTGRES_PORT=5544
  ```

---

## 2. Lifecycle — one command each, zero pre-steps

From the **repo root**:

```bash
make up      # cold start: auto-cert + named volume + seed. Everything on *.lvh.me
make down    # stop the stack, KEEP your data
make fresh   # wipe the DB volume (down -v) + reseed a clean baseline
```

That's it — a cold `make up` on a fresh checkout works with **no cert pre-step,
no `POSTGRES_PORT`, no one-time reset, and no host `npm install`/`npm run build`**.
Every image builds the workspace SDKs from source *inside* the container (the
repo `.dockerignore` even excludes `packages/*/dist` and `examples/**/dist`, so
any host-built output is ignored by the Docker build). Docker is the only
requirement.

**Break/make data, then reset** — the whole point of the named volume:

```bash
make up                 # seeded baseline
# ...sign up a user / edit something in /admin...
make down && make up    # plain restart -> your runtime data is STILL THERE
make fresh              # wipe -> back to the pure seeded baseline
```

Because Postgres lives in the named volume `authvital-pgdata`, `down` keeps data
and `down -v` (via `make fresh`) wipes it. A fresh volume is always seeded
directly against `https://auth.lvh.me`, so there's **no stale-issuer footgun**.

`make` just wraps
`docker compose -f docker-compose.yml -f docker-compose.examples.yml …` with
`POSTGRES_PORT=5433`. `npm run dev:examples` / `npm run fresh:examples` are
equivalents. `http://localhost:8080` (base stack) keeps working unchanged.

> **Seed reconciliation:** the bootstrap seed re-applies `seed.config.yaml` on
> every boot. Edits to *seeded* entities in `/admin` get reconciled back — put
> lasting changes in the seed file. Runtime data you create fresh persists across
> `make down`/`up` and is only removed by `make fresh`.

> **Where the examples seed comes from:** this stack is seeded from the
> **committed** `seed.config.examples.yaml` at the repo root —
> `docker-compose.examples.yml` mounts it into the `api` (and `migrate`)
> container as `/app/seed.config.yaml`, so a fresh clone's `make up` "just
> works" with zero manual steps. A personal root `seed.config.yaml`
> (gitignored) is only for the plain base stack / your own custom setups —
> it is **not** used here.

---

## 3. The BFF webhook — seeded, works out of the box

Identity-sync webhooks are delivered **per-application** to
`application.webhookUrl`. This is now **fully seeded** — there is **NO manual
`/admin` step**. `seed.config.yaml` sets the Web BFF app's webhook config and
`applications.seeder.ts` writes it to the `webhookUrl` / `webhookEnabled` /
`webhookEvents` columns on every boot (idempotent upsert):

```yaml
# seed.config.yaml — Web BFF application
webhook_url: http://bff-express:3000/webhooks   # INTERNAL Docker service URL
webhook_enabled: true
webhook_events: [subject.*, member.*, app_access.*, license.*, invite.*]
```

> **Why the internal `http://bff-express:3000/webhooks` URL (not
> `https://bff.lvh.me/webhooks`)?** `lvh.me` resolves to `127.0.0.1`
> *everywhere*, which inside a container is the container itself — so the `api`
> container could never POST a webhook to `https://bff.lvh.me` (it'd hit
> itself). `bff-express:3000` is the container-to-container address on the
> `authvital` Docker network — no TLS/DNS gymnastics. Webhook authenticity is
> **JWKS-signature based** (the api signs with its active key; the BFF verifies
> against `https://auth.lvh.me/.well-known/jwks.json`), so plain HTTP over the
> trusted internal network is safe. This hostname is specific to the examples
> compose network.

The BFF verifies every delivery via **JWKS** (no shared secret) and shows the
captured events + resulting in-memory identities at **https://bff.lvh.me/events**.
`/events` starts empty and fills in as events fire — e.g. sign up a user scoped
to the Web BFF app, or grant/suspend an acme member (Alice is seeded with Web
BFF access so acme member/app_access events reach the BFF). See the
UAT-CHECKLIST for concrete triggers.

---

## 4. Hostnames

| Host                           | Serves                                  | Demonstrates                                                         |
| ------------------------------ | --------------------------------------- | ------------------------------------------------------------------- |
| `https://auth.lvh.me`          | AuthVital IdP (`api`)                    | Issuer / OAuth + `/admin` Super Admin dashboard                     |
| `https://app.lvh.me`           | "My Local App" React SPA                | Login/signup/logout, decoded claims, tenant switch, role-gated UI   |
| `https://{tenant}.app.lvh.me`  | Same SPA, per-tenant subdomain          | Tenant subdomain context (e.g. `acme.app.lvh.me`)                    |
| `https://seat.lvh.me`          | "Seat App" SPA (PER_SEAT licensing)     | Seat/license status + role-tiered seat controls                     |
| `https://{tenant}.seat.lvh.me` | Same Seat App, per-tenant subdomain     | Per-tenant licensing + cross-tenant block (e.g. `licenseco.seat…`)  |
| `https://bff.lvh.me`           | Express BFF — org-less landing/picker   | B2B org-less token, in-app org switcher, PKCE, JWKS, M2M, webhooks  |
| `https://{tenant}.bff.lvh.me`  | Same BFF, tenant-scoped session         | Subdomain binds `tenant_id` (e.g. `acme.bff.lvh.me`) — scoped panels |
| `https://traefik.lvh.me`       | Traefik dashboard                       | Routing/TLS introspection (also `http://localhost:8081`)            |

### What each app demonstrates (detail)

- **spa-react** (`app.lvh.me`, `{tenant}.app.lvh.me`, `local-spa-client-id`):
  login/signup/logout, decoded-claims panel (`app_roles` / `app_permissions` /
  `tenant_roles` / `license`), tenant switcher (re-login with `tenant_hint` +
  subdomain jumps), role-gated admin card (`app_roles` includes `admin`),
  invitation accept at `/invite?token=...`, and — the intended **hosted-first**
  pattern — **deep-links into the hosted console** built with `@authvital/core`
  (`getManagementUrls` → Manage members / Manage app access / Access matrix / SSO
  / Domains / Billing / Audit, plus `getAppPickerUrl`/`getOrgPickerUrl` switchers
  and `getAccountSettingsUrl`). The app owns auth + gating; **management happens
  in the console via deep-links**, not in-app CRUD.
- **spa-seat** (`seat.lvh.me`, `{tenant}.seat.lvh.me`, `seat-app-client-id`):
  licensing portal — seat/license status (basic-seat vs pro-seat from the JWT
  `license` claim) and controls tiered by tenant role (owner/billing-admin →
  provision; admin → manage; member → view). The manage/provision affordances are
  **deep-links into the hosted console** (`/tenant/:id/licenses` and `/billing`
  via `getManagementUrls`) rather than in-app mutations, plus a console links card
  (members/app access/licenses/billing/audit/SSO/domains + switchers + account).
  Includes a UAT persona legend.
- **bff-express** (`bff.lvh.me` + `{tenant}.bff.lvh.me`): a **B2B
  subdomain-per-tenant** BFF. It runs on the SINGLE **"Web BFF"** app container
  (slug `web-bff`), which owns **two credentials**: an **SPA** credential
  (`web-bff-client-id`, the public PKCE login flow) and a **MACHINE** credential
  (`local-machine-client-id`, the server-to-server M2M identity). The flat host `bff.lvh.me` is the
  **org-less** landing/picker (login there yields a token with **no**
  `tenant_id`); each `{tenant}.bff.lvh.me` is a **tenant-scoped** session. The
  BFF computes the OAuth redirect URI **per-request** from the incoming Host, so
  a login on `acme.bff.lvh.me` sends an `acme` callback and the IdP binds
  `tenant_id=acme` onto the token. An in-app **org switcher** (built from
  `listUserTenants`) links to each org's subdomain — switching orgs = switching
  subdomain + a fresh tenant-scoped login (independent session per org). Plus
  the usual: encrypted httpOnly session cookie, `/api/protected` (JWKS token
  validation), `/api/permission` (claim checks), `/api/m2m` (client_credentials,
  sanitized to a token preview), `POST /webhooks` (JWKS-verified identity-sync
  ingest) and `/events` (live view of captured events + in-memory identities).
  The three tenant-scoped Integration panels are "unavailable" on the org-less
  flat host and render once you pick an org.

---

## 5. Seeded credentials

All values below are **local-dev only** (defined in `seed.config.yaml`). Never
reuse them anywhere real.

| Persona                    | Password      | Tenant / role                     | Used for                          |
| -------------------------- | ------------- | --------------------------------- | --------------------------------- |
| `alice@acme.com`           | `password123` | acme (owner), globex (member)     | multi-tenant + admin app-role     |
| `bob@acme.com`             | `password123` | acme (admin), app role `editor`   | NO admin card                     |
| `charlie@globex.com`       | `password123` | globex (owner), app `admin+editor`| globex admin                      |
| `owner@licenseco.test`     | `test1234`    | licenseco (owner)                 | view + manage + provision         |
| `billing@licenseco.test`   | `test1234`    | licenseco (billing-admin)         | view + manage + provision         |
| `admin@licenseco.test`     | `test1234`    | licenseco (admin)                 | view + manage, NO provision       |
| `member@licenseco.test`    | `test1234`    | licenseco (member)                | view only                         |
| `owner@otherco.test`       | `test1234`    | otherco (owner)                   | cross-tenant block (empty seats)  |
| **Super Admin** `admin@localhost.com` | `admin123` | system-level (`/admin`) | dashboard (webhooks are seeded)   |

 **Full persona-by-persona walkthrough:** [**UAT-CHECKLIST.md**](./UAT-CHECKLIST.md)

---

## 6. Known behaviors (not bugs)

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
- **`/events` starts empty, then fills as events fire.** The webhook is **seeded**
  (see §3) — no `/admin` step. `/events` shows "No webhooks captured yet" only
  until the first identity-sync event for the Web BFF app is delivered.
- **The React SPA ships as one largeish Vite chunk.** A single big JS bundle in the
  build output is expected for these demo apps — no code-splitting tuning was done
  because it's a UAT playground, not a production bundle-size exercise.

---

## Handy commands

```bash
make up                  # cold start (auto certs + named volume + seed)
make down                # stop, KEEP data
make fresh               # DESTRUCTIVE: wipe DB volume (down -v) + reseed
make logs                # follow all logs
make certs               # optional: mint a locally-TRUSTED mkcert cert

# npm equivalents:
npm run dev:examples     # docker compose ... up --build (POSTGRES_PORT=5433)
npm run fresh:examples   # DESTRUCTIVE reset (down -v), with confirm prompt

# If host :5433 is also taken:
make up POSTGRES_PORT=5544
```

## Layout

```
examples/
  README.md            <- you are here (runbook)
  UAT-CHECKLIST.md     <- persona-by-persona pass/fail matrix
  traefik/
    gen-certs.sh        <- TLS cert generation, mkcert or openssl fallback (run via `make certs`)
    certs/              <- generated *.pem (gitignored)
    dynamic/tls.yml     <- Traefik default-cert config (file provider)
  spa-react/            <- "My Local App" SPA (Vite+React, @authvital/browser/react)
  spa-seat/             <- "Seat App" SPA (PER_SEAT licensing UAT)
  bff-express/          <- Express BFF (@authvital/server: PKCE, sessions, webhooks, M2M)
```

## Troubleshooting

- **Every host returns `404` (but all containers are "Up").** Traefik's docker
  provider failed to talk to the Docker daemon, so it discovered zero routers.
  Check `docker logs authvital-traefik` for `Failed to retrieve information of
  the docker client` / `API returned a 400`. Cause: Traefik older than v3.6
  against a modern Docker Engine (see §1). Fix: use the pinned `traefik:v3.6`.
- **`Bind for 0.0.0.0:5433 failed: port is already allocated`.** Something owns
  host `:5433`. Boot with `make up POSTGRES_PORT=5544` — the app services are
  unaffected (they use `postgres:5432` in-network).
- **Browser warns the cert is untrusted.** You're on the self-signed fallback
  (mkcert wasn't installed when the cert was generated). Install `mkcert nss`,
  run `make certs` (calls `bash examples/traefik/gen-certs.sh` directly — no
  `npm install` needed), then restart the stack (`make down && make up`).
- **OAuth/token weirdness after a lot of tinkering.** Just `make fresh` — a
  clean volume reseeds against `https://auth.lvh.me`, no stale keys.
- **`401 Unauthorized` everywhere right after `make fresh`.** Expected, not a
  bug: `make fresh` rotates the signing keys, so any `idp_session` cookie /
  access token minted before the reseed no longer verifies against the new
  JWKS. **Log in again** and you're back in business. (Same truth for real
  deployments: rotating signing keys invalidates already-issued tokens, so
  clients must re-authenticate.)

## Notes / gotchas

- **The Express BFF is now B2B subdomain-per-tenant.** It's reachable at
  `bff.lvh.me` (org-less landing/picker) and `{tenant}.bff.lvh.me`
  (tenant-scoped), with an in-app org switcher; the IdP binds `tenant_id` from
  the callback subdomain. **After pulling this change you must reseed AND
  regenerate TLS certs** to pick up the new `*.bff.lvh.me` SAN: run `make fresh`
  (reseed) and either delete `examples/traefik/certs/lvh.me*.pem` then `make up`
  (the init service re-mints), or run `npm run certs:examples` (mkcert). Without
  the new SAN, `{tenant}.bff.lvh.me` will throw a TLS error.
- **`allowed_web_origins` has no wildcards.** Every tenant subdomain that calls
  the IdP must be enumerated in `seed.config.yaml` (and mirrored in the api
  `CORS_ORIGINS` env in the overlay). Add new tenants to both.
- **Webhooks are seeded — no `/admin` step.** The Web BFF app's `webhook_url` /
  `webhook_enabled` / `webhook_events` live in `seed.config.yaml` and are applied
  by `applications.seeder.ts` on every boot (see §3). The seeded URL is the
  INTERNAL Docker service `http://bff-express:3000/webhooks` — `https://bff.lvh.me`
  is unreachable from the `api` container (lvh.me → 127.0.0.1 = the container
  itself). Signature auth is JWKS-based, so internal plain HTTP is safe.
- **In-container IdP reachability.** The BFF talks to the IdP server-side at
  `AV_HOST=https://auth.lvh.me` (token exchange + JWKS). Because `lvh.me` →
  127.0.0.1, the overlay gives Traefik a Docker network **alias** `auth.lvh.me`
  so in-network DNS routes `auth.lvh.me` → Traefik → `api`, keeping the OIDC
  issuer constant. The BFF sets `NODE_TLS_REJECT_UNAUTHORIZED=0` (dev only) to
  trust the local mkcert TLS on that hop.
