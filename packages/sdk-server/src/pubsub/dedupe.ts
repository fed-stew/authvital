/**
 * @authvital/server/pubsub - Idempotency / Deduplication
 *
 * Pub/Sub is at-least-once: subscribers WILL occasionally see the same
 * event twice (redelivery after a missed ack deadline, subscriber restart,
 * ...). The dispatcher can skip duplicates automatically when given a
 * DedupeStore keyed on the envelope's unique `id`.
 */

/**
 * Pluggable duplicate-tracking store.
 *
 * Implement this against Redis (`SET key 1 PX ttl NX` + `EXISTS`) or a
 * database unique index for production multi-process deployments — the
 * bundled {@link InMemoryDedupeStore} is PER-PROCESS ONLY.
 */
export interface DedupeStore {
  /** Has this event id already been handled? */
  has(id: string): Promise<boolean>;
  /** Record an event id as handled (optionally with a per-entry TTL). */
  add(id: string, ttlMs?: number): Promise<void>;
}

export interface InMemoryDedupeStoreOptions {
  /** Max ids retained before the oldest are evicted (default 10,000). */
  maxEntries?: number;
  /** Default TTL per entry in ms (default 24h). */
  ttlMs?: number;
}

/**
 * Bounded in-memory DedupeStore (LRU eviction + per-entry TTL, zero deps).
 *
 *  PER-PROCESS: state lives in this process's memory. Restarts forget
 * everything and horizontally-scaled subscribers don't share it — good for
 * single-instance consumers and development. Production deployments with
 * multiple subscriber processes should implement {@link DedupeStore} over
 * Redis or their database instead.
 */
export class InMemoryDedupeStore implements DedupeStore {
  private readonly entries = new Map<string, number>(); // id -> expiresAt
  private readonly maxEntries: number;
  private readonly ttlMs: number;

  constructor(options: InMemoryDedupeStoreOptions = {}) {
    this.maxEntries = options.maxEntries ?? 10_000;
    this.ttlMs = options.ttlMs ?? 24 * 60 * 60 * 1000;
  }

  async has(id: string): Promise<boolean> {
    const expiresAt = this.entries.get(id);
    if (expiresAt === undefined) {
      return false;
    }
    if (Date.now() >= expiresAt) {
      this.entries.delete(id); // expired — treat as unseen
      return false;
    }
    // LRU touch: re-insert so recently-checked ids evict last
    this.entries.delete(id);
    this.entries.set(id, expiresAt);
    return true;
  }

  async add(id: string, ttlMs?: number): Promise<void> {
    // Evict oldest entries (Map preserves insertion order) when full
    while (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
    this.entries.set(id, Date.now() + (ttlMs ?? this.ttlMs));
  }

  /** Current number of tracked ids (for tests/metrics). */
  get size(): number {
    return this.entries.size;
  }
}
