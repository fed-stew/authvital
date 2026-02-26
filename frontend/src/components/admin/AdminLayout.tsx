import * as React from 'react';
import { Outlet } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { AdminSidebar } from './AdminSidebar';
import { AdminHeader } from './AdminHeader';
import type { BreadcrumbItem } from './AdminHeader';

// =============================================================================
// LAYOUT COMPONENT
// =============================================================================

interface AdminLayoutProps {
  title?: string;
  breadcrumbs?: BreadcrumbItem[];
  actions?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}

function AdminLayout({
  title = 'Dashboard',
  breadcrumbs = [],
  actions,
  className,
  children,
}: AdminLayoutProps) {
  return (
    <div className="flex min-h-screen bg-slate-900">
      {/* Fixed Sidebar - 280px wide */}
      <AdminSidebar className="fixed left-0 top-0 h-screen w-[280px]" />

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col ml-[280px]">
        {/* Header */}
        <AdminHeader
          title={title}
          breadcrumbs={breadcrumbs}
          actions={actions}
        />

        {/* Content with padding */}
        <main className={cn('flex-1 p-6', className)}>
          {children || <Outlet />}
        </main>
      </div>
    </div>
  );
}

// =============================================================================
// CONTENT WRAPPER COMPONENT
// =============================================================================

interface AdminContentProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Wrapper for content within AdminLayout.
 * Use this to wrap page content when not using Outlet.
 */
function AdminContent({ children, className }: AdminContentProps) {
  return (
    <div className={cn('space-y-6', className)}>
      {children}
    </div>
  );
}

export { AdminLayout, AdminContent };
export type { AdminLayoutProps, BreadcrumbItem };
