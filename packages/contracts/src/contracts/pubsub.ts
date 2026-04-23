import { initContract } from '@ts-rest/core';
import { z } from 'zod';

const c = initContract();

export const pubsubContract = c.router(
  {
    // GET /api/super-admin/pubsub/config
    getConfig: {
      method: 'GET',
      path: '/super-admin/pubsub/config',
      responses: {
        200: z.object({
          id: z.string(),
          enabled: z.boolean(),
          topic: z.string(),
          orderingEnabled: z.boolean(),
          events: z.array(z.string()),
          createdAt: z.string(),
          updatedAt: z.string(),
        }).passthrough(),
      },
      summary: 'Get Pub/Sub configuration',
    },

    // PUT /api/super-admin/pubsub/config
    updateConfig: {
      method: 'PUT',
      path: '/super-admin/pubsub/config',
      body: z.object({
        enabled: z.boolean().optional(),
        topic: z.string().optional(),
        orderingEnabled: z.boolean().optional(),
        events: z.array(z.string()).optional(),
      }),
      responses: {
        200: z.any(),
      },
      summary: 'Update Pub/Sub configuration',
    },

    // GET /api/super-admin/pubsub/event-types
    getEventTypes: {
      method: 'GET',
      path: '/super-admin/pubsub/event-types',
      responses: {
        200: z.object({
          categories: z.array(z.object({
            slug: z.string(),
            name: z.string(),
            description: z.string(),
            events: z.array(z.object({
              type: z.string(),
              description: z.string(),
            })),
          })),
        }),
      },
      summary: 'Get available Pub/Sub event types',
    },

    // GET /api/super-admin/pubsub/outbox
    getOutboxStats: {
      method: 'GET',
      path: '/super-admin/pubsub/outbox',
      responses: {
        200: z.record(z.string(), z.number()),
      },
      summary: 'Get outbox statistics by status',
    },

    // GET /api/super-admin/pubsub/outbox/events
    getOutboxEvents: {
      method: 'GET',
      path: '/super-admin/pubsub/outbox/events',
      query: z.object({
        status: z.string().optional(),
        limit: z.coerce.number().optional(),
      }),
      responses: {
        200: z.array(z.any()),
      },
      summary: 'Get recent outbox events',
    },

    // POST /api/super-admin/pubsub/outbox/:id/retry
    retryEvent: {
      method: 'POST',
      path: '/super-admin/pubsub/outbox/:id/retry',
      pathParams: z.object({ id: z.string().uuid() }),
      body: z.any(),
      responses: {
        200: z.object({ success: z.boolean(), message: z.string() }),
      },
      summary: 'Retry a single failed outbox event',
    },

    // POST /api/super-admin/pubsub/outbox/retry-all
    retryAllFailed: {
      method: 'POST',
      path: '/super-admin/pubsub/outbox/retry-all',
      body: z.any(),
      responses: {
        200: z.object({ success: z.boolean(), count: z.number() }),
      },
      summary: 'Retry all failed outbox events',
    },
  },
  { pathPrefix: '/api' },
);
