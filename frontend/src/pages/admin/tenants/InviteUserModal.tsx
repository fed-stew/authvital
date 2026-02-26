import * as React from 'react';
import { Mail, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { superAdminApi } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import type { Application, LicenseType, MemberAccessResult } from '@/types';

// =============================================================================
// TYPES
// =============================================================================

export interface InviteUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  tenantId: string;
  availableApplications?: Application[]; // Optional: pre-loaded applications
}

// =============================================================================
// COMPONENT
// =============================================================================

export function InviteUserModal({
  isOpen,
  onClose,
  onSuccess,
  tenantId,
  availableApplications,
}: InviteUserModalProps) {
  const [email, setEmail] = React.useState('');
  const [selectedAppId, setSelectedAppId] = React.useState<string>('');
  const [selectedLicenseTypeId, setSelectedLicenseTypeId] = React.useState<string>('');
  const [selectedRole, setSelectedRole] = React.useState('member');
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isCheckingAccess, setIsCheckingAccess] = React.useState(false);
  const [memberAccess, setMemberAccess] = React.useState<MemberAccessResult | null>(null);
  const [applications, setApplications] = React.useState<Application[]>(availableApplications || []);
  const [licenseTypes, setLicenseTypes] = React.useState<LicenseType[]>([]);

  // Reset form when modal opens
  React.useEffect(() => {
    if (isOpen) {
      setEmail('');
      setSelectedAppId('');
      setSelectedLicenseTypeId('');
      setSelectedRole('member');
      setError(null);
      setMemberAccess(null);
      setLicenseTypes([]);
      
      // Load available applications if not provided
      if (!availableApplications) {
        loadApplications();
      }
    }
  }, [isOpen]);

  // Load applications
  const loadApplications = async () => {
    // TODO: Implement application loading
    console.warn('Application loading not yet implemented');
    setApplications(availableApplications || []);
  };

  // Load license types when app is selected
  React.useEffect(() => {
    if (selectedAppId) {
      loadLicenseTypes(selectedAppId);
      checkMemberAccess(selectedAppId);
    } else {
      setLicenseTypes([]);
      setMemberAccess(null);
    }
  }, [selectedAppId]);

  const loadLicenseTypes = async (applicationId: string) => {
    try {
      const types = await superAdminApi.getApplicationLicenseTypes(applicationId);
      setLicenseTypes(types);
    } catch (err) {
      console.error('Failed to load license types:', err);
    }
  };

  const checkMemberAccess = async (applicationId: string) => {
    setIsCheckingAccess(true);
    try {
      const result = await superAdminApi.checkMemberAccess(tenantId, applicationId);
      setMemberAccess(result);
    } catch (err: any) {
      console.error('Failed to check member access:', err);
      setMemberAccess({
        allowed: false,
        mode: 'FREE',
        reason: 'Failed to check access. Please try again.',
      });
    } finally {
      setIsCheckingAccess(false);
    }
  };



  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    // Basic validation
    if (!email) {
      setError('Email is required');
      return;
    }
    
    if (!/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/.test(email)) {
      setError('Invalid email format');
      return;
    }
    
    if (selectedAppId && memberAccess && !memberAccess.allowed) {
      setError(memberAccess.reason || 'Cannot add member to this application');
      return;
    }
    
    try {
      setIsSubmitting(true);
      
      await superAdminApi.inviteUserToTenant({
        email,
        tenantId,
        role: selectedRole,
        applicationId: selectedAppId || undefined,
        licenseTypeId: selectedLicenseTypeId || undefined,
        autoAssign: !!selectedAppId, // Auto-assign if app is selected
      });
      
      onSuccess();
    } catch (err: any) {
      const errorMessage =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to invite user';
      
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderAccessStatus = () => {
    if (!selectedAppId) return null;
    
    if (isCheckingAccess) {
      return (
        <div className="flex items-center gap-2 rounded-md border border-yellow-500/50 bg-yellow-500/10 p-3 text-sm text-yellow-50">
          <Info className="h-4 w-4" />
          Checking access...
        </div>
      );
    }
    
    if (!memberAccess) {
      return null;
    }
    
    if (memberAccess.allowed) {
      return (
        <div className="flex items-center gap-2 rounded-md border border-green-500/50 bg-green-500/10 p-3 text-sm text-green-50">
          <CheckCircle2 className="h-4 w-4" />
          {memberAccess.message || 'Access available'}
          {memberAccess.capacity && (
            <span className="text-green-50/70">
              ({memberAccess.capacity.available} seat{memberAccess.capacity.available !== 1 ? 's' : ''} available)
            </span>
          )}
          {memberAccess.memberLimit && memberAccess.memberLimit.available !== null && (
            <span className="text-green-50/70">
              ({memberAccess.memberLimit.available} member slot{memberAccess.memberLimit.available !== 1 ? 's' : ''} remaining)
            </span>
          )}
        </div>
      );
    }
    
    return (
      <div className="flex items-center gap-2 rounded-md border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-50">
        <AlertCircle className="h-4 w-4" />
        {memberAccess.reason || 'Access not available'}
      </div>
    );
  };

  const shouldShowLicenseSelector = () => {
    return selectedAppId && memberAccess?.mode === 'PER_SEAT';
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Invite User to Tenant"
      size="md"
      footer={
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Sending...' : 'Send Invite'}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Icon and Description */}
        <div className="flex items-center gap-3 rounded-md border border-white/10 bg-white/5 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20">
            <Mail className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
              Send Invitation
            </p>
            <p className="text-xs text-muted-foreground">
              The user will receive an email to join the tenant
            </p>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="rounded-md border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-50">
            {error}
          </div>
        )}

        {/* Application Selection (Optional) */}
        <div className="space-y-2">
          <label htmlFor="application" className="text-sm font-medium text-foreground">
            Application <span className="text-muted-foreground">(Optional)</span>
          </label>
          <Select
            value={selectedAppId}
            onValueChange={setSelectedAppId}
          >
            <option value="">All Applications (full tenant access)</option>
            {applications.map((app) => (
              <option key={app.id} value={app.id}>
                {app.name} {app.licensingMode !== 'FREE' && `(${app.licensingMode})`}
              </option>
            ))}
          </Select>
          <p className="text-xs text-muted-foreground">
            Select an application to grant specific access, or leave blank for full tenant access
          </p>
        </div>

        {/* Access Status */}
        {renderAccessStatus()}

        {/* Role Selection */}
        <div className="space-y-2">
          <label htmlFor="role" className="text-sm font-medium text-foreground">
            Role <span className="text-destructive">*</span>
          </label>
          <Select
            value={selectedRole}
            onValueChange={setSelectedRole}
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
            <option value="owner">Owner</option>
          </Select>
          <p className="text-xs text-muted-foreground">
            Select the tenant role for the new member
          </p>
        </div>

        {/* License Type Selection (PER_SEAT mode only) */}
        {shouldShowLicenseSelector() && (
          <div className="space-y-2">
            <label htmlFor="license" className="text-sm font-medium text-foreground">
              License Type <span className="text-destructive">*</span>
            </label>
            <Select
              value={selectedLicenseTypeId}
              onValueChange={setSelectedLicenseTypeId}
            >
              <option value="">Select license type...</option>
              {licenseTypes.map((lt) => (
                <option key={lt.id} value={lt.id}>
                  {lt.name}
                  {lt.description && ` - ${lt.description}`}
                </option>
              ))}
            </Select>
            <p className="text-xs text-muted-foreground">
              Select the license type to assign (PER_SEAT mode)
            </p>
          </div>
        )}

        {/* Email Input */}
        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium text-foreground">
            Email Address <span className="text-destructive">*</span>
          </label>
          <Input
            id="email"
            type="email"
            placeholder="user@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isSubmitting}
            autoComplete="email"
            className="bg-card"
            required
          />
          <p className="text-xs text-muted-foreground">
            Enter the email address of the user you want to invite
          </p>
        </div>
      </form>
    </Modal>
  );
}
