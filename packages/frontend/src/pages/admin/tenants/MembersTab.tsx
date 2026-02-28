import * as React from 'react';
import {
  Mail,
  User as UserIcon,
  Shield,
  X,
  MoreHorizontal,
  Crown,
} from 'lucide-react';
import { superAdminApi, accessControlApi } from '@/lib/api';
import { Table, type Column } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { InviteUserModal } from './InviteUserModal';

// =============================================================================
// TYPES
// =============================================================================

interface Member {
  id: string; // This IS the membership ID
  status: 'ACTIVE' | 'SUSPENDED' | 'INVITED';
  joinedAt: string | null;
  createdAt: string;
  user: {
    id: string;
    email: string;
    givenName?: string;
    familyName?: string;
    profile?: Record<string, any>;
  };
  rolesByApplication: Array<{
    appId: string;
    appName: string;
    roles: Array<{
      id: string;
      name: string;
      slug: string;
    }>;
  }>;
  totalRoles: number;
  // Tenant roles
  tenantRoles: Array<{
    id: string;
    name: string;
    slug: string;
    description?: string;
    isSystem: boolean;
  }>;
}

interface TenantRole {
  id: string;
  name: string;
  slug: string;
  description?: string;
  permissions: string[];
  isSystem: boolean;
}

interface MembersTabProps {
  tenantId: string;
  onRefresh: () => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function MembersTab({ tenantId, onRefresh: _onRefresh }: MembersTabProps) {
  const { toast } = useToast();

  const [members, setMembers] = React.useState<Member[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [_availableRoles, _setAvailableRoles] = 
    React.useState<Array<{ id: string; name: string }>>([]);

  // Tenant roles state
  const [tenantRoles, setTenantRoles] = React.useState<TenantRole[]>([]);
  const [isLoadingTenantRoles, setIsLoadingTenantRoles] = React.useState(false);
  const [isTenantRolesModalOpen, setIsTenantRolesModalOpen] = React.useState(false);
  const [selectedMember, setSelectedMember] = React.useState<Member | null>(null);

  // Modal states
  const [isInviteModalOpen, setIsInviteModalOpen] = React.useState(false);
  const [isRemoveModalOpen, setIsRemoveModalOpen] = React.useState(false);
  const [memberToRemove, setMemberToRemove] = React.useState<Member | null>(null);
  
  // Fetch members (tenant roles are now included in the response)
  const loadMembers = React.useCallback(async () => {
    try {
      setIsLoading(true);
      const tenantDetail = await superAdminApi.getTenantDetail(tenantId);
      setMembers(tenantDetail.members || []);
      _setAvailableRoles(tenantDetail.availableRoles || []);
    } catch (err: any) {
      const errorMessage =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to load members';
      toast({
        variant: 'error',
        title: 'Error',
        message: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, toast]);

  // Fetch available tenant roles
  const loadTenantRoles = React.useCallback(async () => {
    try {
      setIsLoadingTenantRoles(true);
      const roles = await accessControlApi.getTenantRoles();
      setTenantRoles(roles);
    } catch (err: any) {
      const errorMessage =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to load tenant roles';
      toast({
        variant: 'error',
        title: 'Error',
        message: errorMessage,
      });
    } finally {
      setIsLoadingTenantRoles(false);
    }
  }, [toast]);

  React.useEffect(() => {
    loadMembers();
    loadTenantRoles();
  }, [loadMembers, loadTenantRoles]);

  // Handle invite success
  const handleInviteSuccess = () => {
    setIsInviteModalOpen(false);
    loadMembers();
    toast({
      variant: 'success',
      title: 'Success',
      message: 'User invited successfully',
    });
  };

  // Handle open tenant roles modal
  const handleOpenTenantRolesModal = (member: Member) => {
    setSelectedMember(member);
    setIsTenantRolesModalOpen(true);
  };

  // Handle assign tenant role (silent - no toast)
  const handleAssignTenantRole = async (
    member: Member,
    roleSlug: string,
  ) => {
    try {
      await accessControlApi.assignTenantRole(member.id, roleSlug);
      // Refresh tenant roles for this member
      const roles = await accessControlApi.getMembershipTenantRoles(member.id);
      setMembers((prev) =>
        prev.map((m) =>
          m.id === member.id ? { ...m, tenantRoles: roles } : m,
        ),
      );
      toast({
        variant: 'success',
        title: 'Success',
        message: `Role changed to ${roleSlug}`,
      });
    } catch (err: any) {
      const errorMessage =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to assign tenant role';
      toast({
        variant: 'error',
        title: 'Error',
        message: errorMessage,
      });
      throw err; // Re-throw so the button knows it failed
    }
  };



  // Handle remove member
  const handleRemoveMember = async () => {
    if (!memberToRemove) return;

    try {
      await superAdminApi.removeTenantMember(tenantId, memberToRemove.id);
      setIsRemoveModalOpen(false);
      setMemberToRemove(null);
      loadMembers();
      toast({
        variant: 'success',
        title: 'Success',
        message: 'Member removed successfully',
      });
    } catch (err: any) {
      const errorMessage =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to remove member';
      toast({
        variant: 'error',
        title: 'Error',
        message: errorMessage,
      });
    }
  };

  // Handle update member status
  const handleUpdateStatus = async (member: Member, status: 'ACTIVE' | 'SUSPENDED') => {
    try {
      await superAdminApi.updateMembershipStatus(member.id, status);
      loadMembers();
      toast({
        variant: 'success',
        title: 'Success',
        message: `Member ${status.toLowerCase()} successfully`,
      });
    } catch (err: any) {
      const errorMessage =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to update status';
      toast({
        variant: 'error',
        title: 'Error',
        message: errorMessage,
      });
    }
  };

  // Get user display name
  const getUserName = (member: Member) => {
    const user = member.user;
    // Check direct fields first, then profile
    const givenName = user.givenName || (user.profile as any)?.givenName;
    const familyName = user.familyName || (user.profile as any)?.familyName;

    if (givenName && familyName) {
      return `${givenName} ${familyName}`;
    }
    if (givenName) return givenName;
    return user.email;
  };

  // Loading state
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return <Badge className="bg-green-500/20 text-green-50 border-green-500/50">Active</Badge>;
      case 'SUSPENDED':
        return <Badge className="bg-red-500/20 text-red-50 border-red-500/50">Suspended</Badge>;
      case 'INVITED':
        return <Badge className="bg-yellow-500/20 text-yellow-50 border-yellow-500/50">Invited</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  // Format date
  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Not joined yet';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateString;
    }
  };

  // Table columns
  const columns: Column<Member>[] = [
    {
      header: 'Member',
      accessor: 'user',
      cell: (_, row) => (
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20">
            <UserIcon className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="font-medium text-foreground">{getUserName(row)}</p>
            <p className="text-sm text-muted-foreground">{row.user.email}</p>
          </div>
          {row.tenantRoles?.some((r) => r.slug === 'owner') && (
            <Crown className="h-4 w-4 text-yellow-400" />
          )}
        </div>
      ),
    },
    {
      header: 'Tenant Roles',
      accessor: 'tenantRoles',
      cell: (_, row) => {
        const hasOwner = row.tenantRoles?.some((r) => r.slug === 'owner');
        const hasAdmin = row.tenantRoles?.some((r) => r.slug === 'admin');
        const hasMember = row.tenantRoles?.some((r) => r.slug === 'member');

        return (
          <div className="flex flex-wrap gap-1">
            {hasOwner && (
              <Badge
                className="bg-yellow-500/20 text-yellow-50 border-yellow-500/50 cursor-pointer hover:bg-yellow-500/30"
                title="Owner has full control"
              >
                Owner
              </Badge>
            )}
            {hasAdmin && (
              <Badge
                className="bg-blue-500/20 text-blue-50 border-blue-500/50 cursor-pointer hover:bg-blue-500/30"
                title="Admin can manage members and settings"
              >
                Admin
              </Badge>
            )}
            {hasMember && (
              <Badge
                className="bg-gray-500/20 text-gray-50 border-gray-500/50 cursor-pointer hover:bg-gray-500/30"
                title="Member has view access"
              >
                Member
              </Badge>
            )}
            {row.tenantRoles?.filter(
              (r) => !['owner', 'admin', 'member'].includes(r.slug)
            ).map((role) => (
              <Badge
                key={role.id}
                variant="outline"
                className="cursor-pointer hover:bg-white/10"
                title={role.description || role.name}
              >
                {role.name}
              </Badge>
            ))}
          </div>
        );
      },
    },
    {
      header: 'App Roles',
      accessor: 'rolesByApplication',
      cell: (_, row) => (
        <div className="flex flex-wrap gap-1">
          {(row.rolesByApplication || []).flatMap((appRoles) =>
            appRoles.roles.map((role) => (
              <Badge key={role.id} variant="outline" className="text-xs" title={appRoles.appName}>
                {role.name}
              </Badge>
            ))
          )}
          {(!row.rolesByApplication || row.rolesByApplication.length === 0) && (
            <span className="text-sm text-muted-foreground">No roles</span>
          )}
        </div>
      ),
    },
    {
      header: 'Status',
      accessor: 'status',
      cell: (value) => getStatusBadge(value),
    },
    {
      header: 'Joined',
      accessor: 'joinedAt',
      cell: (value) => formatDate(value),
    },
    {
      header: 'Actions',
      accessor: 'id',
      cell: (_, row) => (
        <div className="flex items-center gap-2 justify-end">
          {/* Tenant Roles Management */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleOpenTenantRolesModal(row)}
            title="Manage tenant roles"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
          {!row.tenantRoles?.some((r) => r.slug === 'owner') && row.status === 'ACTIVE' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleUpdateStatus(row, 'SUSPENDED')}
              title="Suspend member"
            >
              <Shield className="h-4 w-4" />
            </Button>
          )}
          {!row.tenantRoles?.some((r) => r.slug === 'owner') && row.status === 'SUSPENDED' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleUpdateStatus(row, 'ACTIVE')}
              title="Activate member"
            >
              <Shield className="h-4 w-4 text-green-400" />
            </Button>
          )}
          {!row.tenantRoles?.some((r) => r.slug === 'owner') && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setMemberToRemove(row);
                setIsRemoveModalOpen(true);
              }}
              title="Remove member"
            >
              <X className="h-4 w-4 text-destructive" />
            </Button>
          )}
        </div>
      ),
      className: 'text-right',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Members</h2>
          <p className="text-sm text-muted-foreground">
            Manage who has access to this tenant
          </p>
        </div>
        <Button
          onClick={() => setIsInviteModalOpen(true)}
          className="gap-2"
        >
          <Mail className="h-4 w-4" />
          Invite User
        </Button>
      </div>

      {/* Members Table */}
      <div className="rounded-lg border border-white/10 bg-card">
        <Table
          data={members}
          columns={columns}
          isLoading={isLoading}
          emptyMessage="No members found"
        />
      </div>

      {/* Invite User Modal */}
      <InviteUserModal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        onSuccess={handleInviteSuccess}
        tenantId={tenantId}
      />

      {/* Tenant Roles Management Modal */}
      {selectedMember && (
        <Modal
          isOpen={isTenantRolesModalOpen}
          onClose={() => {
            setIsTenantRolesModalOpen(false);
            setSelectedMember(null);
          }}
          title="Set Tenant Role"
          size="md"
        >
          <div className="space-y-4">
            {/* Member Info */}
            <div className="rounded-md border border-white/10 bg-white/5 p-4">
              <p className="font-medium text-foreground">
                {getUserName(selectedMember)}
              </p>
              <p className="text-sm text-muted-foreground">
                {selectedMember.user.email}
              </p>
            </div>

            {/* Current Role */}
            <div className="text-sm text-muted-foreground">
              Current role:{' '}
              <span className="font-medium text-foreground">
                {selectedMember.tenantRoles?.[0]?.name || 'None'}
              </span>
            </div>

            {/* Role Selection */}
            <div className="space-y-2">
              {isLoadingTenantRoles ? (
                <div className="text-center py-4 text-muted-foreground">
                  Loading roles...
                </div>
              ) : (
                tenantRoles.map((role) => {
                  const isSelected = selectedMember.tenantRoles?.some(
                    (r) => r.slug === role.slug,
                  );

                  // Color coding for each role
                  const roleColors = {
                    owner:
                      'border-yellow-500/50 bg-yellow-500/10 hover:bg-yellow-500/20',
                    admin:
                      'border-blue-500/50 bg-blue-500/10 hover:bg-blue-500/20',
                    member:
                      'border-gray-500/50 bg-gray-500/10 hover:bg-gray-500/20',
                  };
                  const selectedColors = {
                    owner:
                      'border-yellow-500 bg-yellow-500/30 ring-2 ring-yellow-500/50',
                    admin:
                      'border-blue-500 bg-blue-500/30 ring-2 ring-blue-500/50',
                    member:
                      'border-gray-500 bg-gray-500/30 ring-2 ring-gray-500/50',
                  };

                  const colorClass = isSelected
                    ?
                      selectedColors[
                        role.slug as keyof typeof selectedColors
                      ] || selectedColors.member
                    : roleColors[role.slug as keyof typeof roleColors] ||
                      roleColors.member;

                  return (
                    <button
                      key={role.id}
                      onClick={async () => {
                        if (isSelected) return; // Already this role

                        try {
                          // Remove current roles first
                          for (const currentRole of
                            selectedMember.tenantRoles || []) {
                            await accessControlApi.removeTenantRole(
                              selectedMember.id,
                              currentRole.slug,
                            );
                          }

                          // Assign new role
                          await handleAssignTenantRole(
                            selectedMember,
                            role.slug,
                          );

                          // Refresh the selected member's tenant roles
                          const updatedRoles =
                            await accessControlApi.getMembershipTenantRoles(
                              selectedMember.id,
                            );
                          setSelectedMember({
                            ...selectedMember,
                            tenantRoles: updatedRoles,
                          });
                        } catch (err: any) {
                          // Show error toast for any failures
                          const errorMessage =
                            err?.response?.data?.message ||
                            err?.message ||
                            'Failed to change tenant role';
                          toast({
                            variant: 'error',
                            title: 'Error',
                            message: errorMessage,
                          });
                        }
                      }}
                      disabled={isSelected}
                      className={`w-full text-left rounded-lg border p-4 transition-all ${colorClass} ${
                        isSelected ? 'cursor-default' : 'cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-foreground flex items-center gap-2">
                            {role.name}
                            {isSelected && (
                              <span className="text-xs bg-white/20 px-2 py-0.5 rounded">
                                Current
                              </span>
                            )}
                          </p>
                          <p className="text-sm text-muted-foreground mt-1">
                            {role.description}
                          </p>
                        </div>
                        {role.slug === 'owner' && (
                          <Crown className="h-5 w-5 text-yellow-400" />
                        )}
                        {role.slug === 'admin' && (
                          <Shield className="h-5 w-5 text-blue-400" />
                        )}
                        {role.slug === 'member' && (
                          <UserIcon className="h-5 w-5 text-gray-400" />
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            <div className="flex justify-end pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setIsTenantRolesModalOpen(false);
                  setSelectedMember(null);
                  loadMembers(); // Refresh to get updated roles
                }}
              >
                Done
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Remove Member Confirmation Modal */}
      <Modal
        isOpen={isRemoveModalOpen}
        onClose={() => {
          setIsRemoveModalOpen(false);
          setMemberToRemove(null);
        }}
        title="Remove Member"
        size="sm"
        footer={
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setIsRemoveModalOpen(false);
                setMemberToRemove(null);
              }}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRemoveMember}>
              Remove Member
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-muted-foreground">
            Are you sure you want to remove this member from the tenant?
          </p>
          {memberToRemove && (
            <div className="rounded-md border border-white/10 bg-white/5 p-4">
              <p className="font-medium text-foreground">{getUserName(memberToRemove)}</p>
              <p className="text-sm text-muted-foreground">{memberToRemove.user.email}</p>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}