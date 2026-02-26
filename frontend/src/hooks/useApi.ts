import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tenancyApi, billingApi, accessControlApi, domainApi } from '@/lib/api';
// import type { Domain } from '@/types';

// =============================================================================
// Tenancy Hooks
// =============================================================================

export function useMyTenants() {
  return useQuery({
    queryKey: ['my-tenants'],
    queryFn: tenancyApi.getMyTenants,
  });
}

export function useTenant(tenantId: string | null) {
  return useQuery({
    queryKey: ['tenant', tenantId],
    queryFn: () => tenancyApi.getTenant(tenantId!),
    enabled: !!tenantId,
  });
}

export function useInviteUser(tenantId: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (userId: string) => tenancyApi.inviteUser(tenantId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant', tenantId] });
    },
  });
}

// =============================================================================
// Billing Hooks
// =============================================================================

export function useSubscriptions() {
  return useQuery({
    queryKey: ['subscriptions'],
    queryFn: () => billingApi.getSubscriptions(),
  });
}

export function useTenantSubscription(tenantId: string | null) {
  return useQuery({
    queryKey: ['tenant-subscription', tenantId],
    queryFn: () => billingApi.getTenantSubscription(tenantId!),
    enabled: !!tenantId,
  });
}

// =============================================================================
// Access Control Hooks
// =============================================================================

export function useAllRoles() {
  return useQuery({
    queryKey: ['all-roles'],
    queryFn: accessControlApi.getAllRoles,
  });
}

export function useUserRoles(tenantId: string | null) {
  return useQuery({
    queryKey: ['user-roles', tenantId],
    queryFn: () => accessControlApi.getUserRoles(tenantId!),
    enabled: !!tenantId,
  });
}

export function useAssignRole(tenantId: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ membershipId, roleId }: { membershipId: string; roleId: string }) =>
      accessControlApi.assignRole(membershipId, roleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-roles', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['tenant', tenantId] });
    },
  });
}

export function useRemoveRole(tenantId: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ membershipId, roleId }: { membershipId: string; roleId: string }) =>
      accessControlApi.removeRole(membershipId, roleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-roles', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['tenant', tenantId] });
    },
  });
}

// =============================================================================
// Domain Hooks
// =============================================================================

export function useTenantDomains(tenantId: string | null) {
  return useQuery({
    queryKey: ['domains', tenantId],
    queryFn: () => domainApi.getTenantDomains(tenantId!),
    enabled: !!tenantId,
  });
}

export function useRegisterDomain(tenantId: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (domainName: string) => domainApi.registerDomain(tenantId, domainName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domains', tenantId] });
    },
  });
}

export function useVerifyDomain(tenantId: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (domainId: string) => domainApi.verifyDomain(domainId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domains', tenantId] });
    },
  });
}

export function useDeleteDomain(tenantId: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (domainId: string) => domainApi.deleteDomain(domainId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domains', tenantId] });
    },
  });
}
