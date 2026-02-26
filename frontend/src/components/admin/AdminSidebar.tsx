import * as React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Building2,
  AppWindow,
  Settings,
  ShieldCheck,
  Webhook,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// =============================================================================
// TYPES
// =============================================================================

type NavSection = {
  title: string;
  items: NavItem[];
};

type NavItem = {
  to: string;
  label: string;
  icon: React.ReactNode;
  badge?: string;
};

// =============================================================================
// CONFIG
// =============================================================================

const navigation: NavSection[] = [
  {
    title: 'Overview',
    items: [
      {
        to: '/admin',
        label: 'Dashboard',
        icon: <LayoutDashboard className="h-5 w-5" />,
      },
    ],
  },
  {
    title: 'Directory Management',
    items: [
      {
        to: '/admin/users',
        label: 'Users',
        icon: <Users className="h-5 w-5" />,
      },
      {
        to: '/admin/tenants',
        label: 'Tenants',
        icon: <Building2 className="h-5 w-5" />,
      },
      {
        to: '/admin/applications',
        label: 'Applications',
        icon: <AppWindow className="h-5 w-5" />,
      },
    ],
  },
  {
    title: 'System',
    items: [
      {
        to: '/admin/admin-accounts',
        label: 'Admin Accounts',
        icon: <ShieldCheck className="h-5 w-5" />,
      },
      {
        to: '/admin/webhooks',
        label: 'Webhooks',
        icon: <Webhook className="h-5 w-5" />,
      },
      {
        to: '/admin/settings',
        label: 'Settings',
        icon: <Settings className="h-5 w-5" />,
      },
    ],
  },
];

// =============================================================================
// COMPONENT
// =============================================================================

interface AdminSidebarProps {
  className?: string;
}

function AdminSidebar({ className }: AdminSidebarProps) {
  return (
    <aside
      className={cn(
        'flex h-screen flex-col border-r border-white/10 bg-slate-950',
        className
      )}
    >
      {/* Logo/Brand */}
      <div className="flex h-16 items-center border-b border-white/10 px-6">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <span className="text-lg font-bold text-primary-foreground">A</span>
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">
              AuthVader
            </h1>
            <p className="text-xs text-muted-foreground">Admin</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-6 overflow-y-auto p-4">
        {navigation.map((section) => (
          <div key={section.title}>
            {/* Section Title */}
            <h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {section.title}
            </h3>
            {/* Section Items */}
            <div className="space-y-1">
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-white/10 text-white'
                        : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'
                    )
                  }
                >
                  <div className="flex items-center gap-3">
                    {item.icon}
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span className="flex h-5 items-center rounded-full bg-primary px-2 text-xs font-medium text-primary-foreground">
                      {item.badge}
                    </span>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Version */}
      <div className="border-t border-white/10 p-4">
        <p className="text-xs text-muted-foreground">
          AuthVader Admin v1.0.0
        </p>
      </div>
    </aside>
  );
}

export { AdminSidebar };
