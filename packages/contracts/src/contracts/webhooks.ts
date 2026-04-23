import { initContract } from '@ts-rest/core';
import { z } from 'zod';

const c = initContract();

export const webhooksContract = c.router(
  {
    // GET /api/super-admin/webhooks/events
    getAvailableEvents: {
      method: 'GET',
      path: '/super-admin/webhooks/events',
      responses: {
        200: z.object({ events: z.array(z.string()) }),
      },
      summary: 'Get flat list of webhook event names',
    },

    // GET /api/super-admin/webhooks/event-types
    getEventTypes: {
      method: 'GET',
      path: '/super-admin/webhooks/event-types',
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
      summary: 'Get categorized webhook event types',
    },

    // GET /api/super-admin/webhooks
    getWebhooks: {
      method: 'GET',
      path: '/super-admin/webhooks',
      responses: {
        200: z.array(z.any()),
      },
      summary: 'List all webhooks',
    },

    // GET /api/super-admin/webhooks/:id
    getWebhook: {
      method: 'GET',
      path: '/super-admin/webhooks/:id',
      pathParams: z.object({ id: z.string().uuid() }),
      responses: {
        200: z.any(),
        404: z.object({ message: z.string(), statusCode: z.number() }),
      },
      summary: 'Get a single webhook',
    },

    // GET /api/super-admin/webhooks/:id/deliveries
    getDeliveries: {
      method: 'GET',
      path: '/super-admin/webhooks/:id/deliveries',
      pathParams: z.object({ id: z.string().uuid() }),
      responses: {
        200: z.array(z.any()),
      },
      summary: 'Get webhook delivery history',
    },

    // POST /api/super-admin/webhooks
    createWebhook: {
      method: 'POST',
      path: '/super-admin/webhooks',
      body: z.object({
        name: z.string().min(1),
        url: z.string().url(),
        events: z.array(z.string()).min(1),
        description: z.string().optional(),
        headers: z.record(z.string(), z.string()).optional(),
      }),
      responses: {
        201: z.any(),
      },
      summary: 'Create a webhook',
    },

    // PUT /api/super-admin/webhooks/:id
    updateWebhook: {
      method: 'PUT',
      path: '/super-admin/webhooks/:id',
      pathParams: z.object({ id: z.string().uuid() }),
      body: z.object({
        name: z.string().min(1).optional(),
        url: z.string().url().optional(),
        events: z.array(z.string()).optional(),
        isActive: z.boolean().optional(),
        description: z.string().optional(),
        headers: z.record(z.string(), z.string()).optional(),
      }),
      responses: {
        200: z.any(),
      },
      summary: 'Update a webhook',
    },

    // DELETE /api/super-admin/webhooks/:id
    deleteWebhook: {
      method: 'DELETE',
      path: '/super-admin/webhooks/:id',
      pathParams: z.object({ id: z.string().uuid() }),
      body: z.any(),
      responses: {
        200: z.object({ success: z.boolean() }).passthrough(),
      },
      summary: 'Delete a webhook',
    },

    // POST /api/super-admin/webhooks/:id/test
    testWebhook: {
      method: 'POST',
      path: '/super-admin/webhooks/:id/test',
      pathParams: z.object({ id: z.string().uuid() }),
      body: z.any(),
      responses: {
        200: z.any(),
      },
      summary: 'Test a webhook',
    },
  },
  { pathPrefix: '/api' },
);
