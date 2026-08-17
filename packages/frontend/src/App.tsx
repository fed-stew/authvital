import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

// UI components
import { ToastProvider } from './components/ui';

// Auth pages (KEEP - DO NOT CHANGE)
// These stay eagerly imported: they are the hot path every end user hits
// first, so they belong in the entry chunk.
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
import MfaEnroll from './pages/auth/MfaEnroll';

// =============================================================================
// LAZY ROUTE GROUPS (code splitting)
// =============================================================================
//
// The admin console, tenant console, and account pages are heavy and only
// visited by a minority of sessions — each group loads as its own chunk on
// first navigation (React.lazy + Suspense) instead of bloating the auth
// bundle above Vite's chunk-size warning threshold.

// Admin console (everything under /admin/*)
const AdminRoutes = lazy(() => import('./AdminRoutes'));

// Tenant management pages — one shared dynamic import of the barrel keeps
// all tenant pages in a single chunk.
const tenantPages = () => import('./pages/tenant');
const TenantLayout = lazy(() => tenantPages().then((m) => ({ default: m.TenantLayout })));
const TenantOverviewPage = lazy(() => tenantPages().then((m) => ({ default: m.OverviewPage })));
const TenantMembersPage = lazy(() => tenantPages().then((m) => ({ default: m.MembersPage })));
const TenantApplicationsPage = lazy(() => tenantPages().then((m) => ({ default: m.ApplicationsPage })));
const AppUsersPage = lazy(() => tenantPages().then((m) => ({ default: m.AppUsersPage })));
const TenantAccessMatrixPage = lazy(() => tenantPages().then((m) => ({ default: m.AccessMatrixPage })));
const TenantSsoSettingsPage = lazy(() => tenantPages().then((m) => ({ default: m.SsoSettingsPage })));
const TenantDomainsPage = lazy(() => tenantPages().then((m) => ({ default: m.DomainsPage })));
const TenantGeneralPage = lazy(() => tenantPages().then((m) => ({ default: m.GeneralPage })));
const TenantLicensesPage = lazy(() => tenantPages().then((m) => ({ default: m.LicensesPage })));
const TenantBillingPage = lazy(() => tenantPages().then((m) => ({ default: m.BillingPage })));
const TenantAuditPage = lazy(() => tenantPages().then((m) => ({ default: m.AuditPage })));

// Account pages
const AccountSettingsPage = lazy(() =>
  import('./pages/account').then((m) => ({ default: m.AccountSettingsPage }))
);

// =============================================================================
// SUSPENSE FALLBACK
// =============================================================================

/** Full-screen spinner matching the existing loading UI (see AdminGuard). */
function RouteFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900">
      <div className="flex flex-col items-center gap-4">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}

// =============================================================================
// APP CONTENT
// =============================================================================

function AppContent() {
  // All routes
  return (
    <Suspense fallback={<RouteFallback />}>
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
        <Route path="/auth/mfa/enroll" element={<MfaEnroll />} />
        <Route path="/auth/org-picker" element={<OrgPicker />} />
        <Route path="/auth/app-picker" element={<AppPicker />} />
        <Route path="/auth/embed/login" element={<EmbedLogin />} />
        <Route path="/auth/embed/signup" element={<EmbedSignup />} />
        <Route path="/auth/verify-email" element={<VerifyEmail />} />
        <Route path="/auth/complete-signup" element={<CompleteSignup />} />
        <Route path="/auth/*" element={<Navigate to="/auth/login" replace />} />

        {/* Admin routes - wrapped in AdminProvider separately */}
        <Route path="/admin/*" element={<AdminRoutes />} />

        {/* Account settings (canonical per-user route; also the console entry point) */}
        <Route path="/account" element={<Navigate to="/account/settings" replace />} />
        <Route path="/account/settings" element={<AccountSettingsPage />} />

        {/* Tenant Management Routes */}
        <Route path="/tenant/:tenantId" element={<TenantLayout />}>
          <Route index element={<Navigate to="overview" replace />} />
          <Route path="overview" element={<TenantOverviewPage />} />
          <Route path="members" element={<TenantMembersPage />} />
          <Route path="applications" element={<TenantApplicationsPage />} />
          <Route path="applications/:appId" element={<AppUsersPage />} />
          <Route path="access-matrix" element={<TenantAccessMatrixPage />} />
          <Route path="licenses" element={<TenantLicensesPage />} />
          <Route path="billing" element={<TenantBillingPage />} />
          <Route path="audit" element={<TenantAuditPage />} />
          <Route path="sso" element={<TenantSsoSettingsPage />} />
          <Route path="domains" element={<TenantDomainsPage />} />
          <Route path="general" element={<TenantGeneralPage />} />
        </Route>

        {/* Catch-all for unknown routes */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
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
