/**
 * Shared styles for components
 */

import type { CSSProperties } from 'react';
import type { AppearanceProps } from '../types';

export function getStyles(appearance: AppearanceProps = {}): Record<string, CSSProperties> {
  const theme = appearance.theme || 'light';
  const vars = appearance.variables || {};
  const elements = appearance.elements || {};

  const isDark = theme === 'dark';

  const colors = {
    primary: vars.colorPrimary || '#7c3aed',
    background: vars.colorBackground || (isDark ? '#1e1e2e' : '#ffffff'),
    text: vars.colorText || (isDark ? '#ffffff' : '#1a1a1a'),
    textSecondary: vars.colorTextSecondary || (isDark ? '#a1a1aa' : '#6b7280'),
    danger: vars.colorDanger || '#dc2626',
    success: vars.colorSuccess || '#16a34a',
    border: isDark ? 'rgba(255,255,255,0.1)' : '#e5e7eb',
    inputBg: isDark ? 'rgba(255,255,255,0.05)' : '#ffffff',
  };

  const borderRadius = vars.borderRadius || '0.5rem';
  const fontFamily = vars.fontFamily || 'system-ui, -apple-system, sans-serif';

  return {
    card: {
      maxWidth: '400px',
      width: '100%',
      padding: '2rem',
      backgroundColor: colors.background,
      borderRadius: '1rem',
      boxShadow: isDark
        ? '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
        : '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
      fontFamily,
      ...elements.card,
    },
    header: {
      textAlign: 'center',
      marginBottom: '1.5rem',
      ...elements.header,
    },
    title: {
      fontSize: '1.5rem',
      fontWeight: 600,
      color: colors.text,
      margin: '0 0 0.25rem 0',
    },
    subtitle: {
      fontSize: '0.875rem',
      color: colors.textSecondary,
      margin: 0,
    },
    form: {
      display: 'flex',
      flexDirection: 'column',
      gap: '1rem',
      ...elements.form,
    },
    inputGroup: {
      display: 'flex',
      flexDirection: 'column',
      gap: '0.375rem',
    },
    label: {
      fontSize: '0.875rem',
      fontWeight: 500,
      color: colors.text,
    },
    input: {
      padding: '0.75rem',
      border: `1px solid ${colors.border}`,
      borderRadius,
      fontSize: '1rem',
      backgroundColor: colors.inputBg,
      color: colors.text,
      outline: 'none',
      transition: 'border-color 0.2s, box-shadow 0.2s',
      ...elements.input,
    },
    primaryButton: {
      padding: '0.75rem 1.5rem',
      backgroundColor: colors.primary,
      color: '#ffffff',
      border: 'none',
      borderRadius,
      fontSize: '1rem',
      fontWeight: 500,
      cursor: 'pointer',
      transition: 'opacity 0.2s',
      ...elements.primaryButton,
    },
    buttonDisabled: {
      opacity: 0.6,
      cursor: 'not-allowed',
    },
    secondaryButton: {
      padding: '0.75rem 1.5rem',
      backgroundColor: 'transparent',
      color: colors.text,
      border: `1px solid ${colors.border}`,
      borderRadius,
      fontSize: '1rem',
      fontWeight: 500,
      cursor: 'pointer',
      transition: 'background-color 0.2s',
      ...elements.secondaryButton,
    },
    socialButtons: {
      display: 'flex',
      flexDirection: 'column',
      gap: '0.75rem',
      marginBottom: '1rem',
    },
    socialButton: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0.75rem',
      border: `1px solid ${colors.border}`,
      borderRadius,
      backgroundColor: 'transparent',
      color: colors.text,
      fontSize: '0.875rem',
      fontWeight: 500,
      cursor: 'pointer',
      transition: 'background-color 0.2s',
      ...elements.socialButton,
    },
    divider: {
      display: 'flex',
      alignItems: 'center',
      gap: '1rem',
      color: colors.textSecondary,
      fontSize: '0.75rem',
      margin: '0.5rem 0',
    },
    link: {
      color: colors.primary,
      textDecoration: 'none',
      cursor: 'pointer',
      fontWeight: 500,
      ...elements.link,
    },
    forgotPassword: {
      textAlign: 'right',
      marginTop: '-0.5rem',
    },
    footer: {
      textAlign: 'center',
      marginTop: '1.5rem',
      fontSize: '0.875rem',
      color: colors.textSecondary,
      ...elements.footer,
    },
    error: {
      padding: '0.75rem',
      backgroundColor: isDark ? 'rgba(220, 38, 38, 0.1)' : '#fef2f2',
      border: `1px solid ${isDark ? 'rgba(220, 38, 38, 0.2)' : '#fecaca'}`,
      borderRadius,
      color: colors.danger,
      fontSize: '0.875rem',
      marginBottom: '1rem',
      ...elements.error,
    },
    success: {
      padding: '0.75rem',
      backgroundColor: isDark ? 'rgba(22, 163, 74, 0.1)' : '#f0fdf4',
      border: `1px solid ${isDark ? 'rgba(22, 163, 74, 0.2)' : '#bbf7d0'}`,
      borderRadius,
      color: colors.success,
      fontSize: '0.875rem',
      marginBottom: '1rem',
    },
    userButton: {
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      padding: '0.5rem',
      border: 'none',
      borderRadius,
      backgroundColor: 'transparent',
      cursor: 'pointer',
      transition: 'background-color 0.2s',
    },
    avatar: {
      width: '32px',
      height: '32px',
      borderRadius: '50%',
      backgroundColor: colors.primary,
      color: '#ffffff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '0.875rem',
      fontWeight: 500,
    },
    dropdown: {
      position: 'absolute',
      top: '100%',
      right: 0,
      marginTop: '0.5rem',
      minWidth: '200px',
      backgroundColor: colors.background,
      border: `1px solid ${colors.border}`,
      borderRadius,
      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
      overflow: 'hidden',
      zIndex: 50,
    },
    dropdownItem: {
      display: 'block',
      width: '100%',
      padding: '0.75rem 1rem',
      textAlign: 'left',
      border: 'none',
      backgroundColor: 'transparent',
      color: colors.text,
      fontSize: '0.875rem',
      cursor: 'pointer',
      transition: 'background-color 0.2s',
    },
  } as Record<string, CSSProperties>;
}
