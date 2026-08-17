# Migration: `app_client_split`

Splits the OAuth **credential** out of the `applications` container into a new
`application_clients` table — the "Entra-style app container + credential"
model.

## What moves

`applications` (now a pure container / product) **loses** these columns, which
move verbatim to `application_clients`:

- `type`
- `client_id`
- `client_secret`
- `redirect_uris`
- `post_logout_redirect_uris`
- `initiate_login_uri`
- `allowed_web_origins`
- `access_token_ttl`
- `refresh_token_ttl`
- `m2m_trusted_all_tenants`
- `m2m_allowed_scopes`

FKs repointed from `applications` to `application_clients`:

- `authorization_codes.application_id` -> `authorization_codes.application_client_id`
- `refresh_tokens.application_id` -> `refresh_tokens.application_client_id`
- `m2m_tenant_grants.application_id` -> `m2m_tenant_grants.application_client_id`

##  Client IDs are preserved (no re-issuance)

The data migration copies `client_id` (and the hashed `client_secret`) **as-is**
into `application_clients`. Existing OAuth clients keep working with their exact
same `clientId` / secret. Nothing is re-generated.

## Invariant enforced

`UNIQUE (application_id, type)` on `application_clients` → at most one `SPA` and
one `MACHINE` credential per application. A single `client_id` is globally
unique and belongs to exactly one credential of exactly one type, so a
`clientId` can never be both types.

Security invariants preserved:

- `client_secret` stays hashed and is only populated for `MACHINE` clients
  (`SPA` clients keep `NULL`). This migration does not alter secret values.
- Deny-by-default M2M authorization (`m2m_trusted_all_tenants`,
  `m2m_allowed_scopes`, and `m2m_tenant_grants`) now hangs off the `MACHINE`
  `application_clients` row.

## Forward steps (what `migration.sql` does)

1. `CREATE TABLE application_clients`.
2. `INSERT` one credential row per existing `applications` row (1:1 — every app
   currently has exactly one credential), copying all credential columns and
   the existing `client_id`/`client_secret`.
3. Create unique/normal indexes incl. `UNIQUE (application_id, type)` and
   `UNIQUE (client_id)`; add FK to `applications`.
4. For each of `authorization_codes`, `refresh_tokens`, `m2m_tenant_grants`:
   add nullable `application_client_id`, backfill by matching old
   `application_id` → new credential's `id`, set `NOT NULL`, drop old
   index/FK/column, add new index + FK.
5. Drop the moved credential columns (and their indexes) from `applications`.

### Note on `gen_random_uuid()`

The new `application_clients.id` values are generated with
`gen_random_uuid()::text` (pgcrypto / PostgreSQL 13+). If your target lacks it,
replace with `md5(random()::text || clock_timestamp()::text)`. These ids are
brand-new surrogate keys and are **not** exposed as credentials.

## Rollback outline (manual — not auto-generated)

There is no automatic down migration. To roll back manually:

1. Re-add the credential columns to `applications`
   (`type`, `client_id`, `client_secret`, `redirect_uris`,
   `post_logout_redirect_uris`, `initiate_login_uri`, `allowed_web_origins`,
   `access_token_ttl`, `refresh_token_ttl`, `m2m_trusted_all_tenants`,
   `m2m_allowed_scopes`) as nullable.
2. Copy values back:
   `UPDATE applications a SET ... FROM application_clients c WHERE c.application_id = a.id;`
   (safe because the split was 1:1).
3. Re-add `application_id` columns to `authorization_codes`, `refresh_tokens`,
   `m2m_tenant_grants`; backfill from `application_clients.application_id` via the
   `application_client_id` join; restore old indexes/FKs; drop the
   `application_client_id` columns.
4. Restore `applications` uniqueness/index on `client_id`, set columns
   `NOT NULL` / defaults as in the original schema.
5. `DROP TABLE application_clients`.

Because `client_id` values were preserved on the way out, a rollback restores
the original credentials exactly.
