/**
 * @authvital/server - Single-flight de-duplication
 *
 * Dedupe concurrent async operations by key: the first caller runs the
 * function; every concurrent caller with the same key awaits the SAME
 * promise. The entry is removed once the promise settles, so later calls
 * start fresh.
 *
 * Used to collapse concurrent refresh-token grants for one session into a
 * single request. With rotating refresh tokens, parallel refreshes (multi-tab
 * BFFs, or several in-flight requests from one tab) would otherwise present
 * the same token twice and trip the IdP's token-theft response.
 *
 * NOTE: this map is per-process only. Multi-instance deployments still race
 * across processes — the server-side rotation-reuse grace interval
 * (ApplicationClient.rotationReuseIntervalSeconds on the AuthVital backend)
 * covers that case.
 */

const inFlight = new Map<string, Promise<unknown>>();

/**
 * Run `fn` unless an operation with the same `key` is already in flight, in
 * which case the in-flight promise is returned instead.
 *
 * @param key - Stable identity of the operation (e.g. `refresh:<sessionId>`)
 * @param fn - The operation to run (invoked only for the first caller)
 * @returns The (possibly shared) operation promise
 */
export function singleFlight<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key);
  if (existing) {
    return existing as Promise<T>;
  }

  const promise = fn().finally(() => {
    inFlight.delete(key);
  });

  inFlight.set(key, promise);
  return promise;
}
