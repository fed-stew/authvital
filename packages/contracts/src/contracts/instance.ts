import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import {
  InstanceMetaSchema,
  UpdateInstanceSchema,
  InstanceApiKeySchema,
  CreateInstanceApiKeySchema,
  CreateInstanceApiKeyResponseSchema,
} from '../schemas/instance.js';

const c = initContract();

export const instanceContract = c.router(
  {
    getInstanceMeta: {
      method: 'GET',
      path: '/',
      responses: {
        200: InstanceMetaSchema,
      },
      summary: 'Get instance configuration',
    },

    getInstanceUuid: {
      method: 'GET',
      path: '/uuid',
      responses: {
        200: z.object({ instanceUuid: z.string() }),
      },
      summary: 'Get instance UUID',
    },

    getSignupConfig: {
      method: 'GET',
      path: '/signup-config',
      responses: {
        200: z.object({
          allowSignUp: z.boolean(),
          autoCreateTenant: z.boolean(),
          allowAnonymousSignUp: z.boolean(),
          requiredUserFields: z.array(z.string()),
        }),
      },
      summary: 'Get public signup configuration',
    },

    getBrandingConfig: {
      method: 'GET',
      path: '/branding',
      responses: {
        200: z.object({
          brandingName: z.string().nullable(),
          brandingLogoUrl: z.string().nullable(),
          brandingIconUrl: z.string().nullable(),
          brandingPrimaryColor: z.string().nullable(),
          brandingBackgroundColor: z.string().nullable(),
          brandingAccentColor: z.string().nullable(),
          brandingSupportUrl: z.string().nullable(),
          brandingPrivacyUrl: z.string().nullable(),
          brandingTermsUrl: z.string().nullable(),
        }),
      },
      summary: 'Get public branding configuration',
    },

    updateInstanceMeta: {
      method: 'PATCH',
      path: '/',
      body: UpdateInstanceSchema,
      responses: {
        200: InstanceMetaSchema,
      },
      summary: 'Update instance configuration',
    },

    listApiKeys: {
      method: 'GET',
      path: '/api-keys',
      responses: {
        200: z.array(InstanceApiKeySchema),
      },
      summary: 'List instance API keys',
    },

    createApiKey: {
      method: 'POST',
      path: '/api-keys',
      body: CreateInstanceApiKeySchema,
      responses: {
        201: CreateInstanceApiKeyResponseSchema,
      },
      summary: 'Create an instance API key (raw key shown once)',
    },

    revokeApiKey: {
      method: 'DELETE',
      path: '/api-keys/:id',
      pathParams: z.object({ id: z.string() }),
      body: z.object({}),
      responses: {
        200: z.object({ success: z.literal(true) }),
      },
      summary: 'Revoke an instance API key',
    },
  },
  {
    pathPrefix: '/instance',
    strictStatusCodes: true,
  },
);
