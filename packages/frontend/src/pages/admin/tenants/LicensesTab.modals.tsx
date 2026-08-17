import * as React from 'react';
import { CheckCircle } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import type {
  TenantLicenseOverview,
  MemberWithLicenses,
  AvailableLicenseType,
  GrantLicenseFormData,
  ProvisionSubscriptionFormData,
  SelectedLicenseForRevoke,
} from './LicensesTab.types';
import { getUserName } from './LicensesTab.helpers';

// =============================================================================
// PROVISION SUBSCRIPTION MODAL
// =============================================================================

interface ProvisionSubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  isSubmitting: boolean;
  availableLicenseTypes: AvailableLicenseType[];
  provisionFormData: ProvisionSubscriptionFormData;
  setProvisionFormData: React.Dispatch<
    React.SetStateAction<ProvisionSubscriptionFormData>
  >;
}

export function ProvisionSubscriptionModal({
  isOpen,
  onClose,
  onSubmit,
  isSubmitting,
  availableLicenseTypes,
  provisionFormData,
  setProvisionFormData,
}: ProvisionSubscriptionModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add Subscription"
      size="lg"
      footer={
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={onSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Adding...' : 'Add Subscription'}
          </Button>
        </div>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Application <span className="text-destructive">*</span>
            </label>
            <div className="space-y-2">
              {availableLicenseTypes
                .filter((lt, index, self) =>
                  index === self.findIndex((t) => t.applicationId === lt.applicationId)
                )
                .map((lt) => (
                  <button
                    key={lt.applicationId}
                    type="button"
                    onClick={() =>
                      setProvisionFormData((prev) => ({
                        ...prev,
                        applicationId: lt.applicationId,
                        licenseTypeId: '', // Reset license type when app changes
                      }))
                    }
                    className={`w-full rounded-lg border p-3 text-left transition-all ${
                      provisionFormData.applicationId === lt.applicationId
                        ? 'border-primary bg-primary/10'
                        : 'border-white/10 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-foreground">{lt.applicationName}</p>
                        <p className="text-xs text-muted-foreground">
                          {lt.description}
                        </p>
                      </div>
                      {provisionFormData.applicationId === lt.applicationId && (
                        <CheckCircle className="h-5 w-5 text-primary" />
                      )}
                    </div>
                  </button>
                ))}
            </div>
          </div>

          {provisionFormData.applicationId && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                License Type <span className="text-destructive">*</span>
              </label>
              <div className="space-y-2">
                {availableLicenseTypes
                  .filter((lt) => lt.applicationId === provisionFormData.applicationId)
                  .map((lt) => (
                    <button
                      key={lt.id}
                      type="button"
                      onClick={() =>
                        setProvisionFormData((prev) => ({
                          ...prev,
                          licenseTypeId: lt.id,
                        }))
                      }
                      className={`w-full rounded-lg border p-3 text-left transition-all ${
                        provisionFormData.licenseTypeId === lt.id
                          ? 'border-primary bg-primary/10'
                          : 'border-white/10 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <p className="font-medium text-foreground">{lt.name}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {lt.description}
                          </p>
                          {Object.keys(lt.features).length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {Object.entries(lt.features)
                                .filter(([_, enabled]) => enabled)
                                .slice(0, 3)
                                .map(([key]) => (
                                  <Badge key={key} variant="outline" className="text-xs">
                                    {key}
                                  </Badge>
                                ))}
                            </div>
                          )}
                        </div>
                        {provisionFormData.licenseTypeId === lt.id && (
                          <CheckCircle className="h-5 w-5 text-primary shrink-0" />
                        )}
                      </div>
                    </button>
                  ))}
              </div>
            </div>
          )}
        </div>

        {provisionFormData.applicationId && provisionFormData.licenseTypeId && (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Quantity <span className="text-destructive">*</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="1"
                  max="1000"
                  value={provisionFormData.quantityPurchased}
                  onChange={(e) =>
                    setProvisionFormData((prev) => ({
                      ...prev,
                      quantityPurchased: parseInt(e.target.value) || 1,
                    }))
                  }
                  className="flex-1 rounded-md border border-white/10 bg-card px-3 py-2 text-foreground focus:border-primary focus:outline-none"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Period End <span className="text-destructive">*</span>
              </label>
              <input
                type="date"
                value={provisionFormData.currentPeriodEnd}
                onChange={(e) =>
                  setProvisionFormData((prev) => ({
                    ...prev,
                    currentPeriodEnd: e.target.value,
                  }))
                }
                className="w-full rounded-md border border-white/10 bg-card px-3 py-2 text-foreground focus:border-primary focus:outline-none"
                required
              />
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
}

// =============================================================================
// GRANT LICENSE MODAL
// =============================================================================

interface GrantLicenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  isSubmitting: boolean;
  selectedMember: MemberWithLicenses | null;
  overview: TenantLicenseOverview | null;
  grantFormData: GrantLicenseFormData;
  setGrantFormData: React.Dispatch<React.SetStateAction<GrantLicenseFormData>>;
}

export function GrantLicenseModal({
  isOpen,
  onClose,
  onSubmit,
  isSubmitting,
  selectedMember,
  overview,
  grantFormData,
  setGrantFormData,
}: GrantLicenseModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Grant License"
      size="md"
      footer={
        <div className="flex gap-2 justify-end">
          <Button
            variant="outline"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Granting...' : 'Grant License'}
          </Button>
        </div>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {selectedMember && (
          <div className="rounded-md border border-white/10 bg-white/5 p-4">
            <p className="font-medium text-foreground">{getUserName(selectedMember)}</p>
            <p className="text-sm text-muted-foreground">{selectedMember.user.email}</p>
          </div>
        )}

        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            Application <span className="text-destructive">*</span>
          </label>
          <div className="space-y-2">
            {overview?.subscriptions
              .filter((sub) => sub.quantityAvailable > 0)
              .map((sub) => {
                const isSelected = grantFormData.applicationId === sub.applicationId;
                return (
                  <button
                    key={sub.applicationId}
                    type="button"
                    onClick={() =>
                      setGrantFormData((prev) => ({
                        ...prev,
                        applicationId: sub.applicationId,
                        licenseTypeId: sub.licenseTypeId, // Set to subscription's type by default
                      }))
                    }
                    disabled={sub.quantityAvailable <= 0}
                    className={`w-full rounded-lg border p-3 text-left transition-all disabled:opacity-50 ${
                      isSelected
                        ? 'border-primary bg-primary/10'
                        : 'border-white/10 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-foreground">{sub.applicationName}</p>
                        <p className="text-xs text-muted-foreground">
                          {sub.licenseTypeName} - {sub.quantityAvailable} seats available
                        </p>
                      </div>
                      {isSelected && (
                        <CheckCircle className="h-5 w-5 text-primary" />
                      )}
                    </div>
                  </button>
                );
              })}
          </div>
        </div>
      </form>
    </Modal>
  );
}

// =============================================================================
// REVOKE LICENSE CONFIRMATION MODAL
// =============================================================================

interface RevokeLicenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  selectedLicenseForRevoke: SelectedLicenseForRevoke | null;
}

export function RevokeLicenseModal({
  isOpen,
  onClose,
  onConfirm,
  selectedLicenseForRevoke,
}: RevokeLicenseModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Revoke License"
      size="sm"
      footer={
        <div className="flex gap-2 justify-end">
          <Button
            variant="outline"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            Revoke License
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-muted-foreground">
          Are you sure you want to revoke this license? The user will lose access to
          the application.
        </p>
        {selectedLicenseForRevoke && (
          <div className="rounded-md border border-white/10 bg-white/5 p-4 space-y-2">
            <div>
              <p className="text-xs text-muted-foreground">User</p>
              <p className="font-medium text-foreground">
                {selectedLicenseForRevoke.userDisplayName}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">License</p>
              <p className="font-medium text-foreground">
                {selectedLicenseForRevoke.applicationName} -{' '}
                {selectedLicenseForRevoke.licenseTypeName}
              </p>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
