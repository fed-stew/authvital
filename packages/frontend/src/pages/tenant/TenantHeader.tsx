import { Building2 } from 'lucide-react';
import { useTenant } from '@/contexts/TenantContext';
import { AppSwitcher } from './AppSwitcher';

/**
 * TenantHeader - Top header for the tenant portal.
 * Shows the real organization name (from TenantContext) instead of a
 * hardcoded placeholder.
 */
export function TenantHeader() {
  const { tenantName } = useTenant();
  const initial = tenantName.trim().charAt(0).toUpperCase() || 'O';

  return (
    <header className="flex h-16 items-center justify-between border-b border-white/10 bg-card px-6">
      <div className="flex items-center gap-3">
        <Building2 className="h-5 w-5 text-muted-foreground" />
        <div className="leading-tight">
          <h1 className="text-lg font-semibold text-foreground">{tenantName}</h1>
          <p className="text-xs text-muted-foreground">Organization settings</p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <AppSwitcher />
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20">
          <span className="text-xs font-medium text-primary">{initial}</span>
        </div>
      </div>
    </header>
  );
}
