import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  AppWindow,
  Grid3x3,
  KeyRound,
  CreditCard,
  ScrollText,
  ShieldCheck,
  Globe,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTenant } from '@/contexts/TenantContext';

interface NavItem {
  label: string;
  icon: LucideIcon;
  path: string;
  /** Permission required to SEE this nav item. Undefined = always visible. */
  permission?: string;
}

/**
 * Nav items are gated on the caller's tenant permissions so we never render a
 * destination the user can't use. Read views (members/licenses/app-access) stay
 * visible to plain viewers; mutation-only areas (SSO/General) are hidden unless
 * the caller can manage them.
 */
const NAV_ITEMS: NavItem[] = [
  { label: 'Overview', icon: LayoutDashboard, path: 'overview' },
  { label: 'Members', icon: Users, path: 'members', permission: 'members:view' },
  { label: 'Applications', icon: AppWindow, path: 'applications', permission: 'app-access:view' },
  { label: 'Access Matrix', icon: Grid3x3, path: 'access-matrix', permission: 'app-access:view' },
  { label: 'Licenses', icon: KeyRound, path: 'licenses', permission: 'licenses:view' },
  { label: 'Billing', icon: CreditCard, path: 'billing', permission: 'billing:view' },
  { label: 'Audit Log', icon: ScrollText, path: 'audit', permission: 'audit:view' },
  { label: 'Single Sign-On', icon: ShieldCheck, path: 'sso', permission: 'tenant:sso:manage' },
  { label: 'Domains', icon: Globe, path: 'domains', permission: 'domains:view' },
  { label: 'General', icon: Settings, path: 'general', permission: 'tenant:manage' },
];

/**
 * TenantSidebar - Navigation sidebar for the tenant portal.
 * Brand + links derive from the shared TenantContext (tenantId + name).
 */
export function TenantSidebar() {
  const location = useLocation();
  const { tenantId, tenantName, can } = useTenant();
  const initial = tenantName.trim().charAt(0).toUpperCase() || 'O';

  const visibleItems = NAV_ITEMS.filter((item) => !item.permission || can(item.permission));

  return (
    <aside className="flex w-64 flex-col border-r border-white/10 bg-card">
      {/* Logo/Brand area */}
      <div className="flex h-16 items-center gap-2 border-b border-white/10 px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
          <span className="text-sm font-bold text-primary-foreground">{initial}</span>
        </div>
        <span className="truncate text-lg font-semibold text-foreground" title={tenantName}>
          {tenantName}
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-4">
        {visibleItems.map((item) => {
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

      {/* Account link */}
      <div className="border-t border-white/10 p-4">
        <NavLink
          to="/account/settings"
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          ← Account settings
        </NavLink>
      </div>
    </aside>
  );
}
