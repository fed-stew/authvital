import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

// Admin context and guard
import { AdminProvider } from './contexts/AdminContext';
import { AdminGuard } from './components/admin/AdminGuard';

// UI components
import { ToastProvider } from './components/ui';

// Admin pages
import { AdminAccountsPage, AdminLogin, ChangePassword, MfaSetup, MfaVerify, WebhooksPage } from './pages/admin';
import { Dashboard } from './pages/admin/Dashboard';
import { UsersPage, UserDetailPage } from './pages/admin/users';
import { TenantsPage, TenantDetailPage } from './pages/admin/tenants';
import {
  ApplicationsPage as AdminApplicationsPage,
  AppDetailPage,
  RoleDetailPage,
} from './pages/admin/applications';
import { SettingsPage } from './pages/admin/settings';

// Tenant management pages
import {
  TenantLayout,
  OverviewPage as TenantOverviewPage,
  MembersPage as TenantMembersPage,
  ApplicationsPage as TenantApplicationsPage,
  AppUsersPage,
} from './pages/tenant';

// Auth pages (KEEP - DO NOT CHANGE)
import { EmbedLogin } from './pages/auth/EmbedLogin';
import { EmbedSignup } from './pages/auth/EmbedSignup';
import { VerifyEmail } from './pages/auth/VerifyEmail';
import { CompleteSignup } from './pages/auth/CompleteSignup';
import { OAuthLogin } from './pages/auth/OAuthLogin';
import { OAuthSignup } from './pages/auth/OAuthSignup';
import { OrgPicker } from './pages/auth/OrgPicker';
import { AppPicker } from './pages/auth/AppPicker';
import { AcceptInvite } from './pages/auth/AcceptInvite';
import { ForgotPassword } from './pages/auth/ForgotPassword';
import { ResetPassword } from './pages/auth/ResetPassword';
import MfaChallenge from './pages/auth/MfaChallenge';
import UserMfaSetup from './pages/auth/MfaSetup';


// =============================================================================
// ADMIN ROUTES WRAPPER (with AdminProvider)
// =============================================================================

function AdminRoutes() {
  return (
    <AdminProvider>
      <Routes>
        <Route path="login" element={<AdminLogin />} />
        <Route path="change-password" element={<ChangePassword />} />
        <Route path="mfa/verify" element={<MfaVerify />} />
        <Route path="mfa/setup" element={<MfaSetup />} />
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
          
          {/* Settings */}
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </AdminProvider>
  );
}

// =============================================================================
// APP CONTENT
// =============================================================================

function AppContent() {
  // All routes
  return (
    <Routes>
      {/* Root - Redirect to login (which handles app-picker flow when no client_id) */}
      <Route path="/" element={<Navigate to="/auth/login" replace />} />
      
      {/* Invitation acceptance page */}
      <Route path="/invite" element={<AcceptInvite />} />

      {/* Auth routes (KEEP - DO NOT CHANGE) */}
      <Route path="/auth/login" element={<OAuthLogin />} />
      <Route path="/auth/signup" element={<OAuthSignup />} />
      <Route path="/auth/forgot-password" element={<ForgotPassword />} />
      <Route path="/auth/reset-password" element={<ResetPassword />} />
      <Route path="/auth/mfa" element={<MfaChallenge />} />
      <Route path="/auth/mfa/setup" element={<UserMfaSetup />} />
      <Route path="/auth/org-picker" element={<OrgPicker />} />
      <Route path="/auth/app-picker" element={<AppPicker />} />
      <Route path="/auth/embed/login" element={<EmbedLogin />} />
      <Route path="/auth/embed/signup" element={<EmbedSignup />} />
      <Route path="/auth/verify-email" element={<VerifyEmail />} />
      <Route path="/auth/complete-signup" element={<CompleteSignup />} />
      <Route path="/auth/*" element={<Navigate to="/auth/login" replace />} />

      {/* Admin routes - wrapped in AdminProvider separately */}
      <Route path="/admin/*" element={<AdminRoutes />} />

      {/* Tenant Management Routes */}
      <Route path="/tenant/:tenantId" element={<TenantLayout />}>
        <Route index element={<Navigate to="overview" replace />} />
        <Route path="overview" element={<TenantOverviewPage />} />
        <Route path="members" element={<TenantMembersPage />} />
        <Route path="applications" element={<TenantApplicationsPage />} />
        <Route path="applications/:appId" element={<AppUsersPage />} />
      </Route>

      {/* Catch-all for unknown routes */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

// =============================================================================
// APP COMPONENT
// =============================================================================

function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </BrowserRouter>
  );
}

export default App;
