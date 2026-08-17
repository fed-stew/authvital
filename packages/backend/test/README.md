# Backend e2e tests

These boot the **real `AppModule`** against a real Postgres, mint real RS256 tokens
with the app's own `KeyService`, and drive the HTTP API. Unlike the unit suite
(`npm test`, which mocks Prisma), these prove the full guard → controller → service → DB
path — including the DB-backed permission resolution.

## Prerequisites

The e2e connects to a real database and must use the **same `MASTER_SECRET`** as that
database (otherwise the stored JWT signing keys won't decrypt).

The easy path — reuse your local docker stack:

```bash
# from repo root
cp .env.example .env          # if you haven't already
docker compose up -d          # Postgres + migrations + API
```

The test reads secrets from `packages/backend/.env` (or the repo-root `.env`, or the
ambient environment). It needs:

| Var            | Why                                                        |
| -------------- | ---------------------------------------------------------- |
| `DATABASE_URL` | Postgres with the schema migrated                          |
| `MASTER_SECRET`| Must match the DB (decrypts the signing keys)              |
| `BASE_URL`     | The JWT issuer the guard verifies (e.g. `http://localhost:8080`) |

> The app itself is booted **in-process** and listens on an ephemeral port, so you do
> NOT need the API container running for the e2e — you only need the database. Pointing
> at your dev DB is fine: all rows are created under a unique run-id and best-effort
> cleaned up afterward.

## Run

```bash
npm run test:e2e -w @authvital/backend
```

## What `licensing-tiers.e2e-spec.ts` asserts

- `licenses:view` → owner, billing-admin, admin, member can read the overview
- `licenses:provision` → owner + billing-admin can create/resize inventory; admin + member get `403`
- `licenses:manage` → owner + billing-admin + admin can grant/revoke; member gets `403`
- **owner god-mode** expansion (`tenant:*`) resolves from the DB
- **IDOR**: you cannot resize another tenant's subscription, nor read a tenant you're not in (`403`)
- **seat accounting**: `totalSeatsAssigned` / `totalSeatsOwned` move correctly on grant/revoke/resize
