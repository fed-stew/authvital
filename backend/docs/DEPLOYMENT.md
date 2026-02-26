# AuthVader Deployment Architecture

## Overview

AuthVader uses a **two-mode deployment** pattern that separates database migrations from API startup for faster, safer deployments.

## Deployment Modes

### 1. Migration Mode (Cloud Run Job)

**Entrypoint:** `./migrate.sh`

Runs database migrations and bootstrap checks, then exits. Used by Cloud Run Job before API deployment.

**What it does:**
1. Constructs `DATABASE_URL` from Cloud SQL components
2. Runs `prisma migrate deploy` to apply pending migrations
3. Runs `migrate-runner.js` to execute bootstrap checks:
   - Creates initial super admin if `SUPER_ADMIN_EMAIL` is set and none exists
   - Sends temporary password via email (or logs to console)
4. Exits with code 0 (success) or 1 (failure)

### 2. API Mode (Cloud Run Service)

**Entrypoint:** `./start.sh` (default)

Fast startup that just runs the application. Migrations and bootstrap are already handled.

**What it does:**
1. Constructs `DATABASE_URL` from Cloud SQL components
2. Starts the NestJS application

## Deployment Pipeline Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Build & Test                                                                │
│ ├── npm ci                                                                  │
│ ├── npm test                                                                │
│ └── npm run build                                                           │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Build & Push Docker Image                                                   │
│ └── docker build & push to Artifact Registry                                │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Deploy Migration Job                                                        │
│ └── gcloud run jobs deploy ${SERVICE}-migration --command="./migrate.sh"    │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Run Migrations (wait for completion)                                        │
│ └── gcloud run jobs execute ${SERVICE}-migration --wait                     │
│     ├── prisma migrate deploy                                               │
│     └── bootstrap checks (super admin creation)                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Deploy API Service                                                          │
│ └── gcloud run deploy ${SERVICE} --image=${IMAGE}                           │
│     └── Fast startup (no migrations!)                                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Benefits

| Benefit | Description |
|---------|-------------|
| **Faster cold starts** | API doesn't run migrations on startup |
| **Safer deployments** | Migrations complete before API starts serving traffic |
| **Audit trail** | Cloud Run Job history shows all migration runs |
| **Rollback clarity** | Clear separation between schema changes and code changes |

## Local Development

For local development, migrations still run the traditional way:

```bash
# Run migrations manually
npx prisma migrate dev

# Or use docker-compose which handles it
docker-compose up
```

## Troubleshooting

### Migration job fails

1. Check Cloud Run Job logs: `gcloud run jobs executions logs ${SERVICE}-migration`
2. Common issues:
   - Database connection (check Cloud SQL instance name)
   - Missing secrets (DB_PASSWORD, SENDGRID_API_KEY)
   - Prisma migration conflicts

### API starts but bootstrap data missing

The bootstrap only runs in migration mode. If you deployed without running migrations:
1. Trigger the migration job manually: `gcloud run jobs execute ${SERVICE}-migration --wait`
2. Or redeploy through the pipeline

## Files

| File | Purpose |
|------|--------|
| `scripts/migrate.sh` | Migration mode entrypoint |
| `scripts/docker-start.sh` | API mode entrypoint |
| `src/migrate-runner.ts` | Bootstrap logic runner |
| `src/bootstrap.ts` | Bootstrap implementation (super admin creation) |
