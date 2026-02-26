
import { Building2 } from 'lucide-react';

interface TenantHeaderProps {
  tenantId: string;
}

/**
 * TenantHeader - Top header for tenant management pages
 * Shows tenant name/org settings title and user menu
 */
export function TenantHeader({ tenantId: _tenantId }: TenantHeaderProps) {
  // TODO: Fetch tenant info or get from context

  return (
    <header className="flex h-16 items-center justify-between border-b border-white/10 bg-card px-6">
      <div className="flex items-center gap-3">
        <Building2 className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-lg font-semibold text-foreground">
          Organization Settings
        </h1>
      </div>

      <div className="flex items-center gap-4">
        {/* User menu placeholder */}
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20">
          <span className="text-xs font-medium text-primary">U</span>
        </div>
      </div>
    </header>
  );
}
