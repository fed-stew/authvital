import { PubSub, Topic } from '@google-cloud/pubsub';
import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PubSubConfigService } from './pubsub-config.service';

/**
 * GCP Pub/Sub publisher service.
 *
 * Wraps the `@google-cloud/pubsub` client library to publish event messages
 * to a configured topic. Uses Application Default Credentials (ADC) — no
 * explicit key files are needed when running under a GCP service account.
 *
 * The publisher initialises whenever GCP connectivity is available
 * (`PUBSUB_PROJECT_ID` or `PUBSUB_EMULATOR_HOST` is set). Topic name and
 * ordering configuration are read from the database via `PubSubConfigService`.
 *
 * Lifecycle:
 * - `OnModuleInit`  — initialises the PubSub client and verifies the topic.
 * - `OnModuleDestroy` — gracefully closes the client connection.
 */
@Injectable()
export class PubSubPublisherService
  implements OnModuleInit, OnModuleDestroy
{
  private pubsub: PubSub | null = null;
  private topic: Topic | null = null;
  private readonly logger = new Logger(PubSubPublisherService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly pubSubConfig: PubSubConfigService,
  ) {}

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Initialise the PubSub client and verify (or create) the target topic.
   *
   * Skipped when no GCP connectivity is configured (neither
   * `PUBSUB_PROJECT_ID` nor `PUBSUB_EMULATOR_HOST` is set).
   */
  async onModuleInit(): Promise<void> {
    const projectId = this.configService.get<string>('PUBSUB_PROJECT_ID');
    const emulatorHost = this.configService.get<string>('PUBSUB_EMULATOR_HOST');

    // Only initialize if GCP connectivity is configured
    if (!projectId && !emulatorHost) {
      this.logger.log(
        'Pub/Sub publisher not initialized (no PUBSUB_PROJECT_ID or PUBSUB_EMULATOR_HOST)',
      );
      return;
    }

    if (emulatorHost) {
      this.logger.log(
        `Using Pub/Sub emulator at ${emulatorHost} (PUBSUB_EMULATOR_HOST is set)`,
      );
    }

    // Read topic and ordering config from database
    const config = await this.pubSubConfig.getConfig();
    const topicName = config?.topic ?? 'authvital-events';
    const orderingEnabled = config?.orderingEnabled ?? true;

    this.pubsub = new PubSub({ projectId });

    this.topic = this.pubsub.topic(topicName, {
      ...(orderingEnabled && { messageOrdering: true }),
    });
    await this.topic.get({ autoCreate: true });

    if (orderingEnabled) {
      this.logger.log(`Message ordering enabled on topic "${topicName}"`);
    }

    this.logger.log(
      `Pub/Sub publisher initialised — topic "${topicName}" (project: ${projectId ?? 'default'})`,
    );
  }

  /**
   * Gracefully close the PubSub client connection on shutdown.
   */
  async onModuleDestroy(): Promise<void> {
    if (this.pubsub) {
      await this.pubsub.close();
      this.logger.log('Pub/Sub client closed');
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Whether the Pub/Sub publisher is ready (GCP connectivity is available
   * and the topic has been initialised).
   */
  isEnabled(): boolean {
    return this.topic !== null;
  }

  /**
   * Publish a message to the configured Pub/Sub topic.
   *
   * @param params.data       - JSON-serialisable payload written as the
   *                            message body.
   * @param params.attributes - Optional Pub/Sub message attributes used for
   *                            server-side filtering by subscribers.
   * @param params.orderingKey - Optional ordering key to guarantee ordered
   *                             delivery within the same key.
   *
   * @returns The GCP message ID on success, or `null` if publishing is
   *          disabled / the topic is not initialised.
   *
   * @throws Re-throws any error from the Pub/Sub client so the caller can
   *         decide on retry logic.
   */
  async publish(params: {
    data: Record<string, unknown>;
    attributes?: Record<string, string>;
    orderingKey?: string;
  }): Promise<string | null> {
    if (!this.topic) {
      return null;
    }

    const { data, attributes, orderingKey } = params;
    const buffer = Buffer.from(JSON.stringify(data));

    try {
      const messageId = await this.topic.publishMessage({
        data: buffer,
        attributes,
        orderingKey,
      });

      return messageId;
    } catch (error) {
      this.logger.error(
        `Failed to publish message to Pub/Sub: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw error;
    }
  }
}
