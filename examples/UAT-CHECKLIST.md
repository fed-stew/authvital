# AuthVital Examples — UAT Persona Matrix

Persona-by-persona acceptance walkthrough for the local examples stack. Boot it
first (see [README.md](./README.md)), then work down each table, logging in as
the persona, and mark **Pass/Fail**.

> All passwords are local-dev seed values. `password123` for the `@acme`/`@globex`
> crew, `test1234` for the `licenseco`/`otherco` crew, `admin123` for Super Admin.

---

## A. React SPA — `app.lvh.me` (client `local-spa-client-id`)

| Persona                | Login at (host)                 | App       | Expected outcome                                                                                              | Pass/Fail |
| ---------------------- | ------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------ | --------- |
| `alice@acme.com`       | `https://app.lvh.me`            | spa-react | Authenticates; claims panel shows `app_roles` **including `admin`**; **Admin-only card visible**; tenant switcher lists **both `acme` + `globex`** |  |
| `bob@acme.com`         | `https://app.lvh.me`            | spa-react | Authenticates; `app_roles` = `editor` (no `admin`); **Admin-only card NOT rendered**                          |  |
| `charlie@globex.com`   | `https://app.lvh.me`            | spa-react | Authenticates on `globex`; `app_roles` = `admin` + `editor`; Admin-only card visible                          |  |
| `alice@acme.com`       | `https://acme.app.lvh.me`       | spa-react | Page shows it is running under the **`acme` tenant subdomain context** (subdomain-derived tenant)             |  |
| `alice@acme.com`       | `https://app.lvh.me`            | spa-react | "Manage in the hosted console" card shows **deep-links** (Manage members / Manage app access / Access matrix / SSO / Domains / Billing / Audit) that open real `/tenant/:id/*` console routes; plus **Switch app**, **Switch org**, **Account settings** |  |
| any signed-in user     | `https://app.lvh.me`            | spa-react | **Account settings** link opens `/account/settings` (real route — no 404); **Switch app/org** open `/auth/app-picker` and `/auth/org-picker` |  |

> **Hosted-first check:** the SPA performs **no in-app tenant-admin CRUD**.
> Every management action is a deep-link into the AuthVital console. Confirm the
> links resolve to real console pages (not the Super-Admin `/admin` area).

---

## B. Seat App — `licenseco.seat.lvh.me` (client `seat-app-client-id`, PER_SEAT)

| Persona                    | Login at (host)                       | App      | Expected outcome                                                                                     | Pass/Fail |
| -------------------------- | ------------------------------------- | -------- | --------------------------------------------------------------------------------------------------- | --------- |
| `owner@licenseco.test`     | `https://licenseco.seat.lvh.me`       | spa-seat | License panel shows seat; can **view + manage seats + provision inventory** (full control)          |  |
| `billing@licenseco.test`   | `https://licenseco.seat.lvh.me`       | spa-seat | Can **view + manage + provision** (billing tier; no other tenant-admin controls)                    |  |
| `admin@licenseco.test`     | `https://licenseco.seat.lvh.me`       | spa-seat | Can **view + manage seats**, but **NO provision control** (provision UI hidden/disabled)            |  |
| `member@licenseco.test`    | `https://licenseco.seat.lvh.me`       | spa-seat | **View only** — no manage, no provision                                                              |  |
| `owner@otherco.test`       | `https://licenseco.seat.lvh.me`       | spa-seat | **Cross-tenant block** — empty roles/seats (fails closed; no error page, just nothing to manage)    |  |

> **Seat controls are deep-links now.** "Manage seats" opens the console
> `/tenant/:id/licenses`; "Provision inventory / billing" opens `/tenant/:id/billing`.
> The buttons are gated by the same tier the console enforces server-side
> (owner/billing → provision; admin → manage; member → view only).

---

## D. Hosted console — `/tenant/:tenantId/*` (deep-linked from the SPAs)

Open these by clicking the deep-links in the SPAs (or navigate directly). The
console enforces the tenant permissions from §3 of the
[authorization model](../docs/sdk/authorization-model.md). Use the `licenseco`
personas to exercise the gating.

| Feature | Route | Persona | Expected outcome | Pass/Fail |
| ------- | ----- | ------- | ---------------- | --------- |
| Members | `/tenant/:id/members` | `member@licenseco.test` | Read-only member list; **no** invite/remove/role controls (member has `members:view` only) |  |
| Members | `/tenant/:id/members` | `admin@licenseco.test` | Can invite/remove/change roles (`members:*`) |  |
| Access Matrix | `/tenant/:id/access-matrix` | `member@licenseco.test` | Members×apps grid renders read-only (`app-access:view`) |  |
| Licenses | `/tenant/:id/licenses` | `admin@licenseco.test` | Can assign/revoke seats (`licenses:manage`); **no** provision/subscription controls |  |
| Billing | `/tenant/:id/billing` | `admin@licenseco.test` | Can **view** billing (`billing:view`); **cannot** provision/resize/cancel (no `licenses:provision`/`billing:manage`) |  |
| Billing | `/tenant/:id/billing` | `owner@licenseco.test` / `billing@licenseco.test` | Can provision/resize/cancel subscriptions |  |
| Usage trends | `/tenant/:id/billing` (usage section) | `admin@licenseco.test` | Seat-usage trend chart visible (`billing:view`); may be sparse until daily snapshots accrue (known gap) |  |
| Audit | `/tenant/:id/audit` | `member@licenseco.test` | **No access** — member lacks `audit:view` |  |
| Audit | `/tenant/:id/audit` | `admin@licenseco.test` | Can **view** the audit log; **Export CSV is hidden/denied** (no `audit:export`) |  |
| Audit export | `/tenant/:id/audit/export` | `owner@licenseco.test` | Can **export** the audit log to CSV (`audit:export`, Owner only) |  |
| Audit contents | `/tenant/:id/audit` | any with `audit:view` | Member/invite/app-access/license actions appear; subscription/SSO/domain changes do **not** yet (deferred instrumentation — known gap) |  |
| SSO | `/tenant/:id/sso` | `owner@licenseco.test` | Can configure tenant SSO (`tenant:sso:manage`) |  |
| Domains | `/tenant/:id/domains` | `admin@licenseco.test` | Can add/verify/remove domains (`domains:manage`) |  |
| App switcher | in-console AppSwitcher / `/auth/app-picker` | any | Can switch between the tenant's apps without a full re-login dance |  |
| Account settings | `/account/settings` | any | Profile (read-only), security/MFA, organizations list, active sessions (sessions may degrade to a note — known guard gap) |  |

---

## C. Express BFF — `bff.lvh.me` (client `web-bff-client-id`, PKCE)

No webhook prereq: the Web BFF webhook is **seeded** (URL + enabled + event
filter), so `/events` works out of the box — no `/admin` step (README §3).

| Step                                   | Host / endpoint                          | Expected outcome                                                                                                   | Pass/Fail |
| -------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------- |
| Login (PKCE)                           | `https://bff.lvh.me/api/auth/login`      | Redirects through `auth.lvh.me`, returns to authenticated home showing **validated claims + memberships + license/usage** |  |
| Protected route (logged **out**)       | `https://bff.lvh.me/api/protected`       | Returns **401**                                                                                                    |  |
| Protected route (logged **in**)        | `https://bff.lvh.me/api/protected`       | Returns **200** with validated claims                                                                              |  |
| Permission check                       | `https://bff.lvh.me/api/permission?permission=content:edit` | JSON reflects `hasAppPermission` for the logged-in user's claims                              |  |
| M2M token                              | `https://bff.lvh.me/api/m2m`             | Returns token **metadata only** (`token_preview`, scopes, subject, exp) — never the raw token                     |  |
| Webhook round-trip                     | trigger an event for the **Web BFF app** → `https://bff.lvh.me/events` | `/events` shows the **verified event (Verified = yes) + updated in-memory identity** — no config needed |  |

### Suggested webhook triggers (Step 6)

> **Webhooks are per-application.** An event only reaches the Web BFF webhook if
> it's emitted for the **Web BFF app** — i.e. for a user/tenant that has Web BFF
> access. The seed gives **Alice (`alice@acme.com`) Web BFF access on acme**, so
> acme member/app-access events reach the BFF. (Seat App / `licenseco` license
> events go to the *Seat App's* webhook, NOT the BFF.)

Pick any one and confirm it lands on `/events`, verified, with the identity
table updated:

- **subject.\* + member.\* (no login/admin needed):** sign a new user up scoped
  to the Web BFF app — the public signup endpoint accepts an `applicationId`:
  ```bash
  APPID=$(docker exec authvital-postgres psql -U authvital -d authvital -tA \
    -c "SELECT id FROM applications WHERE slug='web-bff';")
  curl -sk -X POST https://auth.lvh.me/api/auth/signup \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"demo-$(date +%s)@bffdemo.com\",\"password\":\"password123\",\
         \"givenName\":\"Web\",\"familyName\":\"Hook\",\"applicationId\":\"$APPID\"}"
  ```
  `/events` then shows `subject.created` + `member.joined`, both Verified = yes.
- **member.\* via the console:** suspend/reactivate or change the role of an
  acme member who has Web BFF access (Alice is seeded with it).
- **subject.updated:** update Alice's profile (name) — she has Web BFF access.

---

## Sign-off

| Section                     | Result | Notes |
| --------------------------- | ------ | ----- |
| A. React SPA                |  Pass /  Fail | |
| B. Seat App (licensing)     |  Pass /  Fail | |
| C. Express BFF              |  Pass /  Fail | |
| D. Hosted console           |  Pass /  Fail | |

Tester: ______________________   Date: ____________
