import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/Select';
import { User as UserIcon, Trash2, Clock, RefreshCw } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { useState, useEffect } from 'react';
import { tenantApi } from '@/lib/api';

interface TenantRole {
  id: string;
  name: string;
  slug: string;
}

interface Member {
  id: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'INVITED';
  joinedAt: string | null;
  user: {
    id: string | null;
    email: string;
    givenName?: string | null;
    familyName?: string | null;
  };
  tenantRoles: TenantRole[];
  appAccess: Array<{
    appId: string;
    appName: string;
    roleName: string;
  }>;
  // Invitation details for INVITED members
  invitation?: {
    id: string;
    expiresAt: string;
    invitedBy?: {
      id: string;
      email: string;
      givenName?: string;
      familyName?: string;
    };
  };
}

interface MemberDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpdate: () => void;
  member: Member;
  tenantId: string;
}

export function MemberDetailModal({
  isOpen,
  onClose,
  onUpdate,
  member,
  tenantId,
}: MemberDetailModalProps) {
  const { toast } = useToast();
  const [isRemoving, setIsRemoving] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [isChangingRole, setIsChangingRole] = useState(false);
  const [availableRoles, setAvailableRoles] = useState<TenantRole[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string>('');

  // Load available roles
  useEffect(() => {
    if (isOpen) {
      tenantApi.getTenantRoles().then(setAvailableRoles).catch(console.error);
      // Set initial selected role from tenantRoles (works for both INVITED and ACTIVE)
      if (member.tenantRoles.length > 0) {
        setSelectedRoleId(member.tenantRoles[0].id);
      }
    }
  }, [isOpen, member]);

  const getUserName = () => {
    const { givenName, familyName, email } = member.user;
    if (givenName && familyName) return `${givenName} ${familyName}`;
    if (givenName) return givenName;
    return email;
  };

  const getRoleBadgeClass = (slug: string) => {
    if (slug === 'owner') return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
    if (slug === 'admin') return 'bg-blue-500/20 text-blue-400 border-blue-500/50';
    return 'bg-gray-500/20 text-gray-300 border-gray-500/50';
  };

  const handleRemoveMember = async () => {
    try {
      setIsRemoving(true);
      
      if (member.status === 'INVITED' && member.invitation?.id) {
        // Revoke invitation (this also deletes the INVITED membership)
        await tenantApi.revokeInvitation(member.invitation.id);
        toast({
          variant: 'success',
          title: 'Invitation Revoked',
          message: `Invitation to ${member.user.email} has been revoked`,
        });
      } else {
        // Remove actual member
        await tenantApi.removeMember(tenantId, member.id);
        toast({
          variant: 'success',
          title: 'Member Removed',
          message: `${getUserName()} has been removed from the organization`,
        });
      }

      onUpdate();
      onClose();
    } catch (err: any) {
      toast({
        variant: 'error',
        title: 'Error',
        message: err?.response?.data?.message || err?.message || 'Failed to remove member',
      });
    } finally {
      setIsRemoving(false);
    }
  };

  const handleResendInvitation = async () => {
    if (!member.invitation?.id) return;
    
    try {
      setIsResending(true);
      await tenantApi.resendInvitation(member.invitation.id);
      toast({
        variant: 'success',
        title: 'Invitation Resent',
        message: `A new invitation email has been sent to ${member.user.email}`,
      });
    } catch (err: any) {
      toast({
        variant: 'error',
        title: 'Error',
        message: err?.response?.data?.message || err?.message || 'Failed to resend invitation',
      });
    } finally {
      setIsResending(false);
    }
  };

  const handleRoleChange = async (newRoleId: string) => {
    if (!newRoleId || newRoleId === selectedRoleId) return;
    
    try {
      setIsChangingRole(true);
      
      if (member.status === 'INVITED' && member.invitation?.id) {
        // Update invitation role (which updates the membership's role)
        await tenantApi.updateInvitationRole(member.invitation.id, newRoleId);
      } else {
        // Update member's tenant role
        const newRole = availableRoles.find(r => r.id === newRoleId);
        if (newRole) {
          await tenantApi.changeMemberRole(tenantId, member.id, newRole.slug);
        }
      }
      
      setSelectedRoleId(newRoleId);
      toast({
        variant: 'success',
        title: 'Role Updated',
        message: 'The role has been updated successfully',
      });
      onUpdate();
    } catch (err: any) {
      toast({
        variant: 'error',
        title: 'Error',
        message: err?.response?.data?.message || err?.message || 'Failed to update role',
      });
    } finally {
      setIsChangingRole(false);
    }
  };

  const isOwner = member.tenantRoles.some((r) => r.slug === 'owner');
  const isInvited = member.status === 'INVITED';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isInvited ? 'Pending Invitation' : 'Member Details'}
      size="md"
      footer={
        <div className="flex gap-2 justify-between">
          <div className="flex gap-2">
            {!isOwner && (
              <Button
                variant="destructive"
                onClick={handleRemoveMember}
                disabled={isRemoving}
                className="gap-2"
              >
                <Trash2 className="h-4 w-4" />
                {isRemoving 
                  ? (isInvited ? 'Revoking...' : 'Removing...') 
                  : (isInvited ? 'Revoke Invitation' : 'Remove Member')}
              </Button>
            )}
            {isInvited && (
              <Button
                variant="outline"
                onClick={handleResendInvitation}
                disabled={isResending}
                className="gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${isResending ? 'animate-spin' : ''}`} />
                {isResending ? 'Sending...' : 'Resend'}
              </Button>
            )}
          </div>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* User Info */}
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/20">
            <UserIcon className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">
              {getUserName()}
            </h3>
            <p className="text-sm text-muted-foreground">{member.user.email}</p>
          </div>
        </div>

        {/* Status */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">Status</h4>
          <Badge
            className={
              member.status === 'ACTIVE'
                ? 'bg-green-500/20 text-green-400 border-green-500/50'
                : member.status === 'SUSPENDED'
                  ? 'bg-red-500/20 text-red-400 border-red-500/50'
                  : 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50'
            }
          >
            {member.status}
          </Badge>
        </div>

        {/* Invitation Details (for pending invites) */}
        {isInvited && member.invitation && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">
              Invitation Details
            </h4>
            <div className="rounded-md border border-white/10 bg-white/5 p-3 space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>
                  Expires {new Date(member.invitation.expiresAt).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
              </div>
              {member.invitation.invitedBy && (
                <p className="text-sm text-muted-foreground">
                  Invited by {member.invitation.invitedBy.givenName || member.invitation.invitedBy.email}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Role Selection */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">
            Organization Role
          </h4>
          {isOwner ? (
            // Owners can't have their role changed
            <div className="flex flex-wrap gap-2">
              {member.tenantRoles.map((role) => (
                <Badge key={role.id} className={getRoleBadgeClass(role.slug)}>
                  {role.name}
                </Badge>
              ))}
            </div>
          ) : (
            // Allow role change for non-owners
            <Select 
              value={selectedRoleId} 
              onValueChange={handleRoleChange}
              disabled={isChangingRole}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                {availableRoles.map((role) => (
                  <SelectItem key={role.id} value={role.id}>
                    {role.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* App Access (only for active members) */}
        {!isInvited && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">
              Application Access
            </h4>
            {member.appAccess.length > 0 ? (
              <div className="space-y-2">
                {member.appAccess.map((app) => (
                  <div
                    key={app.appId}
                    className="flex items-center justify-between rounded-md border border-white/10 bg-white/5 px-3 py-2"
                  >
                    <span className="text-sm text-foreground">{app.appName}</span>
                    <Badge variant="outline" className="text-xs">
                      {app.roleName}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No application access assigned
              </p>
            )}
          </div>
        )}

        {/* Joined Date (only for active members) */}
        {member.joinedAt && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">
              Joined
            </h4>
            <p className="text-sm text-foreground">
              {new Date(member.joinedAt).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
