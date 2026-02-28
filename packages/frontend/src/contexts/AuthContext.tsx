import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authApi } from '@/lib/api';

interface User {
  id: string;
  email: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check auth status on mount (via httpOnly cookie)
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
    // Server sets httpOnly cookie on successful login
    const response = await authApi.login(email, password);
    
    // Set user from response
    if (response.user) {
      setUser({ id: response.user.id, email: response.user.email });
    }
  };

  const register = async (email: string, password: string) => {
    // Server sets httpOnly cookie on successful registration
    const response = await authApi.register(email, password);
    
    // Set user from response
    if (response.user) {
      setUser({ id: response.user.id, email: response.user.email });
    }
  };

  const logout = () => {
    setUser(null);
    // Note: httpOnly cookie is cleared by calling logout endpoint
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        register,
        logout,
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
