
import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, AppWindow } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TenantSidebarProps {
  tenantId: string;
}

const navItems = [
  { label: 'Overview', icon: LayoutDashboard, path: 'overview' },
  { label: 'Members', icon: Users, path: 'members' },
  { label: 'Applications', icon: AppWindow, path: 'applications' },
];

/**
 * TenantSidebar - Navigation sidebar for tenant management
 * Links to Overview, Members, and Applications pages
 */
export function TenantSidebar({ tenantId }: TenantSidebarProps) {
  const location = useLocation();

  return (
    <aside className="flex w-64 flex-col border-r border-white/10 bg-card">
      {/* Logo/Brand area */}
      <div className="flex h-16 items-center gap-2 border-b border-white/10 px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
          <span className="text-sm font-bold text-primary-foreground">T</span>
        </div>
        <span className="text-lg font-semibold text-foreground">Tenant</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-4">
        {navItems.map((item) => {
          const fullPath = `/tenant/${tenantId}/${item.path}`;
          const isActive =
            location.pathname === fullPath ||
            location.pathname.startsWith(fullPath + '/');

          return (
            <NavLink
              key={item.path}
              to={fullPath}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </NavLink>
          );
        })}
      </nav>

      {/* Back to app link */}
      <div className="border-t border-white/10 p-4">
        <NavLink
          to="/"
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to App
        </NavLink>
      </div>
    </aside>
  );
}
