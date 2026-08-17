# Local UAT — Lifecycle Guide

This is the **operational** guide to the examples stack: how to start it, how to
break/make data, and how to reset it — all with **one command each** and **zero
manual pre-steps** beyond installing Docker.

!!! tip "TL;DR"
    ```bash
    make up      # cold start: auto-certs + fresh seed, everything on *.lvh.me
    make down    # stop, KEEP your data
    make fresh   # wipe the DB volume + reseed a clean baseline
    ```
    For the app-by-app tour and the acceptance matrix, see
    [Examples — Local UAT Stack](examples.md) and the repo's
    [`examples/UAT-CHECKLIST.md`](https://github.com/fed-stew/authvital/blob/main/examples/UAT-CHECKLIST.md).

## What the stack is

A subdomain-based, HTTPS-everywhere playground fronted by **Traefik**, exercising
AuthVital end to end:

| Component | Host | Role |
| --- | --- | --- |
| **AuthVital IdP** (`api`) | `https://auth.lvh.me` (+ `/admin`) | The identity provider: OAuth/OIDC issuer, admin console |
| **spa-react** — "My Local App" | `https://app.lvh.me`, `https://{tenant}.app.lvh.me` | React SPA (`@authvital/browser/react`): login, claims, tenant switch, role-gated UI |
| **spa-seat** — "Seat App" | `https://seat.lvh.me`, `https://{tenant}.seat.lvh.me` | `PER_SEAT` licensing portal, role-tiered seat controls |
| **bff-express** — "Web BFF" (ONE app, TWO credentials: SPA `web-bff-client-id` + MACHINE `local-machine-client-id`) | `https://bff.lvh.me` (+ `/events`) | Server-side PKCE (SPA cred), JWKS validation, M2M (MACHINE cred), JWKS-verified webhooks |
| **Traefik** | `https://traefik.lvh.me` / `http://localhost:8081` | Reverse proxy, subdomain routing, TLS termination |
| **Postgres** | in-network `postgres:5432` (host `:5433`) | Data store (named volume `authvital-pgdata`) |
| **examples-certs** | — (one-shot) | Generates the self-signed TLS cert on first boot, then exits |

The seed (`seed.config.yaml`) ships four tenants (**acme**, **globex**,
**licenseco**, **otherco**) and a set of personas across them — see
[Login personas](#urls-and-login-personas).

## Prerequisites

- **Docker** with Compose v2 (`docker compose`, not `docker-compose`). That's the
  only hard requirement — certs and DB volume self-configure.
- **`lvh.me` must resolve to `127.0.0.1`.** No `/etc/hosts` edits needed —
  `lvh.me` and every `*.lvh.me` subdomain publicly resolve to loopback. Your
  network just has to be *able* to resolve it (a captive portal, corporate VPN,
  or aggressive DNS blocker can break this — see [Troubleshooting](#troubleshooting)).
- **Free host ports:** `80`, `443`, `8080`, `8081`, and `5433` (Postgres host
  publish; overridable — see below). Postgres deliberately publishes on `5433`,
  not `5432`, to dodge the most common collision with another project's DB.
- **mkcert** *(optional)* for a locally-**trusted** cert (no browser warning):
  ```bash
  brew install mkcert nss   # nss lets Firefox trust the local CA too
  make certs                # mints a trusted *.lvh.me cert
  ```
  If you skip this, the stack still boots HTTPS on a self-signed cert — your
  browser just warns it's untrusted (click through, or `curl -k`). This is a
  **dev-only** shortcut.

## The blessed lifecycle commands

All three are Makefile targets that wrap
`docker compose -f docker-compose.yml -f docker-compose.examples.yml …` and set
`POSTGRES_PORT=5433` for you, so you never pass flags or ports by hand.

| Command | What it does | Data |
| --- | --- | --- |
| `make up` | Builds + boots the whole stack detached. On first boot `examples-certs` mints a cert (if none exists) and the DB seeds. | **Kept** (created if absent) |
| `make down` | Stops & removes the containers. The `authvital-pgdata` volume is left intact. | **Kept** |
| `make fresh` | `down -v` (drops the volume) then `up` — a brand-new DB, reseeded from `seed.config.yaml`. | **Wiped → reseeded** |
| `make logs` | Follows logs for all services. | — |
| `make ps` | Shows service status. | — |
| `make certs` | Optional: mint a **trusted** mkcert cert (restart Traefik after). | — |

!!! note "Why a Makefile and not `COMPOSE_FILE` in `.env`?"
    `.env` (and `.env.*`) is `.gitignored`, so a committed `COMPOSE_FILE` is
    impossible. Setting it globally would also silently force the examples
    overlay onto anyone who just wants the base stack
    (`docker compose up` → `http://localhost:8080`), which is surprising. The
    Makefile keeps the base stack pristine and gives one dead-simple entrypoint
    for the UAT stack. `npm run dev:examples` / `npm run fresh:examples` remain
    as equivalents.

!!! note "Postgres host port"
    Apps reach Postgres in-network at `postgres:5432`; the host publish is only a
    convenience for a DB GUI. It defaults to **`5433`** to avoid the common
    `:5432` collision, and it's overridable: `make up POSTGRES_PORT=5544`.

## Break / make data, then reset — the whole point

This is what the named volume buys you:

```bash
make up                       # 1. cold start — seeded baseline
# ...sign up a user, create a tenant, edit something in /admin, etc...
make down && make up          # 2. plain restart — your runtime data is STILL THERE
make fresh                    # 3. wipe it all — back to the pure seeded baseline
```

- **`down` then `up` keeps data.** The `authvital-pgdata` volume survives, so
  anything you created at runtime is still there after a restart.
- **`fresh` wipes data.** `down -v` removes the volume; the next `up` reseeds a
  clean DB from `seed.config.yaml`. Perfect for "give me a pristine env again".

Because a fresh volume is always seeded **directly against
`https://auth.lvh.me`**, `make fresh` also eliminates the old *stale-issuer*
footgun — there are no lingering signing keys from a previous
`http://localhost:8080` issuer.

## How the seed reconciliation works

The bootstrap seed runs on **every boot** (the `migrate`/api startup applies
`seed.config.yaml` via idempotent upserts). Two consequences worth internalizing:

- **Seeded entities are reconciled back to the file.** If you edit a *seeded*
  application/tenant/user in `/admin`, the next boot re-applies the seed values
  and your ad-hoc edit is overwritten. To make a lasting change to a seeded
  entity, **edit `seed.config.yaml`** (and restart), not the dashboard.
- **Non-seeded data you create at runtime is NOT touched by the seed** — it
  persists across `down`/`up` and only disappears on `make fresh` (volume wipe).
  So "sign up a brand-new user" sticks around; "change alice's seeded role in
  /admin" gets reconciled back.

This is also why webhooks work with **no `/admin` step**: the Web BFF app's
`webhook_url` / `webhook_enabled` / `webhook_events` live in `seed.config.yaml`
and are written on every boot.

## URLs and login personas

All credentials are **local-dev only** (from `seed.config.yaml`). Never reuse.

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

**The persona-by-persona UAT checklist** lives in the repo at
[`examples/UAT-CHECKLIST.md`](https://github.com/fed-stew/authvital/blob/main/examples/UAT-CHECKLIST.md).

## Troubleshooting

- **`Bind for 0.0.0.0:5433 failed: port is already allocated`.** Something owns
  host `:5433`. Boot on another port — apps are unaffected (they use
  `postgres:5432` in-network): `make up POSTGRES_PORT=5544`.
- **Every host returns `404` though all containers are "Up".** Traefik's docker
  provider couldn't reach the daemon → zero routers. Almost always Traefik older
  than `v3.6` against a modern Docker Engine. The overlay pins `traefik:v3.6`
  on purpose — don't downgrade. Check `docker logs authvital-traefik`.
- **`lvh.me` won't resolve / connection refused.** A VPN, captive portal, or DNS
  filter is blocking public resolution of `lvh.me` → `127.0.0.1`. Test with
  `nslookup lvh.me` (expect `127.0.0.1`). As a fallback add
  `127.0.0.1 lvh.me app.lvh.me seat.lvh.me bff.lvh.me auth.lvh.me traefik.lvh.me`
  to `/etc/hosts`.
- **Browser warns the cert is untrusted.** You're on the self-signed fallback
  (dev-only). Run `make certs` (needs `mkcert nss`) for a trusted cert, then
  `make down && make up` so Traefik reloads it.
- **OAuth/token weirdness after a lot of tinkering.** Just `make fresh` — a
  clean volume reseeds against `https://auth.lvh.me`, no stale keys.
- **`401 Unauthorized` on every console/API call right after `make fresh`.**
  Expected. `make fresh` wipes the volume and mints **brand-new signing keys**,
  so any session cookie (`idp_session`) or access token from *before* the reseed
  no longer verifies against the new JWKS. **Just log in again** — the old
  browser session was invalidated by the key rotation, not a bug. (The console
  detects the 401 and bounces you to the login page automatically.) This applies
  to anyone whose signing keys rotate, self-hosters included: rotating keys
  invalidates issued tokens, so clients must re-authenticate.
- **View logs:** `make logs` (all), or `docker logs -f authvital-api`
  (or `-traefik`, `-bff-express`, `-postgres`, `-examples-certs`).

!!! warning "Dev-only shortcuts (never ship these)"
    The self-signed cert, `NODE_TLS_REJECT_UNAUTHORIZED=0` in the BFF (to trust
    the local cert on the server-side IdP hop), and the insecure Traefik
    dashboard are **local-dev conveniences only**. They are clearly labeled as
    such in the compose files and must never be used outside local UAT.
