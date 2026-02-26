import * as React from 'react';
import { Building2, UserPlus, UserCog, UserX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { superAdminApi } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';
import type { AccessMode } from '@/types';

// =============================================================================
// TYPES
// =============================================================================

interface AccessTabProps {
  app: {
    id: string;
    name: string;
    accessMode?: string;
  };
  appId: string;
  onRefresh: () => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function AccessTab({ app, appId, onRefresh }: AccessTabProps) {
  const { toast } = useToast();
  const [accessMode, setAccessMode] = React.useState<AccessMode>(
    (app.accessMode as AccessMode) || 'AUTOMATIC'
  );
  const [isSaving, setIsSaving] = React.useState(false);

  // Sync when app prop changes
  React.useEffect(() => {
    setAccessMode((app.accessMode as AccessMode) || 'AUTOMATIC');
  }, [app.accessMode]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await superAdminApi.updateApplication(appId, { accessMode });
      toast({ variant: 'success', title: 'Success', message: 'Access mode updated' });
      onRefresh();
    } catch (err: any) {
      toast({
        variant: 'error',
        title: 'Error',
        message: err?.response?.data?.message || 'Failed to update access mode',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const accessModeOptions = [
    {
      value: 'AUTOMATIC' as AccessMode,
      label: 'Automatic',
      icon: Building2,
      description: 'New tenants automatically get a subscription on signup',
      color: 'text-green-400',
      bgColor: 'bg-green-500/20',
      borderActive: 'border-green-500 bg-green-500/10',
    },
    {
      value: 'MANUAL_AUTO_GRANT' as AccessMode,
      label: 'Auto-Grant',
      icon: UserPlus,
      description: 'New tenants get subscriptions by default (can be changed)',
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/20',
      borderActive: 'border-blue-500 bg-blue-500/10',
    },
    {
      value: 'MANUAL_NO_DEFAULT' as AccessMode,
      label: 'Manual Only',
      icon: UserCog,
      description: 'Tenants must be explicitly granted subscriptions',
      color: 'text-yellow-400',
      bgColor: 'bg-yellow-500/20',
      borderActive: 'border-yellow-500 bg-yellow-500/10',
    },
    {
      value: 'DISABLED' as AccessMode,
      label: 'Disabled',
      icon: UserX,
      description: 'No new tenant subscriptions allowed',
      color: 'text-red-400',
      bgColor: 'bg-red-500/20',
      borderActive: 'border-red-500 bg-red-500/10',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Info banner */}
      <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-4">
        <div className="flex items-start gap-3">
          <Building2 className="h-5 w-5 text-blue-400 mt-0.5" />
          <div>
            <h4 className="font-medium text-blue-400">Tenant-Level Access Control</h4>
            <p className="text-sm text-muted-foreground mt-1">
              Access Mode controls whether <strong>tenants</strong> can subscribe to this application
              when they sign up. This does <strong>NOT</strong> control individual user access within
              a tenant — that is determined by the <strong>Licensing</strong> settings.
            </p>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Access Mode
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-muted-foreground">
            When a new tenant signs up, should they automatically get a subscription to this application?
          </p>

          <div className="grid grid-cols-2 gap-3">
            {accessModeOptions.map((option) => {
              const Icon = option.icon;
              const isActive = accessMode === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setAccessMode(option.value)}
                  className={cn(
                    'flex flex-col items-center gap-2 rounded-lg border p-4 transition-all text-center',
                    isActive
                      ? option.borderActive
                      : 'border-white/10 hover:border-white/20 hover:bg-white/5'
                  )}
                >
                  <div
                    className={cn(
                      'flex h-10 w-10 items-center justify-center rounded-full',
                      option.bgColor
                    )}
                  >
                    <Icon className={cn('h-5 w-5', option.color)} />
                  </div>
                  <span className="text-sm font-medium text-foreground">{option.label}</span>
                  <span className="text-xs text-muted-foreground">{option.description}</span>
                </button>
              );
            })}
          </div>

          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save Access Mode'}
          </Button>
        </CardContent>
      </Card>

      {/* Explanation of each mode */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Access Mode Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="space-y-3">
            <div className="flex gap-3">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-green-500/20 shrink-0">
                <Building2 className="h-3 w-3 text-green-400" />
              </div>
              <div>
                <strong className="text-green-400">Automatic</strong>
                <span className="text-muted-foreground">
                  {' '}— Best for free/freemium apps. Every new tenant gets a subscription automatically.
                </span>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-500/20 shrink-0">
                <UserPlus className="h-3 w-3 text-blue-400" />
              </div>
              <div>
                <strong className="text-blue-400">Auto-Grant</strong>
                <span className="text-muted-foreground">
                  {' '}— Same as Automatic, but signals that tenants can be individually disabled later.
                </span>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-yellow-500/20 shrink-0">
                <UserCog className="h-3 w-3 text-yellow-400" />
              </div>
              <div>
                <strong className="text-yellow-400">Manual Only</strong>
                <span className="text-muted-foreground">
                  {' '}— Tenants must be explicitly granted access. Good for enterprise/invite-only apps.
                </span>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500/20 shrink-0">
                <UserX className="h-3 w-3 text-red-400" />
              </div>
              <div>
                <strong className="text-red-400">Disabled</strong>
                <span className="text-muted-foreground">
                  {' '}— No new subscriptions allowed. Existing subscriptions are preserved. Use for
                  sunsetting an app.
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
