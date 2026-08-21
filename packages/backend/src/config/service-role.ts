/**
 * SERVICE_ROLE — which plane(s) this backend instance serves.
 *
 *  - 'all' (DEFAULT): everything in one process — exact pre-split behavior.
 *    Single-container self-hosters never need to set anything.
 *  - 'public': the DATA PLANE — OAuth/OIDC, login UI (/auth/*), member-facing
 *    tenant/licensing/invitation APIs, sync polling, SDK integration APIs.
 *    No admin controllers, no /admin UI, no background crons.
 *  - 'admin': the CONTROL PLANE — super-admin dashboard (/admin/*), system
 *    webhook CRUD, Pub/Sub admin, audit read/export, instance config write.
 *    Runs the background crons. Deploy behind internal ingress / IAP.
 */
export type ServiceRole = 'public' | 'admin' | 'all';

const VALID_ROLES: readonly ServiceRole[] = ['public', 'admin', 'all'];

/**
 * Resolve SERVICE_ROLE, FAILING FAST on invalid values.
 *
 * Deliberately stricter than WEBHOOK_DELIVERY_MODE's forgiving fallback:
 * a typo silently becoming 'all' would register the admin control plane on
 * an internet-facing public service. Refusing to boot is the only safe
 * default for a security-splitting knob.
 */
export function resolveServiceRole(
  raw: string | undefined = process.env.SERVICE_ROLE,
): ServiceRole {
  if (raw === undefined || raw === '') {
    return 'all';
  }
  if ((VALID_ROLES as readonly string[]).includes(raw)) {
    return raw as ServiceRole;
  }
  throw new Error(
    `Invalid SERVICE_ROLE "${raw}" — must be one of: ${VALID_ROLES.join(', ')}. ` +
      `Refusing to boot: silently defaulting could expose the admin control ` +
      `plane on a public service.`,
  );
}
