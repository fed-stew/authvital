import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authApi } from '@/lib/api';

// Module-level in-memory token storage (not accessible to XSS attacks)
let memoryToken: string | null = null;

export const setMemoryToken = (token: string | null) => {
  memoryToken = token;
};

export const getMemoryToken = () => memoryToken;

interface User {
  id: string;
  email: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  accessToken: string | null;
  setAccessToken: (token: string | null) => void;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAccessToken: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [accessToken, setAccessTokenState] = useState<string | null>(null);

  // Helper to update both memory and state
  const setAccessToken = (token: string | null) => {
    setMemoryToken(token);
    setAccessTokenState(token);
  };

  // Check auth status on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const profile = await authApi.getProfile();
        setUser({ id: profile.id, email: profile.email });
      } catch {
        // Not authenticated or session expired
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };
    checkAuth();
  }, []);

  const login = async (email: string, password: string) => {
    // Server sets httpOnly refresh cookie and returns access token
    const response = await authApi.login(email, password);
    
    // Store access token in memory
    if (response.access_token) {
      setAccessToken(response.access_token);
    }
    
    // Set user from response
    if (response.user) {
      setUser({ id: response.user.id, email: response.user.email });
    }
  };

  const register = async (email: string, password: string) => {
    // Server sets httpOnly refresh cookie and returns access token
    const response = await authApi.register(email, password);
    
    // Store access token in memory
    if (response.access_token) {
      setAccessToken(response.access_token);
    }
    
    // Set user from response
    if (response.user) {
      setUser({ id: response.user.id, email: response.user.email });
    }
  };

  const refreshAccessToken = async (): Promise<boolean> => {
    try {
      // Call refresh endpoint with credentials to send refresh cookie
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      });
      
      if (!response.ok) {
        setAccessToken(null);
        return false;
      }
      
      const data = await response.json();
      
      if (data.access_token) {
        setAccessToken(data.access_token);
        return true;
      }
      
      return false;
    } catch {
      setAccessToken(null);
      return false;
    }
  };

  const logout = async () => {
    // Clear memory token immediately
    setAccessToken(null);
    setUser(null);
    
    // Call logout endpoint to clear refresh cookie
    try {
      await authApi.logout();
    } catch {
      // Even if server logout fails, client is logged out
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        accessToken,
        setAccessToken,
        login,
        register,
        logout,
        refreshAccessToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
