# License Lifecycle Job

> **Status:** implemented (service + standalone entrypoint). External scheduler
> wiring is deployment-specific — see [Triggering](#triggering).

## Problem (why this exists)

Subscriptions carry a `currentPeriodEnd`, but nothing was moving them from
`ACTIVE`/`TRIALING`/`PAST_DUE` → `EXPIRED` when that date passed. Read-time
checks in `LicenseCheckService` now guard on the period (see the licensing
audit), but relying on read-time filtering alone leaves problems:

- The stored `status` lies (`ACTIVE` forever), so admin dashboards and
  `getApplicationSubscriptions` report lapsed subs as live.
- `AppAccess` rows tied to expired PER_SEAT seats stay `ACTIVE` (ghost access
  for any code path that checks `AppAccess` directly).
- The cached `quantityAssigned` counter can drift from reality when a
  cross-aggregate write half-fails.

We need a periodic, **idempotent** housekeeping pass that:

1. **Expires overdue subscriptions** (`currentPeriodEnd <= now`), reusing the
   transactional `expireSubscription()` that also revokes the entitlements.
2. **Reconciles `quantityAssigned`** against the actual `LicenseAssignment`
   rows, correcting any drift.

## Decision: a separate scheduled job, NOT an in-process `@Cron`

`ScheduleModule.forRoot()` is registered in `AppModule`, so we *could* have
dropped an `@Cron` on a service and called it a day. We deliberately did not.

| Concern | In-process `@Cron` | Separate scheduled job  |
| --- | --- | --- |
| Multiple API replicas | Fires **once per replica** → double-runs / races. Needs leader election or a distributed lock. | Runs exactly once per tick, by construction. |
| Scaling the web tier | Coupled to job cadence. | Independent — scale API and jobs separately. |
| Resource spikes | Batch work competes with request latency in the same process. | Isolated process, own CPU/mem budget. |
| Incident re-run | Awkward (redeploy / poke an endpoint). | `npm run job:license-lifecycle` — just run it again; it's idempotent. |
| Blast radius | A job bug can wedge the API event loop. | Job crash exits non-zero; API unaffected. |

The tradeoff (needing an external trigger) is cheap on GCP and buys us a clean,
testable, independently-scalable command.

## Architecture

```
External scheduler (Cloud Scheduler)
        │  triggers
        ▼
Cloud Run Job / k8s CronJob
        │  runs
        ▼
node dist/jobs/license-lifecycle.job        ← src/jobs/license-lifecycle.job.ts
        │  createApplicationContext(JobsModule)   (NO HTTP, NO ScheduleModule)
        ▼
LicenseLifecycleService.runSweep()          ← pure, idempotent business logic
        ├─ expireOverdueSubscriptions()  → LicensePoolService.expireSubscription() (txn, revokes AppAccess)
        └─ reconcileAssignedCounts()     → fixes quantityAssigned drift
```

Pieces:

- **`LicenseLifecycleService`** (`src/licensing/services/license-lifecycle.service.ts`)
  — the logic. No scheduling decorators. Fully unit-tested. Can also be wired
  to a manual super-admin "run housekeeping now" endpoint later if desired.
- **`JobsModule`** (`src/jobs/jobs.module.ts`) — a minimal DI graph
  (`PrismaModule` + `LicensingModule`). Crucially imports **no**
  `ScheduleModule`, so booting a job context never starts the API's own crons.
- **`license-lifecycle.job.ts`** (`src/jobs/`) — the one-shot entrypoint.
  `createApplicationContext` (no HTTP server), run sweep, log summary,
  `process.exit(0|1)`.
- **npm script**: `npm run job:license-lifecycle` → `node dist/jobs/license-lifecycle.job`
  (run `nest build` first).

## Idempotency & safety

- Running twice back-to-back is a no-op the second time: nothing is overdue,
  no counters drift.
- Per-subscription expiry is wrapped in try/catch — **one bad row does not sink
  the sweep** (it's logged and skipped; the run still exits 0 unless the whole
  process throws).
- `expireSubscription` runs in a transaction and revokes only the `AppAccess`
  linked to the seats it tears down (PER_SEAT). FREE/TENANT_WIDE access is
  gated at read-time by an active, non-expired subscription, so those rows are
  intentionally left alone.
- `autoRenew` is **not** consulted. A genuine renewal (Stripe / control-plane)
  is expected to push `currentPeriodEnd` forward *before* the sweep runs;
  auto-renew must never mean "free indefinite access".

## Triggering

### Recommended: Cloud Run Job + Cloud Scheduler (GCP)

```bash
# One-time: deploy the job (same image as the API, different entrypoint/command)
gcloud run jobs create license-lifecycle \
  --image "$IMAGE" \
  --command node --args "dist/jobs/license-lifecycle.job" \
  --set-secrets DATABASE_URL=authvital-db-url:latest \
  --max-retries 1 --task-timeout 300s

# Trigger it every 15 minutes
gcloud scheduler jobs create http license-lifecycle-tick \
  --schedule "*/15 * * * *" \
  --uri "https://<region>-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/<project>/jobs/license-lifecycle:run" \
  --http-method POST --oauth-service-account-email <runner-sa>
```

### Alternative: Kubernetes CronJob

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: license-lifecycle
spec:
  schedule: "*/15 * * * *"
  concurrencyPolicy: Forbid   # never overlap runs
  jobTemplate:
    spec:
      backoffLimit: 1
      activeDeadlineSeconds: 300
      template:
        spec:
          restartPolicy: Never
          containers:
            - name: license-lifecycle
              image: <authvital-image>
              command: ["node", "dist/jobs/license-lifecycle.job"]
              envFrom:
                - secretRef: { name: authvital-secrets }
```

Set **concurrency = 1 / `Forbid`** so ticks never overlap.

## Cadence & observability

- **Cadence:** every 15 min is plenty (period boundaries are day-grained). Even
  hourly is fine — read-time checks already deny expired access immediately;
  the job just makes stored state honest.
- **Exit codes:** `0` success, `1` failure → let the scheduler alert/retry.
- **Logs:** the sweep logs `expired=N reconciled=M/checked=K` and warns with the
  exact drift corrections. Wire these into your alerting; a non-zero
  `reconciled` count is a signal that a write path is failing to stay atomic.

## Future work

- **Renewal hook:** when Stripe / control-plane billing lands, a webhook should
  extend `currentPeriodEnd` (and, for lapsed-then-paid, call `renewSubscription`).
  The sweep then only ever sees genuinely-dead subscriptions.
- **`PAST_DUE` grace:** currently `PAST_DUE` past its period is expired like the
  rest. A future refinement: a grace window before hard expiry, driven by the
  billing signal rather than the calendar.
