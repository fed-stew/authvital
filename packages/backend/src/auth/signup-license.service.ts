import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LicenseProvisioningService } from '../licensing/services/license-provisioning.service';
import { AccessMode } from '@prisma/client';

/**
 * Handles license provisioning during signup flows.
 * Separated from SignUpService for better maintainability.
 */
@Injectable()
export class SignUpLicenseService {
  private readonly logger = new Logger(SignUpLicenseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly licenseProvisioningService: LicenseProvisioningService,
  ) {}

  /**
   * Provision licenses for a new tenant
   * - If applicationId is provided: provision that app (and any FREE apps)
   * - If no applicationId: provision ALL FREE apps
   */
  async provisionLicensesForNewTenant(
    tenantId: string,
    userId: string,
    applicationId?: string,
    selectedLicenseTypeId?: string,
  ): Promise<void> {
    // Get all FREE apps that should be auto-provisioned
    const freeApps = await this.prisma.application.findMany({
      where: {
        isActive: true,
        licensingMode: 'FREE',
        defaultLicenseTypeId: { not: null },
        accessMode: { in: [AccessMode.AUTOMATIC, AccessMode.MANUAL_AUTO_GRANT] },
      },
      select: {
        id: true,
        name: true,
        defaultLicenseTypeId: true,
      },
    });

    this.logger.log(
      `Found ${freeApps.length} FREE apps to auto-provision for tenant ${tenantId}`,
    );

    // Provision all FREE apps
    for (const app of freeApps) {
      // Skip if this is the main app and user selected a specific license type
      if (app.id === applicationId && selectedLicenseTypeId) {
        continue;
      }

      this.logger.log(
        `Auto-provisioning FREE app "${app.name}" for tenant ${tenantId}`,
      );

      try {
        await this.licenseProvisioningService.provisionForNewTenant(
          tenantId,
          userId,
          app.defaultLicenseTypeId!,
          app.id,
        );
      } catch (err) {
        this.logger.error(
          `Failed to provision FREE app "${app.name}" for tenant ${tenantId}`,
          err instanceof Error ? err.stack : String(err),
        );
      }
    }

    // If a specific application was provided, handle it separately
    if (applicationId) {
      await this.provisionSpecificApplication(
        tenantId,
        userId,
        applicationId,
        selectedLicenseTypeId,
        freeApps,
      );
    }
  }

  private async provisionSpecificApplication(
    tenantId: string,
    userId: string,
    applicationId: string,
    selectedLicenseTypeId?: string,
    freeApps: { id: string }[] = [],
  ): Promise<void> {
    let licenseTypeId = selectedLicenseTypeId;

    // If no license type was explicitly selected, check app config
    if (!licenseTypeId) {
      const app = await this.prisma.application.findUnique({
        where: { id: applicationId },
        select: {
          id: true,
          name: true,
          licensingMode: true,
          defaultLicenseTypeId: true,
          autoProvisionOnSignup: true,
          accessMode: true,
        },
      });

      // Skip if already provisioned as FREE app
      const alreadyProvisioned = freeApps.some((fa) => fa.id === applicationId);
      if (alreadyProvisioned) {
        this.logger.log(`App ${applicationId} already provisioned as FREE app`);
        return;
      }

      // Check if accessMode allows auto-provisioning
      const accessModeAllowsAutoProvision =
        app?.accessMode === AccessMode.AUTOMATIC ||
        app?.accessMode === AccessMode.MANUAL_AUTO_GRANT;

      if (app?.autoProvisionOnSignup && app.defaultLicenseTypeId && accessModeAllowsAutoProvision) {
        licenseTypeId = app.defaultLicenseTypeId;
        this.logger.log(
          `Auto-provisioning "${app.name}" (autoProvisionOnSignup=true, accessMode=${app.accessMode}) for tenant ${tenantId}`,
        );
      } else if (app?.autoProvisionOnSignup && !accessModeAllowsAutoProvision) {
        this.logger.log(
          `Skipping auto-provision for "${app?.name}": accessMode=${app?.accessMode} does not allow auto-provisioning`,
        );
      }
    }

    if (licenseTypeId) {
      await this.licenseProvisioningService.provisionForNewTenant(
        tenantId,
        userId,
        licenseTypeId,
        applicationId,
      );
    }
  }
}
