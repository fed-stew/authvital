import * as crypto from 'crypto';
import type {
  SyncEvent,
  SubjectCreatedEvent,
  SubjectUpdatedEvent,
  SubjectDeletedEvent,
  MemberJoinedEvent,
  MemberLeftEvent,
  MemberRoleChangedEvent,
  LicenseAssignedEvent,
  LicenseRevokedEvent,
} from '@authvital/shared';
import { jwksUri } from './config';

// ===========================================================================
// In-memory identity store (no Postgres/Prisma — this is a demo mirror)
// ===========================================================================

export interface Identity {
  sub: string;
  email?: string;
  givenName?: string;
  familyName?: string;
  status: 'active' | 'deleted';
  /** tenantId -> tenant role slugs */
  memberships: Record<string, string[]>;
  licenses: Array<{ assignmentId: string; name: string }>;
  updatedAt: string;
}

export interface CapturedEvent {
  receivedAt: string;
  type: string;
  verified: boolean;
  eventId?: string;
  summary: string;
  payload: unknown;
}

const events: CapturedEvent[] = [];
const identities = new Map<string, Identity>();
const MAX_IDENTITIES = 500;

export function getEvents(): CapturedEvent[] {
  return events.slice();
}
export function getIdentities(): Identity[] {
  return [...identities.values()];
}

function touch(sub: string): Identity {
  let id = identities.get(sub);
  if (!id) {
    id = { sub, status: 'active', memberships: {}, licenses: [], updatedAt: '' };
    identities.set(sub, id);
    // Bound memory: evict the stalest identity (oldest updatedAt) when full.
    if (identities.size > MAX_IDENTITIES) {
      let oldestKey: string | undefined;
      let oldestAt = Infinity;
      for (const [key, ident] of identities) {
        const at = Date.parse(ident.updatedAt) || 0;
        if (at < oldestAt) {
          oldestAt = at;
          oldestKey = key;
        }
      }
      if (oldestKey !== undefined) identities.delete(oldestKey);
    }
  }
  id.updatedAt = new Date().toISOString();
  return id;
}

// ===========================================================================
// AuthVitalEventHandler — abstract dispatcher (the SDK does not ship one, so
// we define the extension point here). Override the on* hooks in a subclass.
// ===========================================================================

export abstract class AuthVitalEventHandler {
  async handle(event: SyncEvent): Promise<void> {
    switch (event.type) {
      case 'subject.created': return this.onSubjectCreated(event);
      case 'subject.updated': return this.onSubjectUpdated(event);
      case 'subject.deleted': return this.onSubjectDeleted(event);
      case 'member.joined': return this.onMemberJoined(event);
      case 'member.left': return this.onMemberLeft(event);
      case 'member.role_changed': return this.onMemberRoleChanged(event);
      case 'license.assigned': return this.onLicenseAssigned(event);
      case 'license.revoked': return this.onLicenseRevoked(event);
      default: return this.onOther(event);
    }
  }

  protected async onSubjectCreated(_e: SubjectCreatedEvent): Promise<void> {}
  protected async onSubjectUpdated(_e: SubjectUpdatedEvent): Promise<void> {}
  protected async onSubjectDeleted(_e: SubjectDeletedEvent): Promise<void> {}
  protected async onMemberJoined(_e: MemberJoinedEvent): Promise<void> {}
  protected async onMemberLeft(_e: MemberLeftEvent): Promise<void> {}
  protected async onMemberRoleChanged(_e: MemberRoleChangedEvent): Promise<void> {}
  protected async onLicenseAssigned(_e: LicenseAssignedEvent): Promise<void> {}
  protected async onLicenseRevoked(_e: LicenseRevokedEvent): Promise<void> {}
  protected async onOther(_e: SyncEvent): Promise<void> {}
}

// ===========================================================================
// Concrete handler: mutate the in-memory identity map on each event type.
// ===========================================================================

export class InMemoryEventHandler extends AuthVitalEventHandler {
  protected async onSubjectCreated(e: SubjectCreatedEvent): Promise<void> {
    const id = touch(e.data.sub);
    id.status = 'active';
    id.email = e.data.email ?? id.email;
    id.givenName = e.data.given_name ?? id.givenName;
    id.familyName = e.data.family_name ?? id.familyName;
  }

  protected async onSubjectUpdated(e: SubjectUpdatedEvent): Promise<void> {
    const id = touch(e.data.sub);
    id.email = e.data.email ?? id.email;
    id.givenName = e.data.given_name ?? id.givenName;
    id.familyName = e.data.family_name ?? id.familyName;
  }

  protected async onSubjectDeleted(e: SubjectDeletedEvent): Promise<void> {
    const id = touch(e.data.sub);
    id.status = 'deleted';
  }

  protected async onMemberJoined(e: MemberJoinedEvent): Promise<void> {
    const id = touch(e.data.sub);
    id.email = e.data.email ?? id.email;
    id.givenName = e.data.given_name ?? id.givenName;
    id.familyName = e.data.family_name ?? id.familyName;
    id.memberships[e.tenant_id] = e.data.tenant_roles ?? [];
  }

  protected async onMemberLeft(e: MemberLeftEvent): Promise<void> {
    const id = touch(e.data.sub);
    delete id.memberships[e.tenant_id];
  }

  protected async onMemberRoleChanged(e: MemberRoleChangedEvent): Promise<void> {
    const id = touch(e.data.sub);
    id.memberships[e.tenant_id] = e.data.tenant_roles ?? [];
  }

  protected async onLicenseAssigned(e: LicenseAssignedEvent): Promise<void> {
    const id = touch(e.data.sub);
    id.licenses.push({ assignmentId: e.data.assignment_id, name: e.data.license_type_name });
  }

  protected async onLicenseRevoked(e: LicenseRevokedEvent): Promise<void> {
    const id = touch(e.data.sub);
    id.licenses = id.licenses.filter((l) => l.assignmentId !== e.data.assignment_id);
  }
}

// ===========================================================================
// Detached-signature verification (JWKS-based, no shared secret).
//
// AuthVital signs identity-sync webhooks with RSA-SHA256 over
// `${X-AuthVital-Timestamp}.${rawBody}` and sends the base64 signature in
// X-AuthVital-Signature plus the signing key id in X-AuthVital-Key-Id. We fetch
// the public key from the IdP's JWKS and verify with Node crypto.
// ===========================================================================

interface Jwk { kid: string; kty: string; n?: string; e?: string; [k: string]: unknown }
let jwksCache: { keys: Jwk[] } | null = null;
let lastFetchAt = 0;
const JWKS_REFETCH_INTERVAL_MS = 60_000;

async function getJwk(kid: string): Promise<Jwk> {
  if (!jwksCache || !jwksCache.keys.some((k) => k.kid === kid)) {
    // Throttle refetches so an attacker spamming unknown kids can't make us
    // hammer the IdP's JWKS endpoint.
    if (jwksCache && Date.now() - lastFetchAt <= JWKS_REFETCH_INTERVAL_MS) {
      throw new Error('Unknown kid (JWKS refetch throttled)');
    }
    lastFetchAt = Date.now();
    const res = await fetch(jwksUri);
    if (!res.ok) throw new Error(`JWKS fetch failed: HTTP ${res.status}`);
    jwksCache = (await res.json()) as { keys: Jwk[] };
  }
  const jwk = jwksCache.keys.find((k) => k.kid === kid);
  if (!jwk) throw new Error(`No JWKS key for kid=${kid}`);
  return jwk;
}

async function verifyDetachedSignature(input: string, signatureB64: string, kid: string): Promise<boolean> {
  const jwk = await getJwk(kid);
  const key = crypto.createPublicKey({ key: jwk as crypto.JsonWebKey, format: 'jwk' });
  return crypto.verify('RSA-SHA256', Buffer.from(input), key, Buffer.from(signatureB64, 'base64'));
}

// ===========================================================================
// WebhookRouter — verifies + captures + dispatches. (Our own minimal version;
// the SDK exposes JWKS/verify primitives but no ready-made router.)
// ===========================================================================

function headerValue(headers: Record<string, string | string[] | undefined>, name: string): string {
  const v = headers[name];
  return Array.isArray(v) ? v[0] : (v ?? '');
}

/**
 * Defensively parse a webhook timestamp header into epoch millis.
 * Accepts unix seconds, unix millis, or an ISO-8601 string.
 * Returns NaN when the value is unparseable.
 */
function parseTimestampMs(raw: string): number {
  if (/^\d+$/.test(raw)) {
    const n = Number(raw);
    // Anything below 1e12 can't plausibly be millis (that's pre-2001),
    // so treat it as epoch seconds.
    return n < 1e12 ? n * 1000 : n;
  }
  return Date.parse(raw);
}

const REPLAY_TOLERANCE_MS = 5 * 60 * 1000;

// Bounded FIFO set of processed event ids for replay/duplicate suppression.
const seenEventIds = new Set<string>();
const MAX_SEEN_EVENT_IDS = 1000;

function rememberEventId(id: string): void {
  seenEventIds.add(id);
  if (seenEventIds.size > MAX_SEEN_EVENT_IDS) {
    // Set iterates in insertion order — first entry is the oldest.
    const oldest = seenEventIds.values().next().value;
    if (oldest !== undefined) seenEventIds.delete(oldest);
  }
}

function summarize(event: SyncEvent | null, fallbackType: string): string {
  if (!event) return `${fallbackType} (unparseable body)`;
  const data = event.data as Record<string, unknown>;
  const who = (data.email as string) || (data.sub as string) || event.tenant_id || '';
  return `${event.type} · ${who}`;
}

export class WebhookRouter {
  constructor(private readonly handler: AuthVitalEventHandler) {}

  async receive(
    headers: Record<string, string | string[] | undefined>,
    rawBody: string,
  ): Promise<{ verified: boolean; type: string; error?: string }> {
    const signature = headerValue(headers, 'x-authvital-signature');
    const kid = headerValue(headers, 'x-authvital-key-id');
    const timestamp = headerValue(headers, 'x-authvital-timestamp');
    const eventType = headerValue(headers, 'x-authvital-event-type') || '(unknown)';
    const eventId = headerValue(headers, 'x-authvital-event-id') || undefined;

    let event: SyncEvent | null = null;
    try {
      event = JSON.parse(rawBody) as SyncEvent;
    } catch {
      event = null;
    }

    let verified = false;
    let error: string | undefined;
    if (signature && kid && timestamp) {
      const tsMs = parseTimestampMs(timestamp);
      if (!Number.isFinite(tsMs) || Math.abs(Date.now() - tsMs) > REPLAY_TOLERANCE_MS) {
        error = 'timestamp outside tolerance';
      } else {
        try {
          verified = await verifyDetachedSignature(`${timestamp}.${rawBody}`, signature, kid);
          if (!verified) error = 'signature mismatch';
        } catch (e) {
          error = e instanceof Error ? e.message : String(e);
        }
      }
    } else {
      error = 'missing signature headers';
    }

    // Duplicate suppression: a verified event we've already processed is
    // still captured (for visibility) but never re-dispatched.
    let duplicate = false;
    if (verified && eventId) {
      if (seenEventIds.has(eventId)) {
        duplicate = true;
        error = 'duplicate event id';
      } else {
        rememberEventId(eventId);
      }
    }

    const type = event?.type ?? eventType;
    events.unshift({
      receivedAt: new Date().toISOString(),
      type,
      verified,
      eventId,
      summary: summarize(event, eventType),
      payload: event ?? rawBody,
    });
    if (events.length > 100) events.pop();

    // Only mutate identity state for authentic, first-seen (verified) events.
    if (verified && !duplicate && event) {
      await this.handler.handle(event);
    }

    return { verified, type, error };
  }
}

export const webhookRouter = new WebhookRouter(new InMemoryEventHandler());
