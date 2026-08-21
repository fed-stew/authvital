import { eventMatchesFilter } from './event-filter';

/**
 * Parity tests against SyncEventService.eventMatchesFilter()
 * (packages/backend/src/sync/sync-event.service.ts).
 */
describe('eventMatchesFilter', () => {
  it('should match exact filters', () => {
    expect(eventMatchesFilter('user.created', ['user.created'])).toBe(true);
    expect(eventMatchesFilter('user.created', ['user.deleted'])).toBe(false);
  });

  it('should match trailing wildcards ("user.*")', () => {
    expect(eventMatchesFilter('user.created', ['user.*'])).toBe(true);
    expect(eventMatchesFilter('user.deleted', ['user.*'])).toBe(true);
    expect(eventMatchesFilter('invite.created', ['user.*'])).toBe(false);
  });

  it('should match nested types against wildcards by prefix', () => {
    // "user.*" -> prefix "user." — same startsWith semantics as the backend
    expect(eventMatchesFilter('user.role.changed', ['user.*'])).toBe(true);
  });

  it('should not treat the wildcard as matching the bare category', () => {
    // "user" does not start with "user." — parity with backend behaviour
    expect(eventMatchesFilter('user', ['user.*'])).toBe(false);
  });

  it('should return true if ANY filter matches', () => {
    expect(
      eventMatchesFilter('license.assigned', ['user.*', 'license.assigned']),
    ).toBe(true);
  });

  it('should return false for an empty filter list (call sites treat empty as match-all)', () => {
    expect(eventMatchesFilter('user.created', [])).toBe(false);
  });
});
