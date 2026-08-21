import type { AuthVitalPubSubEvent } from '@authvital/shared';
import { PubSubParseError } from './errors';
import { parsePubSubMessage } from './parse';
import { createPubSubDispatcher } from './dispatcher';
import { InMemoryDedupeStore } from './dedupe';
import { createPubSubPushHandler } from './push-handler';

// =============================================================================
// Fixtures
// =============================================================================

const memberJoinedEnvelope = {
  id: 'evt_member_1',
  source: 'authvital' as const,
  event_type: 'member.joined' as const,
  event_source: 'sync_event' as const,
  timestamp: '2026-08-21T00:00:00.000Z',
  tenant_id: 'tenant-1',
  application_id: 'app-1',
  data: {
    membership_id: 'mem-1',
    sub: 'user-1',
    email: 'user@example.com',
    tenant_roles: ['member'],
  },
};

// Canonical tenant.created payload (system events are strictly typed now)
const tenantCreatedEnvelope = {
  id: 'evt_system_1',
  source: 'authvital' as const,
  event_type: 'tenant.created' as const,
  event_source: 'system_webhook' as const,
  timestamp: '2026-08-21T00:00:00.000Z',
  tenant_id: 'tenant-1',
  application_id: null,
  data: {
    tenant_id: 'tenant-1',
    name: 'Acme',
    slug: 'acme',
    created_at: '2026-08-21T00:00:00.000Z',
    settings: { theme: 'dark' },
    created_by_sub: 'user-1',
  },
};

function asPullMessage(envelope: object) {
  return { data: Buffer.from(JSON.stringify(envelope)), attributes: {} };
}

function asPushBody(envelope: object) {
  return {
    message: {
      data: Buffer.from(JSON.stringify(envelope)).toString('base64'),
      attributes: {},
      messageId: '123',
    },
    subscription: 'projects/p/subscriptions/s',
  };
}

// =============================================================================
// parsePubSubMessage
// =============================================================================

describe('parsePubSubMessage', () => {
  it('should parse a pull Message-like object (Buffer data)', () => {
    const event = parsePubSubMessage(asPullMessage(memberJoinedEnvelope));

    expect(event.id).toBe('evt_member_1');
    expect(event.event_type).toBe('member.joined');
    expect(event.data).toEqual(memberJoinedEnvelope.data);
  });

  it('should parse a pull Message-like object with string data', () => {
    const event = parsePubSubMessage({
      data: JSON.stringify(tenantCreatedEnvelope),
    });

    expect(event.event_type).toBe('tenant.created');
    expect(event.event_source).toBe('system_webhook');
  });

  it('should parse a pull Message-like object with Uint8Array data', () => {
    const bytes = new TextEncoder().encode(JSON.stringify(memberJoinedEnvelope));
    const event = parsePubSubMessage({ data: bytes });

    expect(event.id).toBe('evt_member_1');
  });

  it('should parse a push HTTP body (base64 data)', () => {
    const event = parsePubSubMessage(asPushBody(memberJoinedEnvelope));

    expect(event.id).toBe('evt_member_1');
    expect(event.tenant_id).toBe('tenant-1');
  });

  // Malformed matrix — every failure is a descriptive PubSubParseError
  it.each([
    [null, /Expected a Pub\/Sub message object/],
    ['a string', /Expected a Pub\/Sub message object/],
    [{ nothing: true }, /Unrecognized input shape/],
    [{ data: 42 }, /Unrecognized input shape/],
    [{ data: 'not json {' }, /not valid JSON/],
    [{ data: '"just a string"' }, /not an object envelope/],
    [{ data: JSON.stringify({ ...memberJoinedEnvelope, source: 'other' }) }, /source is "other"/],
    [{ data: JSON.stringify({ ...memberJoinedEnvelope, id: undefined }) }, /missing a string "id"/],
    [{ data: JSON.stringify({ ...memberJoinedEnvelope, event_type: '' }) }, /missing a string "event_type"/],
    [{ data: JSON.stringify({ ...memberJoinedEnvelope, event_source: 'smoke_signal' }) }, /"event_source" must be/],
    [{ data: JSON.stringify({ ...memberJoinedEnvelope, timestamp: 5 }) }, /missing a string "timestamp"/],
    [{ data: JSON.stringify({ ...memberJoinedEnvelope, data: null }) }, /missing an object "data"/],
    [{ message: { data: Buffer.from('nope{').toString('base64') } }, /not valid JSON/],
  ])('should throw PubSubParseError for malformed input %#', (input, pattern) => {
    expect(() => parsePubSubMessage(input)).toThrow(PubSubParseError);
    expect(() => parsePubSubMessage(input)).toThrow(pattern);
  });
});

// =============================================================================
// Type narrowing (compile-time check — the assertions run trivially, the
// real test is that this file TYPECHECKS with narrowed payload access)
// =============================================================================

describe('type narrowing', () => {
  it('should narrow event.data by event_type in a switch', () => {
    const event: AuthVitalPubSubEvent = parsePubSubMessage(
      asPullMessage(memberJoinedEnvelope),
    );

    switch (event.event_type) {
      case 'member.joined': {
        // Narrowed: MemberEventData & {given_name?, family_name?}
        const roles: string[] = event.data.tenant_roles;
        const membershipId: string = event.data.membership_id;
        expect(roles).toEqual(['member']);
        expect(membershipId).toBe('mem-1');
        break;
      }
      case 'license.assigned': {
        // Narrowed: LicenseEventData — this branch must typecheck too
        const licenseType: string = event.data.license_type_name;
        expect(licenseType).toBeDefined();
        break;
      }
      case 'tenant.created': {
        // Narrowed: TenantCreatedEventData (canonical strict contract)
        const slug: string = event.data.slug;
        const createdAt: string = event.data.created_at;
        const settings: Record<string, unknown> = event.data.settings;
        expect(event.event_source).toBe('system_webhook');
        expect({ slug, createdAt, settings }).toBeDefined();
        break;
      }
      default:
        break;
    }
  });

  it('should narrow system event payloads by event_type (strict canonical contract)', () => {
    const event: AuthVitalPubSubEvent = parsePubSubMessage(
      asPullMessage(tenantCreatedEnvelope),
    );

    switch (event.event_type) {
      case 'tenant.created': {
        const name: string = event.data.name; // required by canonical
        expect(name).toBe('Acme');
        expect(event.data.created_at).toBe('2026-08-21T00:00:00.000Z');
        expect(event.data.settings).toEqual({ theme: 'dark' });
        break;
      }
      case 'application.created': {
        // This branch must typecheck too — config/licensing blocks narrowed
        const uris: string[] = event.data.config.redirect_uris;
        const mode: string = event.data.licensing.mode;
        expect({ uris, mode }).toBeDefined();
        break;
      }
      case 'sso.provider_removed': {
        const removedAt: string = event.data.removed_at;
        expect(removedAt).toBeDefined();
        break;
      }
      default:
        break;
    }
  });
});

// =============================================================================
// Dispatcher routing
// =============================================================================

describe('createPubSubDispatcher', () => {
  const memberEvent = parsePubSubMessage(asPullMessage(memberJoinedEnvelope));
  const systemEvent = parsePubSubMessage(asPullMessage(tenantCreatedEnvelope));

  it('should route to exact-match handlers with typed data', async () => {
    const seen: string[] = [];
    const dispatcher = createPubSubDispatcher().on('member.joined', (event) => {
      seen.push(event.data.membership_id); // typed access
    });

    const result = await dispatcher.dispatch(memberEvent);

    expect(result).toBe('handled');
    expect(seen).toEqual(['mem-1']);
  });

  it('should route category wildcards using last-segment semantics (platform parity)', async () => {
    const hits: string[] = [];
    const dispatcher = createPubSubDispatcher()
      .on('member.*', (event) => void hits.push(`member:${event.event_type}`))
      .on('tenant.*', (event) => void hits.push(`tenant:${event.event_type}`))
      .on('*', (event) => void hits.push(`all:${event.event_type}`));

    await dispatcher.dispatch(memberEvent);
    await dispatcher.dispatch(systemEvent);

    expect(hits).toEqual([
      'member:member.joined',
      'all:member.joined',
      'tenant:tenant.created',
      'all:tenant.created',
    ]);
  });

  it("should NOT match 'tenant.*' against 'tenant.app.granted' (matches platform filter)", async () => {
    const hits: string[] = [];
    const dispatcher = createPubSubDispatcher()
      .on('tenant.*', () => void hits.push('tenant.*'))
      .on('tenant.app.*', () => void hits.push('tenant.app.*'));

    // Proper canonical tenant.app.granted envelope (user-level grant mode)
    await dispatcher.dispatch({
      id: 'evt_system_2',
      source: 'authvital',
      event_type: 'tenant.app.granted',
      event_source: 'system_webhook',
      timestamp: '2026-08-21T00:00:00.000Z',
      tenant_id: 'tenant-1',
      application_id: null,
      data: {
        tenant_id: 'tenant-1',
        application_id: 'app-1',
        user_id: 'user-1',
        access_type: 'GRANTED',
      },
    } as AuthVitalPubSubEvent);

    expect(hits).toEqual(['tenant.app.*']);
  });

  it('should invoke onAny ONLY when nothing else matched', async () => {
    const fallback = jest.fn();
    const dispatcher = createPubSubDispatcher()
      .on('member.joined', jest.fn())
      .onAny(fallback);

    expect(await dispatcher.dispatch(memberEvent)).toBe('handled');
    expect(fallback).not.toHaveBeenCalled();

    expect(await dispatcher.dispatch(systemEvent)).toBe('handled');
    expect(fallback).toHaveBeenCalledTimes(1);
  });

  it("should return 'unhandled' when nothing matches and no onAny exists", async () => {
    const dispatcher = createPubSubDispatcher().on('license.*', jest.fn());

    expect(await dispatcher.dispatch(memberEvent)).toBe('unhandled');
  });

  it('should propagate handler errors (caller decides ack/nack)', async () => {
    const dispatcher = createPubSubDispatcher().on('member.joined', () => {
      throw new Error('db down');
    });

    await expect(dispatcher.dispatch(memberEvent)).rejects.toThrow('db down');
  });

  // ---------------------------------------------------------------------------
  // Dedupe integration
  // ---------------------------------------------------------------------------

  describe('with dedupeStore', () => {
    it('should skip duplicate ids and record after success', async () => {
      const store = new InMemoryDedupeStore();
      const handler = jest.fn();
      const dispatcher = createPubSubDispatcher({ dedupeStore: store }).on(
        'member.joined',
        handler,
      );

      expect(await dispatcher.dispatch(memberEvent)).toBe('handled');
      expect(await dispatcher.dispatch(memberEvent)).toBe('duplicate');
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should NOT record the id when a handler throws (redelivery retries)', async () => {
      const store = new InMemoryDedupeStore();
      const handler = jest
        .fn()
        .mockImplementationOnce(() => {
          throw new Error('transient');
        })
        .mockImplementation(() => undefined);
      const dispatcher = createPubSubDispatcher({ dedupeStore: store }).on(
        'member.joined',
        handler,
      );

      await expect(dispatcher.dispatch(memberEvent)).rejects.toThrow('transient');
      // Redelivery gets a second chance
      expect(await dispatcher.dispatch(memberEvent)).toBe('handled');
      expect(handler).toHaveBeenCalledTimes(2);
    });
  });
});

// =============================================================================
// InMemoryDedupeStore
// =============================================================================

describe('InMemoryDedupeStore', () => {
  it('should expire entries after their TTL', async () => {
    jest.useFakeTimers();
    try {
      const store = new InMemoryDedupeStore({ ttlMs: 1000 });
      await store.add('evt-1');

      expect(await store.has('evt-1')).toBe(true);
      jest.advanceTimersByTime(1001);
      expect(await store.has('evt-1')).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it('should evict oldest entries beyond maxEntries (bounded memory)', async () => {
    const store = new InMemoryDedupeStore({ maxEntries: 3 });
    await store.add('a');
    await store.add('b');
    await store.add('c');
    await store.add('d'); // evicts 'a'

    expect(store.size).toBe(3);
    expect(await store.has('a')).toBe(false);
    expect(await store.has('d')).toBe(true);
  });

  it('should honor per-entry TTL overrides', async () => {
    jest.useFakeTimers();
    try {
      const store = new InMemoryDedupeStore({ ttlMs: 60_000 });
      await store.add('short', 100);

      jest.advanceTimersByTime(200);
      expect(await store.has('short')).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });
});

// =============================================================================
// Push handler status mapping
// =============================================================================

describe('createPubSubPushHandler', () => {
  it('should return 204 for handled events (Pub/Sub acks 2xx)', async () => {
    const dispatcher = createPubSubDispatcher().on('member.joined', jest.fn());
    const handle = createPubSubPushHandler(dispatcher);

    const result = await handle(asPushBody(memberJoinedEnvelope));

    expect(result).toEqual({ status: 204, outcome: 'handled' });
  });

  it('should return 204 for duplicates and unhandled events (terminal — nothing to retry)', async () => {
    const store = new InMemoryDedupeStore();
    const dispatcher = createPubSubDispatcher({ dedupeStore: store }).on(
      'member.joined',
      jest.fn(),
    );
    const handle = createPubSubPushHandler(dispatcher);

    await handle(asPushBody(memberJoinedEnvelope));
    const dup = await handle(asPushBody(memberJoinedEnvelope));
    const unhandled = await handle(asPushBody(tenantCreatedEnvelope));

    expect(dup).toEqual({ status: 204, outcome: 'duplicate' });
    expect(unhandled).toEqual({ status: 204, outcome: 'unhandled' });
  });

  it('should return 400 for parse errors (permanent — pair with a DLQ)', async () => {
    const handle = createPubSubPushHandler(createPubSubDispatcher());

    const result = await handle({ message: { data: 'bm90IGpzb24=' } }); // "not json"

    expect(result.status).toBe(400);
    expect(result.outcome).toBe('parse_error');
    expect(result.error).toMatch(/not valid JSON/);
  });

  it('should return 500 for handler errors (transient — Pub/Sub redelivers)', async () => {
    const onError = jest.fn();
    const dispatcher = createPubSubDispatcher().on('member.joined', () => {
      throw new Error('db down');
    });
    const handle = createPubSubPushHandler(dispatcher, { onError });

    const result = await handle(asPushBody(memberJoinedEnvelope));

    expect(result.status).toBe(500);
    expect(result.outcome).toBe('handler_error');
    expect(result.error).toBe('db down');
    expect(onError).toHaveBeenCalled();
  });
});
