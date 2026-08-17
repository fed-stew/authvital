import * as React from 'react';
import { tenantApi } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { useToast } from '@/components/ui/Toast';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/Select';
import type { TenantSubscription, AvailableLicenseType } from './LicensesPage';
import { errMessage } from './LicensesPage';

interface ProvisionLicenseModalProps {
  tenantId: string;
  availableTypes: AvailableLicenseType[];
  /** When set, the modal only resizes this subscription's seat count. */
  resizeSubscription: TenantSubscription | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}

const oneYearOut = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
};

/**
 * ProvisionLicenseModal - buy a new subscription (create) or resize seats on an
 * existing one. Gated by licenses:provision (owner + billing-admin) upstream.
 */
export function ProvisionLicenseModal({
  tenantId,
  availableTypes,
  resizeSubscription,
  onClose,
  onSaved,
}: ProvisionLicenseModalProps) {
  const { toast } = useToast();
  const isResize = !!resizeSubscription;

  const [licenseTypeId, setLicenseTypeId] = React.useState('');
  const [quantity, setQuantity] = React.useState(
    resizeSubscription ? resizeSubscription.quantityPurchased : 1,
  );
  const [renewDate, setRenewDate] = React.useState(oneYearOut());
  const [isSaving, setIsSaving] = React.useState(false);

  // Resize can never drop below seats already handed out.
  const minQuantity = resizeSubscription ? resizeSubscription.quantityAssigned : 1;

  const selectedType = availableTypes.find((t) => t.id === licenseTypeId);

  const handleSave = async () => {
    if (quantity < minQuantity) {
      toast({
        variant: 'error',
        title: 'Invalid quantity',
        message: `Quantity cannot be below ${minQuantity} (already assigned).`,
      });
      return;
    }

    try {
      setIsSaving(true);
      if (isResize && resizeSubscription) {
        await tenantApi.updateSubscriptionQuantity(tenantId, resizeSubscription.id, quantity);
        toast({ variant: 'success', title: 'Seats updated', message: 'Subscription resized.' });
      } else {
        if (!selectedType) {
          toast({ variant: 'error', title: 'Pick a license', message: 'Choose a license type first.' });
          setIsSaving(false);
          return;
        }
        await tenantApi.provisionSubscription(tenantId, {
          applicationId: selectedType.applicationId,
          licenseTypeId: selectedType.id,
          quantityPurchased: quantity,
          currentPeriodEnd: new Date(renewDate).toISOString(),
        });
        toast({ variant: 'success', title: 'Licenses provisioned', message: 'Subscription created.' });
      }
      onClose();
      await onSaved();
    } catch (err: any) {
      toast({ variant: 'error', title: 'Error', message: errMessage(err, 'Failed to save subscription') });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={isResize ? 'Resize seats' : 'Provision licenses'}
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : isResize ? 'Update seats' : 'Provision'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {isResize && resizeSubscription ? (
          <div className="rounded-md border border-white/10 bg-white/5 p-3">
            <p className="font-medium text-foreground">
              {resizeSubscription.applicationName} — {resizeSubscription.licenseTypeName}
            </p>
            <p className="text-xs text-muted-foreground">
              {resizeSubscription.quantityAssigned} seats currently assigned
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <Label>License type</Label>
            <Select value={licenseTypeId} onValueChange={setLicenseTypeId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose an application license" />
              </SelectTrigger>
              <SelectContent>
                {availableTypes.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.applicationName} — {t.name}
                    {t.hasSubscription ? ' (resize)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedType?.description && (
              <p className="text-xs text-muted-foreground">{selectedType.description}</p>
            )}
          </div>
        )}

        <div className="space-y-2">
          <Label>Seats</Label>
          <Input
            type="number"
            min={minQuantity}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(0, Number(e.target.value)))}
            className="bg-card"
          />
          <p className="text-xs text-muted-foreground">Minimum {minQuantity} (seats already assigned).</p>
        </div>

        {!isResize && (
          <div className="space-y-2">
            <Label>Renews on</Label>
            <Input
              type="date"
              value={renewDate}
              onChange={(e) => setRenewDate(e.target.value)}
              className="bg-card"
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
