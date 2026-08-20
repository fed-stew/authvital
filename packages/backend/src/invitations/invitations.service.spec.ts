// Mock the authorization barrel BEFORE importing the service: loading it for
// real drags in authorization.module -> auth.module -> ... -> licensing
// controllers, a circular chain that leaves TENANT_PERMISSIONS undefined at
// decorator-evaluation time in a bare jest context.
jest.mock('../authorization', () => ({
  AppAccessService: class AppAccessService {},
  TENANT_PERMISSIONS: {},
}));

// Mock the sync barrel too: importing the real sync.module leaves an async
// handle open at module scope, which keeps jest from ever exiting.
jest.mock('../sync', () => ({
  SyncEventService: class SyncEventService {},
  SYNC_EVENT_TYPES: {
    INVITE_CREATED: 'invite.created',
    INVITE_ACCEPTED: 'invite.accepted',
    MEMBER_JOINED: 'member.joined',
  },
}));

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { InvitationsService } from './invitations.service';
import { PrismaService } from '../prisma/prisma.service';
import { LicensePoolService } from '../licensing/services/license-pool.service';
import { LicenseAssignmentService } from '../licensing/services/license-assignment.service';
import { LicenseProvisioningService } from '../licensing/services/license-provisioning.service';
import { SyncEventService } from '../sync';
import { EmailService } from '../auth/email.service';
import { AppAccessService } from '../authorization';
import { InvitationManagementService } from './invitation-management.service';

/**
 * Regression spec for invitee name pre-fill / fallback:
 * - getInvitationByToken must surface the inviter-provided names (stored on
 *   the invitee's placeholder user at invite time) so the accept page can
 *   pre-fill the form.
 * - acceptInvitation name precedence: form value > inviter-provided value.
 *   When the DTO omits names, the placeholder user's names must survive
 *   untouched (no user.update clobbering them).
 */

const mockTx = {
  user: { update: jest.fn() },
  membership: { update: jest.fn() },
  invitation: { update: jest.fn() },
};

const mockPrisma = {
  invitation: { findUnique: jest.fn() },
  applicationClient: { findUnique: jest.fn() },
  application: { findUnique: jest.fn() },
  $transaction: jest.fn(async (fn: (tx: typeof mockTx) => unknown) => fn(mockTx)),
};

const mockLicensePoolService = { getAvailableCapacity: jest.fn() };
const mockLicenseAssignmentService = { grantLicense: jest.fn() };
const mockLicenseProvisioningService = { checkMemberLimit: jest.fn() };
const mockSyncEventService = { emit: jest.fn().mockResolvedValue(undefined) };
const mockEmailService = { sendInvitationEmail: jest.fn() };
const mockAppAccessService = {
  autoGrantFreeApps: jest.fn().mockResolvedValue(undefined),
  autoGrantTenantWideApps: jest.fn().mockResolvedValue(undefined),
};
const mockInvitationManagementService = {
  getApplicationIdFromClientId: jest.fn().mockResolvedValue([]),
  getApplicationIdsForTenant: jest.fn().mockResolvedValue([]),
};

const FUTURE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const TENANT = { id: 't-1', name: 'Acme', slug: 'acme' };

const tokenInvitation = (overrides: Record<string, unknown> = {}) => ({
  id: 'inv-1',
  email: 'invitee@example.com',
  token: 'tok-1',
  expiresAt: FUTURE,
  consumedAt: null,
  tenant: TENANT,
  invitedBy: { givenName: 'Alice', familyName: 'Admin', email: 'alice@example.com' },
  membership: {
    id: 'm-1',
    user: { givenName: 'Ada', familyName: 'Lovelace' },
    membershipTenantRoles: [{ tenantRole: { name: 'Member' } }],
  },
  ...overrides,
});

const acceptInvitation = (overrides: Record<string, unknown> = {}) => ({
  id: 'inv-1',
  email: 'invitee@example.com',
  token: 'tok-1',
  expiresAt: FUTURE,
  consumedAt: null,
  clientId: null,
  tenantId: 't-1',
  invitedById: 'inviter-1',
  metadata: {},
  tenant: TENANT,
  membership: {
    id: 'm-1',
    user: {
      id: 'u-1',
      email: 'invitee@example.com',
      passwordHash: 'existing-hash',
      givenName: 'Ada',
      familyName: 'Lovelace',
    },
    membershipTenantRoles: [{ tenantRole: { slug: 'member' } }],
  },
  ...overrides,
});

describe('InvitationsService - invitee names', () => {
  let service: InvitationsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvitationsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: LicensePoolService, useValue: mockLicensePoolService },
        { provide: LicenseAssignmentService, useValue: mockLicenseAssignmentService },
        { provide: LicenseProvisioningService, useValue: mockLicenseProvisioningService },
        { provide: SyncEventService, useValue: mockSyncEventService },
        { provide: EmailService, useValue: mockEmailService },
        { provide: AppAccessService, useValue: mockAppAccessService },
        { provide: InvitationManagementService, useValue: mockInvitationManagementService },
      ],
    }).compile();
    service = module.get(InvitationsService);
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockTx) => unknown) =>
      fn(mockTx),
    );
    mockInvitationManagementService.getApplicationIdsForTenant.mockResolvedValue([]);
    mockTx.membership.update.mockResolvedValue({ id: 'm-1', status: 'ACTIVE', tenant: TENANT });
    mockTx.invitation.update.mockResolvedValue({});
  });

  describe('getInvitationByToken', () => {
    it('throws NotFoundException for an unknown token', async () => {
      mockPrisma.invitation.findUnique.mockResolvedValue(null);
      await expect(service.getInvitationByToken('nope')).rejects.toThrow(NotFoundException);
    });

    it('returns the inviter-provided invitee names for form pre-fill', async () => {
      mockPrisma.invitation.findUnique.mockResolvedValue(tokenInvitation());

      const result = await service.getInvitationByToken('tok-1');

      expect(result.givenName).toBe('Ada');
      expect(result.familyName).toBe('Lovelace');
      // Existing shape preserved
      expect(result.email).toBe('invitee@example.com');
      expect(result.invitedBy).toEqual({ name: 'Alice Admin' });
    });

    it('returns null names when the inviter provided none', async () => {
      mockPrisma.invitation.findUnique.mockResolvedValue(
        tokenInvitation({
          membership: {
            id: 'm-1',
            user: { givenName: null, familyName: null },
            membershipTenantRoles: [{ tenantRole: { name: 'Member' } }],
          },
        }),
      );

      const result = await service.getInvitationByToken('tok-1');

      expect(result.givenName).toBeNull();
      expect(result.familyName).toBeNull();
    });
  });

  describe('acceptInvitation name precedence (form > inviter-provided)', () => {
    it('keeps the inviter-provided names when the DTO omits them', async () => {
      mockPrisma.invitation.findUnique.mockResolvedValue(acceptInvitation());

      const result = await service.acceptInvitation({ token: 'tok-1' });

      // No form values -> no user.update -> placeholder names survive
      expect(mockTx.user.update).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.user).toMatchObject({ givenName: 'Ada', familyName: 'Lovelace' });
    });

    it('lets form values win when both form and inviter values are present', async () => {
      mockPrisma.invitation.findUnique.mockResolvedValue(acceptInvitation());
      mockTx.user.update.mockResolvedValue({
        id: 'u-1',
        email: 'invitee@example.com',
        passwordHash: 'existing-hash',
        givenName: 'Grace',
        familyName: 'Hopper',
      });

      const result = await service.acceptInvitation({
        token: 'tok-1',
        givenName: 'Grace',
        familyName: 'Hopper',
      });

      expect(mockTx.user.update).toHaveBeenCalledWith({
        where: { id: 'u-1' },
        data: { givenName: 'Grace', familyName: 'Hopper' },
      });
      expect(result.user).toMatchObject({ givenName: 'Grace', familyName: 'Hopper' });
    });
  });
});
