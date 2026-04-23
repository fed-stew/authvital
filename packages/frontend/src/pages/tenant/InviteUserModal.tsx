import { useState, useEffect, useCallback } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import { tenantApi } from '@/lib/api';

interface TenantRole {
  id: string;
  name: string;
  slug: string;
  description?: string;
}

interface InviteUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  tenantId: string;
}

/**
 * InviteUserModal - Modal to invite a new user to the tenant
 */
export function InviteUserModal({
  isOpen,
  onClose,
  onSuccess,
  tenantId,
}: InviteUserModalProps) {
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [givenName, setGivenName] = useState('');
  const [familyName, setFamilyName] = useState('');
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [tenantRoles, setTenantRoles] = useState<TenantRole[]>([]);
  const [isLoadingRoles, setIsLoadingRoles] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const loadTenantRoles = useCallback(async () => {
    try {
      setIsLoadingRoles(true);
      const roles = await tenantApi.getTenantRoles();
      setTenantRoles(roles);

      // Set default to 'member' role if available
      const memberRole = roles.find(
        (r: TenantRole) => r.slug === 'member'
      );
      if (memberRole) {
        setSelectedRoleId(memberRole.id);
      } else if (roles.length > 0) {
        setSelectedRoleId(roles[0].id);
      }
    } catch (err: any) {
      toast({
        variant: 'error',
        title: 'Error',
        message: err?.message || 'Failed to load roles',
      });
    } finally {
      setIsLoadingRoles(false);
    }
  }, [toast]);

  // Load tenant roles when modal opens
  useEffect(() => {
    if (isOpen) {
      loadTenantRoles();
    }
  }, [isOpen, loadTenantRoles]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email) {
      toast({
        variant: 'error',
        title: 'Error',
        message: 'Email is required',
      });
      return;
    }

    if (!selectedRoleId) {
      toast({
        variant: 'error',
        title: 'Error',
        message: 'Please select a role',
      });
      return;
    }

    try {
      setIsSubmitting(true);
      await tenantApi.inviteUser(tenantId, email, selectedRoleId, {
        givenName: givenName.trim() || undefined,
        familyName: familyName.trim() || undefined,
      });

      toast({
        variant: 'success',
        title: 'Invitation Sent',
        message: `An invitation has been sent to ${email}`,
      });

      // Reset form
      setEmail('');
      setGivenName('');
      setFamilyName('');
      onSuccess();
    } catch (err: any) {
      toast({
        variant: 'error',
        title: 'Error',
        message:
          err?.response?.data?.message ||
          err?.message ||
          'Failed to send invitation',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setEmail('');
    setGivenName('');
    setFamilyName('');
    onClose();
  };

  // Get role description for display
  const getRoleDescription = (slug: string) => {
    switch (slug) {
      case 'owner':
        return 'Full control over the organization';
      case 'admin':
        return 'Can manage members and settings';
      case 'member':
        return 'Standard organization member';
      default:
        return '';
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Invite User"
      size="md"
      footer={
        <div className="flex gap-2 justify-end">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || isLoadingRoles}
          >
            {isSubmitting ? 'Sending...' : 'Send Invitation'}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Email Field */}
        <div className="space-y-2">
          <label
            htmlFor="email"
            className="text-sm font-medium text-foreground"
          >
            Email Address <span className="text-destructive">*</span>
          </label>
          <Input
            id="email"
            type="email"
            placeholder="user@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isSubmitting}
            className="bg-card"
          />
        </div>

        {/* Given Name Field */}
        <div className="space-y-2">
          <label
            htmlFor="givenName"
            className="text-sm font-medium text-foreground"
          >
            First Name
          </label>
          <Input
            id="givenName"
            type="text"
            placeholder="John"
            value={givenName}
            onChange={(e) => setGivenName(e.target.value)}
            disabled={isSubmitting}
            className="bg-card"
          />
        </div>

        {/* Family Name Field */}
        <div className="space-y-2">
          <label
            htmlFor="familyName"
            className="text-sm font-medium text-foreground"
          >
            Last Name
          </label>
          <Input
            id="familyName"
            type="text"
            placeholder="Doe"
            value={familyName}
            onChange={(e) => setFamilyName(e.target.value)}
            disabled={isSubmitting}
            className="bg-card"
          />
        </div>

        {/* Role Selector */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            Organization Role <span className="text-destructive">*</span>
          </label>
          {isLoadingRoles ? (
            <div className="text-sm text-muted-foreground">Loading roles...</div>
          ) : (
            <Select value={selectedRoleId} onValueChange={setSelectedRoleId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                {tenantRoles.map((role) => (
                  <SelectItem key={role.id} value={role.id}>
                    {role.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {selectedRoleId && (
            <p className="text-xs text-muted-foreground">
              {getRoleDescription(
                tenantRoles.find((r) => r.id === selectedRoleId)?.slug || ''
              )}
            </p>
          )}
        </div>

        {/* Help Text */}
        <div className="rounded-md border border-white/10 bg-white/5 p-3">
          <p className="text-xs text-muted-foreground">
            The user will receive an email with instructions to join your
            organization. Application access can be granted separately after
            they join.
          </p>
        </div>
      </form>
    </Modal>
  );
}
