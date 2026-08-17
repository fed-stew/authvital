import { cn } from '@/lib/utils';
import { Key, Shield, Zap, Crown } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Switch } from '@/components/ui/Switch';
import { Dropdown } from '@/components/ui/Dropdown';
import type { LicensingMode } from '@/types';
import type { LicenseType } from './LicensesTab.types';

// =============================================================================
// MODE CONFIGURATION CARD
// =============================================================================

interface ModeConfigProps {
  licensingMode: LicensingMode;
  defaultLicenseTypeId: string;
  defaultSeatCount: number;
  autoProvisionOnSignup: boolean;
  autoGrantToOwner: boolean;
  licenseTypes: LicenseType[];
  isSaving: boolean;
  onModeChange: (mode: LicensingMode) => void;
  onFieldChange: (field: string, value: any) => void;
  onSave: () => void;
}

export function ModeConfigCard({
  licensingMode,
  defaultLicenseTypeId,
  defaultSeatCount,
  autoProvisionOnSignup,
  autoGrantToOwner,
  licenseTypes,
  isSaving,
  onModeChange,
  onFieldChange,
  onSave,
}: ModeConfigProps) {
  const modeOptions = [
    {
      value: 'FREE' as LicensingMode,
      label: 'Free',
      icon: Zap,
      description: 'All users get access automatically',
      color: 'text-green-400',
      bgColor: 'bg-green-500/20',
      borderActive: 'border-green-500 bg-green-500/10',
    },
    {
      value: 'TENANT_WIDE' as LicensingMode,
      label: 'Tenant-Wide',
      icon: Shield,
      description: 'All users in tenant get access',
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/20',
      borderActive: 'border-blue-500 bg-blue-500/10',
    },
    {
      value: 'PER_SEAT' as LicensingMode,
      label: 'Per-Seat',
      icon: Crown,
      description: 'Individual seats assigned to users',
      color: 'text-purple-400',
      bgColor: 'bg-purple-500/20',
      borderActive: 'border-purple-500 bg-purple-500/10',
    },
  ];

  const activeLicenseTypes = licenseTypes.filter(lt => lt.status === 'ACTIVE' || lt.status === 'DRAFT');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Key className="h-5 w-5" />
          User Licensing Mode
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-sm text-muted-foreground">
          How individual users within a tenant get licensed to use this application.
        </p>
        {/* Mode Selector - 3 column cards */}
        <div className="grid grid-cols-3 gap-3">
          {modeOptions.map((option) => {
            const Icon = option.icon;
            const isActive = licensingMode === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onModeChange(option.value)}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-lg border p-4 transition-all text-center',
                  isActive
                    ? option.borderActive
                    : 'border-white/10 hover:border-white/20 hover:bg-white/5'
                )}
              >
                <div className={cn('flex h-10 w-10 items-center justify-center rounded-full', option.bgColor)}>
                  <Icon className={cn('h-5 w-5', option.color)} />
                </div>
                <span className="text-sm font-medium text-foreground">{option.label}</span>
                <span className="text-xs text-muted-foreground">{option.description}</span>
              </button>
            );
          })}
        </div>

        {/* Dynamic settings based on mode */}
        {licensingMode !== 'FREE' && (
          <div className="space-y-4 rounded-lg border border-white/10 bg-white/5 p-4">
            <h4 className="text-sm font-medium text-foreground">Provisioning Settings</h4>

            {/* Default License Type */}
            <div className="space-y-2">
              <Label className="text-sm">Default License Type</Label>
              <Dropdown
                value={defaultLicenseTypeId || ''}
                onChange={(value) => onFieldChange('defaultLicenseTypeId', value)}
                options={[
                  { value: '', label: 'No default (manual assignment)' },
                  ...activeLicenseTypes.map(lt => ({
                    value: lt.id,
                    label: `${lt.name}${lt.maxMembers ? ` (max ${lt.maxMembers})` : ' (unlimited)'}`,
                  })),
                ]}
              />
              <p className="text-xs text-muted-foreground">
                Auto-assigned to new tenants on signup
              </p>
            </div>

            {/* Default Seat Count - PER_SEAT only */}
            {licensingMode === 'PER_SEAT' && (
              <div className="space-y-2">
                <Label className="text-sm">Default Seat Count</Label>
                <Input
                  type="number"
                  min="1"
                  value={defaultSeatCount || 10}
                  onChange={(e) => onFieldChange('defaultSeatCount', parseInt(e.target.value) || 10)}
                  placeholder="10"
                  className="bg-card max-w-32"
                />
                <p className="text-xs text-muted-foreground">
                  Number of seats provisioned for new tenants
                </p>
              </div>
            )}

            {/* Auto-provision toggle */}
            <div className="flex items-center justify-between rounded-lg border border-white/10 p-3">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">Auto-Provision on Signup</Label>
                <p className="text-xs text-muted-foreground">
                  Create subscription when a new tenant signs up
                </p>
              </div>
              <Switch
                checked={autoProvisionOnSignup || false}
                onCheckedChange={(checked) => onFieldChange('autoProvisionOnSignup', checked)}
              />
            </div>

            {/* Auto-grant to owner - PER_SEAT only */}
            {licensingMode === 'PER_SEAT' && (
              <div className="flex items-center justify-between rounded-lg border border-white/10 p-3">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">Auto-Grant to Tenant Owner</Label>
                  <p className="text-xs text-muted-foreground">
                    Assign a seat to the owner when subscription is created
                  </p>
                </div>
                <Switch
                  checked={autoGrantToOwner || false}
                  onCheckedChange={(checked) => onFieldChange('autoGrantToOwner', checked)}
                />
              </div>
            )}
          </div>
        )}

        {/* FREE mode info */}
        {licensingMode === 'FREE' && (
          <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-4">
            <p className="text-sm text-green-300">
              <strong>Free mode</strong> — A "Free" license type is auto-created and all members get access automatically. No provisioning configuration needed.
            </p>
          </div>
        )}

        {/* Save button */}
        <div className="flex justify-end">
          <Button onClick={onSave} disabled={isSaving} size="sm">
            {isSaving ? 'Saving...' : 'Save Mode Settings'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
