import { Routes, Route } from 'react-router-dom';

// Admin context and guard
import { AdminProvider } from './contexts/AdminContext';
import { AdminGuard } from './components/admin/AdminGuard';

// Admin pages
import { AdminAccountsPage, AdminForgotPassword, AdminLogin, AdminResetPassword, ChangePassword, MfaSetup, MfaVerify, WebhooksPage, PubSubPage } from './pages/admin';
import { Dashboard } from './pages/admin/Dashboard';
import { UsersPage, UserDetailPage } from './pages/admin/users';
import { TenantsPage, TenantDetailPage } from './pages/admin/tenants';
import {
  ApplicationsPage as AdminApplicationsPage,
  AppDetailPage,
  RoleDetailPage,
} from './pages/admin/applications';
import { SettingsPage } from './pages/admin/settings';

// =============================================================================
// ADMIN ROUTES WRAPPER (with AdminProvider)
// =============================================================================
//
// This module is loaded lazily from App.tsx (React.lazy) so the entire admin
// console lands in its own code-split chunk instead of bloating the auth
// bundle that every end user downloads.

export default function AdminRoutes() {
  return (
    <AdminProvider>
      <Routes>
        <Route path="login" element={<AdminLogin />} />
        <Route path="change-password" element={<ChangePassword />} />
        <Route path="mfa/verify" element={<MfaVerify />} />
        <Route path="mfa/setup" element={<MfaSetup />} />
        <Route path="forgot-password" element={<AdminForgotPassword />} />
        <Route path="reset-password" element={<AdminResetPassword />} />
        <Route element={<AdminGuard />}>
          <Route index element={<Dashboard />} />

          {/* User Management */}
          <Route path="users" element={<UsersPage />} />
          <Route path="users/:id" element={<UserDetailPage />} />

          {/* Tenant Management */}
          <Route path="tenants" element={<TenantsPage />} />
          <Route path="tenants/:id" element={<TenantDetailPage />} />

          {/* Application Management */}
          <Route path="applications" element={<AdminApplicationsPage />} />
          <Route path="applications/:id" element={<AppDetailPage />} />
          <Route path="applications/:appId/roles/:roleId" element={<RoleDetailPage />} />

          {/* Admin Accounts */}
          <Route path="admin-accounts" element={<AdminAccountsPage />} />

          {/* Webhooks */}
          <Route path="webhooks" element={<WebhooksPage />} />

          {/* Pub/Sub */}
          <Route path="pubsub" element={<PubSubPage />} />

          {/* Settings */}
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </AdminProvider>
  );
}
