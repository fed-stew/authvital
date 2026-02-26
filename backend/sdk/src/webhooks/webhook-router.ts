import type { SyncEvent } from './types';
import type { IAuthVaderEventHandler } from './event-interfaces';
import { AuthVaderWebhooks, WebhookHeaders } from './webhook-handler';

export interface WebhookRouterOptions {
  /**
   * AuthVader base URL (from AV_HOST env var)
   * Example: 'https://auth.example.com'
   * JWKS endpoint is automatically derived as: {authVaderHost}/.well-known/jwks.json
   */
  authVaderHost?: string;

  /**
   * Event handler instance - extend AuthVaderEventHandler and implement methods
   */
  handler: IAuthVaderEventHandler;

  /**
   * Maximum age of the timestamp in seconds (default: 300 = 5 minutes)
   * Prevents replay attacks with old signatures
   */
  maxTimestampAge?: number;

  /**
   * Cache TTL for JWKS keys in milliseconds (default: 3600000 = 1 hour)
   */
  keysCacheTtl?: number;
}

/**
 * WebhookRouter - Routes verified webhook events to handler methods
 *
 * @example
 * ```typescript
 * // 1. Create your handler by extending the base class
 * class MyHandler extends AuthVaderEventHandler {
 *   constructor(private db: Database, private slack: SlackClient) {
 *     super();
 *   }
 *
 *   async onSubjectCreated(event: SubjectCreatedEvent) {
 *     // event.data.sub is the subject ID (user, service account, etc.)
 *     await this.db.subjects.create({
 *       id: event.data.sub,
 *       email: event.data.email,
 *       type: event.data.subject_type,
 *     });
 *   }
 *
 *   async onMemberJoined(event: MemberJoinedEvent) {
 *     await this.slack.send(`Welcome ${event.data.email}!`);
 *   }
 * }
 *
 * // 2. Create the router (AV_HOST is read from environment automatically)
 * const router = new WebhookRouter({
 *   handler: new MyHandler(db, slack),
 * });
 *
 * // 3. Use in your Express app
 * app.post('/webhooks/authvader', router.expressHandler());
 * ```
 */
export class WebhookRouter {
  private readonly verifier: AuthVaderWebhooks;
  private readonly handler: IAuthVaderEventHandler;

  constructor(options: WebhookRouterOptions) {
    // Get authVaderHost from options or environment variable
    const authVaderHost = options.authVaderHost || process.env.AV_HOST;

    if (!authVaderHost) {
      throw new Error(
        'AuthVader URL is required. Either pass authVaderHost in options or set AV_HOST environment variable.',
      );
    }

    // Derive JWKS URL from base URL
    const jwksUrl = `${authVaderHost.replace(/\/$/, '')}/.well-known/jwks.json`;

    this.verifier = new AuthVaderWebhooks({
      jwksUrl,
      maxTimestampAge: options.maxTimestampAge,
      keysCacheTtl: options.keysCacheTtl,
    });
    this.handler = options.handler;
  }

  /**
   * Handle a webhook request
   */
  async handle(
    body: string | object,
    headers: WebhookHeaders | Record<string, string | string[] | undefined>,
  ): Promise<{ status: number; body: { success: boolean; message?: string; error?: string } }> {
    try {
      const event = await this.verifier.verifyAndParse(body, headers);
      await this.dispatch(event);

      return {
        status: 200,
        body: { success: true, message: `Processed ${event.type}` },
      };
    } catch (error: any) {
      return {
        status: 400,
        body: { success: false, error: error.message || 'Webhook processing failed' },
      };
    }
  }

  /**
   * Dispatch event to the appropriate handler method
   */
  private async dispatch(event: SyncEvent): Promise<void> {
    const h = this.handler;

    switch (event.type) {
      // Invite events
      case 'invite.created':
        return h.onInviteCreated?.(event);
      case 'invite.accepted':
        return h.onInviteAccepted?.(event);
      case 'invite.deleted':
        return h.onInviteDeleted?.(event);
      case 'invite.expired':
        return h.onInviteExpired?.(event);

      // Subject events (users, service accounts, machines)
      case 'subject.created':
        return h.onSubjectCreated?.(event);
      case 'subject.updated':
        return h.onSubjectUpdated?.(event);
      case 'subject.deleted':
        return h.onSubjectDeleted?.(event);
      case 'subject.deactivated':
        return h.onSubjectDeactivated?.(event);

      // Member events
      case 'member.joined':
        return h.onMemberJoined?.(event);
      case 'member.left':
        return h.onMemberLeft?.(event);
      case 'member.role_changed':
        return h.onMemberRoleChanged?.(event);
      case 'member.suspended':
        return h.onMemberSuspended?.(event);
      case 'member.activated':
        return h.onMemberActivated?.(event);

      // App access events
      case 'app_access.granted':
        return h.onAppAccessGranted?.(event);
      case 'app_access.revoked':
        return h.onAppAccessRevoked?.(event);
      case 'app_access.role_changed':
        return h.onAppAccessRoleChanged?.(event);

      // License events
      case 'license.assigned':
        return h.onLicenseAssigned?.(event);
      case 'license.revoked':
        return h.onLicenseRevoked?.(event);
      case 'license.changed':
        return h.onLicenseChanged?.(event);

      default:
        return h.onUnhandledEvent?.(event);
    }
  }

  /**
   * Express middleware handler
   */
  expressHandler(): (req: any, res: any) => Promise<void> {
    return async (req: any, res: any) => {
      const result = await this.handle(req.body, req.headers);
      res.status(result.status).json(result.body);
    };
  }

  /**
   * Get the underlying verifier
   */
  getVerifier(): AuthVaderWebhooks {
    return this.verifier;
  }
}
