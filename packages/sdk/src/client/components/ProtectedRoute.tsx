/**
 * ProtectedRoute - Redirects to login if not authenticated
 */

import React, { useEffect } from 'react';
import { useAuth } from '../provider';
import type { ProtectedRouteProps } from '../types';

export function ProtectedRoute({
  children,
  redirectTo = '/login',
  showLoading = true,
  loadingComponent,
}: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      window.location.href = redirectTo;
    }
  }, [isLoading, isAuthenticated, redirectTo]);

  if (isLoading) {
    if (loadingComponent) {
      return <>{loadingComponent}</>;
    }
    if (showLoading) {
      return (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '200px',
        }}>
          <LoadingSpinner />
        </div>
      );
    }
    return null;
  }

  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}

function LoadingSpinner() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      style={{ animation: 'spin 1s linear infinite' }}
    >
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="60 40"
        opacity="0.25"
      />
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="#7c3aed"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="60 40"
      />
    </svg>
  );
}
