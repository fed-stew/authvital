import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * DTO for updating the Pub/Sub configuration singleton.
 * All fields are optional — only provided fields are updated.
 */
export interface UpdatePubSubConfigDto {
  enabled?: boolean;
  topic?: string;
  orderingEnabled?: boolean;
  events?: string[];
}

/** Shape of the in-memory cached configuration. */
export interface CachedPubSubConfig {
  enabled: boolean;
  topic: string;
  orderingEnabled: boolean;
  events: string[];
}

/**
 * PubSubConfigService — DB-backed Pub/Sub configuration management.
 *
 * Manages the `PubSubConfig` singleton record (id = "pubsub_config") which
 * controls whether events are published to GCP Pub/Sub, which topic to use,
 * and which event types are enabled.
 *
 * An in-memory cache with a 60-second TTL avoids a DB round-trip on every
 * event dispatch while still honouring configuration changes within a
 * reasonable window.
 *
 * Follows the singleton-upsert-on-init pattern from {@link InstanceService}.
 */
@Injectable()
export class PubSubConfigService implements OnModuleInit {
  private readonly SINGLETON_ID = 'pubsub_config';
  private readonly logger = new Logger(PubSubConfigService.name);

  /** In-memory cache to avoid a DB hit on every event dispatch. */
  private cachedConfig: CachedPubSubConfig | null = null;

  /** Epoch-ms timestamp of the last successful cache load. */
  private cacheLoadedAt: number = 0;

  /** Cache time-to-live in milliseconds (60 seconds). */
  private readonly CACHE_TTL_MS = 60_000;

  constructor(private readonly prisma: PrismaService) {}

  // ===========================================================================
  // Lifecycle
  // ===========================================================================

  /**
   * Ensure the singleton `PubSubConfig` record exists on startup,
   * then warm the in-memory cache.
   */
  async onModuleInit(): Promise<void> {
    await this.ensureSingleton();
    await this.refreshCache();
    this.logger.log('PubSubConfig singleton initialised and cache warmed');
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Return the current Pub/Sub configuration.
   *
   * Uses the in-memory cache when it is still within the TTL window;
   * otherwise reloads from the database first.
   */
  async getConfig(): Promise<CachedPubSubConfig> {
    if (this.isCacheFresh()) {
      return this.cachedConfig!;
    }

    await this.refreshCache();
    return this.cachedConfig!;
  }

  /**
   * Update the singleton Pub/Sub configuration.
   *
   * Only the fields present in {@link UpdatePubSubConfigDto} are written;
   * omitted fields keep their current value. The in-memory cache is
   * invalidated immediately so subsequent reads reflect the change.
   *
   * @param dto - Partial configuration update.
   * @returns The full updated configuration record.
   */
  async updateConfig(dto: UpdatePubSubConfigDto) {
    const updated = await this.prisma.pubSubConfig.update({
      where: { id: this.SINGLETON_ID },
      data: {
        enabled: dto.enabled,
        topic: dto.topic,
        orderingEnabled: dto.orderingEnabled,
        events: dto.events,
      },
    });

    // Invalidate cache so the next read picks up the new values.
    this.invalidateCache();

    this.logger.log('PubSubConfig updated successfully');
    return updated;
  }

  /**
   * Fast, synchronous check whether a given event type should be published.
   *
   * Returns `true` when Pub/Sub is globally enabled AND the event type is
   * permitted by the configured allow-list.
   *
   * Convention:
   * - `[]` (empty array)          → nothing enabled, no events published
   * - `["*"]`                     → global wildcard, all events enabled
   * - `["tenant.*"]`              → category wildcard, all tenant.* events
   * - `["tenant.created"]`        → exact match only
   *
   * @param eventType - Dot-notation event type, e.g. `"tenant.created"`.
   */
  isEventEnabled(eventType: string): boolean {
    if (!this.cachedConfig) {
      return false;
    }

    if (!this.cachedConfig.enabled) {
      return false;
    }

    // Empty events array = nothing enabled
    if (this.cachedConfig.events.length === 0) {
      return false;
    }

    // Global wildcard: ["*"] means all events
    if (this.cachedConfig.events.includes('*')) {
      return true;
    }

    // Exact match (e.g., "application.created" in events list)
    if (this.cachedConfig.events.includes(eventType)) {
      return true;
    }

    // Category wildcard match (e.g., "application.*" matches "application.created")
    const lastDot = eventType.lastIndexOf('.');
    if (lastDot > 0) {
      const prefix = eventType.substring(0, lastDot);
      if (this.cachedConfig.events.includes(`${prefix}.*`)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Return the full catalogue of available event types, grouped by category.
   *
   * This is static data combining system-webhook events and sync events.
   * Used by the admin dashboard to render event-type pickers.
   */
  getAvailableEventTypes() {
    return {
      categories: [
        // — System Webhook Events ——————————————————————————————————————————
        {
          slug: 'tenant',
          name: 'Tenant Lifecycle',
          description: 'Events related to tenant creation and management',
          events: [
            { type: 'tenant.created', description: 'When a new tenant is created' },
            { type: 'tenant.updated', description: 'When tenant details are updated' },
            { type: 'tenant.deleted', description: 'When a tenant is deleted' },
            { type: 'tenant.suspended', description: 'When a tenant is suspended' },
          ],
        },
        {
          slug: 'tenant.app',
          name: 'Tenant App Access',
          description: 'Events related to application access within tenants',
          events: [
            { type: 'tenant.app.granted', description: 'When a user is granted access to an application' },
            { type: 'tenant.app.revoked', description: 'When application access is revoked' },
          ],
        },
        {
          slug: 'application',
          name: 'Application Lifecycle',
          description: 'Events related to OAuth application management',
          events: [
            { type: 'application.created', description: 'When a new application is registered' },
            { type: 'application.updated', description: 'When application settings are updated' },
            { type: 'application.deleted', description: 'When an application is deleted' },
          ],
        },
        {
          slug: 'sso',
          name: 'SSO Providers',
          description: 'Events related to Single Sign-On configuration',
          events: [
            { type: 'sso.provider_added', description: 'When an SSO provider is configured' },
            { type: 'sso.provider_updated', description: 'When SSO provider settings are updated' },
            { type: 'sso.provider_removed', description: 'When an SSO provider is removed' },
          ],
        },
        // — Sync Events ———————————————————————————————————————————————————
        {
          slug: 'invite',
          name: 'Invitations',
          description: 'Events related to user invitations',
          events: [
            { type: 'invite.created', description: 'When an invitation is sent' },
            { type: 'invite.accepted', description: 'When an invitation is accepted' },
            { type: 'invite.deleted', description: 'When an invitation is deleted' },
            { type: 'invite.expired', description: 'When an invitation expires' },
          ],
        },
        {
          slug: 'subject',
          name: 'Subjects',
          description: 'Events related to users and service accounts',
          events: [
            { type: 'subject.created', description: 'When a new user is created' },
            { type: 'subject.updated', description: 'When a user profile is updated' },
            { type: 'subject.deleted', description: 'When a user is deleted' },
            { type: 'subject.deactivated', description: 'When a user is deactivated' },
          ],
        },
        {
          slug: 'member',
          name: 'Members',
          description: 'Events related to tenant membership',
          events: [
            { type: 'member.joined', description: 'When a user joins a tenant' },
            { type: 'member.left', description: 'When a user leaves a tenant' },
            { type: 'member.role_changed', description: "When a member's tenant role changes" },
            { type: 'member.suspended', description: 'When a member is suspended' },
            { type: 'member.activated', description: 'When a suspended member is reactivated' },
          ],
        },
        {
          slug: 'app_access',
          name: 'App Access',
          description: 'Events related to application access',
          events: [
            { type: 'app_access.granted', description: 'When a user is granted app access' },
            { type: 'app_access.revoked', description: 'When app access is revoked' },
            { type: 'app_access.role_changed', description: "When a user's app role changes" },
          ],
        },
        {
          slug: 'license',
          name: 'Licenses',
          description: 'Events related to license management',
          events: [
            { type: 'license.assigned', description: 'When a license is assigned' },
            { type: 'license.revoked', description: 'When a license is revoked' },
            { type: 'license.changed', description: "When a user's license type changes" },
          ],
        },
      ],
    };
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  /**
   * Upsert the singleton `PubSubConfig` record.
   *
   * If the record already exists the upsert is a no-op (empty `update`).
   * On a fresh database the record is created with sensible defaults
   * inherited from the Prisma schema.
   */
  private async ensureSingleton(): Promise<void> {
    await this.prisma.pubSubConfig.upsert({
      where: { id: this.SINGLETON_ID },
      update: {},
      create: { id: this.SINGLETON_ID },
    });
  }

  /**
   * Load the current configuration from the database into the in-memory
   * cache and record the load timestamp.
   */
  private async refreshCache(): Promise<void> {
    const config = await this.prisma.pubSubConfig.findUnique({
      where: { id: this.SINGLETON_ID },
    });

    if (config) {
      this.cachedConfig = {
        enabled: config.enabled,
        topic: config.topic,
        orderingEnabled: config.orderingEnabled,
        events: config.events,
      };
      this.cacheLoadedAt = Date.now();
    }
  }

  /** Immediately invalidate the in-memory cache so the next read reloads from DB. */
  private invalidateCache(): void {
    this.cacheLoadedAt = 0;
  }

  /** Return `true` if the cache exists and has not exceeded its TTL. */
  private isCacheFresh(): boolean {
    return (
      this.cachedConfig !== null &&
      Date.now() - this.cacheLoadedAt < this.CACHE_TTL_MS
    );
  }
}
