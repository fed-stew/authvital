import * as React from 'react';
import { superAdminApi } from '@/lib/api';

// =============================================================================
// TYPES
// =============================================================================

export interface SuperAdmin {
  id: string;
  email: string;
  emailVerified?: boolean;
  username?: string;
  displayName?: string;
  givenName?: string;
  familyName?: string;
  pictureUrl?: string;
  createdAt: string;
}

export interface AdminContextValue {
  admin: SuperAdmin | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  mustChangePassword: boolean;
  login: (email: string, password: string) => Promise<{
    mustChangePassword: boolean;
    mfaRequired?: boolean;
    mfaSetupRequired?: boolean;
    mfaChallengeToken?: string;
  }>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  clearMustChangePassword: () => void;
}

interface AdminProviderProps {
  children: React.ReactNode;
}

// =============================================================================
// CONTEXT
// =============================================================================

const AdminContext = React.createContext<AdminContextValue | undefined>(
  undefined
);

// =============================================================================
// PROVIDER
// =============================================================================

function AdminProvider({ children }: AdminProviderProps) {
  const [admin, setAdmin] = React.useState<SuperAdmin | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isAuthenticated, setIsAuthenticated] = React.useState(false);
  const [mustChangePassword, setMustChangePassword] = React.useState(false);

  // Check authentication on mount
  React.useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const profile = await superAdminApi.getProfile();
      setAdmin(profile);
      setIsAuthenticated(true);
    } catch (error) {
      // Not authenticated or session expired
      setAdmin(null);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    try {
      setIsLoading(true);
      const loginResponse = await superAdminApi.login(email, password);

      // Check if MFA is required
      if (loginResponse.mfaRequired || loginResponse.mfaSetupRequired) {
        // Don't set authenticated yet - need MFA verification first
        return {
          mustChangePassword: false,
          mfaRequired: loginResponse.mfaRequired,
          mfaSetupRequired: loginResponse.mfaSetupRequired,
          mfaChallengeToken: loginResponse.mfaChallengeToken,
        };
      }

      // Check if password change is required
      if (loginResponse.mustChangePassword) {
        setAdmin(loginResponse.admin);
        setIsAuthenticated(true);
        setMustChangePassword(true);
        return { mustChangePassword: true };
      }

      // Get profile data
      const profile = await superAdminApi.getProfile();
      setAdmin(profile);
      setIsAuthenticated(true);
      setMustChangePassword(false);
      return { mustChangePassword: false };
    } catch (error) {
      setAdmin(null);
      setIsAuthenticated(false);
      setMustChangePassword(false);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    try {
      setIsLoading(true);
      await superAdminApi.changePassword(currentPassword, newPassword);
      setMustChangePassword(false);
      
      // Refresh profile
      const profile = await superAdminApi.getProfile();
      setAdmin(profile);
    } finally {
      setIsLoading(false);
    }
  };

  const clearMustChangePassword = () => {
    setMustChangePassword(false);
  };

  const logout = async () => {
    try {
      await superAdminApi.logout();
    } catch (error) {
      // Continue with logout even if API call fails
      console.error('Logout API call failed:', error);
    } finally {
      setAdmin(null);
      setIsAuthenticated(false);
      // Redirect to login page
      window.location.href = '/admin/login';
    }
  };

  const refresh = async () => {
    await checkAuth();
  };

  const value: AdminContextValue = {
    admin,
    isLoading,
    isAuthenticated,
    mustChangePassword,
    login,
    logout,
    refresh,
    changePassword,
    clearMustChangePassword,
  };

  return (
    <AdminContext.Provider value={value}>
      {children}
    </AdminContext.Provider>
  );
}

// =============================================================================
// HOOK
// =============================================================================

function useAdmin(): AdminContextValue {
  const context = React.useContext(AdminContext);
  if (context === undefined) {
    throw new Error('useAdmin must be used within an AdminProvider');
  }
  return context;
}

export { AdminProvider, useAdmin };
