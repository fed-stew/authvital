# Organization Sync Use Cases

> Common patterns for leveraging organization sync in production applications.

---

## Provisioning Workflows

Automatically create resources when new tenants are created.

### Database Per Tenant

Create isolated databases or schemas for each tenant:

```typescript
import { OrganizationSyncHandler } from '@authvital/sdk/server';

class ProvisioningHandler extends OrganizationSyncHandler {
  async onTenantCreated(event: TenantCreatedEvent): Promise<void> {
    // First, run the default sync
    await super.onTenantCreated(event);
    
    const { tenant_id, slug } = event.data;
    
    // Provision tenant-specific database
    await this.provisionTenantDatabase(slug);
    
    // Create default resources
    await this.createDefaultResources(tenant_id);
    
    console.log(`Provisioned resources for tenant: ${slug}`);
  }
  
  private async provisionTenantDatabase(slug: string): Promise<void> {
    // Example: Create PostgreSQL schema
    await prisma.$executeRawUnsafe(
      `CREATE SCHEMA IF NOT EXISTS "tenant_${slug}"`
    );
    
    // Run tenant-specific migrations
    await runMigrationsForSchema(`tenant_${slug}`);
  }
  
  private async createDefaultResources(tenantId: string): Promise<void> {
    // Create default workspace
    await prisma.workspace.create({
      data: {
        organizationId: tenantId,
        name: 'Default Workspace',
        isDefault: true,
      },
    });
    
    // Create default settings
    await prisma.organizationSettings.create({
      data: {
        organizationId: tenantId,
        theme: 'light',
        timezone: 'UTC',
        notificationsEnabled: true,
      },
    });
  }
}
```

### Cloud Resource Provisioning

Create cloud resources (S3 buckets, namespaces, etc.) for new tenants:

```typescript
import { S3Client, CreateBucketCommand } from '@aws-sdk/client-s3';
import { KubernetesClient } from './k8s';

class CloudProvisioningHandler extends OrganizationSyncHandler {
  private s3 = new S3Client({ region: 'us-east-1' });
  private k8s = new KubernetesClient();
  
  async onTenantCreated(event: TenantCreatedEvent): Promise<void> {
    await super.onTenantCreated(event);
    
    const { tenant_id, slug, plan } = event.data;
    
    // Create S3 bucket for tenant files
    await this.s3.send(new CreateBucketCommand({
      Bucket: `myapp-${slug}-files`,
      ObjectOwnership: 'BucketOwnerEnforced',
    }));
    
    // Create Kubernetes namespace (for enterprise tenants)
    if (plan === 'enterprise') {
      await this.k8s.createNamespace({
        name: `tenant-${slug}`,
        labels: {
          'app.kubernetes.io/tenant': tenant_id,
          'app.kubernetes.io/plan': plan,
        },
      });
    }
    
    // Update organization with resource references
    await prisma.organization.update({
      where: { id: tenant_id },
      data: {
        metadata: {
          s3Bucket: `myapp-${slug}-files`,
          k8sNamespace: plan === 'enterprise' ? `tenant-${slug}` : null,
        },
      },
    });
  }
}
```

!!! tip "Idempotency"
    Always design provisioning handlers to be idempotent. Webhooks may be delivered multiple times, so your code should handle "resource already exists" gracefully.

---

## Billing Integration

Sync tenant plan changes to your billing system.

### Stripe Integration

```typescript
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

class BillingHandler extends OrganizationSyncHandler {
  // Map AuthVital plans to Stripe price IDs
  private readonly planToPriceId: Record<string, string> = {
    free: null,  // No subscription needed
    starter: 'price_starter_monthly',
    pro: 'price_pro_monthly',
    enterprise: 'price_enterprise_monthly',
  };
  
  async onTenantCreated(event: TenantCreatedEvent): Promise<void> {
    await super.onTenantCreated(event);
    
    const { tenant_id, name, plan, created_by_sub } = event.data;
    
    // Create Stripe customer
    const customer = await stripe.customers.create({
      name,
      metadata: {
        authvital_tenant_id: tenant_id,
        created_by: created_by_sub,
      },
    });
    
    // Store Stripe customer ID
    await prisma.organization.update({
      where: { id: tenant_id },
      data: { stripeCustomerId: customer.id },
    });
    
    // Create subscription if not on free plan
    if (plan !== 'free') {
      await stripe.subscriptions.create({
        customer: customer.id,
        items: [{ price: this.planToPriceId[plan] }],
        metadata: { authvital_tenant_id: tenant_id },
      });
    }
  }
  
  async onTenantUpdated(event: TenantUpdatedEvent): Promise<void> {
    await super.onTenantUpdated(event);
    
    const { tenant_id, plan, changed_fields, previous_values } = event.data;
    
    // Only handle plan changes
    if (!changed_fields.includes('plan')) return;
    
    const previousPlan = previous_values.plan as string;
    
    // Get organization with Stripe customer ID
    const org = await prisma.organization.findUnique({
      where: { id: tenant_id },
      select: { stripeCustomerId: true },
    });
    
    if (!org?.stripeCustomerId) {
      console.error(`No Stripe customer for tenant ${tenant_id}`);
      return;
    }
    
    // Get current subscription
    const subscriptions = await stripe.subscriptions.list({
      customer: org.stripeCustomerId,
      status: 'active',
      limit: 1,
    });
    
    if (plan === 'free') {
      // Downgrade to free: cancel subscription
      if (subscriptions.data.length > 0) {
        await stripe.subscriptions.cancel(subscriptions.data[0].id);
      }
    } else if (previousPlan === 'free') {
      // Upgrade from free: create subscription
      await stripe.subscriptions.create({
        customer: org.stripeCustomerId,
        items: [{ price: this.planToPriceId[plan] }],
        metadata: { authvital_tenant_id: tenant_id },
      });
    } else {
      // Plan change: update subscription
      const subscription = subscriptions.data[0];
      await stripe.subscriptions.update(subscription.id, {
        items: [{
          id: subscription.items.data[0].id,
          price: this.planToPriceId[plan],
        }],
        proration_behavior: 'create_prorations',
      });
    }
    
    console.log(`Updated billing for ${tenant_id}: ${previousPlan} → ${plan}`);
  }
  
  async onTenantDeleted(event: TenantDeletedEvent): Promise<void> {
    // Get Stripe customer before deleting
    const org = await prisma.organization.findUnique({
      where: { id: event.data.tenant_id },
      select: { stripeCustomerId: true },
    });
    
    // Run default delete
    await super.onTenantDeleted(event);
    
    // Cancel all subscriptions and delete Stripe customer
    if (org?.stripeCustomerId) {
      const subscriptions = await stripe.subscriptions.list({
        customer: org.stripeCustomerId,
        status: 'active',
      });
      
      for (const sub of subscriptions.data) {
        await stripe.subscriptions.cancel(sub.id);
      }
      
      await stripe.customers.del(org.stripeCustomerId);
    }
  }
}
```

!!! warning "Handle Failures Gracefully"
    If Stripe operations fail, consider:
    - Logging the failure for manual resolution
    - Using a queue to retry billing operations
    - Implementing a reconciliation job to catch missed updates

---

## Audit Logging

Maintain immutable audit trails for compliance.

### Comprehensive Audit Handler

```typescript
class AuditHandler extends OrganizationSyncHandler {
  async onTenantCreated(event: TenantCreatedEvent): Promise<void> {
    await super.onTenantCreated(event);
    await this.logAuditEvent(event, 'organization', event.data.tenant_id);
  }
  
  async onTenantUpdated(event: TenantUpdatedEvent): Promise<void> {
    await super.onTenantUpdated(event);
    await this.logAuditEvent(event, 'organization', event.data.tenant_id);
  }
  
  async onTenantDeleted(event: TenantDeletedEvent): Promise<void> {
    await this.logAuditEvent(event, 'organization', event.data.tenant_id);
    await super.onTenantDeleted(event);
  }
  
  async onTenantSuspended(event: TenantSuspendedEvent): Promise<void> {
    await super.onTenantSuspended(event);
    await this.logAuditEvent(event, 'organization', event.data.tenant_id);
  }
  
  async onApplicationCreated(event: ApplicationCreatedEvent): Promise<void> {
    await super.onApplicationCreated(event);
    await this.logAuditEvent(event, 'application', event.data.application_id);
  }
  
  async onApplicationUpdated(event: ApplicationUpdatedEvent): Promise<void> {
    await super.onApplicationUpdated(event);
    await this.logAuditEvent(event, 'application', event.data.application_id);
  }
  
  async onApplicationDeleted(event: ApplicationDeletedEvent): Promise<void> {
    await this.logAuditEvent(event, 'application', event.data.application_id);
    await super.onApplicationDeleted(event);
  }
  
  async onSsoProviderAdded(event: SsoProviderAddedEvent): Promise<void> {
    await super.onSsoProviderAdded(event);
    await this.logAuditEvent(event, 'sso_provider', event.data.provider_id);
  }
  
  async onSsoProviderUpdated(event: SsoProviderUpdatedEvent): Promise<void> {
    await super.onSsoProviderUpdated(event);
    await this.logAuditEvent(event, 'sso_provider', event.data.provider_id);
  }
  
  async onSsoProviderRemoved(event: SsoProviderRemovedEvent): Promise<void> {
    await this.logAuditEvent(event, 'sso_provider', event.data.provider_id);
    await super.onSsoProviderRemoved(event);
  }
  
  private async logAuditEvent(
    event: OrganizationEvent,
    entityType: string,
    entityId: string,
  ): Promise<void> {
    await prisma.organizationAuditLog.create({
      data: {
        organizationId: event.tenant_id,
        eventType: event.type,
        entityType,
        entityId,
        changedFields: event.data.changed_fields ?? [],
        previousValues: event.data.previous_values ?? {},
        newValues: this.extractNewValues(event),
        changedBySub: this.extractActor(event),
      },
    });
  }
  
  private extractActor(event: OrganizationEvent): string | null {
    const data = event.data as Record<string, unknown>;
    return (
      data.created_by_sub ??
      data.updated_by_sub ??
      data.deleted_by_sub ??
      data.suspended_by_sub ??
      data.removed_by_sub ??
      null
    ) as string | null;
  }
  
  private extractNewValues(event: OrganizationEvent): Record<string, unknown> {
    const { changed_fields, previous_values, ...rest } = event.data as any;
    return rest;
  }
}
```

### Querying Audit Logs

```typescript
// Get all changes to a specific organization
const orgHistory = await prisma.organizationAuditLog.findMany({
  where: { organizationId: 'tnt_acme123' },
  orderBy: { createdAt: 'desc' },
});

// Get all changes made by a specific admin
const adminActions = await prisma.organizationAuditLog.findMany({
  where: { changedBySub: 'usr_admin001' },
  orderBy: { createdAt: 'desc' },
});

// Get all plan changes in the last month
const planChanges = await prisma.organizationAuditLog.findMany({
  where: {
    eventType: 'tenant.updated',
    changedFields: { has: 'plan' },
    createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
  },
  orderBy: { createdAt: 'desc' },
});
```

---

## Multi-Region Sync

Replicate organization config across multiple regions for low-latency access.

### Regional Replication Handler

```typescript
import { Redis } from 'ioredis';

class MultiRegionHandler extends OrganizationSyncHandler {
  private redis = new Redis(process.env.REDIS_URL!);
  private currentRegion = process.env.AWS_REGION ?? 'us-east-1';
  private regions = ['us-east-1', 'us-west-2', 'eu-west-1', 'ap-southeast-1'];
  
  async onTenantCreated(event: TenantCreatedEvent): Promise<void> {
    await super.onTenantCreated(event);
    await this.replicateToOtherRegions(event);
    await this.invalidateCache(event.data.tenant_id);
  }
  
  async onTenantUpdated(event: TenantUpdatedEvent): Promise<void> {
    await super.onTenantUpdated(event);
    await this.replicateToOtherRegions(event);
    await this.invalidateCache(event.data.tenant_id);
  }
  
  async onTenantDeleted(event: TenantDeletedEvent): Promise<void> {
    await super.onTenantDeleted(event);
    await this.replicateToOtherRegions(event);
    await this.invalidateCache(event.data.tenant_id);
  }
  
  private async replicateToOtherRegions(event: OrganizationEvent): Promise<void> {
    const otherRegions = this.regions.filter(r => r !== this.currentRegion);
    
    // Publish to Redis pub/sub for other regions
    await this.redis.publish(
      'org-sync:replicate',
      JSON.stringify({
        sourceRegion: this.currentRegion,
        targetRegions: otherRegions,
        event,
      })
    );
  }
  
  private async invalidateCache(tenantId: string): Promise<void> {
    // Invalidate organization cache across all regions
    const cacheKeys = [
      `org:${tenantId}`,
      `org:${tenantId}:apps`,
      `org:${tenantId}:sso`,
    ];
    
    for (const key of cacheKeys) {
      await this.redis.del(key);
    }
  }
}
```

### Read Replica Pattern

For high-read scenarios, cache organization data in Redis:

```typescript
class CachedOrganizationService {
  private redis = new Redis(process.env.REDIS_URL!);
  private cacheTtlSeconds = 300; // 5 minutes
  
  async getOrganization(tenantId: string): Promise<Organization | null> {
    // Try cache first
    const cached = await this.redis.get(`org:${tenantId}`);
    if (cached) {
      return JSON.parse(cached);
    }
    
    // Fall back to database
    const org = await prisma.organization.findUnique({
      where: { id: tenantId },
      include: {
        applications: { where: { isActive: true } },
        ssoProviders: { where: { isEnabled: true } },
      },
    });
    
    if (org) {
      await this.redis.setex(
        `org:${tenantId}`,
        this.cacheTtlSeconds,
        JSON.stringify(org)
      );
    }
    
    return org;
  }
  
  async getOrganizationBySlug(slug: string): Promise<Organization | null> {
    // Slug lookup with cache
    const tenantId = await this.redis.get(`org:slug:${slug}`);
    if (tenantId) {
      return this.getOrganization(tenantId);
    }
    
    const org = await prisma.organization.findUnique({
      where: { slug },
    });
    
    if (org) {
      await this.redis.setex(`org:slug:${slug}`, this.cacheTtlSeconds, org.id);
      return this.getOrganization(org.id);
    }
    
    return null;
  }
}
```

---

## Access Control Based on Org Config

Use synced organization data for access control decisions.

### Middleware Example

```typescript
import { NextRequest, NextResponse } from 'next/server';

export async function organizationMiddleware(request: NextRequest) {
  const tenantSlug = request.headers.get('x-tenant-slug');
  
  if (!tenantSlug) {
    return NextResponse.json(
      { error: 'Missing tenant header' },
      { status: 400 }
    );
  }
  
  // Get organization from local database (fast!)
  const org = await prisma.organization.findUnique({
    where: { slug: tenantSlug },
  });
  
  if (!org) {
    return NextResponse.json(
      { error: 'Tenant not found' },
      { status: 404 }
    );
  }
  
  // Check organization status
  if (org.status === 'suspended') {
    return NextResponse.json(
      { error: 'This organization has been suspended', reason: org.suspendedReason },
      { status: 403 }
    );
  }
  
  // Attach organization to request context
  const response = NextResponse.next();
  response.headers.set('x-organization-id', org.id);
  response.headers.set('x-organization-plan', org.plan);
  
  return response;
}
```

### Feature Flags Based on Plan

```typescript
class FeatureService {
  private planFeatures: Record<string, Set<string>> = {
    free: new Set(['basic_dashboard', 'single_user']),
    starter: new Set(['basic_dashboard', 'team_members', 'api_access']),
    pro: new Set(['basic_dashboard', 'team_members', 'api_access', 'custom_domains', 'webhooks']),
    enterprise: new Set(['basic_dashboard', 'team_members', 'api_access', 'custom_domains', 'webhooks', 'sso', 'audit_logs', 'sla']),
  };
  
  async hasFeature(organizationId: string, feature: string): Promise<boolean> {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { plan: true, status: true },
    });
    
    if (!org || org.status !== 'active') {
      return false;
    }
    
    return this.planFeatures[org.plan]?.has(feature) ?? false;
  }
  
  async requireFeature(organizationId: string, feature: string): Promise<void> {
    const hasAccess = await this.hasFeature(organizationId, feature);
    
    if (!hasAccess) {
      const org = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { plan: true },
      });
      
      throw new FeatureNotAvailableError(
        `The '${feature}' feature is not available on the ${org?.plan ?? 'free'} plan. ` +
        `Please upgrade to access this feature.`
      );
    }
  }
}
```

---

## Testing Handlers

Test your custom handlers with mock events:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { BillingHandler } from './billing-handler';
import { mockDeep } from 'vitest-mock-extended';

describe('BillingHandler', () => {
  let handler: BillingHandler;
  let mockStripe: ReturnType<typeof mockDeep<Stripe>>;
  
  beforeEach(() => {
    mockStripe = mockDeep<Stripe>();
    handler = new BillingHandler(prisma, mockStripe);
  });
  
  it('creates Stripe customer on tenant creation', async () => {
    const event: TenantCreatedEvent = {
      id: 'evt_test001',
      type: 'tenant.created',
      timestamp: new Date().toISOString(),
      tenant_id: 'tnt_test123',
      application_id: null,
      data: {
        tenant_id: 'tnt_test123',
        name: 'Test Corp',
        slug: 'test-corp',
        plan: 'pro',
        created_by_sub: 'usr_admin001',
        created_at: new Date().toISOString(),
        settings: {
          allow_signups: true,
          require_mfa: false,
          allowed_email_domains: [],
          session_lifetime_minutes: 480,
          password_policy: 'standard',
        },
      },
    };
    
    mockStripe.customers.create.mockResolvedValue({ id: 'cus_test123' } as any);
    mockStripe.subscriptions.create.mockResolvedValue({ id: 'sub_test123' } as any);
    
    await handler.onTenantCreated(event);
    
    expect(mockStripe.customers.create).toHaveBeenCalledWith({
      name: 'Test Corp',
      metadata: {
        authvital_tenant_id: 'tnt_test123',
        created_by: 'usr_admin001',
      },
    });
    
    expect(mockStripe.subscriptions.create).toHaveBeenCalledWith({
      customer: 'cus_test123',
      items: [{ price: 'price_pro_monthly' }],
      metadata: { authvital_tenant_id: 'tnt_test123' },
    });
  });
});
```

---

## Related Documentation

- [Organization Sync Overview](./index.md)
- [Event Details](./events.md)
- [Prisma Schema](./prisma-schema.md)
- [Identity Sync](../identity-sync/index.md)
- [Webhooks Guide](../webhooks.md)
