/**
 * Event filter matching — faithful port of
 * SyncEventService.eventMatchesFilter() in
 * packages/backend/src/sync/sync-event.service.ts.
 *
 * Supports exact match ("user.created") or trailing wildcard ("user.*").
 * An empty filter list means "match everything" AT THE CALL SITE (the
 * backend checks `filters.length === 0` before calling) — this function
 * itself returns false for an empty list, same as the original.
 */
export function eventMatchesFilter(
  eventType: string,
  filters: string[],
): boolean {
  for (const filter of filters) {
    if (filter.endsWith('.*')) {
      const prefix = filter.slice(0, -1); // "user.*" -> "user."
      if (eventType.startsWith(prefix)) {
        return true;
      }
    } else if (filter === eventType) {
      return true;
    }
  }
  return false;
}
