// =============================================================================
// CredentialsTab shared primitives
// =============================================================================
// Small pieces shared across the CredentialsTab orchestrator, its card and the
// tenant-grants manager. Kept in one place to avoid duplication (DRY).

import { useToast } from '@/components/ui/Toast';

export type TenantOption = { id: string; name: string; slug: string };

// Copy-to-clipboard helper that surfaces a success toast. No-op on empty value.
export function useCopy() {
  const { toast } = useToast();
  return (label: string, value?: string) => {
    if (!value) return;
    navigator.clipboard.writeText(value);
    toast({ variant: 'success', title: 'Copied', message: `${label} copied to clipboard` });
  };
}
