import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { superAdminApi } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Switch } from '@/components/ui/Switch';
import { useToast } from '@/components/ui/Toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

// =============================================================================
// TYPES
// =============================================================================

interface MfaStatus {
  enabled: boolean;
  verifiedAt: string | null;
  backupCodesRemaining: number;
}

interface MfaPolicy {
  superAdminMfaRequired: boolean;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function MfaTab() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [mfaStatus, setMfaStatus] = React.useState<MfaStatus | null>(null);
  const [mfaPolicy, setMfaPolicy] = React.useState<MfaPolicy | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);
  const [disableCode, setDisableCode] = React.useState('');
  const [showDisableConfirm, setShowDisableConfirm] = React.useState(false);

  // Load MFA status and policy
  React.useEffect(() => {
    loadMfaData();
  }, []);

  async function loadMfaData() {
    try {
      setIsLoading(true);
      const [status, policy] = await Promise.all([
        superAdminApi.getMfaStatus(),
        superAdminApi.getMfaPolicy(),
      ]);
      setMfaStatus(status);
      setMfaPolicy(policy);
    } catch (err) {
      console.error('Failed to load MFA data:', err);
      toast({
        title: 'Error',
        message: 'Failed to load MFA settings',
        variant: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function handlePolicyChange(required: boolean) {
    // Prevent enabling if current admin doesn't have MFA
    if (required && !mfaStatus?.enabled) {
      toast({
        title: 'Error',
        message: 'You must set up MFA for your own account first',
        variant: 'error',
      });
      return;
    }

    try {
      setIsSaving(true);
      await superAdminApi.updateMfaPolicy(required);
      setMfaPolicy({ superAdminMfaRequired: required });
      toast({
        title: 'Success',
        message: required
          ? 'MFA is now required for all super admins'
          : 'MFA requirement removed',
        variant: 'success',
      });
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Failed to update MFA policy';
      toast({
        title: 'Error',
        message,
        variant: 'error',
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDisableMfa() {
    if (!disableCode.trim()) {
      toast({
        title: 'Error',
        message: 'Please enter your verification code',
        variant: 'error',
      });
      return;
    }

    try {
      setIsSaving(true);
      await superAdminApi.mfaDisable(disableCode.trim());
      setMfaStatus({ enabled: false, verifiedAt: null, backupCodesRemaining: 0 });
      setShowDisableConfirm(false);
      setDisableCode('');
      toast({
        title: 'Success',
        message: 'MFA has been disabled',
        variant: 'success',
      });
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Invalid verification code';
      toast({
        title: 'Error',
        message: message,
        variant: 'error',
      });
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Your MFA Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Your MFA Status</span>
            {mfaStatus?.enabled ? (
              <Badge variant="default" className="bg-green-500">
                Enabled
              </Badge>
            ) : (
              <Badge variant="outline">Not Enabled</Badge>
            )}
          </CardTitle>
          <CardDescription>
            Two-factor authentication adds an extra layer of security to your account
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {mfaStatus?.enabled ? (
            <>
              <div className="flex items-center justify-between py-2 border-b">
                <span className="text-sm text-muted-foreground">Enabled since</span>
                <span className="text-sm font-medium">
                  {mfaStatus.verifiedAt
                    ? new Date(mfaStatus.verifiedAt).toLocaleDateString()
                    : 'Unknown'}
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b">
                <span className="text-sm text-muted-foreground">Backup codes remaining</span>
                <span
                  className={`text-sm font-medium ${mfaStatus.backupCodesRemaining < 3 ? 'text-amber-500' : ''}`}
                >
                  {mfaStatus.backupCodesRemaining} / 10
                </span>
              </div>

              {mfaPolicy?.superAdminMfaRequired ? (
                <div className="mt-4 p-3 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    MFA cannot be disabled while it is required for all super admins.
                    To disable your MFA, first turn off the requirement in the Instance MFA Policy section below.
                  </p>
                </div>
              ) : showDisableConfirm ? (
                <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                  <p className="text-sm text-red-600 dark:text-red-400 mb-3">
                    Enter your authenticator code or a backup code to disable MFA:
                  </p>
                  <input
                    type="text"
                    value={disableCode}
                    onChange={(e) => setDisableCode(e.target.value)}
                    placeholder="000000 or XXXX-XXXX"
                    className="w-full px-3 py-2 border rounded-md text-center font-mono mb-3"
                    maxLength={9}
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowDisableConfirm(false);
                        setDisableCode('');
                      }}
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={handleDisableMfa}
                      disabled={isSaving}
                      className="flex-1"
                    >
                      {isSaving ? 'Disabling...' : 'Disable MFA'}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2 mt-4">
                  <Button variant="outline" onClick={() => navigate('/admin/mfa/setup')}>
                    Regenerate Backup Codes
                  </Button>
                  <Button
                    variant="outline"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={() => setShowDisableConfirm(true)}
                  >
                    Disable MFA
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground mb-4">
                Protect your account with two-factor authentication using an authenticator app.
              </p>
              <Button onClick={() => navigate('/admin/mfa/setup')}>Enable MFA</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Instance MFA Policy */}
      <Card>
        <CardHeader>
          <CardTitle>Instance MFA Policy</CardTitle>
          <CardDescription>
            Control whether MFA is required for all super admins in this instance
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Require MFA for all super admins</p>
              <p className="text-sm text-muted-foreground">
                When enabled, all super admins must set up MFA to access the admin console
              </p>
              {!mfaStatus?.enabled && !mfaPolicy?.superAdminMfaRequired && (
                <p className="text-sm text-amber-500 mt-1">
                  ⚠️ Set up MFA for your account first before enabling this requirement
                </p>
              )}
            </div>
            <Switch
              checked={mfaPolicy?.superAdminMfaRequired ?? false}
              onCheckedChange={handlePolicyChange}
              disabled={isSaving || (!mfaStatus?.enabled && !mfaPolicy?.superAdminMfaRequired)}
            />
          </div>

          {mfaPolicy?.superAdminMfaRequired && !mfaStatus?.enabled && (
            <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
              <p className="text-sm text-amber-600 dark:text-amber-400">
                ⚠️ MFA is required but you haven't enabled it yet.
                <Button
                  variant="link"
                  className="text-amber-600 dark:text-amber-400 p-0 h-auto ml-1"
                  onClick={() => navigate('/admin/mfa/setup')}
                >
                  Set up MFA now
                </Button>
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
